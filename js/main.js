// UI 연결, 캔버스 애니메이션, 그래프, 표 렌더링

const els = {
  motionBtns: document.querySelectorAll(".motion-btn"),
  themeBtns: document.querySelectorAll(".theme-btn"),
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
  ff_restitution: document.getElementById("ff_restitution"),
  pj_v0: document.getElementById("pj_v0"),
  pj_angle: document.getElementById("pj_angle"),
  pj_h0: document.getElementById("pj_h0"),
  pj_restitution: document.getElementById("pj_restitution"),
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
const SIM_DT = 0.02; // 시뮬레이션 적분 간격 (이론/실제 공통)
const TABLE_DT = 0.1; // 표 샘플링 간격
const TRAIL_DT = 0.09; // 잔상(스트로보스코프) 점 간격 - 가속을 눈으로 보여줌

const THEMES = {
  dark: {
    ground: "#3a4664",
    label: "#9aa7c2",
    ghostStroke: "rgba(148,163,184,0.7)",
    realPath: "rgba(79,140,255,0.75)",
    trail: "rgba(148,163,184,0.45)",
    chartGrid: "#2a3654",
    chartTick: "#9aa7c2",
    chartLegend: "#e6ebf5",
    chartTheory: "#9aa7c2",
    chartReal: "#4f8cff",
    chartMarker: "#ffb347",
  },
  light: {
    ground: "#b7c0d4",
    label: "#57617a",
    ghostStroke: "rgba(87,97,122,0.6)",
    realPath: "rgba(47,111,237,0.8)",
    trail: "rgba(87,97,122,0.4)",
    chartGrid: "#dde3ee",
    chartTick: "#57617a",
    chartLegend: "#1b2436",
    chartTheory: "#8b93a8",
    chartReal: "#2f6fed",
    chartMarker: "#b45309",
  },
};

let state = {
  motion: "freefall",
  theme: "dark",
  playing: false,
  t: 0,
  tEnd: 1,
  theoryData: null,
  theoryDuration: 0,
  realData: null,
  realDuration: 0,
  chart: null,
  lastTs: null,
};

function theme() {
  return THEMES[state.theme];
}

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
    ff_e: parseFloat(els.ff_restitution.value),
    pj_v0: parseFloat(els.pj_v0.value),
    pj_angle: parseFloat(els.pj_angle.value),
    pj_h0: parseFloat(els.pj_h0.value),
    pj_e: parseFloat(els.pj_restitution.value),
    pd_L: parseFloat(els.pd_length.value),
    pd_angle: parseFloat(els.pd_angle.value),
    pd_periods: parseFloat(els.pd_periods.value),
  };
}

// ---------------- 테마 ----------------
function applyTheme(name) {
  state.theme = name;
  document.documentElement.setAttribute("data-theme", name);
  els.themeBtns.forEach((b) => b.classList.toggle("active", b.dataset.theme === name));
  try { localStorage.setItem("physicsSimTheme", name); } catch (e) {}
  computeAll();
}

els.themeBtns.forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});

let savedTheme = "dark";
try { savedTheme = localStorage.getItem("physicsSimTheme") || "dark"; } catch (e) {}

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
 els.ff_height, els.ff_restitution, els.pj_v0, els.pj_angle, els.pj_h0, els.pj_restitution,
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
    state.theoryData = Physics.freeFall.simulate(p.ff_h, p.g, p.massKg, 0, p.ff_e, SIM_DT);
    state.realData = p.airOn ? Physics.freeFall.simulate(p.ff_h, p.g, p.massKg, p.k, p.ff_e, SIM_DT) : null;
  } else if (state.motion === "projectile") {
    state.theoryData = Physics.projectile.simulate(p.pj_v0, p.pj_angle, p.pj_h0, p.g, p.massKg, 0, p.pj_e, SIM_DT);
    state.realData = p.airOn ? Physics.projectile.simulate(p.pj_v0, p.pj_angle, p.pj_h0, p.g, p.massKg, p.k, p.pj_e, SIM_DT) : null;
  } else if (state.motion === "pendulum") {
    state.theoryData = Physics.pendulum.simulate(p.pd_L, p.pd_angle, p.g, p.massKg, 0, p.pd_periods, SIM_DT);
    state.realData = p.airOn ? Physics.pendulum.simulate(p.pd_L, p.pd_angle, p.g, p.massKg, p.k, p.pd_periods, SIM_DT) : null;
  }

  state.theoryDuration = state.theoryData[state.theoryData.length - 1].t;
  state.realDuration = state.realData ? state.realData[state.realData.length - 1].t : 0;
  state.tEnd = Math.max(state.theoryDuration, state.realDuration, 0.01);

  buildChart(p);
  buildTable(p);
  drawFrame();
}

