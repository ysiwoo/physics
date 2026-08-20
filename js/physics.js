// 물리 계산 모듈: 자유낙하 / 포물선 운동 / 단진자 운동
// 이론(k=0) / 실제(k>0, 공기저항) 모두 같은 RK4 적분기를 사용하고,
// 자유낙하·포물선은 바닥에서 반발계수만큼 튕기며, 단진자는 감쇠 진동한다.
// 각 simulate()는 일정 시간(정지/한계) 이후 멈추는 "한 사이클" 데이터를 만들고,
// 재생 쪽(main.js)에서 이 사이클을 반복 재생해 운동이 끝없이 이어지는 것처럼 보이게 한다.

const STEEL_DENSITY = 7850; // kg/m^3, 강철 밀도

function ballArea(radiusM) {
  return Math.PI * radiusM * radiusM;
}

// 항력 계수 k: F_drag = k * v^2 (뉴턴 항력, 구 형태)
function dragK(rho, Cd, radiusM) {
  return 0.5 * rho * Cd * ballArea(radiusM);
}

function steelMassFromRadius(radiusM) {
  const volume = (4 / 3) * Math.PI * Math.pow(radiusM, 3);
  return STEEL_DENSITY * volume; // kg
}

// 4차 룽게-쿠타 적분 한 스텝
function rk4Step(state, dt, deriv) {
  const k1 = deriv(state);
  const s2 = state.map((v, i) => v + (k1[i] * dt) / 2);
  const k2 = deriv(s2);
  const s3 = state.map((v, i) => v + (k2[i] * dt) / 2);
  const k3 = deriv(s3);
  const s4 = state.map((v, i) => v + k3[i] * dt);
  const k4 = deriv(s4);
  return state.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function sampleAt(data, dt, t) {
  const idx = Math.min(data.length - 1, Math.max(0, Math.round(t / dt)));
  return data[idx];
}

const Physics = {
  sampleAt,

  // ---------------- 자유낙하 (바닥에서 반발) ----------------
  freeFall: {
    // state: [y(바닥 기준 높이), vy(+ 위, - 아래)]
    simulate(h, g, m, k, restitution, dt) {
      let state = [h, 0];
      let t = 0;
      const data = [{ t, y: h, v: 0 }];
      const deriv = ([y, vy]) => [vy, -g - (k > 0 ? (k / m) * vy * Math.abs(vy) : 0)];
      const tMax = 40;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < tMax) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        if (state[0] <= 0 && state[1] < 0) {
          state[0] = 0;
          state[1] = -state[1] * restitution;
        }
        data.push({ t, y: Math.max(state[0], 0), v: state[1] });
        if (Math.abs(state[0]) < 0.004 && Math.abs(state[1]) < 0.06) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // ---------------- 포물선 운동 (바닥에서 반발) ----------------
  projectile: {
    simulate(v0, angleDeg, h0, g, m, k, restitution, dt) {
      const angle = (angleDeg * Math.PI) / 180;
      let state = [0, h0, v0 * Math.cos(angle), v0 * Math.sin(angle)]; // x,y,vx,vy
      let t = 0;
      const data = [{ t, x: 0, y: h0, vx: state[2], vy: state[3], speed: v0 }];
      const deriv = ([, , vx, vy]) => {
        const speed = Math.hypot(vx, vy);
        const drag = k > 0 ? (k / m) * speed : 0;
        return [vx, vy, -drag * vx, -g - drag * vy];
      };
      const tMax = 40;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < tMax) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        if (state[1] <= 0 && state[3] < 0) {
          state[1] = 0;
          state[3] = -state[3] * restitution;
          state[2] = state[2] * 0.85; // 바닥 마찰로 수평 속도 일부 손실
        }
        const speed = Math.hypot(state[2], state[3]);
        data.push({ t, x: state[0], y: Math.max(state[1], 0), vx: state[2], vy: state[3], speed });
        if (Math.abs(state[1]) < 0.004 && speed < 0.08) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // ---------------- 단진자 운동 (감쇠) ----------------
  pendulum: {
    period(L, g) {
      return 2 * Math.PI * Math.sqrt(L / g);
    },
    // k=0(이론)이면 minPeriods 만큼 정확히 돌고 멈춘다 (반복 재생 시 이음매가 자연스럽도록).
    // k>0(실제, 공기저항)이면 감쇠로 멈추거나, minPeriods를 다 채우거나, 최대 한계까지 돈다.
    simulate(L, theta0Deg, g, m, k, minPeriods, dt) {
      const theta0 = (theta0Deg * Math.PI) / 180;
      let state = [theta0, 0];
      let t = 0;
      const data = [{ t, theta: theta0, angVel: 0 }];
      const deriv = ([theta, omega]) => {
        const gravTerm = -(g / L) * Math.sin(theta);
        const dragTerm = k > 0 ? -((k * L) / m) * omega * Math.abs(omega) : 0;
        return [omega, gravTerm + dragTerm];
      };
      const T = this.period(L, g);
      const minT = Math.max(minPeriods, 1) * T;
      const hardCap = 60;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < hardCap) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        data.push({ t, theta: state[0], angVel: state[1] });
        if (k === 0) {
          if (t >= minT) break; // 무손실: 정확히 요청한 주기 수에서 끊어 매끄럽게 반복
          continue;
        }
        if (t >= minT && Math.abs(state[0]) < 0.01 && Math.abs(state[1]) < 0.02) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // ---------------- 운동량·충격량 실험 (벽 사이를 오가며 반발) ----------------
  momentum: {
    // state: [x(왼쪽 벽 기준 위치), v(+ 오른쪽)]
    simulate(D, v0, m, k, restitution, dt) {
      let state = [D / 2, v0];
      let t = 0;
      const data = [{ t, x: D / 2, v: v0 }];
      const deriv = ([, v]) => [v, k > 0 ? -(k / m) * v * Math.abs(v) : 0];
      const tMax = 40;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < tMax) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        if (state[0] <= 0 && state[1] < 0) {
          state[0] = 0;
          state[1] = -state[1] * restitution;
        } else if (state[0] >= D && state[1] > 0) {
          state[0] = D;
          state[1] = -state[1] * restitution;
        }
        data.push({ t, x: state[0], v: state[1] });
        if (Math.abs(state[1]) < 0.03) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // ---------------- 등속 원운동 (감쇠 시 각속도 감소) ----------------
  circular: {
    period(R, v0) {
      return (2 * Math.PI * R) / Math.abs(v0);
    },
    // k=0(이론)이면 각속도가 일정하게 유지되어 정확히 minPeriods만큼 돌고 끊는다 (반복 재생 이음매용).
    simulate(R, v0, m, k, minPeriods, dt) {
      const omega0 = v0 / R;
      let state = [0, omega0];
      let t = 0;
      const data = [{ t, theta: 0, omega: omega0 }];
      const deriv = ([, omega]) => [omega, k > 0 ? -((k * R) / m) * omega * Math.abs(omega) : 0];
      const T = this.period(R, v0);
      const minT = Math.max(minPeriods, 1) * T;
      const hardCap = 60;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < hardCap) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        data.push({ t, theta: state[0], omega: state[1] });
        if (k === 0) {
          if (t >= minT) break;
          continue;
        }
        if (t >= minT && Math.abs(state[1]) < 0.02) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // ---------------- 단진동 운동 (용수철 - 감쇠) ----------------
  shm: {
    period(springK, m) {
      return 2 * Math.PI * Math.sqrt(m / springK);
    },
    simulate(springK, x0, m, k, minPeriods, dt) {
      let state = [x0, 0];
      let t = 0;
      const data = [{ t, x: x0, v: 0 }];
      const deriv = ([x, v]) => [v, -(springK / m) * x - (k > 0 ? (k / m) * v * Math.abs(v) : 0)];
      const T = this.period(springK, m);
      const minT = Math.max(minPeriods, 1) * T;
      const hardCap = 60;
      const restStreakLimit = Math.round(0.6 / dt);
      let restStreak = 0;
      while (t < hardCap) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        data.push({ t, x: state[0], v: state[1] });
        if (k === 0) {
          if (t >= minT) break;
          continue;
        }
        if (t >= minT && Math.abs(state[0]) < 0.003 && Math.abs(state[1]) < 0.02) {
          restStreak++;
          if (restStreak > restStreakLimit) break;
        } else {
          restStreak = 0;
        }
      }
      return data;
    },
  },

  // 위치/속도 데이터에서 운동량·가속도·힘·에너지를 유도한다 (그래프용).
  // 속도는 중심차분으로 미분해 순간 가속도를 구한다.
  // extra: 단진자={L}, 등속원운동={R}, 단진동={springK} — 나머지 운동은 사용하지 않는다.
  derive(data, motion, m, g, extra) {
    const n = data.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = data[i];
      const prev = data[Math.max(i - 1, 0)];
      const next = data[Math.min(i + 1, n - 1)];
      const dt = Math.max(next.t - prev.t, 1e-6);
      let v, a, h, PE;
      if (motion === "freefall") {
        v = d.v;
        a = (next.v - prev.v) / dt;
        h = d.y;
        PE = m * g * h;
      } else if (motion === "projectile") {
        v = Math.hypot(d.vx, d.vy);
        const ax = (next.vx - prev.vx) / dt;
        const ay = (next.vy - prev.vy) / dt;
        a = Math.hypot(ax, ay);
        h = d.y;
        PE = m * g * h;
      } else if (motion === "pendulum") {
        const L = extra.L;
        v = L * d.angVel;
        const angAccel = (next.angVel - prev.angVel) / dt;
        const centripetal = L * d.angVel * d.angVel; // 구심가속도 (v²/L)
        const tangential = L * angAccel; // 접선가속도
        a = Math.hypot(tangential, centripetal);
        h = L * (1 - Math.cos(d.theta)); // 최하점 기준 높이
        PE = m * g * h;
      } else if (motion === "momentum") {
        v = d.v;
        a = (next.v - prev.v) / dt;
        PE = 0; // 수평 트랙, 높이 변화 없음
      } else if (motion === "circular") {
        const R = extra.R;
        v = R * d.omega;
        a = R * d.omega * d.omega; // 구심가속도 (등속이면 일정, 감쇠 시 감소)
        PE = 0; // 수평면 위 원운동, 높이 변화 없음
      } else if (motion === "shm") {
        v = d.v;
        a = (next.v - prev.v) / dt;
        PE = 0.5 * extra.springK * d.x * d.x; // 탄성 위치 에너지
      }
      const KE = 0.5 * m * v * v;
      out[i] = { t: d.t, v, a, F: m * a, KE, PE, ME: KE + PE, p: m * v };
    }
    return out;
  },
};
