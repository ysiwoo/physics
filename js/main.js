// UI 연결, 캔버스 애니메이션, 그래프, 표 렌더링

const els = {
  motionBtns: document.querySelectorAll(".motion-btn"),
  panels: document.querySelectorAll("[data-motion-panel]"),
  mass: document.getElementById("mass"),
  radius: document.getElementById("radius"),
  massFromRadius: document.getElementById("massFromRadius"),
  gravity: document.getElementById("gravity"),
  airResistance: document.getElementById("airResistance"),
  airParams: document.getElementById("airParams"),
  airDensity: document.getElementById("airDensity"),
  dragCoef: document.getElementById("dragCoef"),
  ff_height: document.getElementById("ff_height"),
  pj_v0: document.getElementById("pj_v0"),
  pj_angle: document.getElementById("pj_angle"),
  pj_h0: document.getElementById("pj_h0"),
  pd_length: document.getElementById("pd_length"),
  pd_angle: document.getElementById("pd_angle"),
  pd_periods: document.getElementById("pd_periods"),
  playBtn: document.getElementById("playBtn"),
  resetBtn: document.getElementById("resetBtn"),
  speed: document.getElementById("speed"),
  readout: document.getElementById("readout"),
  canvas: document.getElementById("simCanvas"),
  chartCanvas: document.getElementById("chartCanvas"),
  tableHead: document.querySelector("#dataTable thead tr"),
  tableBody: document.querySelector("#dataTable tbody"),
};

const ctx = els.canvas.getContext("2d");
const SIM_DT = 0.02; // 실제(공기저항) 시뮬레이션 적분 간격
const TABLE_DT = 0.1; // 표 샘플링 간격

let state = {
  motion: "freefall",
  playing: false,
  t: 0,
  tEnd: 1,
  realData: null,
  realDt: SIM_DT,
  chart: null,
  lastTs: null,
};

function getParams() {
  const massKg = parseFloat(els.mass.value) / 1000;
  const radiusM = parseFloat(els.radius.value) / 100;
  const g = parseFloat(els.gravity.value);
  const airOn = els.airResistance.checked;
  const rho = parseFloat(els.airDensity.value);
  const Cd = parseFloat(els.dragCoef.value);
  const k = airOn ? dragK(rho, Cd, radiusM) : 0;
  return {
    massKg, radiusM, g, airOn, rho, Cd, k,
    ff_h: parseFloat(els.ff_height.value),
    pj_v0: parseFloat(els.pj_v0.value),
    pj_angle: parseFloat(els.pj_angle.value),
    pj_h0: parseFloat(els.pj_h0.value),
    pd_L: parseFloat(els.pd_length.value),
    pd_angle: parseFloat(els.pd_angle.value),
    pd_periods: parseFloat(els.pd_periods.value),
  };
}

// ---------------- 모션 전환 ----------------
els.motionBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.motionBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.motion = btn.dataset.motion;
    els.panels.forEach((p) => {
      p.classList.toggle("hidden", p.dataset.motionPanel !== state.motion);
    });
    resetPlayback();
    computeAll();
  });
});

els.airResistance.addEventListener("change", () => {
  els.airParams.classList.toggle("hidden", !els.airResistance.checked);
  resetPlayback();
  computeAll();
});

els.massFromRadius.addEventListener("click", () => {
  const radiusM = parseFloat(els.radius.value) / 100;
  const massKg = steelMassFromRadius(radiusM);
  els.mass.value = Math.round(massKg * 1000 * 10) / 10;
  resetPlayback();
  computeAll();
});

[els.mass, els.radius, els.gravity, els.airDensity, els.dragCoef,
 els.ff_height, els.pj_v0, els.pj_angle, els.pj_h0,
 els.pd_length, els.pd_angle, els.pd_periods].forEach((input) => {
  input.addEventListener("input", () => {
    resetPlayback();
    computeAll();
  });
});

