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
  presetButtons: document.getElementById("presetButtons"),
  exportChartBtn: document.getElementById("exportChartBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  showVelocity: document.getElementById("showVelocity"),
  showAccel: document.getElementById("showAccel"),
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

// 운동별 프리셋: els.<id>.value에 그대로 넣을 값들 (문자열/숫자 둘 다 가능)
const PRESETS = {
  freefall: [
    { label: "지구에서 사과 낙하", values: { gravity: 9.8, ff_height: 1.5, ff_restitution: 0.2 } },
    { label: "달에서 낙하 (g=1.6)", values: { gravity: 1.6, ff_height: 1.5, ff_restitution: 0.2 } },
    { label: "높은 곳에서 쇠구슬 낙하", values: { gravity: 9.8, ff_height: 20, ff_restitution: 0.7 } },
  ],
  projectile: [
    { label: "야구공 던지기", values: { pj_v0: 20, pj_angle: 35, pj_h0: 1.5 } },
    { label: "농구 슛", values: { pj_v0: 7, pj_angle: 52, pj_h0: 2 } },
  ],
  circular: [
    { label: "놀이공원 회전 그네", values: { ci_radius: 3, ci_v0: 4 } },
    { label: "빠르게 도는 인공위성", values: { ci_radius: 1, ci_v0: 8 } },
  ],
  pendulum: [
    { label: "그네 타기", values: { pd_length: 2.5, pd_angle: 25 } },
    { label: "괘종시계 진자", values: { pd_length: 0.25, pd_angle: 10 } },
  ],
  shm: [
    { label: "부드러운 스프링", values: { sh_springK: 0.1, sh_x0: 3 } },
    { label: "뻣뻣한 스프링", values: { sh_springK: 5, sh_x0: 2 } },
  ],
};

function renderPresets() {
  const list = PRESETS[state.motion] || [];
  els.presetButtons.innerHTML = "";
  list.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      Object.entries(preset.values).forEach(([id, value]) => {
        if (els[id]) els[id].value = value;
      });
      resetPlayback();
      computeAll();
    });
    els.presetButtons.appendChild(btn);
  });
}

// 이론(k=0)이 손실 없이 정확히 주기적인 운동들 — theoryAt/derivedAt에서 위상을 감아 반복시킨다.
const PERIODIC_MOTIONS = ["pendulum", "circular", "shm"];

let state = {
  motion: "freefall",
  theme: "light",
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
  showVelocity: false,
  showAccel: false,
  maxV: 1,
  maxA: 1,
};

[["showVelocity", "showVelocity"], ["showAccel", "showAccel"]].forEach(([elKey, stateKey]) => {
  const input = els[elKey];
  const chip = input.closest(".toggle-chip");
  input.addEventListener("change", () => {
    state[stateKey] = input.checked;
    chip.classList.toggle("active", input.checked);
    drawFrame();
  });
});

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

let savedTheme = "light";
try { savedTheme = localStorage.getItem("physicsSimTheme") || "light"; } catch (e) {}

// ---------------- 모션 전환 ----------------
function setMotion(motion) {
  els.motionBtns.forEach((b) => b.classList.toggle("active", b.dataset.motion === motion));
  state.motion = motion;
  els.panels.forEach((p) => {
    p.classList.toggle("hidden", p.dataset.motionPanel !== state.motion);
  });
  els.canvas.classList.toggle("pendulum-mode", motion === "pendulum");
  renderPresets();
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(text) {
  const s = String(text);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

els.exportCsvBtn.addEventListener("click", () => {
  const headers = [...els.tableHead.querySelectorAll("th")].map((th) => th.textContent);
  const rows = [...els.tableBody.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent)
  );
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${state.motion}_측정값.csv`);
});

els.exportChartBtn.addEventListener("click", () => {
  if (!state.chart) return;
  const a = document.createElement("a");
  a.href = state.chart.toBase64Image();
  a.download = `${state.motion}_${state.graphType}_그래프.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
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

  const extra = { L: p.pd_L, R: p.ci_R, springK: p.sh_k };
  state.theoryDerived = Physics.derive(state.theoryData, state.motion, p.massKg, p.g, extra);
  state.realDerived = state.realData ? Physics.derive(state.realData, state.motion, p.massKg, p.g, extra) : null;
  state.maxV = Math.max(maxAbsField(state.theoryDerived, "v"), state.realDerived ? maxAbsField(state.realDerived, "v") : 0, 1e-6);
  // 가속도는 반발/벽 충돌 순간 속도가 한 스텝 만에 뒤집히면서 유한차분 값이 순간적으로
  // 치솟는다. 이 한두 프레임짜리 충돌 스파이크를 기준으로 화살표 길이를 잡으면 평소
  // 가속도 화살표가 거의 안 보일 만큼 짧아지므로, 최댓값 대신 95백분위수를 기준으로 쓴다.
  state.maxA = Math.max(percentileAbsField(state.theoryDerived, "a"), state.realDerived ? percentileAbsField(state.realDerived, "a") : 0, 1e-6);

  buildChart(p);
  buildTable(p);
  drawFrame();
}

function maxAbsField(data, field) {
  let m = 0;
  for (const d of data) { const v = Math.abs(d[field]); if (v > m) m = v; }
  return m;
}

function percentileAbsField(data, field, pct = 0.95) {
  if (!data.length) return 0;
  const vals = data.map((d) => Math.abs(d[field])).sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(vals.length * pct))];
}