// 단진자 이론(k=0)은 손실이 없어 정확히 주기적으로 반복되므로,
// tEnd가 이론 길이보다 길어져도(감쇠가 느린 실제값에 맞춰) 위상을 이어서 보여준다.
function theoryAt(t) {
  if (state.motion === "pendulum" && state.theoryDuration > 0) {
    const wrapped = ((t % state.theoryDuration) + state.theoryDuration) % state.theoryDuration;
    return Physics.sampleAt(state.theoryData, SIM_DT, wrapped);
  }
  return Physics.sampleAt(state.theoryData, SIM_DT, t);
}

function realAt(t) {
  if (!state.realData) return null;
  return Physics.sampleAt(state.realData, SIM_DT, t);
}

function activeData() {
  return state.realData || state.theoryData;
}

function collectTrail(mapFn) {
  const data = activeData();
  const pts = [];
  for (let tt = 0; tt <= state.t; tt += TRAIL_DT) {
    pts.push(mapFn(Physics.sampleAt(data, SIM_DT, tt)));
  }
  return pts;
}

function drawTrail(points) {
  ctx.save();
  ctx.fillStyle = theme().trail;
  points.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---------------- 캔버스 애니메이션 ----------------
const STEEL_LIGHT = "#dfe6f0";
const STEEL_DARK = "#5a6478";

function drawSteelBall(cx, cy, r, ghost) {
  if (ghost) {
    ctx.save();
    ctx.strokeStyle = theme().ghostStroke;
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
  const th = theme();
  clearCanvas();
  const W = els.canvas.width, H = els.canvas.height;
  const ballR = 14;

  if (state.motion === "freefall") {
    const top = 30, bottom = H - 30;
    const scale = (bottom - top) / p.ff_h;
    const cx = W / 2;
    ctx.strokeStyle = th.ground;
    ctx.beginPath(); ctx.moveTo(20, bottom); ctx.lineTo(W - 20, bottom); ctx.stroke();
    ctx.fillStyle = th.label; ctx.font = "12px sans-serif";
    ctx.fillText(`h = ${p.ff_h} m`, 20, top - 10);

    const toY = (y) => top + (p.ff_h - Math.min(Math.max(y, 0), p.ff_h)) * scale;
    drawTrail(collectTrail((d) => ({ x: cx, y: toY(d.y) })));

    const thd = theoryAt(state.t);
    const thY = toY(thd.y);
    if (p.airOn) drawSteelBall(cx, thY, ballR, true);

    let curY = thY, curV = thd.v;
    if (p.airOn) {
      const r = realAt(state.t);
      const y = toY(r.y);
      drawSteelBall(cx, y, ballR, false);
      curY = y; curV = r.v;
    } else {
      drawSteelBall(cx, thY, ballR, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   속도: ${curV.toFixed(2)} m/s`;

  } else if (state.motion === "projectile") {
    let maxX = 0.5, maxY = Math.max(p.pj_h0, 0.5);
    for (const d of state.theoryData) { if (d.x > maxX) maxX = d.x; if (d.y > maxY) maxY = d.y; }
    if (state.realData) for (const d of state.realData) { if (d.x > maxX) maxX = d.x; if (d.y > maxY) maxY = d.y; }
    const left = 40, bottom = H - 30, right = W - 20, top = 25;
    const scaleX = (right - left) / maxX;
    const scaleY = (bottom - top) / maxY;
    const scale = Math.min(scaleX, scaleY);
    const toPx = (x, y) => [left + x * scale, bottom - y * scale];

    ctx.strokeStyle = th.ground;
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();

    // 이론 궤적 전체(점선)
    ctx.save();
    ctx.strokeStyle = th.ghostStroke;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    state.theoryData.forEach((d, i) => {
      const [x, y] = toPx(d.x, d.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    drawTrail(collectTrail((d) => { const [x, y] = toPx(d.x, d.y); return { x, y }; }));

    const thd = theoryAt(state.t);
    const [thx, thy] = toPx(thd.x, thd.y);
    let curSpeed = thd.speed;

    if (p.airOn) {
      drawSteelBall(thx, thy, ballR, true);
      ctx.save();
      ctx.strokeStyle = th.realPath;
      ctx.beginPath();
      for (let i = 0; state.realData[i] && state.realData[i].t <= state.t; i++) {
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
    const thd = theoryAt(state.t);
    const ballPos = (theta) => ({
      x: pivotX + Math.sin(theta) * p.pd_L * scale,
      y: pivotY + Math.cos(theta) * p.pd_L * scale,
    });

    ctx.fillStyle = th.ground;
    ctx.beginPath(); ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2); ctx.fill();

    drawTrail(collectTrail((d) => ballPos(d.theta)));

    const drawArm = (theta, ghost) => {
      const b = ballPos(theta);
      ctx.strokeStyle = ghost ? th.ghostStroke : th.ground;
      ctx.setLineDash(ghost ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      drawSteelBall(b.x, b.y, ballR, ghost);
    };

    let curAngDeg = (thd.theta * 180) / Math.PI;
    let curAngVel = (thd.angVel * 180) / Math.PI;
    if (p.airOn) {
      drawArm(thd.theta, true);
      const r = realAt(state.t);
      drawArm(r.theta, false);
      curAngDeg = (r.theta * 180) / Math.PI;
      curAngVel = (r.angVel * 180) / Math.PI;
    } else {
      drawArm(thd.theta, false);
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
    // 운동이 끝나지 않고 처음부터 이어서 반복 재생된다.
    state.t = state.tEnd > 0 ? state.t % state.tEnd : 0;
  }
  drawFrame();
  requestAnimationFrame(tick);
}

// ---------------- 그래프 ----------------
function buildChart(p) {
  let labelX = "시간 (s)", labelY = "";
  const th = theme();

  if (state.motion === "freefall") {
    labelY = "높이 (m)";
  } else if (state.motion === "projectile") {
    labelX = "수평 거리 (m)"; labelY = "높이 (m)";
  } else if (state.motion === "pendulum") {
    labelY = "각도 (°)";
  }

  const toPoint = (motion, d) => {
    if (motion === "freefall") return { x: d.t, y: d.y };
    if (motion === "projectile") return { x: d.x, y: d.y };
    return { x: d.t, y: (d.theta * 180) / Math.PI };
  };

  const theoryPts = state.theoryData.map((d) => toPoint(state.motion, d));
  const realPts = state.realData ? state.realData.map((d) => toPoint(state.motion, d)) : [];

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(els.chartCanvas.getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "이론값",
          data: theoryPts,
          borderColor: th.chartTheory,
          borderDash: [5, 4],
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
        },
        ...(p.airOn ? [{
          label: "실제값 (공기저항)",
          data: realPts,
          borderColor: th.chartReal,
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
        }] : []),
        {
          label: "현재",
          data: [],
          borderColor: th.chartMarker,
          backgroundColor: th.chartMarker,
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
        x: { type: "linear", title: { display: true, text: labelX, color: th.chartTick }, ticks: { color: th.chartTick }, grid: { color: th.chartGrid } },
        y: { title: { display: true, text: labelY, color: th.chartTick }, ticks: { color: th.chartTick }, grid: { color: th.chartGrid } },
      },
      plugins: {
        legend: { labels: { color: th.chartLegend } },
      },
    },
  });
}

function updateChartMarker() {
  if (!state.chart) return;
  const p = getParams();
  let point = null;
  if (state.motion === "freefall") {
    const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
    point = { x: state.t, y: src.y };
  } else if (state.motion === "projectile") {
    const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
    point = { x: src.x, y: src.y };
  } else if (state.motion === "pendulum") {
    const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
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
      const thd = theoryAt(tt);
      if (p.airOn) {
        const r = realAt(tt);
        cells = [fmt(tt, 2), fmt(r.y), fmt(thd.y), errCell(r.y, thd.y), fmt(r.v), fmt(thd.v), errCell(r.v, thd.v)];
      } else {
        cells = [fmt(tt, 2), fmt(thd.y), fmt(thd.v)];
      }
    } else if (state.motion === "projectile") {
      const thd = theoryAt(tt);
      if (p.airOn) {
        const r = realAt(tt);
        cells = [fmt(tt, 2), fmt(r.x), fmt(thd.x), errCell(r.x, thd.x), fmt(r.y), fmt(thd.y), errCell(r.y, thd.y)];
      } else {
        cells = [fmt(tt, 2), fmt(thd.x), fmt(thd.y), fmt(thd.speed)];
      }
    } else if (state.motion === "pendulum") {
      const thd = theoryAt(tt);
      const thDeg = (thd.theta * 180) / Math.PI, thAV = (thd.angVel * 180) / Math.PI;
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
applyTheme(savedTheme);