els.playBtn.addEventListener("click", () => {
  state.playing = !state.playing;
  els.playBtn.textContent = state.playing ? "⏸ 일시정지" : "▶ 재생";
  state.lastTs = null;
  if (state.playing) requestAnimationFrame(tick);
});

els.resetBtn.addEventListener("click", () => {
  resetPlayback();
  drawFrame();
});

function resetPlayback() {
  state.t = 0;
  state.playing = false;
  state.lastTs = null;
  els.playBtn.textContent = "▶ 재생";
}

// ---------------- 계산 ----------------
function computeAll() {
  const p = getParams();

  if (state.motion === "freefall") {
    const tLandTheory = Physics.freeFall.tLand(p.ff_h, p.g);
    state.realData = p.airOn ? Physics.freeFall.simulateReal(p.ff_h, p.g, p.massKg, p.k, SIM_DT) : null;
    const tLandReal = state.realData ? state.realData[state.realData.length - 1].t : tLandTheory;
    state.tEnd = Math.max(tLandTheory, tLandReal);
  } else if (state.motion === "projectile") {
    const angleRad = (p.pj_angle * Math.PI) / 180;
    const tLandTheory = Physics.projectile.tLand(p.pj_v0, angleRad, p.pj_h0, p.g);
    state.realData = p.airOn ? Physics.projectile.simulateReal(p.pj_v0, p.pj_angle, p.pj_h0, p.g, p.massKg, p.k, SIM_DT) : null;
    const tLandReal = state.realData ? state.realData[state.realData.length - 1].t : tLandTheory;
    state.tEnd = Math.max(tLandTheory, tLandReal);
  } else if (state.motion === "pendulum") {
    const T = Physics.pendulum.period(p.pd_L, p.g);
    state.tEnd = T * p.pd_periods;
    state.realData = p.airOn ? Physics.pendulum.simulateReal(p.pd_L, p.pd_angle, p.g, p.massKg, p.k, SIM_DT, state.tEnd) : null;
  }

  buildChart(p);
  buildTable(p);
  drawFrame();
}

function realAt(t) {
  if (!state.realData) return null;
  const idx = Math.min(state.realData.length - 1, Math.max(0, Math.round(t / SIM_DT)));
  return state.realData[idx];
}

// ---------------- 캔버스 애니메이션 ----------------
const STEEL_LIGHT = "#dfe6f0";
const STEEL_DARK = "#5a6478";

function drawSteelBall(cx, cy, r, ghost) {
  if (ghost) {
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.7)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, STEEL_LIGHT);
  grad.addColorStop(1, STEEL_DARK);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function clearCanvas() {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
}

