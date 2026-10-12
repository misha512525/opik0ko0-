'use strict';
// Мяч: скорость, трение, отскок, закрутка (эффект Магнуса), высота полёта,
// столкновения со штангами/перекладиной и сеткой ворот, предсказание траектории для ИИ.
(function (PF) {
  const C = PF.C;
  const Y1 = C.PITCH_W / 2 - C.GOAL_HALF, Y2 = C.PITCH_W / 2 + C.GOAL_HALF;
  const R = C.BALL_R;

  // Один шаг интегрирования; ev — колбэки (null при предсказании)
  function integrate(s, dt, ev) {
    const sp = Math.hypot(s.vx, s.vy);
    const air = s.z > 0.02 || s.vz > 0.1;
    // Закрутка: боковое ускорение перпендикулярно скорости
    if (s.spin && sp > 3) {
      const a = s.spin * sp * C.MAGNUS * (air ? 1 : 0.25) * dt;
      s.vx += (-s.vy / sp) * a; s.vy += (s.vx / sp) * a;
      s.spin *= 1 - C.SPIN_DECAY * dt;
    }
    if (air) {
      s.vz -= C.GRAVITY * dt;
      const k = 1 - C.AIR_DRAG * dt;
      s.vx *= k; s.vy *= k;
    } else {
      // качение: постоянное трение + линейное сопротивление
      const dec = (C.ROLL_DECEL + C.ROLL_DRAG * sp) * dt;
      if (sp <= dec) { s.vx = 0; s.vy = 0; } else { const k = (sp - dec) / sp; s.vx *= k; s.vy *= k; }
    }
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.z < 0) {
      s.z = 0;
      if (s.vz < -C.BOUNCE_STOP) {
        if (ev) ev.bounce(-s.vz);
        s.vz = -s.vz * C.BOUNCE;
        s.vx *= C.BOUNCE_FRICTION; s.vy *= C.BOUNCE_FRICTION;
        s.spin *= 0.5;
      } else s.vz = 0;
    }
    // Каркас ворот
    for (let side = 0; side < 2; side++) {
      const gx = side ? C.PITCH_L : 0;
      if (Math.abs(s.x - gx) > 2.6) continue;
      // штанги — вертикальные цилиндры
      if (s.z < C.GOAL_H + R) {
        for (let k = 0; k < 2; k++) {
          const py = k ? Y2 : Y1;
          const dx = s.x - gx, dy = s.y - py, d = Math.hypot(dx, dy), md = R + C.POST_R;
          if (d < md && d > 1e-5) {
            const nx = dx / d, ny = dy / d, vn = s.vx * nx + s.vy * ny;
            if (vn < 0) {
              s.vx -= (1 + C.POST_BOUNCE) * vn * nx; s.vy -= (1 + C.POST_BOUNCE) * vn * ny;
              if (ev) ev.post(-vn);
            }
            s.x = gx + nx * md; s.y = py + ny * md;
          }
        }
      }
      // перекладина — горизонтальный цилиндр вдоль Y
      if (s.y > Y1 && s.y < Y2) {
        const dx = s.x - gx, dz = s.z - C.GOAL_H, d = Math.hypot(dx, dz), md = R + C.POST_R;
        if (d < md && d > 1e-5) {
          const nx = dx / d, nz = dz / d, vn = s.vx * nx + s.vz * nz;
          if (vn < 0) { s.vx -= (1 + C.POST_BOUNCE) * vn * nx; s.vz -= (1 + C.POST_BOUNCE) * vn * nz; if (ev) ev.post(-vn); }
          s.x = gx + nx * md; s.z = C.GOAL_H + nz * md;
        }
      }
      // сетка: мяч внутри ворот гасится и остаётся внутри
      const inside = side ? s.x > gx : s.x < gx;
      if (inside && s.y > Y1 - R && s.y < Y2 + R && s.z < C.GOAL_H) {
        const back = side ? gx + C.GOAL_DEPTH - R : gx - C.GOAL_DEPTH + R;
        if (side ? s.x > back : s.x < back) { s.x = back; s.vx *= -0.12; s.vy *= 0.5; if (ev) ev.net(); }
        if (Math.abs(s.x - gx) > 0.15) {
          if (s.y < Y1 + R) { s.y = Y1 + R; s.vy = Math.abs(s.vy) * 0.2; }
          if (s.y > Y2 - R) { s.y = Y2 - R; s.vy = -Math.abs(s.vy) * 0.2; }
          if (s.z > C.GOAL_H - R) { s.z = C.GOAL_H - R; s.vz = -Math.abs(s.vz) * 0.2; }
        }
      }
    }
  }

  const PRED_X = new Float32Array(C.PRED_STEPS), PRED_Y = new Float32Array(C.PRED_STEPS), PRED_Z = new Float32Array(C.PRED_STEPS);
  const scratch = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };

  class Ball {
    constructor() { this.reset(52.5, 34); }
    reset(x, y) {
      this.x = x; this.y = y; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.spin = 0;
      this.px = x; this.py = y; this.pz = 0;
      this.owner = null; this.lastTouch = null; this.lastKick = null; this.roll = 0; this.frame = 0;
      this.shot = null; // данные последнего удара по воротам (для статистики)
      this.kickT = 0; this.kickType = '';
      this.held = false; // в руках вратаря
    }
    savePrev() { this.px = this.x; this.py = this.y; this.pz = this.z; }
    speed() { return Math.hypot(this.vx, this.vy); }
    kick(vx, vy, vz, spin, by, type) {
      this.vx = vx; this.vy = vy; this.vz = vz; this.spin = spin || 0;
      if (this.z <= 0 && vz > 0) this.z = 0.02;
      this.owner = null; this.held = false;
      this.lastTouch = by; this.lastKick = by; this.kickT = 0; this.kickType = type || 'pass';
    }
    update(dt, ev) {
      this.kickT += dt;
      if (this.owner) return;
      integrate(this, dt, ev);
      this.roll += Math.hypot(this.vx, this.vy) * dt;
      this.frame = Math.floor(this.roll / 0.22) & 3;
    }
    // Предсказание траектории (без игроков) — используется ИИ и вратарём
    predict() {
      const s = scratch;
      if (this.owner) {
        for (let i = 0; i < C.PRED_STEPS; i++) { PRED_X[i] = this.x; PRED_Y[i] = this.y; PRED_Z[i] = this.z; }
        return;
      }
      s.x = this.x; s.y = this.y; s.z = this.z; s.vx = this.vx; s.vy = this.vy; s.vz = this.vz; s.spin = this.spin;
      const sub = C.PRED_DT / 2;
      for (let i = 0; i < C.PRED_STEPS; i++) {
        PRED_X[i] = s.x; PRED_Y[i] = s.y; PRED_Z[i] = s.z;
        integrate(s, sub, null); integrate(s, sub, null);
      }
    }
    // Симуляция удара: пересечёт ли мяч линию ворот в створе (для «удар в створ»)
    static simulateOnTarget(x, y, z, vx, vy, vz, spin, side) {
      const s = scratch;
      s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz; s.spin = spin;
      const gx = side ? C.PITCH_L : 0;
      for (let i = 0; i < 240; i++) {
        const prevX = s.x;
        integrate(s, 1 / 60, null);
        if ((side && prevX < gx && s.x >= gx) || (!side && prevX > gx && s.x <= gx)) {
          return { hit: s.y > Y1 + 0.05 && s.y < Y2 - 0.05 && s.z < C.GOAL_H - 0.05, y: s.y, z: s.z, t: i / 60 };
        }
        if (Math.hypot(s.vx, s.vy) < 0.5 && s.z <= 0) break;
      }
      return { hit: false, y: s.y, z: s.z, t: 4 };
    }
  }
  Ball.PRED_X = PRED_X; Ball.PRED_Y = PRED_Y; Ball.PRED_Z = PRED_Z;
  Ball.Y1 = Y1; Ball.Y2 = Y2;
  PF.Ball = Ball;
})(window.PF);
