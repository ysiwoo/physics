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
  ci_radius: document.getElementById("ci_radius"),
  ci_v0: document.getElementById("ci_v0"),
  ci_periods: document.getElementById("ci_periods"),
  sh_springK: document.getElementById("sh_springK"),
  sh_x0: document.getElementById("sh_x0"),
  sh_periods: document.getElementById("sh_periods"),
  playBtn: document.getElementById("playBtn"),
  resetBtn: document.getElementById("resetBtn"),
  resetAllBtn: document.getElementById("resetAllBtn"),
  speed: document.getElementById("speed"),
  readout: document.getElementById("readout"),
  canvas: document.getElementById("simCanvas"),
  chartCanvas: document.getElementById("chartCanvas"),
  graphType: document.getElementById("graphType"),
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

const GRAPH_TYPES = {
  vt: { field: "v", label: "속도", unit: "m/s" },
  at: { field: "a", label: "가속도", unit: "m/s²" },
  Ft: { field: "F", label: "힘", unit: "N" },
  pt: { field: "p", label: "운동량", unit: "kg·m/s" },
  keT: { field: "KE", label: "운동 에너지", unit: "J" },
  peT: { field: "PE", label: "위치 에너지", unit: "J" },
  meT: { field: "ME", label: "역학적 에너지", unit: "J" },
};

// 이론(k=0)이 손실 없이 정확히 주기적인 운동들 — theoryAt/derivedAt에서 위상을 감아 반복시킨다.
const PERIODIC_MOTIONS = ["pendulum", "circular", "shm"];

let state = {
  motion: "freefall",
  theme: "dark",
  graphType: "st",
  playing: false,
  t: 0,
  tEnd: 1,
  theoryData: null,
  theoryDuration: 0,
  realData: null,
  realDuration: 0,
  chart: null,
  lastTs: null,
  dragThetaDeg: null, // 캔버스에서 쇠구슬을 드래그하는 동안의 임시 각도
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
    ci_R: parseFloat(els.ci_radius.value),
    ci_v0: parseFloat(els.ci_v0.value),
    ci_periods: parseFloat(els.ci_periods.value),
    sh_k: parseFloat(els.sh_springK.value),
    sh_x0: parseFloat(els.sh_x0.value) / 100, // cm -> m
    sh_periods: parseFloat(els.sh_periods.value),
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
function setMotion(motion) {
  els.motionBtns.forEach((b) => b.classList.toggle("active", b.dataset.motion === motion));
  state.motion = motion;
  els.panels.forEach((p) => {
    p.classList.toggle("hidden", p.dataset.motionPanel !== state.motion);
  });
  els.canvas.classList.toggle("pendulum-mode", motion === "pendulum");
}

els.motionBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMotion(btn.dataset.motion);
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
 els.pd_length, els.pd_angle, els.pd_periods,
 els.ci_radius, els.ci_v0, els.ci_periods,
 els.sh_springK, els.sh_x0, els.sh_periods].forEach((input) => {
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

els.resetAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".controls input[type=\"number\"]").forEach((el) => { el.value = el.defaultValue; });
  els.airResistance.checked = els.airResistance.defaultChecked;
  els.airParams.classList.toggle("hidden", !els.airResistance.checked);
  els.speed.value = "1";
  els.graphType.value = "st";
  state.graphType = "st";
  setMotion("freefall");
  resetPlayback();
  computeAll();
});