function drawFrame() {
  const p = getParams();
  clearCanvas();
  const W = els.canvas.width, H = els.canvas.height;
  const ballR = 14;

  if (state.motion === "freefall") {
    const top = 30, bottom = H - 30;
    const scale = (bottom - top) / p.ff_h;
    const cx = W / 2;
    ctx.strokeStyle = "#3a4664";
    ctx.beginPath(); ctx.moveTo(20, bottom); ctx.lineTo(W - 20, bottom); ctx.stroke();
    ctx.fillStyle = "#9aa7c2"; ctx.font = "12px sans-serif";
    ctx.fillText(`h = ${p.ff_h} m`, 20, top - 10);

    const th = Physics.freeFall.theoryAt(state.t, p.ff_h, p.g);
    const thY = top + (p.ff_h - th.y) * scale;
    if (p.airOn) drawSteelBall(cx, thY, ballR, true);

    let curY = thY, curV = th.v;
    if (p.airOn) {
      const r = realAt(state.t);
      const y = top + (p.ff_h - r.y) * scale;
      drawSteelBall(cx, y, ballR, false);
      curY = y; curV = r.v;
    } else {
      drawSteelBall(cx, thY, ballR, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   속도: ${curV.toFixed(2)} m/s`;

  } else if (state.motion === "projectile") {
    const angleRad = (p.pj_angle * Math.PI) / 180;
    const tLand = Physics.projectile.tLand(p.pj_v0, angleRad, p.pj_h0, p.g);
    const vy0 = p.pj_v0 * Math.sin(angleRad);
    const range = p.pj_v0 * Math.cos(angleRad) * tLand;
    const maxHeight = p.pj_h0 + (vy0 * vy0) / (2 * p.g);
    const left = 40, bottom = H - 30, right = W - 20, top = 25;
    const scaleX = (right - left) / Math.max(range, 0.001);
    const scaleY = (bottom - top) / Math.max(maxHeight, 0.001);
    const scale = Math.min(scaleX, scaleY);
    const toPx = (x, y) => [left + x * scale, bottom - y * scale];

    ctx.strokeStyle = "#3a4664";
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();

    // 이론 궤적(점선)
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = (tLand * i) / 60;
      const th = Physics.projectile.theoryAt(t, p.pj_v0, p.pj_angle, p.pj_h0, p.g);
      const [x, y] = toPx(th.x, th.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    const th = Physics.projectile.theoryAt(state.t, p.pj_v0, p.pj_angle, p.pj_h0, p.g);
    const [thx, thy] = toPx(th.x, th.y);
    let curSpeed = th.speed;

    if (p.airOn) {
      drawSteelBall(thx, thy, ballR, true);
      ctx.save();
      ctx.strokeStyle = "rgba(79,140,255,0.7)";
      ctx.beginPath();
      const upto = Math.min(state.t, state.realData[state.realData.length - 1].t);
      for (let i = 0; state.realData[i] && state.realData[i].t <= upto; i++) {
        const [x, y] = toPx(state.realData[i].x, state.realData[i].y);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      const r = realAt(state.t);
      const [rx, ry] = toPx(r.x, r.y);
      drawSteelBall(rx, ry, ballR, false);
      curSpeed = r.speed;
    } else {
      drawSteelBall(thx, thy, ballR, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   속력: ${curSpeed.toFixed(2)} m/s`;

  } else if (state.motion === "pendulum") {
    const pivotX = W / 2, pivotY = 40;
    const maxDim = Math.min(W - 80, H - 80);
    const scale = maxDim / p.pd_L;
    const th = Physics.pendulum.theoryAt(state.t, p.pd_L, p.pd_angle, p.g);

    ctx.fillStyle = "#3a4664";
    ctx.beginPath(); ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2); ctx.fill();

    const drawArm = (theta, ghost) => {
      const bx = pivotX + Math.sin(theta) * p.pd_L * scale;
      const by = pivotY + Math.cos(theta) * p.pd_L * scale;
      ctx.strokeStyle = ghost ? "rgba(148,163,184,0.5)" : "#5a6478";
      ctx.setLineDash(ghost ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      drawSteelBall(bx, by, ballR, ghost);
      return { angVel: null };
    };

    let curAngDeg = (th.theta * 180) / Math.PI;
    let curAngVel = (th.angVel * 180) / Math.PI;
    if (p.airOn) {
      drawArm(th.theta, true);
      const r = realAt(state.t);
      drawArm(r.theta, false);
      curAngDeg = (r.theta * 180) / Math.PI;
      curAngVel = (r.angVel * 180) / Math.PI;
    } else {
      drawArm(th.theta, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   각도: ${curAngDeg.toFixed(1)}°   각속도: ${curAngVel.toFixed(1)} °/s`;
  }

  updateChartMarker();
}

function tick(ts) {
  if (!state.playing) return;
  if (state.lastTs === null) state.lastTs = ts;
  const dt = (ts - state.lastTs) / 1000;
  state.lastTs = ts;
  const speed = parseFloat(els.speed.value);
  state.t += dt * speed;
  if (state.t >= state.tEnd) {
    state.t = state.tEnd;
    state.playing = false;
    els.playBtn.textContent = "▶ 재생";
  }
  drawFrame();
  if (state.playing) requestAnimationFrame(tick);
}

// ---------------- 그래프 ----------------
function buildChart(p) {
  let labelX = "시간 (s)", labelY = "", theoryPts = [], realPts = [];

  if (state.motion === "freefall") {
    labelY = "높이 (m)";
    for (let i = 0; i <= 100; i++) {
      const t = (state.tEnd * i) / 100;
      theoryPts.push({ x: t, y: Physics.freeFall.theoryAt(t, p.ff_h, p.g).y });
    }
    if (state.realData) realPts = state.realData.map((d) => ({ x: d.t, y: d.y }));
  } else if (state.motion === "projectile") {
    labelX = "수평 거리 (m)"; labelY = "높이 (m)";
    const angleRad = (p.pj_angle * Math.PI) / 180;
    const tLand = Physics.projectile.tLand(p.pj_v0, angleRad, p.pj_h0, p.g);
    for (let i = 0; i <= 100; i++) {
      const t = (tLand * i) / 100;
      const th = Physics.projectile.theoryAt(t, p.pj_v0, p.pj_angle, p.pj_h0, p.g);
      theoryPts.push({ x: th.x, y: th.y });
    }
    if (state.realData) realPts = state.realData.map((d) => ({ x: d.x, y: d.y }));
  } else if (state.motion === "pendulum") {
    labelY = "각도 (°)";
    for (let i = 0; i <= 150; i++) {
      const t = (state.tEnd * i) / 150;
      theoryPts.push({ x: t, y: (Physics.pendulum.theoryAt(t, p.pd_L, p.pd_angle, p.g).theta * 180) / Math.PI });
    }
    if (state.realData) realPts = state.realData.map((d) => ({ x: d.t, y: (d.theta * 180) / Math.PI }));
  }

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(els.chartCanvas.getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "이론값",
          data: theoryPts,
          borderColor: "#9aa7c2",
          borderDash: [5, 4],
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
        },
        ...(p.airOn ? [{
          label: "실제값 (공기저항)",
          data: realPts,
          borderColor: "#4f8cff",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
        }] : []),
        {
          label: "현재",
          data: [],
          borderColor: "#ffb347",
          backgroundColor: "#ffb347",
          pointRadius: 5,
          showLine: false,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: "linear", title: { display: true, text: labelX, color: "#9aa7c2" }, ticks: { color: "#9aa7c2" }, grid: { color: "#2a3654" } },
        y: { title: { display: true, text: labelY, color: "#9aa7c2" }, ticks: { color: "#9aa7c2" }, grid: { color: "#2a3654" } },
      },
      plugins: {
        legend: { labels: { color: "#e6ebf5" } },
      },
    },
  });
}

function updateChartMarker() {
  if (!state.chart) return;
  const p = getParams();
  let point = null;
  if (state.motion === "freefall") {
    const src = p.airOn ? realAt(state.t) : Physics.freeFall.theoryAt(state.t, p.ff_h, p.g);
    point = { x: state.t, y: src.y };
  } else if (state.motion === "projectile") {
    const src = p.airOn ? realAt(state.t) : Physics.projectile.theoryAt(state.t, p.pj_v0, p.pj_angle, p.pj_h0, p.g);
    point = { x: src.x, y: src.y };
  } else if (state.motion === "pendulum") {
    const src = p.airOn ? realAt(state.t) : Physics.pendulum.theoryAt(state.t, p.pd_L, p.pd_angle, p.g);
    point = { x: state.t, y: (src.theta * 180) / Math.PI };
  }
  const markerIdx = state.chart.data.datasets.length - 1;
  state.chart.data.datasets[markerIdx].data = point ? [point] : [];
  state.chart.update("none");
}

// ---------------- 표 ----------------
function fmt(n, d = 3) {
  return Number.isFinite(n) ? n.toFixed(d) : "-";
}
function errRate(real, theory) {
  if (Math.abs(theory) < 1e-9) return null;
  return (Math.abs(real - theory) / Math.abs(theory)) * 100;
}
function errCell(real, theory) {
  const e = errRate(real, theory);
  if (e === null) return `<td class="err-cell">-</td>`;
  const cls = e > 10 ? "err-cell high" : "err-cell";
  return `<td class="${cls}">${e.toFixed(2)}%</td>`;
}

function buildTable(p) {
  const rows = [];
  const maxRows = 200;
  const step = Math.max(state.tEnd / maxRows, TABLE_DT);
  const nSteps = state.tEnd > 0 ? Math.max(1, Math.ceil(state.tEnd / step)) : 0;

  let headers = [];
  if (state.motion === "freefall") {
    headers = p.airOn
      ? ["시간(s)", "실제 높이(m)", "이론 높이(m)", "높이 오차율", "실제 속도(m/s)", "이론 속도(m/s)", "속도 오차율"]
      : ["시간(s)", "높이(m)", "속도(m/s)"];
  } else if (state.motion === "projectile") {
    headers = p.airOn
      ? ["시간(s)", "실제 x(m)", "이론 x(m)", "x 오차율", "실제 y(m)", "이론 y(m)", "y 오차율"]
      : ["시간(s)", "x(m)", "y(m)", "속력(m/s)"];
  } else if (state.motion === "pendulum") {
    headers = p.airOn
      ? ["시간(s)", "실제 각도(°)", "이론 각도(°)", "각도 오차율", "실제 각속도(°/s)", "이론 각속도(°/s)", "각속도 오차율"]
      : ["시간(s)", "각도(°)", "각속도(°/s)"];
  }
  els.tableHead.innerHTML = headers.map((h) => `<th>${h}</th>`).join("");

  for (let i = 0; i <= nSteps; i++) {
    const tt = Math.min(i * step, state.tEnd);
    let cells = [];
    if (state.motion === "freefall") {
      const th = Physics.freeFall.theoryAt(tt, p.ff_h, p.g);
      if (p.airOn) {
        const r = realAt(tt);
        cells = [fmt(tt, 2), fmt(r.y), fmt(th.y), errCell(r.y, th.y), fmt(r.v), fmt(th.v), errCell(r.v, th.v)];
      } else {
        cells = [fmt(tt, 2), fmt(th.y), fmt(th.v)];
      }
    } else if (state.motion === "projectile") {
      const th = Physics.projectile.theoryAt(tt, p.pj_v0, p.pj_angle, p.pj_h0, p.g);
      if (p.airOn) {
        const r = realAt(tt);
        cells = [fmt(tt, 2), fmt(r.x), fmt(th.x), errCell(r.x, th.x), fmt(r.y), fmt(th.y), errCell(r.y, th.y)];
      } else {
        cells = [fmt(tt, 2), fmt(th.x), fmt(th.y), fmt(th.speed)];
      }
    } else if (state.motion === "pendulum") {
      const th = Physics.pendulum.theoryAt(tt, p.pd_L, p.pd_angle, p.g);
      const thDeg = (th.theta * 180) / Math.PI, thAV = (th.angVel * 180) / Math.PI;
      if (p.airOn) {
        const r = realAt(tt);
        const rDeg = (r.theta * 180) / Math.PI, rAV = (r.angVel * 180) / Math.PI;
        cells = [fmt(tt, 2), fmt(rDeg), fmt(thDeg), errCell(rDeg, thDeg), fmt(rAV), fmt(thAV), errCell(rAV, thAV)];
      } else {
        cells = [fmt(tt, 2), fmt(thDeg), fmt(thAV)];
      }
    }
    rows.push(`<tr>${cells.map((c) => (typeof c === "string" && c.startsWith("<td")) ? c : `<td>${c}</td>`).join("")}</tr>`);
    if (tt >= state.tEnd) break;
  }
  els.tableBody.innerHTML = rows.join("");
}

// 초기 실행
computeAll();
