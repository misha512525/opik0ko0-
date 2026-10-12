'use strict';
// Игрок: кинематика, анимация, дриблинг и все удары по мячу (пасы, навесы, удары, подкаты).
// Статы влияют на скорость, точность, силу, приём, отбор и выносливость.
(function (PF) {
  const C = PF.C, U = PF.U, POSE = PF.POSE, DIR = PF.DIR;

  // Подбор начальной скорости низового паса, чтобы мяч дошёл до цели со скоростью va.
  // Модель трения: dv/dt = -(a + k v) -> решаем бисекцией.
  function passSpeed(d, va) {
    const a = C.ROLL_DECEL, k = C.ROLL_DRAG, ak = a / k;
    let lo = va, hi = 60;
    for (let i = 0; i < 24; i++) {
      const v0 = (lo + hi) / 2;
      const T = Math.log((v0 + ak) / (va + ak)) / k;
      const s = (v0 - va) / k - ak * T;
      if (s < d) lo = v0; else hi = v0;
    }
    return (lo + hi) / 2;
  }

  class Player {
    constructor(match, team, def, slot) {
      this.m = match; this.team = team; this.def = def; this.slot = slot;
      this.num = def.num;
      this.isGK = false;
      this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
      this.px = 0; this.py = 0; this.pz = 0;
      this.facing = 0;
      this.state = 'move'; this.stateT = 0;
      this.animT = Math.random() * 3;
      this.ix = 0; this.iy = 0; this.sprint = false; // намерение движения (0..1)
      this.faceX = null; this.faceY = null;          // куда смотреть, стоя на месте
      this.tx = 0; this.ty = 0;                      // цель ИИ
      this.stamina = 1;
      this.kickCD = 0;
      this.controlled = false;
      this.buffer = null; this.bufferT = 0; this.charge = 0; this.charging = false;
      this.offside = false;
      this.yellow = 0; this.red = false; this.off = false;
      this.skillCD = 0; this.skillDir = 1;
      this.diveX = 0; this.diveY = 0;
      this.slideTouched = false; this.slideFouled = false;
      this.aiT = Math.random() * 0.3; this.holdT = 0; this.runT = 0; this.runX = 0; this.runY = 0;
      this.pressOrder = 0;
      this.tackleCD = 0;
      this.st = { goals: 0, assists: 0, shots: 0, onT: 0, passes: 0, passOk: 0, tackles: 0, fouls: 0, saves: 0, inter: 0, keyPass: 0, yellow: 0, red: 0, conceded: 0, minutes: 0 };
      this.rating = 6.0;
      this.pose = POSE.IDLE; this.dir = DIR.RIGHT;
      this.rx = 0; this.ry = 0; this.rz = 0; // позиция для отрисовки (интерполяция/повтор)
      this.setStats(def.stats, 1);
    }
    setStats(s, mul) {
      const m = (v) => U.clamp(v * mul, 10, 99);
      this.s = { spd: m(s.spd), sho: m(s.sho), pas: m(s.pas), dri: m(s.dri), def: m(s.def), phy: m(s.phy), gk: m(s.gk) };
    }
    get name() { return this.def.name; }
    get dirX() { return this.team.dir; }
    hasBall() { return this.m.ball.owner === this; }
    canAct() { return !this.off && (this.state === 'move' || this.state === 'hold'); }
    place(x, y) { this.x = this.px = x; this.y = this.py = y; this.z = this.pz = 0; this.vx = this.vy = 0; }
    savePrev() { this.px = this.x; this.py = this.y; this.pz = this.z; }
    setState(s, t) { this.state = s; this.stateT = 0; if (t !== undefined) this.stateDur = t; }

    maxSpeed() {
      let v = C.BASE_SPEED + C.SPEED_STAT_K * this.s.spd / 100;
      if (this.sprint && this.stamina > 0.05) v *= C.SPRINT_MUL;
      if (this.hasBall()) v *= C.DRIBBLE_MUL + this.s.dri / 1500;
      v *= U.lerp(C.STAMINA_SLOW, 1, Math.min(1, this.stamina * 1.6));
      if (this.isGK) v *= 0.92;
      return v;
    }

    // --- Основной апдейт кинематики ---
    update(dt) {
      if (this.off) return;
      this.stateT += dt;
      if (this.kickCD > 0) this.kickCD -= dt;
      if (this.skillCD > 0) this.skillCD -= dt;
      if (this.tackleCD > 0) this.tackleCD -= dt;
      if (this.bufferT > 0) { this.bufferT -= dt; if (this.bufferT <= 0) this.buffer = null; }
      const ball = this.m.ball;
      switch (this.state) {
        case 'kick': case 'tackle':
          this.friction(dt, 14);
          if (this.stateT > (this.stateDur || 0.22)) this.setState('move');
          break;
        case 'slide': {
          const k = 1 - this.stateT / C.SLIDE_TIME;
          this.vx = Math.cos(this.facing) * C.SLIDE_SPEED * Math.max(0, k);
          this.vy = Math.sin(this.facing) * C.SLIDE_SPEED * Math.max(0, k);
          if (Math.random() < 0.5) PF.FX.dust(this.x, this.y, 1);
          if (this.stateT > C.SLIDE_TIME) this.setState('getup', 0.35);
          break;
        }
        case 'getup': this.friction(dt, 20); if (this.stateT > this.stateDur) this.setState('move'); break;
        case 'down': this.friction(dt, 8); if (this.stateT > (this.stateDur || C.FALL_TIME)) this.setState('move'); break;
        case 'skill': {
          const k = 1 - this.stateT / C.SKILL_TIME;
          this.vx = U.lerp(this.vx, this.skX * C.SKILL_SPEED, 0.35) * (0.5 + 0.5 * k);
          this.vy = U.lerp(this.vy, this.skY * C.SKILL_SPEED, 0.35) * (0.5 + 0.5 * k);
          if (this.stateT > C.SKILL_TIME) this.setState('move');
          break;
        }
        case 'dive': {
          const k = 1 - this.stateT / C.GK_DIVE_TIME;
          this.vx = this.diveX * k; this.vy = this.diveY * k;
          if (this.stateT > C.GK_DIVE_TIME) { this.setState('down', 0.55); }
          break;
        }
        case 'throw':
          this.friction(dt, 10);
          if (this.stateT > (this.stateDur || 0.35)) this.setState('move');
          break;
        case 'celebrate': case 'idle':
          this.friction(dt, 6);
          if (this.state === 'celebrate') this.steer(dt);
          break;
        case 'hold': this.steer(dt); break;
        default: this.steer(dt);
      }
      // вертикаль (прыжки)
      if (this.z > 0 || this.vz > 0) {
        this.vz -= C.GRAVITY * dt; this.z += this.vz * dt;
        if (this.z <= 0) { this.z = 0; this.vz = 0; }
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      // не убегаем далеко за пределы поля
      this.x = U.clamp(this.x, -3, C.PITCH_L + 3); this.y = U.clamp(this.y, -2.5, C.PITCH_W + 2.5);
      // выносливость
      const sp = Math.hypot(this.vx, this.vy);
      if (this.sprint && sp > 5) this.stamina -= C.STAMINA_SPRINT * (1.3 - this.s.phy / 200) * dt;
      else if (sp > 3) this.stamina -= C.STAMINA_RUN * dt;
      else this.stamina += C.STAMINA_REGEN * dt;
      this.stamina = U.clamp(this.stamina, 0, 1);
      // анимация бега
      this.animT += sp * dt * 0.62;
      // мяч у ног
      if (ball.owner === this) this.dribble(dt, sp);
    }
    friction(dt, k) { const f = Math.max(0, 1 - k * dt); this.vx *= f; this.vy *= f; }

    // Разгон к желаемой скорости + поворот корпуса
    steer(dt) {
      let ix = this.ix, iy = this.iy;
      if (this.state === 'hold' && this.isGK) { const lim = this.m.inOwnBox(this, 1); if (!lim) { ix = 0; iy = 0; } }
      const mag = Math.min(1, Math.hypot(ix, iy));
      const vmax = this.maxSpeed() * mag;
      const tx = mag > 0.01 ? (ix / (Math.hypot(ix, iy) || 1)) * vmax : 0;
      const ty = mag > 0.01 ? (iy / (Math.hypot(ix, iy) || 1)) * vmax : 0;
      const dvx = tx - this.vx, dvy = ty - this.vy;
      const dl = Math.hypot(dvx, dvy);
      const acc = (mag > 0.01 ? C.ACCEL : C.DECEL) * dt * (this.hasBall() ? 0.85 + this.s.dri / 700 : 1);
      if (dl <= acc) { this.vx = tx; this.vy = ty; } else { this.vx += dvx / dl * acc; this.vy += dvy / dl * acc; }
      const sp = Math.hypot(this.vx, this.vy);
      let want = null;
      if (sp > 0.6 && mag > 0.05) want = Math.atan2(this.vy, this.vx);
      else if (this.faceX !== null) want = Math.atan2(this.faceY - this.y, this.faceX - this.x);
      if (want !== null) {
        const rate = (this.hasBall() ? C.TURN_RATE_BALL + this.s.dri / 20 : C.TURN_RATE) * dt;
        const d = U.angDiff(this.facing, want);
        this.facing += U.clamp(d, -rate, rate);
      }
    }

    // Ведение мяча: мяч «прилипает» перед игроком, с касаниями в такт шагам
    dribble(dt, sp) {
      const b = this.m.ball;
      if (b.held) {
        // у вратаря в руках
        b.x = this.x + Math.cos(this.facing) * 0.25; b.y = this.y + Math.sin(this.facing) * 0.1 + 0.01; b.z = 0.9;
        b.vx = this.vx; b.vy = this.vy; b.vz = 0;
        return;
      }
      let d = C.DRIBBLE_DIST;
      if (sp > 2.5) {
        const loose = this.sprint ? 0.55 - this.s.dri / 300 : 0.18;
        d += Math.max(0.05, loose) * (0.5 + 0.5 * Math.sin(this.animT * 2.6));
      }
      const tx = this.x + Math.cos(this.facing) * d, ty = this.y + Math.sin(this.facing) * d;
      b.x += (tx - b.x) * Math.min(1, dt * 24); b.y += (ty - b.y) * Math.min(1, dt * 24); b.z = 0;
      b.vx = this.vx; b.vy = this.vy; b.vz = 0; b.spin = 0;
      b.roll += sp * dt;
      b.frame = Math.floor(b.roll / 0.22) & 3;
    }

    // --- Выбор позы и направления для отрисовки ---
    updatePose() {
      const sp = Math.hypot(this.vx, this.vy);
      const fx = Math.cos(this.facing), fy = Math.sin(this.facing);
      let dir = Math.abs(fx) > Math.abs(fy) * 0.8 ? (fx > 0 ? DIR.RIGHT : DIR.LEFT) : fy > 0 ? DIR.DOWN : DIR.UP;
      let pose;
      switch (this.state) {
        case 'kick': pose = this.stateT < 0.06 ? POSE.KICK0 : POSE.KICK1; break;
        case 'tackle': pose = POSE.TACKLE; break;
        case 'slide': pose = POSE.SLIDE; break;
        case 'getup': pose = POSE.SLIDE; break;
        case 'down': pose = this.isGK && this.diveSave ? (this.diveY < 0 ? POSE.DIVE_UP : POSE.DIVE_DOWN) : POSE.FALLEN; if (pose === POSE.FALLEN && (dir === DIR.DOWN || dir === DIR.UP)) dir = DIR.RIGHT; break;
        case 'dive': pose = this.diveY < 0 ? POSE.DIVE_UP : POSE.DIVE_DOWN; dir = this.team.dir > 0 ? DIR.RIGHT : DIR.LEFT; break;
        case 'hold': pose = sp > 0.6 ? POSE.RUN0 + (Math.floor(this.animT) & 3) : POSE.HOLD; break;
        case 'celebrate': pose = sp > 1.2 ? POSE.RUN0 + (Math.floor(this.animT) & 3) : ((this.stateT * 4) & 1 ? POSE.CELEB1 : POSE.CELEB0); if (sp <= 1.2) dir = DIR.DOWN; break;
        case 'throw': pose = POSE.THROW; break;
        case 'skill': pose = POSE.RUN0 + (Math.floor(this.animT * 1.5) & 3); break;
        default:
          if (this.z > 0.2) pose = POSE.HEADER;
          else if (this.charging) pose = POSE.KICK0;
          else pose = sp > 0.5 ? POSE.RUN0 + (Math.floor(this.animT) & 3) : POSE.IDLE;
      }
      this.pose = pose; this.dir = dir;
    }

    // ================== Удары по мячу ==================
    // Ошибка исполнения: зависит от стата, давления соперника и сложности
    errFor(stat, extra) {
      const pressure = this.m.pressureOn(this);
      const diff = this.team.human ? 1 : this.m.diff.err;
      return (1.15 - stat / 100) * (1 + pressure * 0.9) * diff * (extra || 1);
    }
    startKick(type) {
      this.setState('kick', 0.22);
      this.kickCD = C.KICK_COOLDOWN;
      this.charging = false; this.charge = 0;
      this.buffer = null;
      const b = this.m.ball;
      // мяч выбивается из-под ног; если он был немного в стороне — бьём туда, где он есть
      if (b.owner === this) { b.owner = null; b.held = false; }
      PF.FX.grass(b.x, b.y, type === 'shot' ? 6 : 3, type === 'shot' ? 1.2 : 0.7);
    }

    // Низовой пас в точку
    passTo(tx, ty, arrive, type, receiver) {
      const b = this.m.ball;
      const d = Math.hypot(tx - b.x, ty - b.y);
      let v = U.clamp(passSpeed(d, arrive || C.PASS_ARRIVE), C.PASS_MIN * 0.6, C.PASS_MAX + this.s.pas / 20);
      const e = this.errFor(this.s.pas, d > 30 ? 1.3 : 1);
      const ang = Math.atan2(ty - b.y, tx - b.x) + U.gauss() * 0.075 * e;
      v *= 1 + U.gauss() * 0.06 * e;
      this.startKick('pass');
      b.kick(Math.cos(ang) * v, Math.sin(ang) * v, 0, 0, this, type || 'pass');
      this.facing = ang;
      this.m.onKick(this, type || 'pass', receiver);
      PF.Audio.play('pass');
    }
    // Навес/длинный пас: мяч прилетает в точку на высоте landZ
    lobTo(tx, ty, landZ, type, receiver) {
      const b = this.m.ball;
      const d = Math.hypot(tx - b.x, ty - b.y);
      const T = C.LOB_T_BASE + d * C.LOB_T_PER_M;
      const e = this.errFor(this.s.pas, 1.2);
      const ang = Math.atan2(ty - b.y, tx - b.x) + U.gauss() * 0.06 * e;
      const vh = (d / T) * (1 + C.AIR_DRAG * T * 0.5) * (1 + U.gauss() * 0.06 * e);
      const z = landZ || 0;
      const vz = (z + 0.5 * C.GRAVITY * T * T) / T;
      this.startKick('lob');
      b.kick(Math.cos(ang) * vh, Math.sin(ang) * vh, vz, U.gauss() * 0.15, this, type || 'lob');
      this.facing = ang;
      this.m.onKick(this, type || 'lob', receiver);
      PF.Audio.play('kick', 0.5);
    }
    // Удар по воротам: power 0..1, aimY — точка по ширине ворот, aimZ — высота
    shoot(power, aimY, aimZ, curve) {
      const b = this.m.ball;
      const gx = this.team.dir > 0 ? C.PITCH_L : 0;
      const e = this.errFor(this.s.sho, 1.5 + Math.max(0, power - 0.85) * 3);
      const dist = Math.hypot(gx - b.x, aimY - b.y);
      const v = (C.SHOT_MIN + (C.SHOT_MAX - C.SHOT_MIN) * power) * (0.72 + this.s.sho / 360);
      const ang = Math.atan2(aimY - b.y, gx - b.x) + U.gauss() * 0.11 * e;
      const t = dist / (v * 0.96);
      let vz = (aimZ - b.z) / t + 0.5 * C.GRAVITY * t;
      vz += U.gauss() * 1.9 * e + Math.max(0, power - 0.88) * 9 * (1.1 - this.s.sho / 100);
      // закрутка: мяч стартует чуть в сторону и «заворачивает» обратно к цели
      const spin = curve || 0;
      const ang2 = ang - spin * C.MAGNUS * v * t * t * 0.5 / Math.max(4, dist) * 0.9;
      this.startKick('shot');
      b.kick(Math.cos(ang2) * v, Math.sin(ang2) * v, Math.max(0.5, vz), spin, this, 'shot');
      this.facing = ang2;
      this.m.onKick(this, 'shot');
      PF.Audio.play('kick', power);
    }
    // Выбить мяч подальше (вынос / подкат / отбор)
    clear(dirX, dirY, speed, vz, type) {
      const b = this.m.ball;
      const l = Math.hypot(dirX, dirY) || 1;
      this.startKick('pass');
      b.kick(dirX / l * speed, dirY / l * speed, vz || 0, 0, this, type || 'clear');
      this.m.onKick(this, type || 'clear');
      PF.Audio.play('kick', 0.6);
    }
    header(dirX, dirY, speed, vz, type) {
      const b = this.m.ball;
      const e = this.errFor((this.s.phy + this.s.sho) / 2, 1.2);
      const a = Math.atan2(dirY, dirX) + U.gauss() * 0.12 * e;
      this.kickCD = C.KICK_COOLDOWN;
      b.owner = null;
      b.kick(Math.cos(a) * speed, Math.sin(a) * speed, vz, 0, this, type || 'header');
      this.m.onKick(this, type === 'shot' ? 'shot' : 'header');
      this.vz = Math.max(this.vz, 2.5);
      PF.Audio.play('head');
    }

    // Финт: резкая смена направления с мячом
    skill(ix, iy) {
      if (this.skillCD > 0 || !this.hasBall()) return;
      let dx = ix, dy = iy;
      if (Math.hypot(dx, dy) < 0.3) {
        this.skillDir = -this.skillDir;
        dx = -Math.sin(this.facing) * this.skillDir; dy = Math.cos(this.facing) * this.skillDir;
      }
      const l = Math.hypot(dx, dy) || 1;
      this.skX = dx / l; this.skY = dy / l;
      this.setState('skill');
      this.skillCD = 0.9;
      PF.Audio.play('swoosh');
      PF.FX.dust(this.x, this.y, 3);
    }
    // Стандартный отбор
    tackle() {
      if (!this.canAct() || this.tackleCD > 0) return;
      this.setState('tackle', C.TACKLE_TIME);
      this.tackleCD = 0.55;
      this.vx += Math.cos(this.facing) * 3; this.vy += Math.sin(this.facing) * 3;
      this.m.resolveTackle(this);
    }
    slide() {
      if (!this.canAct() || this.tackleCD > 0) return;
      this.setState('slide');
      this.tackleCD = 1.2;
      this.slideTouched = false; this.slideFouled = false;
      this.stamina -= 0.03;
      PF.Audio.play('slide');
      PF.FX.dust(this.x, this.y, 5);
    }
    // Вратарь: прыжок к точке
    dive(tx, ty, tz) {
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(C.GK_DIVE_SPEED * (0.85 + this.s.gk / 400), d / (C.GK_DIVE_TIME * 0.6));
      this.diveX = dx / d * sp; this.diveY = dy / d * sp;
      this.setState('dive');
      this.diveSave = true;
      this.vz = U.clamp(tz * 2.6, 0.5, 4.2);
      PF.Audio.play('swoosh');
    }
    knockDown(t) {
      if (this.m.ball.owner === this) { this.m.ball.owner = null; this.m.ball.held = false; }
      this.setState('down', t || C.FALL_TIME);
      this.diveSave = false;
      this.charging = false;
      PF.FX.dust(this.x, this.y, 4);
    }
  }
  Player.passSpeed = passSpeed;
  PF.Player = Player;
})(window.PF);