els.graphType.addEventListener("change", () => {
  state.graphType = els.graphType.value;
  buildChart(getParams());
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
  } else if (state.motion === "circular") {
    state.theoryData = Physics.circular.simulate(p.ci_R, p.ci_v0, p.massKg, 0, p.ci_periods, SIM_DT);
    state.realData = p.airOn ? Physics.circular.simulate(p.ci_R, p.ci_v0, p.massKg, p.k, p.ci_periods, SIM_DT) : null;
  } else if (state.motion === "shm") {
    state.theoryData = Physics.shm.simulate(p.sh_k, p.sh_x0, p.massKg, 0, p.sh_periods, SIM_DT);
    state.realData = p.airOn ? Physics.shm.simulate(p.sh_k, p.sh_x0, p.massKg, p.k, p.sh_periods, SIM_DT) : null;
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
  if (PERIODIC_MOTIONS.includes(state.motion) && state.theoryDuration > 0) {
    const wrapped = ((t % state.theoryDuration) + state.theoryDuration) % state.theoryDuration;
    return Physics.sampleAt(state.theoryData, SIM_DT, wrapped);
  }
  return Physics.sampleAt(state.theoryData, SIM_DT, t);
}

function realAt(t) {
  if (!state.realData) return null;
  return Physics.sampleAt(state.realData, SIM_DT, t);
}

function derivedAt(t, useReal) {
  const arr = useReal ? state.realDerived : state.theoryDerived;
  if (!arr) return null;
  if (!useReal && PERIODIC_MOTIONS.includes(state.motion) && state.theoryDuration > 0) {
    const wrapped = ((t % state.theoryDuration) + state.theoryDuration) % state.theoryDuration;
    return Physics.sampleAt(arr, SIM_DT, wrapped);
  }
  return Physics.sampleAt(arr, SIM_DT, t);
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
    const { pivotX, pivotY, scale } = pendulumGeometry(p);
    const ballPos = (theta) => ({
      x: pivotX + Math.sin(theta) * p.pd_L * scale,
      y: pivotY + Math.cos(theta) * p.pd_L * scale,
    });

    ctx.fillStyle = th.ground;
    ctx.beginPath(); ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2); ctx.fill();

    if (state.dragThetaDeg !== null) {
      const dragTheta = (state.dragThetaDeg * Math.PI) / 180;
      const b = ballPos(dragTheta);
      ctx.strokeStyle = th.ground;
      ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(b.x, b.y); ctx.stroke();
      drawSteelBall(b.x, b.y, ballR, false);
      els.readout.textContent = `초기 각도 설정 중: ${state.dragThetaDeg.toFixed(1)}°`;
      return;
    }

    const thd = theoryAt(state.t);
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

  } else if (state.motion === "circular") {
    const cx = W / 2, cy = H / 2;
    const margin = 40;
    const scale = (Math.min(W, H) / 2 - margin) / p.ci_R;
    const posAt = (theta) => ({ x: cx + Math.cos(theta) * p.ci_R * scale, y: cy + Math.sin(theta) * p.ci_R * scale });

    ctx.save();
    ctx.strokeStyle = th.ghostStroke;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, p.ci_R * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = th.ground;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

    drawTrail(collectTrail((d) => posAt(d.theta)));

    const thd = theoryAt(state.t);
    const thPos = posAt(thd.theta);
    if (p.airOn) drawSteelBall(thPos.x, thPos.y, ballR, true);

    let curOmegaDeg = (thd.omega * 180) / Math.PI;
    if (p.airOn) {
      const r = realAt(state.t);
      const rPos = posAt(r.theta);
      drawSteelBall(rPos.x, rPos.y, ballR, false);
      curOmegaDeg = (r.omega * 180) / Math.PI;
    } else {
      drawSteelBall(thPos.x, thPos.y, ballR, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   각속도: ${curOmegaDeg.toFixed(1)} °/s`;

  } else if (state.motion === "shm") {
    const midY = H / 2;
    const anchorX = 60;
    const eqX = W / 2 + 30;
    let maxAbsX = 0.05;
    for (const d of state.theoryData) maxAbsX = Math.max(maxAbsX, Math.abs(d.x));
    if (state.realData) for (const d of state.realData) maxAbsX = Math.max(maxAbsX, Math.abs(d.x));
    const leftBound = (eqX - anchorX - 20) / maxAbsX;
    const rightBound = (W - 40 - eqX) / maxAbsX;
    const scale = Math.min(leftBound, rightBound);
    const toX = (x) => eqX + x * scale;

    const drawSpring = (endX, color) => {
      const segs = 14;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(anchorX, midY);
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const x = anchorX + (endX - anchorX) * t;
        const y = midY + (i % 2 === 0 ? -10 : 10);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(endX, midY);
      ctx.stroke();
    };

    ctx.strokeStyle = th.ground;
    ctx.beginPath(); ctx.moveTo(anchorX, midY - 30); ctx.lineTo(anchorX, midY + 30); ctx.stroke();

    // 평형점(x=0) 표시
    ctx.save();
    ctx.strokeStyle = th.ghostStroke;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(eqX, midY - 35); ctx.lineTo(eqX, midY + 35); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = th.label; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("평형점", eqX, midY - 42);
    ctx.textAlign = "start";

    drawTrail(collectTrail((d) => ({ x: toX(d.x), y: midY })));

    const thd = theoryAt(state.t);
    const thX = toX(thd.x);
    if (p.airOn) {
      drawSpring(thX, th.ghostStroke);
      drawSteelBall(thX, midY, ballR, true);
    }

    let curV = thd.v, curX = thd.x;
    if (p.airOn) {
      const r = realAt(state.t);
      const x = toX(r.x);
      drawSpring(x, th.ground);
      drawSteelBall(x, midY, ballR, false);
      curV = r.v; curX = r.x;
    } else {
      drawSpring(thX, th.ground);
      drawSteelBall(thX, midY, ballR, false);
    }
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   변위: ${(curX * 100).toFixed(2)} cm   속도: ${curV.toFixed(2)} m/s`;
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

// ---------------- 단진자 드래그로 초기 각도 설정 ----------------
const MAX_DRAG_ANGLE_DEG = 175;
const dragState = { active: false };

function pendulumGeometry(p) {
  const W = els.canvas.width, H = els.canvas.height;
  // 각도가 90°를 넘으면 공이 축보다 위로 올라가므로, 축을 중앙에 두고
  // 반경 L*scale의 원 전체(-175°~175°)가 캔버스 안에 들어오게 계산한다.
  const margin = 40;
  const maxRadius = Math.min(W, H) / 2 - margin;
  return { pivotX: W / 2, pivotY: H / 2, scale: maxRadius / p.pd_L };
}

function canvasPoint(evt) {
  const rect = els.canvas.getBoundingClientRect();
  const src = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
  return {
    x: (src.clientX - rect.left) * (els.canvas.width / rect.width),
    y: (src.clientY - rect.top) * (els.canvas.height / rect.height),
  };
}

function startDrag(evt) {
  if (state.motion !== "pendulum") return;
  const p = getParams();
  const { pivotX, pivotY, scale } = pendulumGeometry(p);
  const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
  const ballX = pivotX + Math.sin(src.theta) * p.pd_L * scale;
  const ballY = pivotY + Math.cos(src.theta) * p.pd_L * scale;
  const pt = canvasPoint(evt);
  if (Math.hypot(pt.x - ballX, pt.y - ballY) > 26) return;
  dragState.active = true;
  els.canvas.classList.add("dragging");
  state.playing = false;
  els.playBtn.textContent = "▶ 재생";
  updateDrag(evt);
}

function updateDrag(evt) {
  if (!dragState.active) return;
  if (evt.type === "touchmove") evt.preventDefault(); // touchstart는 passive라 여기선 호출하지 않음
  const p = getParams();
  const { pivotX, pivotY } = pendulumGeometry(p);
  const pt = canvasPoint(evt);
  const dx = pt.x - pivotX, dy = pt.y - pivotY;
  let thetaDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  thetaDeg = Math.max(-MAX_DRAG_ANGLE_DEG, Math.min(MAX_DRAG_ANGLE_DEG, thetaDeg));
  state.dragThetaDeg = thetaDeg;
  drawFrame();
}

function endDrag() {
  if (!dragState.active) return;
  dragState.active = false;
  els.canvas.classList.remove("dragging");
  const finalDeg = Math.round(state.dragThetaDeg * 10) / 10;
  state.dragThetaDeg = null;
  els.pd_angle.value = finalDeg;
  els.pd_angle.dispatchEvent(new Event("input"));
}

els.canvas.addEventListener("mousedown", startDrag);
document.addEventListener("mousemove", updateDrag);
document.addEventListener("mouseup", endDrag);
els.canvas.addEventListener("touchstart", startDrag, { passive: true });
document.addEventListener("touchmove", updateDrag, { passive: false });
document.addEventListener("touchend", endDrag);

// ---------------- 그래프 ----------------
function buildChart(p) {
  let labelX = "시간 (s)", labelY = "";
  const th = theme();
  const gt = state.graphType;

  let theoryPts, realPts;

  if (gt === "st") {
    state.theoryDerived = null;
    state.realDerived = null;
    const toPoint = (motion, d) => {
      if (motion === "freefall") return { x: d.t, y: d.y };
      if (motion === "projectile") return { x: d.x, y: d.y };
      if (motion === "pendulum") return { x: d.t, y: (d.theta * 180) / Math.PI };
      if (motion === "circular") return { x: d.t, y: (d.theta * 180) / Math.PI };
      return { x: d.t, y: d.x * 100 }; // shm, cm
    };
    if (state.motion === "freefall") {
      labelY = "높이 (m)";
    } else if (state.motion === "projectile") {
      labelX = "수평 거리 (m)"; labelY = "높이 (m)";
    } else if (state.motion === "pendulum") {
      labelY = "각도 (°)";
    } else if (state.motion === "circular") {
      labelY = "회전각 (°, 누적)";
    } else if (state.motion === "shm") {
      labelY = "변위 (cm)";
    }
    theoryPts = state.theoryData.map((d) => toPoint(state.motion, d));
    realPts = state.realData ? state.realData.map((d) => toPoint(state.motion, d)) : [];
  } else {
    const info = GRAPH_TYPES[gt];
    labelY = `${info.label} (${info.unit})`;
    const extra = { L: p.pd_L, R: p.ci_R, springK: p.sh_k };
    state.theoryDerived = Physics.derive(state.theoryData, state.motion, p.massKg, p.g, extra);
    state.realDerived = state.realData ? Physics.derive(state.realData, state.motion, p.massKg, p.g, extra) : null;
    theoryPts = state.theoryDerived.map((d) => ({ x: d.t, y: d[info.field] }));
    realPts = state.realDerived ? state.realDerived.map((d) => ({ x: d.t, y: d[info.field] })) : [];
  }

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
        y: {
          // 에너지 그래프는 y축을 0부터 고정한다. 이론(무손실)에서는 RK4의 극미한 수치오차(약 1e-8 수준)만
          // 남는데, 축을 데이터 범위에 맞춰 자동 확대하면 이 오차가 마치 에너지가 새는 것처럼 보인다.
          min: (gt === "keT" || gt === "peT" || gt === "meT") ? 0 : undefined,
          title: { display: true, text: labelY, color: th.chartTick },
          ticks: { color: th.chartTick },
          grid: { color: th.chartGrid },
        },
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
  if (state.graphType === "st") {
    if (state.motion === "freefall") {
      const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
      point = { x: state.t, y: src.y };
    } else if (state.motion === "projectile") {
      const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
      point = { x: src.x, y: src.y };
    } else if (state.motion === "pendulum") {
      const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
      point = { x: state.t, y: (src.theta * 180) / Math.PI };
    } else if (state.motion === "circular") {
      const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
      point = { x: state.t, y: (src.theta * 180) / Math.PI };
    } else if (state.motion === "shm") {
      const src = p.airOn ? realAt(state.t) : theoryAt(state.t);
      point = { x: state.t, y: src.x * 100 };
    }
  } else {
    const info = GRAPH_TYPES[state.graphType];
    const src = derivedAt(state.t, p.airOn);
    if (src) point = { x: state.t, y: src[info.field] };
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
  } else if (state.motion === "circular") {
    headers = p.airOn
      ? ["시간(s)", "실제 회전각(°)", "이론 회전각(°)", "회전각 오차율", "실제 각속도(°/s)", "이론 각속도(°/s)", "각속도 오차율"]
      : ["시간(s)", "회전각(°)", "각속도(°/s)"];
  } else if (state.motion === "shm") {
    headers = p.airOn
      ? ["시간(s)", "실제 변위(cm)", "이론 변위(cm)", "변위 오차율", "실제 속도(m/s)", "이론 속도(m/s)", "속도 오차율"]
      : ["시간(s)", "변위(cm)", "속도(m/s)"];
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
    } else if (state.motion === "circular") {
      const thd = theoryAt(tt);
      const thDeg = (thd.theta * 180) / Math.PI, thAV = (thd.omega * 180) / Math.PI;
      if (p.airOn) {
        const r = realAt(tt);
        const rDeg = (r.theta * 180) / Math.PI, rAV = (r.omega * 180) / Math.PI;
        cells = [fmt(tt, 2), fmt(rDeg), fmt(thDeg), errCell(rDeg, thDeg), fmt(rAV), fmt(thAV), errCell(rAV, thAV)];
      } else {
        cells = [fmt(tt, 2), fmt(thDeg), fmt(thAV)];
      }
    } else if (state.motion === "shm") {
      const thd = theoryAt(tt);
      const thXcm = thd.x * 100;
      if (p.airOn) {
        const r = realAt(tt);
        const rXcm = r.x * 100;
        cells = [fmt(tt, 2), fmt(rXcm), fmt(thXcm), errCell(rXcm, thXcm), fmt(r.v), fmt(thd.v), errCell(r.v, thd.v)];
      } else {
        cells = [fmt(tt, 2), fmt(thXcm), fmt(thd.v)];
      }
    }
    rows.push(`<tr>${cells.map((c) => (typeof c === "string" && c.startsWith("<td")) ? c : `<td>${c}</td>`).join("")}</tr>`);
    if (tt >= state.tEnd) break;
  }
  els.tableBody.innerHTML = rows.join("");
}

// 초기 실행
applyTheme(savedTheme);
