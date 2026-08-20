// 물리 계산 모듈: 자유낙하 / 포물선 운동 / 단진자 운동
// 이론값 = 닫힌형 공식(공기저항 없음), 실제값 = RK4 수치적분(공기저항 포함)

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

const Physics = {
  // ---------------- 자유낙하 ----------------
  freeFall: {
    tLand(h, g) {
      return Math.sqrt((2 * h) / g);
    },
    theoryAt(t, h, g) {
      const tLand = this.tLand(h, g);
      const tt = Math.min(t, tLand);
      const s = 0.5 * g * tt * tt;
      return { y: Math.max(h - s, 0), v: g * tt, landed: t >= tLand, tLand };
    },
    simulateReal(h, g, m, k, dt, tMax = 60) {
      let state = [0, 0]; // [낙하거리 s, 속도 v]
      let t = 0;
      const data = [{ t, s: 0, v: 0, y: h }];
      const deriv = ([s, v]) => [v, g - (k / m) * v * Math.abs(v)];
      while (state[0] < h && t < tMax) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        const s = Math.min(state[0], h);
        data.push({ t, s, v: state[1], y: Math.max(h - s, 0) });
        if (s >= h) break;
      }
      return data;
    },
  },

  // ---------------- 포물선 운동 ----------------
  projectile: {
    tLand(v0, angleRad, h0, g) {
      const vy0 = v0 * Math.sin(angleRad);
      const a = -0.5 * g,
        b = vy0,
        c = h0;
      const disc = b * b - 4 * a * c;
      return (-b - Math.sqrt(disc)) / (2 * a);
    },
    theoryAt(t, v0, angleDeg, h0, g) {
      const angle = (angleDeg * Math.PI) / 180;
      const vx0 = v0 * Math.cos(angle);
      const vy0 = v0 * Math.sin(angle);
      const tLand = this.tLand(v0, angle, h0, g);
      const tt = Math.min(t, tLand);
      const x = vx0 * tt;
      const y = Math.max(h0 + vy0 * tt - 0.5 * g * tt * tt, 0);
      const vx = vx0;
      const vy = vy0 - g * tt;
      return { x, y, vx, vy, speed: Math.hypot(vx, vy), landed: t >= tLand, tLand };
    },
    simulateReal(v0, angleDeg, h0, g, m, k, dt, tMax = 60) {
      const angle = (angleDeg * Math.PI) / 180;
      let state = [0, h0, v0 * Math.cos(angle), v0 * Math.sin(angle)]; // x,y,vx,vy
      let t = 0;
      const data = [{ t, x: 0, y: h0, vx: state[2], vy: state[3], speed: v0 }];
      const deriv = ([x, y, vx, vy]) => {
        const speed = Math.hypot(vx, vy);
        return [vx, vy, -(k / m) * speed * vx, -g - (k / m) * speed * vy];
      };
      while (state[1] >= 0 && t < tMax) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        const y = Math.max(state[1], 0);
        data.push({ t, x: state[0], y, vx: state[2], vy: state[3], speed: Math.hypot(state[2], state[3]) });
        if (state[1] <= 0) break;
      }
      return data;
    },
  },

  // ---------------- 단진자 운동 ----------------
  pendulum: {
    period(L, g) {
      return 2 * Math.PI * Math.sqrt(L / g);
    },
    theoryAt(t, L, theta0Deg, g) {
      const theta0 = (theta0Deg * Math.PI) / 180;
      const omega0 = Math.sqrt(g / L);
      const theta = theta0 * Math.cos(omega0 * t);
      const angVel = -theta0 * omega0 * Math.sin(omega0 * t);
      return { theta, angVel };
    },
    simulateReal(L, theta0Deg, g, m, k, dt, tEnd) {
      const theta0 = (theta0Deg * Math.PI) / 180;
      let state = [theta0, 0]; // theta, omega
      let t = 0;
      const data = [{ t, theta: theta0, angVel: 0 }];
      const deriv = ([theta, omega]) => {
        const gravTerm = -(g / L) * Math.sin(theta);
        const dragTerm = -((k * L) / m) * omega * Math.abs(omega);
        return [omega, gravTerm + dragTerm];
      };
      while (t < tEnd) {
        state = rk4Step(state, dt, deriv);
        t += dt;
        data.push({ t, theta: state[0], angVel: state[1] });
      }
      return data;
    },
  },
};