// 등속원운동·단진자·단진동처럼 감쇠가 아주 약할 때, 그래프에 수십 개의 진동이
// 한꺼번에 몰려 파란 선이 사실상 색칠된 것처럼 겹쳐 보이는 걸 막기 위한 표시 구간 상한.
const MAX_DISPLAY_PERIODS = 12;
function motionPeriod(motion, p) {
  if (motion === "pendulum") return Physics.pendulum.period(p.pd_L, p.g);
  if (motion === "circular") return Physics.circular.period(p.ci_R, p.ci_v0);
  if (motion === "shm") return Physics.shm.period(p.sh_k, p.massKg);
  return null;
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

function drawVectorArrow(x, y, dirX, dirY, length, color) {
  const mag = Math.hypot(dirX, dirY);
  if (mag < 1e-6 || length < 1) return;
  const ux = dirX / mag, uy = dirY / mag;
  const endX = x + ux * length, endY = y + uy * length;
  const angle = Math.atan2(uy, ux);
  const headLen = 7;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 속도/가속도 벡터: 방향은 화면 좌표에서 근처 시점들의 위치 차분으로(모션마다 다른 화면
// 변환을 다시 손으로 안 풀어도 되게), 길이는 이 운동에서 나올 수 있는 최댓값 대비 비율로 정한다.
function drawMotionVectors(mapFn, ballX, ballY) {
  if (!state.showVelocity && !state.showAccel) return;
  const p = getParams();
  const useReal = p.airOn;
  const data = useReal ? state.realData : state.theoryData;
  if (!data) return;
  const derived = derivedAt(state.t, useReal);
  if (!derived) return;

  const wrap = (tt) => {
    if (useReal || !PERIODIC_MOTIONS.includes(state.motion) || state.theoryDuration <= 0) return Math.max(tt, 0);
    return ((tt % state.theoryDuration) + state.theoryDuration) % state.theoryDuration;
  };
  const tNext = wrap(state.t + SIM_DT);
  const tPrev = wrap(state.t - SIM_DT);
  const tCur = wrap(state.t);
  const nextPt = mapFn(Physics.sampleAt(data, SIM_DT, tNext));
  const prevPt = mapFn(Physics.sampleAt(data, SIM_DT, tPrev));

  if (state.showVelocity) {
    const dx = nextPt.x - prevPt.x, dy = nextPt.y - prevPt.y;
    const len = 14 + Math.min(1, Math.abs(derived.v) / state.maxV) * 50;
    drawVectorArrow(ballX, ballY, dx, dy, len, "#ffd166");
  }
  if (state.showAccel) {
    const curPt = mapFn(Physics.sampleAt(data, SIM_DT, tCur));
    const adx = nextPt.x - 2 * curPt.x + prevPt.x;
    const ady = nextPt.y - 2 * curPt.y + prevPt.y;
    // maxA는 충돌 스파이크를 배제한 95백분위수라 실제 순간값이 이를 넘을 수 있어 1로 클램프한다.
    const len = 14 + Math.min(1, Math.abs(derived.a) / state.maxA) * 50;
    drawVectorArrow(ballX, ballY, adx, ady, len, "#ff6b6b");
  }
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
    const mapFn = (d) => ({ x: cx, y: toY(d.y) });
    drawTrail(collectTrail(mapFn));

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
    drawMotionVectors(mapFn, cx, curY);
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

    const mapFn = (d) => { const [x, y] = toPx(d.x, d.y); return { x, y }; };
    drawTrail(collectTrail(mapFn));

    const thd = theoryAt(state.t);
    const [thx, thy] = toPx(thd.x, thd.y);
    let curSpeed = thd.speed;
    let ballX = thx, ballY = thy;

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
      ballX = rx; ballY = ry;
    } else {
      drawSteelBall(thx, thy, ballR, false);
    }
    drawMotionVectors(mapFn, ballX, ballY);
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
    const mapFn = (d) => ballPos(d.theta);
    drawTrail(collectTrail(mapFn));

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
    let finalTheta = thd.theta;
    if (p.airOn) {
      drawArm(thd.theta, true);
      const r = realAt(state.t);
      drawArm(r.theta, false);
      curAngDeg = (r.theta * 180) / Math.PI;
      curAngVel = (r.angVel * 180) / Math.PI;
      finalTheta = r.theta;
    } else {
      drawArm(thd.theta, false);
    }
    const finalBallPos = ballPos(finalTheta);
    drawMotionVectors(mapFn, finalBallPos.x, finalBallPos.y);
    els.readout.textContent = `시간: ${state.t.toFixed(2)} s   각도: ${curAngDeg.toFixed(1)}°   각속도: ${curAngVel.toFixed(1)} °/s`;

  } else if (state.motion === "circular") {
    const cx = W / 2, cy = H / 2;
    const margin = 40;
    const scale = (Math.min(W, H) / 2 - margin) / p.ci_R;
    const posAt = (theta) => ({ x: cx + Math.cos(theta) * p.ci_R * scale, y: cy + Math.sin(theta) * p.ci_R * scale });
    const mapFn = (d) => posAt(d.theta);

    ctx.save();
    ctx.strokeStyle = th.ghostStroke;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, p.ci_R * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = th.ground;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

    drawTrail(collectTrail(mapFn));

    const thd = theoryAt(state.t);
    const thPos = posAt(thd.theta);
    if (p.airOn) drawSteelBall(thPos.x, thPos.y, ballR, true);

    let curOmegaDeg = (thd.omega * 180) / Math.PI;
    let ballX = thPos.x, ballY = thPos.y;
    if (p.airOn) {
      const r = realAt(state.t);
      const rPos = posAt(r.theta);
      drawSteelBall(rPos.x, rPos.y, ballR, false);
      curOmegaDeg = (r.omega * 180) / Math.PI;
      ballX = rPos.x; ballY = rPos.y;
    } else {
      drawSteelBall(thPos.x, thPos.y, ballR, false);
    }
    drawMotionVectors(mapFn, ballX, ballY);
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

    const mapFn = (d) => ({ x: toX(d.x), y: midY });
    drawTrail(collectTrail(mapFn));

    const thd = theoryAt(state.t);
    const thX = toX(thd.x);
    if (p.airOn) {
      drawSpring(thX, th.ghostStroke);
      drawSteelBall(thX, midY, ballR, true);
    }

    let curV = thd.v, curX = thd.x, ballX = thX;
    if (p.airOn) {
      const r = realAt(state.t);
      const x = toX(r.x);
      drawSpring(x, th.ground);
      drawSteelBall(x, midY, ballR, false);
      curV = r.v; curX = r.x; ballX = x;
    } else {
      drawSpring(thX, th.ground);
      drawSteelBall(thX, midY, ballR, false);
    }
    drawMotionVectors(mapFn, ballX, midY);
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

  // 감쇠가 아주 약한 등속원운동/단진자/단진동은 진동이 수십 번 반복돼도 거의 안 줄어들어서,
  // 전체를 다 그리면 그래프에 선이 촘촘히 겹쳐 색칠된 것처럼 보인다. 그래프에는 앞쪽 몇 주기만
  // 보여주고(애니메이션과 표는 전체 길이를 그대로 씀), 이걸로 파란 선이 뭉개져 보이는 문제를 막는다.
  const period = motionPeriod(state.motion, p);
  const maxChartT = period ? Math.min(state.tEnd, period * MAX_DISPLAY_PERIODS) : state.tEnd;
  const capData = (data) => (data.length && data[data.length - 1].t > maxChartT ? data.filter((d) => d.t <= maxChartT) : data);

  let theoryPts, realPts;

  if (gt === "st") {
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
    theoryPts = capData(state.theoryData).map((d) => toPoint(state.motion, d));
    realPts = state.realData ? capData(state.realData).map((d) => toPoint(state.motion, d)) : [];
  } else {
    const info = GRAPH_TYPES[gt];
    labelY = `${info.label} (${info.unit})`;
    theoryPts = capData(state.theoryDerived).map((d) => ({ x: d.t, y: d[info.field] }));
    realPts = state.realDerived ? capData(state.realDerived).map((d) => ({ x: d.t, y: d[info.field] })) : [];
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
// 유효숫자 기준 표시 (물리량은 자릿수에 관계없이 4자리 유효숫자로 통일).
// 시간 열은 등간격 눈금이라 별도로 fmtTime()에서 고정 소수점으로 표시한다.
function fmt(n, sig = 4) {
  if (!Number.isFinite(n)) return "-";
  if (n === 0) return "0";
  return Number(n.toPrecision(sig)).toString();
}
function fmtTime(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "-";
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
        cells = [fmtTime(tt), fmt(r.y), fmt(thd.y), errCell(r.y, thd.y), fmt(r.v), fmt(thd.v), errCell(r.v, thd.v)];
      } else {
        cells = [fmtTime(tt), fmt(thd.y), fmt(thd.v)];
      }
    } else if (state.motion === "projectile") {
      const thd = theoryAt(tt);
      if (p.airOn) {
        const r = realAt(tt);
        cells = [fmtTime(tt), fmt(r.x), fmt(thd.x), errCell(r.x, thd.x), fmt(r.y), fmt(thd.y), errCell(r.y, thd.y)];
      } else {
        cells = [fmtTime(tt), fmt(thd.x), fmt(thd.y), fmt(thd.speed)];
      }
    } else if (state.motion === "pendulum") {
      const thd = theoryAt(tt);
      const thDeg = (thd.theta * 180) / Math.PI, thAV = (thd.angVel * 180) / Math.PI;
      if (p.airOn) {
        const r = realAt(tt);
        const rDeg = (r.theta * 180) / Math.PI, rAV = (r.angVel * 180) / Math.PI;
        cells = [fmtTime(tt), fmt(rDeg), fmt(thDeg), errCell(rDeg, thDeg), fmt(rAV), fmt(thAV), errCell(rAV, thAV)];
      } else {
        cells = [fmtTime(tt), fmt(thDeg), fmt(thAV)];
      }
    } else if (state.motion === "circular") {
      const thd = theoryAt(tt);
      const thDeg = (thd.theta * 180) / Math.PI, thAV = (thd.omega * 180) / Math.PI;
      if (p.airOn) {
        const r = realAt(tt);
        const rDeg = (r.theta * 180) / Math.PI, rAV = (r.omega * 180) / Math.PI;
        cells = [fmtTime(tt), fmt(rDeg), fmt(thDeg), errCell(rDeg, thDeg), fmt(rAV), fmt(thAV), errCell(rAV, thAV)];
      } else {
        cells = [fmtTime(tt), fmt(thDeg), fmt(thAV)];
      }
    } else if (state.motion === "shm") {
      const thd = theoryAt(tt);
      const thXcm = thd.x * 100;
      if (p.airOn) {
        const r = realAt(tt);
        const rXcm = r.x * 100;
        cells = [fmtTime(tt), fmt(rXcm), fmt(thXcm), errCell(rXcm, thXcm), fmt(r.v), fmt(thd.v), errCell(r.v, thd.v)];
      } else {
        cells = [fmtTime(tt), fmt(thXcm), fmt(thd.v)];
      }
    }
    rows.push(`<tr>${cells.map((c) => (typeof c === "string" && c.startsWith("<td")) ? c : `<td>${c}</td>`).join("")}</tr>`);
    if (tt >= state.tEnd) break;
  }
  els.tableBody.innerHTML = rows.join("");
}

// 초기 실행
renderPresets();
applyTheme(savedTheme);
