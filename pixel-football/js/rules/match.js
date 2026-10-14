'use strict';
// Матч: конечный автомат (intro → kickoff → play → stopped → setpiece → goal → replay → halftime → fulltime → shootout)
// и все правила: ауты, угловые, удары от ворот, штрафные, пенальти, офсайд, фолы и карточки,
// замены, добавленное время, статистика и оценки игроков.
(function (PF) {
  const C = PF.C, U = PF.U, AI = PF.AI, Ball = PF.Ball, Player = PF.Player, Comm = PF.Comm;
  const L = C.PITCH_L, W = C.PITCH_W, MY = W / 2;
  const snd = (n, p) => PF.Audio.play(n, p);
  const CHARGE_ACTS = ['pass', 'lob', 'through', 'shoot'];

  function newStats() { return { poss: 0, shots: 0, onT: 0, corners: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, passes: 0, passOk: 0, tackles: 0, saves: 0 }; }

  class Match {
    constructor(o) {
      this.o = o;
      this.mode = o.mode || 'match';
      this.diff = C.DIFF[o.diff == null ? 1 : o.diff];
      this.diffHumanMates = C.DIFF[1];
      this.offsideOn = o.offside !== false && this.mode === 'match';
      this.duelTarget = this.mode === 'duel' ? (o.duelTarget || 0) : 0;
      this.timed = this.mode === 'match' || (this.mode === 'duel' && !this.duelTarget); // идут ли часы
      this.cardsOn = o.cards !== false;
      this.halfMin = o.halfMin || 3;
      this.clockRate = C.GAME_HALF_SEC / (this.halfMin * 60);
      PF.Sprites.clearSheets(); // не копим листы спрайтов между матчами
      const kits = PF.Data.pickKits(o.home, o.away);
      this.kits = kits;
      // цвета точек на радаре: слишком тёмные осветляем
      this.radarCol = [kits[0].p, kits[1].p].map((c) => (U.luma(c) < 0.25 ? U.shade(c, 0.5) : c));
      if (U.colorDist(this.radarCol[0], this.radarCol[1]) < 90) this.radarCol[1] = '#ffffff';
      this.ball = new Ball();
      this.teams = [
        this.makeTeam(0, o.home, kits[0], kits[2], o.homeLineup, o.homeFormation, o.homeTactics, o.human === 0 || o.human === 'both'),
        this.makeTeam(1, o.away, kits[1], kits[3], o.awayLineup, o.awayFormation, o.awayTactics, o.human === 1 || o.human === 'both'),
      ];
      // номер набора ввода: первая команда человека — игрок 1, вторая — игрок 2
      let pad = 0;
      for (const t of this.teams) t.pad = t.human ? pad++ : 0;
      this.teams[0].dir = 1; this.teams[1].dir = -1;
      // судья
      const refTeam = { dir: 1, human: false, idx: -1, players: [] };
      this.ref = new Player(this, refTeam, { num: 0, name: 'СУДЬЯ', stats: { spd: 60, sho: 10, pas: 10, dri: 10, def: 10, phy: 70, gk: 10 }, skin: 1, hair: 3 }, -1);
      this.ref.sheet = PF.Sprites.sheetFor(PF.Sprites.refereeKit, 1, 3);
      this.ref.cardT = 0; this.ref.cardCol = '#ff0';
      this.refreshAll();
      this.replay = new PF.Replay(23);
      this.state = 'intro'; this.stateT = 0; this.t = 0;
      this.clock = 0; this.half = 1; this.stoppage = 0; this.addedMin = 0; this.addedShown = false;
      this.possTeam = -1;
      this.sp = null; this.pending = null;
      this.banner = null;
      this.goals = []; this.shotMap = [];
      this.lastShot = null; this.lastPass = null;
      this.netBulge = [0, 0];
      this.excite = 0;
      this.slowmo = 0;
      this.cam = { x: L / 2, y: MY, z: 0, zoom: 1, rate: C.CAM_SMOOTH, snap: true };
      this.so = null; // серия пенальти
      this.finished = false;
      this.fk = { tries: 0, goals: 0 }; // тренировка штрафных
      this.kickoffFirst = Math.random() < 0.5 ? 0 : 1;
      Comm.reset();
      PF.FX.clear();
      PF.Pitch.build(kits[0], kits[1], !!o.night);
      if (this.mode === 'duel') this.setupDuel();
      this.placeKickoff(this.kickoffFirst);
      if (this.mode === 'training' || this.mode === 'freekick') {
        this.setupTraining();
        this.state = 'play';
        if (this.mode === 'freekick') this.nextFreeKick(); else this.trainingReset();
      }
      this.cam.snap = true;
    }

    // ---------- Команды ----------
    makeTeam(idx, def, kit, gkKit, lineupIds, formation, tactics, human) {
      const t = {
        idx, def, kit, gkKit, human, dir: 1, score: 0, pens: 0,
        formation: formation || def.formation, tactics: Object.assign({}, def.tactics, tactics || {}),
        players: [], bench: [], subsLeft: C.MAX_SUBS, stats: newStats(),
        ctx: {}, ctxT: 0, controlled: null, pressCall: false, pressHelper: null,
        name: def.name, short: def.short,
      };
      t.slots = PF.FORMATIONS[t.formation];
      t.tac = {
        press: PF.TACTICS.press.val[t.tactics.press], width: PF.TACTICS.width.val[t.tactics.width], line: PF.TACTICS.line.val[t.tactics.line],
      };
      const ids = lineupIds || def.squad.map((p) => p.id);
      const defs = ids.map((id) => PF.Data.PLAYERS[id]).filter(Boolean);
      // у человека статы не режутся; в карьере на них влияет мораль команды (o.humanMul)
      const mul = human ? (this.o.humanMul || 1) : this.diff.statMul;
      for (let i = 0; i < 11; i++) {
        const p = new Player(this, t, defs[i], i);
        p.role = t.slots[i].role;
        p.isGK = i === 0;
        p.setStats(defs[i].stats, mul);
        if (p.isGK && defs[i].role !== 'GK') p.s.gk = Math.max(p.s.gk, 35);
        p.sheet = PF.Sprites.sheetFor(p.isGK ? gkKit : kit, defs[i].skin, defs[i].hair, PF.Sprites.lookOf(defs[i]));
        t.players.push(p);
      }
      t.bench = defs.slice(11);
      return t;
    }
    refreshAll() {
      this.all = this.teams[0].players.concat(this.teams[1].players);
      this.replayEnts = this.all.concat([this.ref]);
    }
    get human() { return this.teams.find((t) => t.human) || null; }
    get humans() { return this.teams.filter((t) => t.human); }

    // ---------- Геометрия ----------
    inBox(x, y, team, margin) {
      const m = margin || 0;
      const gx = team.dir > 0 ? 0 : L;
      return Math.abs(x - gx) < C.BOX_DEPTH + m && Math.abs(y - MY) < C.BOX_HALF + m;
    }
    inOwnBox(p, margin) { return this.inBox(p.x, p.y, p.team, margin); }
    pressureOn(p) {
      let d = 99;
      const opp = this.teams[1 - p.team.idx];
      if (!opp) return 0;
      for (const o of opp.players) if (!o.off) d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y));
      return U.clamp(1 - (d - 0.8) / 3, 0, 1);
    }

    // ---------- Управление ----------
    setControlled(t, p) {
      if (!t.human || !p || p.off) return;
      if (t.controlled) { t.controlled.controlled = false; t.controlled.charging = false; }
      t.controlled = p; p.controlled = true;
      p.tgtStale = true;
    }
    // Лучший кандидат для переключения (ближе всех к мячу по времени перехвата / по направлению)
    switchCandidate(t, ix, iy) {
      let best = null, bs = 1e9;
      const b = this.ball;
      const useDir = Math.hypot(ix, iy) > 0.3;
      for (const p of t.players) {
        if (p.off || p.isGK || p === t.controlled) continue;
        let s = Math.min(p.icT, 5) + Math.hypot(p.x - b.x, p.y - b.y) * 0.05;
        if (useDir && t.controlled) {
          const dx = p.x - t.controlled.x, dy = p.y - t.controlled.y, d = Math.hypot(dx, dy) || 1;
          s -= ((dx * ix + dy * iy) / d) * 1.2;
        }
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    }
    // Выбор адресата паса по направлению стика
    // Ассистент паса (как в FIFA): из партнёров в направлении стика (или взгляда) выбираем
    // открытого, с безопасной линией паса, и считаем точку с упреждением по его бегу (this.passLead).
    passTarget(p, ix, iy, far, pref) {
      const t = p.team, b = this.ball;
      const hasDir = Math.hypot(ix, iy) > 0.3;
      let dx = hasDir ? ix : Math.cos(p.facing), dy = hasDir ? iy : Math.sin(p.facing);
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const pa = AI.ax(t, p.x), offLine = t.ctx.offLine || L / 2;
      let best = null, bs = -1e9, lx = 0, ly = 0;
      for (let pass = 0; pass < 2 && !best; pass++) {
        const minCos = pass ? 0 : hasDir ? 0.5 : 0.2; // второй проход — если в конусе никого нет
        for (const q of t.players) {
          if (q === p || q.off || q.state === 'down') continue;
          const vx = q.x - p.x, vy = q.y - p.y, d = Math.hypot(vx, vy);
          if (d < 3) continue;
          const cos = (vx * dx + vy * dy) / d;
          if (cos < minCos) continue;
          // упреждение: пас в точку, куда партнёр добежит к приходу мяча
          const T = d / (far ? 17 : 14);
          const tx = U.clamp(q.x + q.vx * T * 0.8, 1, L - 1), ty = U.clamp(q.y + q.vy * T * 0.8, 1, W - 1);
          const lr = AI.laneRisk(this, t, b.x, b.y, tx, ty);
          const risk = lr.risk, open = Math.min(lr.open, 10);
          // сила паса задаёт желаемую дистанцию: слабый — ближнему, сильный — дальнему
          const distTerm = pref != null ? Math.abs(d - pref) / 10 : far ? Math.abs(d - 30) / 18 : d / 26;
          let s = cos * (hasDir ? 3 : 1.6) - distTerm - risk * (far ? 0.35 : 1.0) + open / 10 * 0.8;
          const qa = AI.ax(t, q.x);
          if (!hasDir) s += (qa - pa) / 45; // без направления — предпочитаем пас вперёд
          if (qa > L / 2 && qa > offLine + 0.3) s -= 0.9; // адресат в офсайде
          if (q.isGK) s -= 1.5;
          if (s > bs) { bs = s; best = q; lx = tx; ly = ty; }
        }
      }
      this.passLead = best ? { x: lx, y: ly } : null;
      return best;
    }

    // Действие человека с мячом
    // power: null — короткое нажатие (сила подбирается автоматически), 0..1 — заряженная шкала
    humanAction(p, act, ix, iy, power) {
      const t = p.team;
      const auto = power == null;
      const pw = auto ? 0.35 : power;
      const crossZone = AI.ax(t, p.x) > C.CROSS_ZONE_X && Math.abs(p.y - MY) > 11;
      const freeDir = () => (Math.hypot(ix, iy) > 0.3 ? Math.atan2(iy, ix) : p.facing);
      if (act === 'pass') {
        const q = this.passTarget(p, ix, iy, false, auto ? null : 5 + pw * 38);
        // сильнее пас — быстрее мяч приходит к партнёру
        const arrive = auto ? C.PASS_ARRIVE : U.lerp(4, 14, pw);
        if (q) { p.passTo(this.passLead.x, this.passLead.y, arrive, 'pass', q); this.setControlled(t, q); }
        else { const a = freeDir(), d = 8 + pw * 35; p.passTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 4, 'pass'); }
      } else if (act === 'lob') {
        if (crossZone && Math.hypot(ix, iy) < 0.5) {
          // навес в штрафную: без заряда — на сильного в воздухе, с зарядом — сила выбирает ближнюю/дальнюю штангу
          let best = null, bs = -1e9;
          const pref = 10 + pw * 30;
          for (const q of t.players) {
            if (q === p || q.off || q.isGK) continue;
            if (!this.inBox(q.x, q.y, this.teams[1 - t.idx], 2)) continue;
            const s = auto ? q.s.phy + Math.random() * 20 : -Math.abs(Math.hypot(q.x - p.x, q.y - p.y) - pref);
            if (s > bs) { bs = s; best = q; }
          }
          let tx, ty;
          if (best) { tx = best.x; ty = best.y; }
          else { // в зону: глубина подачи по силе
            const gx = t.dir > 0 ? L - 8 : 8;
            ty = U.lerp(p.y, W - p.y, U.clamp(0.25 + pw * 0.6, 0, 1)); tx = gx;
          }
          p.lobTo(tx, ty, 1.5, 'cross', best);
          if (best) this.setControlled(t, best);
        } else {
          const q = this.passTarget(p, ix, iy, true, auto ? null : 14 + pw * 42);
          if (q) { p.lobTo(this.passLead.x, this.passLead.y, 0, 'lob', q); this.setControlled(t, q); }
          else { const a = freeDir(), d = 15 + pw * 45; p.lobTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0, 'lob'); }
        }
      } else if (act === 'through') {
        const q = this.passTarget(p, ix, iy, false, auto ? null : 8 + pw * 30);
        if (q) {
          // сила паса на ход — насколько далеко вперёд забрасываем мяч
          const lead = auto ? 7 + q.s.spd / 25 : 3 + pw * 16;
          const gx = t.dir > 0 ? L : 0;
          let dx = t.dir, dy = (MY - q.y) * 0.015;
          if (Math.hypot(ix, iy) > 0.3) { dx = ix; dy = iy; }
          const dl = Math.hypot(dx, dy) || 1;
          let tx = q.x + dx / dl * lead, ty = q.y + dy / dl * lead;
          tx = t.dir > 0 ? Math.min(tx, gx - 3) : Math.max(tx, gx + 3); ty = U.clamp(ty, 2, W - 2);
          p.passTo(tx, ty, auto ? 11 : U.lerp(8, 14, pw), 'through', q);
          q.runT = 2.2; q.runX = tx; q.runY = ty;
          this.setControlled(t, q);
        }
      } else if (act === 'shoot') {
        this.humanShoot(p, Math.max(0.25, pw), ix, iy);
      }
    }

    // Заряд действия человека: нажал — копится сила, отпустил (или шкала полная) — исполняем.
    // exec(p, act, ix, iy, power); power = null при коротком нажатии (кроме удара)
    chargeAction(p, dt, ax, exec) {
      const I = PF.Input;
      if (!p.chAct) {
        for (const a of CHARGE_ACTS) if (I.pressed(a)) { p.chAct = a; p.charge = 0; p.chT = 0; break; }
        if (!p.chAct) return false;
        // режим «авто»: пас, навес и пас на ход — с одного нажатия, сила подбирается сама
        if (p.chAct !== 'shoot' && !PF.Save.data.settings.manualPass) {
          const act = p.chAct; p.chAct = null; p.charging = false; p.charge = 0;
          exec(p, act, ax.x, ax.y, null);
          return true;
        }
      }
      p.charging = true;
      p.chT += dt;
      p.charge = Math.min(1.1, p.charge + dt / C.CHARGE_TIME[p.chAct]);
      if (I.down(p.chAct) && p.charge < 1.1) return true;
      const act = p.chAct;
      const power = p.chT < C.TAP_TIME && act !== 'shoot' ? null : Math.min(1, p.charge);
      p.chAct = null; p.charging = false; p.charge = 0;
      exec(p, act, ax.x, ax.y, power);
      return true;
    }
    humanShoot(p, power, ix, iy) {
      const t = p.team;
      const gx = t.dir > 0 ? L : 0;
      let aimY;
      if (iy < -0.35) aimY = Ball.Y1 + 0.55; else if (iy > 0.35) aimY = Ball.Y2 - 0.55;
      else aimY = p.y < MY ? Ball.Y2 - 0.9 : Ball.Y1 + 0.9; // в дальний угол
      const d = Math.abs(gx - p.x);
      const aimZ = 0.25 + power * (d < 14 ? 1.3 : 1.9);
      // закрутка к дальней штанге при ударе сбоку
      const curve = (p.y < MY ? 1 : -1) * t.dir * 0.25 * (p.s.dri / 100) * (Math.abs(ix) < 0.3 ? 1 : 0.3);
      p.shoot(power, aimY, aimZ, curve);
    }

    humanControl(dt) {
      if (this.state !== 'play') return;
      for (const t of this.teams) {
        if (!t.human) continue;
        PF.Input.use(t.pad);
        this.humanControlTeam(t, dt);
      }
      PF.Input.use(0);
    }
    humanControlTeam(t, dt) {
      const I = PF.Input, b = this.ball;
      let p = t.controlled;
      if (!p || p.off) { this.setControlled(t, this.switchCandidate(t, 0, 0)); p = t.controlled; if (!p) return; }
      const ax = I.axis();
      const attack = this.possTeam === t.idx;
      t.pressCall = I.down('press') && !attack;
      // владелец мяча в команде человека всегда под контролем
      if (b.owner && b.owner.team === t && b.owner !== p) { this.setControlled(t, b.owner); p = b.owner; }
      // авто-переключение на защитника, когда мяч у соперника
      if (b.owner && b.owner.team !== t && this.autoSwitchFor !== b.owner) {
        this.autoSwitchFor = b.owner;
        const c = this.switchCandidate(t, 0, 0);
        if (c && Math.hypot(p.x - b.x, p.y - b.y) > 7) this.setControlled(t, c);
        p = t.controlled;
      }
      if (!b.owner) this.autoSwitchFor = null;
      // свободный мяч: если стик не трогают, управление переходит к тому, кто быстрее к нему успеет
      const steering = Math.hypot(ax.x, ax.y) > 0.2;
      t.humanSteering = steering;
      if (!b.owner) {
        this.looseT = (this.looseT || 0) + dt;
        const forMe = b.intended === p && b.kickT < 3.5 && p.icT < 4;
        if (this.looseT > 0.3 && !steering && !forMe && !p.charging) {
          const c = t.ctx.chaser;
          if (c && c !== p && !c.off && c.icT + 0.35 < p.icT) { this.setControlled(t, c); p = c; }
          this.looseT = 0;
        }
      } else this.looseT = 0;

      if (p.isGK && b.owner !== p && !this.so) {
        const c = this.switchCandidate(t, 0, 0);
        if (c) { this.setControlled(t, c); p = c; }
      }
      if (p.isGK && b.owner === p) {
        // вратарь с мячом в руках
        p.ix = ax.x * 0.6; p.iy = ax.y * 0.6; p.sprint = false;
        p.holdT += dt;
        if (p.holdT > 6) { AI.gkDistribute(this, t, p); return; }
        this.chargeAction(p, dt, ax, (pp, act, x, y, power) => {
          const pw = power == null ? 0.35 : power;
          if (act === 'pass' || act === 'through') {
            const q = this.passTarget(pp, x, y, false, power == null ? null : 6 + pw * 34);
            if (!q) return;
            pp.passTo(this.passLead.x, this.passLead.y, power == null ? 6 : U.lerp(4, 13, pw), 'pass', q); b.held = false; this.setControlled(t, q);
          } else {
            // K/L — выбить рукой/ногой далеко: сила = дальность
            const q = this.passTarget(pp, x, y, true, power == null ? null : 20 + pw * 45);
            const tx = q ? this.passLead.x : pp.x + t.dir * (20 + pw * 45), ty = q ? this.passLead.y : MY;
            pp.lobTo(tx, ty, 0, 'lob', q); b.held = false; if (q) this.setControlled(t, q);
          }
        });
        return;
      }
      if (!p.canAct()) { p.ix = p.iy = 0; return; }
      t.idleT = steering ? 0 : (t.idleT || 0) + dt;
      if (!steering && !b.owner && this.autoRun(t, p)) { /* игрок сам идёт на мяч */ }
      else if (t.idleT > 0.8 && b.owner && b.owner.team !== t) AI.offBall(this, t, p, dt); // помощь в обороне без стика
      else { p.ix = ax.x; p.iy = ax.y; p.sprint = I.down('sprint'); }
      p.faceX = b.x; p.faceY = b.y;

      if (b.owner === p) {
        if (I.pressed('skill') && !p.chAct) return p.skill(ax.x, ax.y);
        this.chargeAction(p, dt, ax, (pp, act, x, y, power) => this.humanAction(pp, act, x, y, power));
        return;
      }
      // мяч потерян во время заряда — отменяем
      if (p.chAct) { p.chAct = null; p.charging = false; p.charge = 0; }
      // без мяча
      if (attack || (!b.owner && Math.hypot(p.x - b.x, p.y - b.y) < 6)) {
        // буфер первого касания: пас/удар сразу после приёма; пока кнопку держат — копится сила
        for (const a of CHARGE_ACTS) if (I.pressed(a)) {
          p.buffer = a; p.bufferT = C.ACTION_BUFFER; p.charge = 0; p.chT = 0;
          if (a === 'pass' && !b.owner && p.icT > 1.2) { const c = this.switchCandidate(t, ax.x, ax.y); if (c) { this.setControlled(t, c); c.buffer = a; c.bufferT = C.ACTION_BUFFER; c.charge = 0; c.chT = 0; p = c; } }
        }
        if (p.buffer && I.down(p.buffer) && (p.buffer === 'shoot' || PF.Save.data.settings.manualPass)) {
          p.charge = Math.min(1, p.charge + dt / C.CHARGE_TIME[p.buffer]); p.chT += dt;
          p.bufferT = Math.max(p.bufferT, 0.15);
        }
        p.charging = !!p.buffer && p.chT > C.TAP_TIME;
      } else {
        if (I.pressed('pass')) { const c = this.switchCandidate(t, ax.x, ax.y); if (c) this.setControlled(t, c); }
        if (I.pressed('lob')) t.controlled.tackle();
        if (I.pressed('shoot')) t.controlled.slide();
      }
    }
    // Автобег управляемого игрока: навстречу пасу или на свободный мяч, пока человек не трогает стик
    autoRun(t, p) {
      const b = this.ball;
      const forMe = b.intended === p && b.kickT < 3.5;
      const best = t.ctx.chaser === p || p.icT <= (t.ctx.chaseT == null ? 99 : t.ctx.chaseT) + 0.05;
      if (!(forMe || best) || p.icT > 4) return false;
      const i = Math.min(p.icI + 1, C.PRED_STEPS - 1);
      AI.moveTo(p, Ball.PRED_X[i], Ball.PRED_Y[i], true, true);
      return true;
    }

    // Выполнить буфер после приёма мяча
    runBuffer(p) {
      if (!p.buffer || !p.controlled) return false;
      const a = PF.Input.axis();
      const act = p.buffer; p.buffer = null;
      // кнопка ещё зажата — продолжаем копить силу уже с мячом, удар/пас по отпусканию
      const manual = act === 'shoot' || PF.Save.data.settings.manualPass;
      if (manual && PF.Input.down(act)) { p.chAct = act; p.charging = true; return false; }
      const power = p.chT < C.TAP_TIME && act !== 'shoot' ? null : Math.max(act === 'shoot' ? 0.35 : 0, Math.min(1, p.charge));
      p.charge = 0; p.charging = false;
      this.humanAction(p, act, a.x, a.y, power);
      return true;
    }

    // ---------- Главный апдейт ----------
    update(dt) {
      this.t += dt; this.stateT += dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
      if (this.ref.cardT > 0) this.ref.cardT -= dt;
      for (let i = 0; i < 2; i++) this.netBulge[i] = Math.max(0, this.netBulge[i] - dt);
      this.excite = Math.max(0, this.excite - dt * 0.4);
      for (const p of this.all) p.savePrev();
      this.ref.savePrev();
      this.ball.savePrev();
      switch (this.state) {
        case 'intro': this.updIntro(dt); break;
        case 'kickoff': case 'setpiece': this.updSetPiece(dt); break;
        case 'play': this.updPlay(dt); break;
        case 'stopped': this.updStopped(dt); break;
        case 'goal': this.updGoal(dt); break;
        case 'replay': this.updReplay(dt); break;
        case 'halftime': case 'fulltime': this.updIdle(dt); break;
        default: break;
      }
      if (this.state !== 'replay') {
        for (const p of this.all) p.updatePose();
        this.ref.updatePose();
        this.replay.record(this.ball, this.replayEnts);
      }
      PF.FX.update(dt);
      Comm.update(dt, C.W);
      PF.Audio.crowdUpdate(dt, 0.25 + this.dangerLevel() * 0.35);
    }

    dangerLevel() {
      // близость мяча к воротам — для гула трибун
      const d = Math.min(this.ball.x, L - this.ball.x);
      return this.state === 'play' ? U.clamp(1 - d / 30, 0, 1) : 0;
    }

    updIntro(dt) {
      this.moveRef(dt);
      for (const p of this.all) { p.ix = p.iy = 0; p.update(dt); }
      this.cam.x = L / 2; this.cam.y = MY;
      if (this.stateT > 2.2) {
        this.setState('kickoff');
        Comm.say('kickoff', { home: this.teams[0].short, away: this.teams[1].short }, 2);
      }
    }
    updIdle(dt) {
      for (const p of this.all) { p.ix = p.iy = 0; p.update(dt); }
      this.moveRef(dt);
    }
    setState(s) { this.state = s; this.stateT = 0; }

    updPlay(dt) {
      const b = this.ball;
      if (this.timed && !this.so) {
        this.clock += dt * this.clockRate;
        this.checkTime();
      }
      b.predict();
      for (const p of this.all) AI.intercept(this, p);
      AI.updateTeam(this, this.teams[0], dt);
      AI.updateTeam(this, this.teams[1], dt);
      this.humanControl(dt);
      for (const p of this.all) p.update(dt);
      this.separate();
      b.update(dt, this.ballEv);
      this.slideContacts();
      this.resolveTouches();
      this.moveRef(dt);
      if (this.state !== 'play') return;
      this.checkBall();
      // владение
      const pt = b.owner ? b.owner.team.idx : this.possTeam;
      if (pt >= 0) this.teams[pt].stats.poss += dt;
      // камера следит за мячом с упреждением
      this.cam.x = b.x + b.vx * C.CAM_LEAD; this.cam.y = b.y + b.vy * C.CAM_LEAD; this.cam.z = b.z; this.cam.zoom = 1; this.cam.rate = C.CAM_SMOOTH;
      // накал у ворот
      if (b.kickType === 'shot' && b.kickT < 0.1) PF.Audio.crowdExcite(0.35);
      // тренировки
      if (this.mode === 'freekick' && this.fkWatch !== undefined) this.updFreeKickWatch(dt);
      if (this.mode === 'training') this.updTrainingWatch(dt);
    }

    // Расталкивание игроков
    separate() {
      const a = this.all, R2 = C.PLAYER_R * 2;
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        if (p.off || p.state === 'down') continue;
        for (let j = i + 1; j < a.length; j++) {
          const q = a[j];
          if (q.off || q.state === 'down') continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          if (Math.abs(dx) > R2 || Math.abs(dy) > R2) continue;
          const d = Math.hypot(dx, dy);
          if (d < R2 && d > 1e-4) {
            const push = (R2 - d) * 0.5, nx = dx / d, ny = dy / d;
            // сильный физически толкает сильнее
            const k = U.clamp(0.5 + (p.s.phy - q.s.phy) / 200, 0.25, 0.75);
            p.x -= nx * push * (1 - k) * 2; p.y -= ny * push * (1 - k) * 2;
            q.x += nx * push * k * 2; q.y += ny * push * k * 2;
          }
        }
      }
    }

    // ---------- Касания мяча ----------
    resolveTouches() {
      const b = this.ball;
      if (b.owner) return;
      let best = null, bd = 1e9;
      for (const p of this.all) {
        if (p.off || p.kickCD > 0) continue;
        const st = p.state;
        if (st === 'down' || st === 'getup' || st === 'celebrate' || st === 'slide') continue;
        const gkHands = p.isGK && this.inOwnBox(p, 0.5);
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        // быстрый мяч, улетающий от игрока, не «прилипает» к нему
        if (!gkHands && d > 0.35 && (b.vx * (p.x - b.x) + b.vy * (p.y - b.y)) < 0 && b.speed() > 6) continue;
        let r = gkHands ? C.CONTROL_R_GK : C.CONTROL_R + p.s.def / 600;
        if (st === 'dive') r = 1.0 + p.s.gk / 300;
        const zmax = gkHands ? C.GK_REACH_Z + (st === 'dive' ? 0.3 : 0) + p.z : C.HEADER_Z_MAX + p.z;
        if (d < r && b.z < zmax) {
          const s = d - (p.controlled ? 0.08 : 0) + (gkHands ? -0.2 : 0);
          if (s < bd) { bd = s; best = p; }
        }
      }
      if (best) this.touch(best);
    }

    touch(p) {
      const b = this.ball, t = p.team;
      const speed = b.speed();
      const rel = Math.hypot(b.vx - p.vx, b.vy - p.vy);
      const prev = b.lastTouch;
      // офсайд: первый, кто коснулся после паса партнёра, находясь в офсайде
      if (this.offsideOn && p.offside && b.lastKick && b.lastKick.team === t && b.lastKick !== p) {
        this.callOffside(p);
        return;
      }
      b.intended = null;
      if (prev && prev.team !== t) {
        for (const q of this.teams[1 - t.idx].players) q.offside = false;
        if (this.lastPass && this.lastPass.team !== t) { p.st.inter++; }
      }
      // статистика пасов
      if (this.lastPass) {
        const lp = this.lastPass;
        if (lp.from !== p) {
          if (lp.team === t) { lp.from.st.passOk++; t.stats.passOk++; this.assistCand = { p: lp.from, t: this.t }; }
          this.lastPass = null;
        }
      }
      const gkHands = p.isGK && this.inOwnBox(p, 0.5);
      if (gkHands && prev && (prev.team !== t || b.kickType === 'shot' || speed > 14 || b.kickType === 'header')) {
        // вратарь: сейв / ловля / отбивание
        const isShot = this.lastShot && this.lastShot.team !== t && b.kickT < 2.5 && (b.kickType === 'shot' || b.kickType === 'header');
        if (isShot) {
          const chance = U.clamp(0.66 + p.s.gk / 260 - (speed - 23) / 70 + (p.state === 'dive' ? 0.06 : 0) - (b.z > 2 ? 0.08 : 0), 0.25, 0.95);
          if (Math.random() > chance) { p.kickCD = 0.35; return; } // мяч проходит мимо рук
          if (!this.so) { p.st.saves++; t.stats.saves++; }
          if (this.lastShot.entry) this.lastShot.entry.res = 'save';
          this.lastShot = null;
          Comm.say('save', { player: p.name }, 1);
          PF.Audio.crowdExcite(0.5);
          snd('save');
          if (speed < 17 + p.s.gk / 14 && Math.random() < 0.75 && b.z < 2.3) this.gkCatch(p);
          else this.gkParry(p);
          b.lastTouch = p; this.possTeam = t.idx;
          return;
        }
        if (speed < 24 && b.z < C.GK_REACH_Z + p.z) { this.gkCatch(p); b.lastTouch = p; this.possTeam = t.idx; return; }
        this.gkParry(p); b.lastTouch = p; this.possTeam = t.idx; return;
      }
      // удар вратаря отражён полевым — сбрасываем «удар»
      if (this.lastShot && this.lastShot.team !== t && this.lastShot.entry && this.lastShot.entry.res === 'on') {
        this.lastShot.entry.res = 'block';
      }
      this.lastShot = null;
      // высокий мяч — голова/грудь
      if (b.z > C.CONTROL_Z + p.z * 0.5) {
        this.headerTouch(p);
        b.lastTouch = p; this.possTeam = t.idx;
        return;
      }
      // плохой первый контакт на быстром мяче
      const ft = C.FIRST_TOUCH_SPEED * (0.72 + p.s.dri / 360);
      if (rel > ft && !p.buffer) {
        const k = 0.3 + Math.random() * 0.2;
        b.vx = b.vx * k + (Math.random() - 0.5) * 4; b.vy = b.vy * k + (Math.random() - 0.5) * 4; b.vz = Math.random() * 2;
        b.lastTouch = p; p.kickCD = 0.25; this.possTeam = t.idx;
        snd('bounce', 0.8);
        return;
      }
      b.owner = p; b.held = false; b.lastTouch = p; b.spin = 0;
      p.holdT = 0; p.aiT = Math.min(p.aiT, 0.1);
      this.possTeam = t.idx;
      if (t.human) { this.setControlled(t, p); PF.Input.use(t.pad); this.runBuffer(p); PF.Input.use(0); }
    }

    gkCatch(p) {
      const b = this.ball;
      b.owner = p; b.held = true; b.vx = b.vy = b.vz = 0; b.spin = 0;
      p.setState('hold'); p.holdT = 0; p.diveSave = false;
      if (p.team.human) this.setControlled(p.team, p);
      snd('save');
    }
    gkParry(p) {
      const b = this.ball, out = p.team.dir;
      b.owner = null; b.held = false;
      if (Math.random() < 0.4) {
        // отбит за лицевую — будет угловой
        b.vx = -out * (2 + Math.random() * 2); b.vy = (b.y < MY ? -1 : 1) * (5 + Math.random() * 4); b.vz = 2.5 + Math.random() * 2;
      } else {
        b.vx = Math.abs(b.vx) * 0.22 * out + out * 2; b.vy = b.vy * 0.4 + (Math.random() - 0.5) * 9; b.vz = 2 + Math.random() * 3.5;
      }
      b.lastTouch = p; b.kickType = 'parry';
      p.kickCD = 0.45;
      snd('save');
    }

    headerTouch(p) {
      const b = this.ball, t = p.team;
      const gx = t.dir > 0 ? L : 0;
      const dGoal = Math.hypot(gx - p.x, MY - p.y);
      if (b.speed() > 26 && Math.random() < 0.5) { b.vx *= 0.5; b.vy *= 0.5; b.vz = Math.abs(b.vz) * 0.4; b.lastTouch = p; p.kickCD = 0.3; return; }
      // человек с буфером
      if (p.controlled && p.buffer) {
        PF.Input.use(t.pad);
        const a = { x: PF.Input.axis().x, y: PF.Input.axis().y }; const act = p.buffer; p.buffer = null;
        PF.Input.use(0);
        if (act === 'shoot') {
          const aimY = a.y < -0.35 ? Ball.Y1 + 0.6 : a.y > 0.35 ? Ball.Y2 - 0.6 : MY + U.gauss() * 2;
          p.header(gx - p.x, aimY - p.y, 16 + p.s.phy / 12, -0.5 + Math.random(), 'shot');
        } else {
          const q = this.passTarget(p, a.x, a.y, act === 'lob');
          if (q) { p.header(q.x - p.x, q.y - p.y, 14, 2.5, 'header'); this.setControlled(t, q); } else p.header(Math.cos(p.facing), Math.sin(p.facing), 13, 2.5);
        }
        return;
      }
      // ИИ (или человек без нажатия): удар у чужих ворот, вынос у своих, иначе скидка партнёру
      if (dGoal < 15 && AI.ax(t, p.x) > 80) {
        const aimY = AI.shotAim(this, p);
        p.header(gx - p.x, aimY - p.y, 15 + p.s.phy / 12, -0.8 + Math.random() * 1.2, 'shot');
      } else if (AI.ax(t, p.x) < 40) {
        p.header(t.dir, (p.y < MY ? -0.5 : 0.5), 15, 5, 'clear');
      } else {
        const q = this.passTarget(p, t.dir, 0, false);
        if (q) p.header(q.x - p.x, q.y - p.y, 14, 2.5); else p.header(t.dir, 0, 14, 3);
      }
    }

    // Подкаты: проверка касаний во время скольжения
    slideContacts() {
      const b = this.ball;
      for (const p of this.all) {
        if (p.state !== 'slide' || p.off) continue;
        const fx = p.x + Math.cos(p.facing) * 0.8, fy = p.y + Math.sin(p.facing) * 0.8;
        if (!p.slideTouched && !b.held && b.z < 0.6 && Math.hypot(b.x - fx, b.y - fy) < 0.95) {
          const owner = b.owner;
          if (!owner || owner.team !== p.team) {
            p.slideTouched = true;
            if (owner) owner.setState('getup', 0.3);
            b.owner = null;
            b.kick(Math.cos(p.facing) * 8 + (Math.random() - 0.5) * 4, Math.sin(p.facing) * 8 + (Math.random() - 0.5) * 4, 0.6, 0, p, 'tackle');
            b.lastTouch = p; this.possTeam = p.team.idx;
            if (owner) { p.st.tackles++; p.team.stats.tackles++; Comm.say('tackle', { player: p.name }); }
            for (const q of this.teams[1 - p.team.idx].players) q.offside = false;
            snd('tackle');
            PF.FX.grass(b.x, b.y, 6, 1);
          }
        }
        if (p.slideFouled) continue;
        for (const o of this.teams[1 - p.team.idx].players) {
          if (o.off || o.state === 'down') continue;
          if (Math.hypot(o.x - fx, o.y - fy) < 0.75 || Math.hypot(o.x - p.x, o.y - p.y) < 0.6) {
            p.slideFouled = true;
            if (!p.slideTouched) { this.foul(p, o, 'slide'); return; }
            if (Math.random() < 0.4) o.knockDown(0.9);
          }
        }
      }
    }

    resolveTackle(p) {
      const b = this.ball, c = b.owner;
      if (!c || c.team === p.team) {
        // по свободному мячу — выбить
        if (!c && b.z < 0.5 && Math.hypot(b.x - p.x, b.y - p.y) < 1.5) {
          b.kick(Math.cos(p.facing) * 6, Math.sin(p.facing) * 6, 0.3, 0, p, 'tackle');
          b.lastTouch = p; this.possTeam = p.team.idx;
        }
        return;
      }
      if (b.held) return;
      const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
      if (d > C.TACKLE_RANGE) return;
      const front = Math.cos(U.angDiff(p.facing, Math.atan2(dy, dx)));
      if (front < 0.2) return;
      // сзади ли атакуем: направление взгляда владельца от нас
      const behind = (Math.cos(c.facing) * -dx + Math.sin(c.facing) * -dy) / (d || 1) < -0.45;
      const diff = p.team.human ? this.diffHumanMates : this.diff;
      let chance = 0.44 + (p.s.def - c.s.dri) * 0.0075 - (c.s.phy - p.s.phy) * 0.002 + (behind ? -0.15 : 0) + (p.team.human ? 0.08 : (diff.tackle - 0.85) * 0.25);
      if (c.state === 'skill') chance *= 0.35;
      if (Math.random() < chance) {
        b.owner = null;
        if (Math.random() < 0.5) { b.owner = p; p.holdT = 0; }
        else b.kick(Math.cos(p.facing) * 4 + c.vx * 0.3, Math.sin(p.facing) * 4 + c.vy * 0.3, 0, 0, p, 'tackle');
        b.lastTouch = p; this.possTeam = p.team.idx;
        c.setState('getup', 0.3);
        p.st.tackles++; p.team.stats.tackles++;
        for (const q of this.teams[1 - p.team.idx].players) q.offside = false;
        snd('tackle');
        if (p.team.human && b.owner === p) this.setControlled(p.team, p);
        if (Math.random() < 0.3) Comm.say('tackle', { player: p.name });
      } else if (Math.random() < 0.1 + (behind ? 0.3 : 0)) {
        this.foul(p, c, 'tackle');
      }
    }

    // ---------- Удары: события и статистика ----------
    get ballEv() {
      if (!this._ev) {
        this._ev = {
          bounce: (v) => { if (v > 3) snd('bounce', Math.min(1, v / 10)); },
          post: (v) => {
            if (v < 2) return;
            snd('post'); Comm.say('post', null, 1); PF.Audio.crowdExcite(0.6);
            if (this.lastShot && this.lastShot.entry) this.lastShot.entry.res = 'post';
            this.excite = 1;
          },
          net: () => { snd('net'); },
        };
      }
      return this._ev;
    }
    onKick(p, type, receiver) {
      const t = p.team, b = this.ball;
      p.holdT = 0;
      if (p.controlled && !receiver && t.human) { /* оставляем контроль */ }
      if (type === 'pass' || type === 'lob' || type === 'through' || type === 'cross' || type === 'throw') {
        p.st.passes++; t.stats.passes++;
        this.lastPass = { from: p, team: t, t: this.t };
        if (type === 'through' && Math.random() < 0.35) Comm.say('through', { player: p.name });
        if (type === 'cross') Comm.say('cross', { player: p.name });
      }
      if (type === 'shot') this.registerShot(p);
      // офсайд фиксируется в момент паса
      const noOff = this.spKick === 'throw' || this.spKick === 'corner' || this.spKick === 'goalkick';
      this.spKick = null;
      if (this.offsideOn) {
        const opp = this.teams[1 - t.idx];
        let a1 = 0, a2 = 0;
        for (const o of opp.players) { if (o.off) continue; const a = AI.ax(t, o.x); if (a > a1) { a2 = a1; a1 = a; } else if (a > a2) a2 = a; }
        const ba = AI.ax(t, b.x);
        for (const q of t.players) {
          const qa = AI.ax(t, q.x);
          q.offside = !noOff && q !== p && !q.off && qa > L / 2 && qa > ba + 0.2 && qa > a2 + C.OFFSIDE_MARGIN;
        }
        for (const o of opp.players) o.offside = false;
      }
      this.possTeam = t.idx;
      b.lastTouch = p;
      b.intended = receiver && receiver !== p ? receiver : null;
    }
    registerShot(p) {
      const t = p.team, b = this.ball;
      if (this.so) { this.lastShot = { p, team: t, entry: null, onT: true }; return; }
      p.st.shots++; t.stats.shots++;
      const side = t.dir > 0 ? 1 : 0;
      const sim = Ball.simulateOnTarget(b.x, b.y, b.z, b.vx, b.vy, b.vz, b.spin, side);
      const entry = { x: b.x, y: b.y, team: t.idx, res: sim.hit ? 'on' : 'off', half: this.half };
      if (sim.hit) { p.st.onT++; t.stats.onT++; }
      this.shotMap.push(entry);
      this.lastShot = { p, team: t, entry, onT: sim.hit };
      if (sim.hit) PF.Audio.crowdExcite(0.4);
    }

    // ---------- Мяч вне игры / гол ----------
    checkBall() {
      const b = this.ball, r = C.BALL_R;
      if (this.so) {
        if ((b.x > L + r) && b.y > Ball.Y1 && b.y < Ball.Y2 && b.z < C.GOAL_H) this.scoreGoal(1);
        return;
      }
      if (this.mode === 'duel') {
        // в дуэли нет аутов и угловых: мяч переходит сопернику того, кто коснулся последним
        const lastT = b.lastTouch ? b.lastTouch.team : null;
        if (b.x < -r || b.x > L + r) {
          const side = b.x < 0 ? 0 : 1;
          if (b.y > Ball.Y1 && b.y < Ball.Y2 && b.z < C.GOAL_H) { this.scoreGoal(side); return; }
          const def = this.teams.find((t) => (t.dir > 0 ? 0 : 1) === side);
          if (lastT === def) this.stop({ type: 'duel', team: 1 - def.idx, x: side ? L - 4 : 4, y: b.y < MY ? 5 : W - 5 }, true);
          else this.stop({ type: 'duel', team: def.idx, gk: true, x: 0, y: MY }, true);
        } else if (b.y < -r || b.y > W + r) {
          this.stop({ type: 'duel', team: lastT ? 1 - lastT.idx : 0, x: U.clamp(b.x, 4, L - 4), y: b.y < 0 ? 3 : W - 3 }, true);
        }
        return;
      }
      if (this.mode === 'training' || this.mode === 'freekick') {
        // в тренировке ауты не нужны — только голы
        if (b.x < -r || b.x > L + r) {
          if (b.y > Ball.Y1 && b.y < Ball.Y2 && b.z < C.GOAL_H) this.scoreGoal(b.x < 0 ? 0 : 1);
          else this.trainingReset(1);
        } else if (b.y < -r || b.y > W + r) this.trainingReset(1);
        return;
      }
      const last = b.lastTouch;
      if (b.y < -r || b.y > W + r) {
        if (b.owner) { b.owner = null; }
        const team = last ? 1 - last.team.idx : 0;
        this.stop({ type: 'throw', team, x: U.clamp(b.x, 1, L - 1), y: b.y < 0 ? 0 : W });
        return;
      }
      if (b.x < -r || b.x > L + r) {
        const side = b.x < 0 ? 0 : 1;
        if (b.y > Ball.Y1 && b.y < Ball.Y2 && b.z < C.GOAL_H) { this.scoreGoal(side); return; }
        // какая команда защищает эти ворота
        const def = this.teams.find((t) => (t.dir > 0 ? 0 : 1) === side);
        if (this.lastShot && this.lastShot.entry && this.lastShot.entry.res === 'off') {
          Comm.say('miss', { player: this.lastShot.p.name });
          if (Math.random() < 0.5) snd('ooh');
        }
        this.lastShot = null;
        if (last && last.team === def) {
          this.stop({ type: 'corner', team: 1 - def.idx, x: side ? L : 0, y: b.y < MY ? 0 : W });
        } else {
          this.stop({ type: 'goalkick', team: def.idx, x: side ? L - C.SIX_DEPTH : C.SIX_DEPTH, y: b.y < MY ? MY - 5 : MY + 5 });
        }
      }
    }

    stop(pending, noWhistle) {
      this.pending = pending;
      this.setState('stopped');
      if (!noWhistle && pending.type !== 'throw' && pending.type !== 'goalkick' && pending.type !== 'corner') snd('whistle', 1);
      for (const p of this.all) { p.charging = false; p.chAct = null; p.charge = 0; p.buffer = null; p.runT = 0; }
      if (this.ball.owner && !this.ball.held) this.ball.owner = null;
      this.lastPass = null;
      if (pending.type === 'corner') { this.teams[pending.team].stats.corners++; Comm.say('corner', { team: this.teams[pending.team].short }); this.showBanner('УГЛОВОЙ', null, 1.4); }
      if (pending.type === 'throw') this.showBanner('АУТ', null, 1.0);
      if (pending.type === 'goalkick') this.showBanner('УДАР ОТ ВОРОТ', null, 1.2);
      this.stoppage += C.STOPPAGE_OTHER;
    }
    updStopped(dt) {
      const b = this.ball;
      b.update(dt, this.ballEv);
      for (const p of this.all) {
        if (p.state === 'move' || p.state === 'hold') { p.ix *= 0.9; p.iy *= 0.9; p.sprint = false; }
        p.update(dt);
      }
      this.moveRef(dt);
      this.cam.x = b.x; this.cam.y = b.y; this.cam.z = 0;
      if (this.stateT > C.STOP_DELAY) { if (this.pending.type === 'duel') this.duelRestart(this.pending); else this.beginSetPiece(this.pending); }
    }

    showBanner(text, sub, dur, col) { this.banner = { text, sub, t: 0, dur: dur || 1.6, col: col || C.COL.accent2 }; }

    callOffside(p) {
      const t = p.team;
      t.stats.offsides++;
      Comm.say('offside', { player: p.name }, 1);
      this.showBanner('ОФСАЙД', p.name, 1.6, C.COL.red);
      for (const q of this.all) q.offside = false;
      this.lastPass = null;
      this.stop({ type: 'free', team: 1 - t.idx, x: p.x, y: p.y, indirect: true });
    }

    // Фол: свисток, карточки, штрафной или пенальти
    foul(off, vic, kind) {
      if (this.state !== 'play') return;
      const ft = off.team, vt = vic.team;
      ft.stats.fouls++; off.st.fouls++;
      vic.knockDown(C.FALL_TIME);
      snd('tackle');
      // фол последней надежды: впереди жертвы нет защитников, кроме вратаря
      const va = AI.ax(vt, vic.x);
      let ahead = 0;
      for (const q of ft.players) if (!q.off && !q.isGK && AI.ax(vt, q.x) > va) ahead++;
      const dogso = ahead === 0 && va > 62 && Math.abs(vic.y - MY) < 22;
      const behind = Math.cos(U.angDiff(off.facing, vic.facing)) > 0.4;
      let sev = (kind === 'slide' ? 0.4 : 0.16) + (behind ? 0.22 : 0) + Math.random() * 0.25;
      let card = 0;
      if (this.cardsOn) {
        if (dogso && (kind === 'slide' || Math.random() < 0.5)) card = 2;
        else if (Math.random() < sev - 0.33) card = 1;
      }
      Comm.say('foul', { player: off.name });
      if (card) this.giveCard(off, card);
      const pen = this.inBox(vic.x, vic.y, ft, 0);
      if (pen) {
        Comm.say('penalty', null, 2);
        this.showBanner('ПЕНАЛЬТИ!', null, 2, C.COL.red);
        PF.Audio.crowdExcite(0.8);
        this.stop({ type: 'penalty', team: vt.idx, x: vt.dir > 0 ? L - C.PEN_SPOT : C.PEN_SPOT, y: MY });
      } else if (this.mode === 'duel') {
        if (!card) this.showBanner('ФОЛ', off.name, 1.3);
        this.stop({ type: 'duel', team: vt.idx, x: U.clamp(vic.x, 4, L - 4), y: U.clamp(vic.y, 3, W - 3) });
      } else {
        if (!card) this.showBanner('ФОЛ', off.name, 1.3);
        if (Math.random() < 0.5) Comm.say('freekick', { team: vt.short });
        this.stop({ type: 'free', team: vt.idx, x: U.clamp(vic.x, 1, L - 1), y: U.clamp(vic.y, 1, W - 1) });
      }
    }
    giveCard(p, level) {
      const t = p.team;
      if (level === 1) {
        p.yellow++; p.st.yellow++; t.stats.yellow++;
        if (p.yellow >= 2) level = 2;
      }
      this.ref.cardT = 2.2; this.ref.cardCol = level === 2 ? '#ff3030' : '#ffe030';
      snd('card');
      this.stoppage += C.STOPPAGE_CARD;
      if (level === 2) {
        p.red = true; p.st.red++; t.stats.red++;
        Comm.say('red', { player: p.name, team: t.short }, 2);
        this.showBanner('КРАСНАЯ КАРТОЧКА', p.name, 2.4, '#ff3030');
        this.sendOff(p);
      } else {
        Comm.say('yellow', { player: p.name }, 1);
        this.showBanner('ЖЕЛТАЯ КАРТОЧКА', p.name, 2.2, '#ffe030');
      }
    }
    sendOff(p) {
      p.off = true;
      if (this.ball.owner === p) this.ball.owner = null;
      p.x = p.px = U.clamp(p.x, 2, L - 2); p.y = p.py = -2;
      const t = p.team;
      if (p.isGK) {
        // в ворота встаёт полевой
        p.isGK = false;
        const repl = t.players.filter((q) => !q.off && !q.isGK).sort((a, b) => b.s.gk - a.s.gk || (a.role === 'DEF' ? -1 : 1))[0];
        if (repl) {
          repl.isGK = true; repl.s.gk = Math.max(repl.s.gk, 40);
          const s0 = repl.slot; repl.slot = 0; p.slot = s0;
          repl.sheet = PF.Sprites.sheetFor(t.gkKit, repl.def.skin, repl.def.hair, PF.Sprites.lookOf(repl.def));
        }
      }
      if (t.controlled === p) this.setControlled(t, this.switchCandidate(t, 0, 0));
    }

    // ---------- Голы ----------
    scoreGoal(side) {
      const b = this.ball;
      const scorerTeam = this.teams.find((t) => (t.dir > 0 ? 1 : 0) === side);
      const last = b.lastTouch;
      if (this.so) { this.netBulge[side] = 0.6; snd('goal'); snd('net'); PF.Audio.crowdExcite(1); this.soResult(true); return; }
      const own = last && last.team !== scorerTeam;
      scorerTeam.score++;
      if (this.mode === 'freekick') this.fk.goals++;
      this.netBulge[side] = 0.6;
      const scorer = own ? null : last;
      let assist = null;
      if (scorer && this.assistCand && this.assistCand.p.team === scorerTeam && this.assistCand.p !== scorer && this.t - this.assistCand.t < 12) assist = this.assistCand.p;
      if (scorer) { scorer.st.goals++; }
      if (assist) assist.st.assists++;
      const conc = this.teams[1 - scorerTeam.idx];
      for (const q of conc.players) if (q.isGK || q.role === 'DEF') q.st.conceded++;
      if (this.lastShot && this.lastShot.entry) this.lastShot.entry.res = 'goal';
      else if (scorer) this.shotMap.push({ x: scorer.x, y: scorer.y, team: scorerTeam.idx, res: 'goal', half: this.half });
      this.lastShot = null; this.lastPass = null;
      const min = this.displayMinute();
      const isPen = this.spLastType === 'penalty' && b.kickT < 3;
      if (this.mode === 'match' || this.mode === 'duel') this.goals.push({ team: scorerTeam.idx, name: scorer ? scorer.name : (last ? last.name : '?'), id: scorer ? scorer.def.id : null, own, min, pen: isPen });
      this.stoppage += C.STOPPAGE_GOAL;
      snd('goal'); snd('net');
      PF.Audio.crowdExcite(1);
      this.excite = 3;
      this.goalInfo = { team: scorerTeam, scorer, assist, own, side, t: 0 };
      if (own) Comm.say('owngoal', { team: conc.short }, 3);
      else if (assist) Comm.say('goalAssist', { player: scorer.name, assist: assist.name }, 3);
      else Comm.say('goal', { player: scorer ? scorer.name : '', team: scorerTeam.short }, 3);
      this.showBanner('ГОЛ!', own ? 'АВТОГОЛ' : scorer ? scorer.name : '', 3.2, C.COL.accent2);
      PF.FX.confetti(b.x, b.y, 60);
      for (const p of this.all) { p.charging = false; p.buffer = null; p.runT = 0; }
      this.setState('goal');
      this.slowmo = C.GOAL_SLOWMO_TIME;
      if (scorer) { scorer.setState('celebrate'); scorer.celebX = U.clamp(scorer.x + scorerTeam.dir * -6, 4, L - 4); scorer.celebY = scorer.y < MY ? 6 : W - 6; }
    }
    updGoal(dt) {
      const b = this.ball, gi = this.goalInfo;
      b.update(dt, this.ballEv);
      const sc = gi.scorer;
      for (const p of this.all) {
        if (p.off) continue;
        if (p === sc) {
          AI.moveTo(p, sc.celebX, sc.celebY, true, false);
          if (p.state !== 'celebrate') p.setState('celebrate');
        } else if (sc && p.team === gi.team && !p.isGK) {
          // партнёры бегут обнимать автора гола
          const d = Math.hypot(p.x - sc.x, p.y - sc.y);
          if (d < 18 || this.stateT > 1.2) AI.moveTo(p, sc.x + (p.slot % 3 - 1) * 1.2, sc.y + ((p.slot >> 1) % 3 - 1) * 1.0, true, false);
          else { p.ix = p.iy = 0; }
        } else { p.ix = p.iy = 0; p.faceX = b.x; p.faceY = b.y; }
        p.update(dt);
      }
      this.moveRef(dt);
      if (sc) { this.cam.x = sc.x; this.cam.y = sc.y; this.cam.z = 0; }
      this.cam.zoom = this.stateT > 0.9 && sc ? 2 : 1;
      this.cam.rate = 3;
      if (this.stateT > C.GOAL_CELEB_TIME) {
        this.cam.zoom = 1;
        if ((this.mode === 'match' || this.mode === 'duel') && this.replay.play(C.REPLAY_SEC, C.GOAL_CELEB_TIME - 1.2)) {
          this.setState('replay');
          for (const p of this.replayEnts) p.rvis = true;
        } else this.afterGoal();
      }
    }
    updReplay(dt) {
      this.replay.apply(this.ball, this.replayEnts);
      this.cam.x = this.ball.rx; this.cam.y = this.ball.ry; this.cam.z = this.ball.rz; this.cam.zoom = 1; this.cam.rate = 6;
      if (this.replay.update(dt) || this.skipReplay) { this.skipReplay = false; this.replay.playing = false; this.afterGoal(); }
    }
    afterGoal() {
      if (this.mode === 'training' || this.mode === 'freekick') { this.trainingReset(0); return; }
      // дуэль до N голов: победитель определён
      if (this.mode === 'duel' && this.duelTarget && this.goalInfo.team.score >= this.duelTarget) {
        const w = this.goalInfo.team;
        this.goalInfo = null;
        snd('whistle', 3);
        this.setState('fulltime');
        this.showBanner('ПОБЕДА: ' + w.short, w.score + ':' + this.teams[1 - w.idx].score, 3);
        Comm.say('fulltime', { score: this.teams[0].score + ':' + this.teams[1].score }, 2);
        return;
      }
      const conc = 1 - this.goalInfo.team.idx;
      this.goalInfo = null;
      this.placeKickoff(conc);
      this.cam.snap = true;
    }

    // ---------- Время ----------
    displayMinute() { return Math.min(Math.floor(this.clock / 60) + 1, this.half === 1 ? 45 : 90) + (this.clock >= (this.half === 1 ? 2700 : 5400) ? '+' : ''); }
    checkTime() {
      const end = this.half === 1 ? C.GAME_HALF_SEC : C.GAME_HALF_SEC * 2;
      if (this.clock >= end && !this.addedShown) {
        this.addedShown = true;
        this.addedMin = U.clamp(Math.round(this.stoppage / 60) + 1, 1, 6);
        Comm.say('added', { n: this.addedMin }, 1);
      }
      if (this.addedShown && this.clock >= end + this.addedMin * 60) {
        // не обрываем опасную атаку: ждём, пока мяч уйдёт от ворот (не дольше 20 игровых секунд)
        const danger = Math.min(this.ball.x, L - this.ball.x) < 25;
        if (danger && this.clock < end + this.addedMin * 60 + 20) return;
        this.endHalf();
      }
    }
    endHalf() {
      snd('whistle', this.half === 1 ? 2 : 3);
      const sc = this.teams[0].score + ':' + this.teams[1].score;
      this.ball.owner = null;
      for (const p of this.all) { p.charging = false; p.buffer = null; }
      if (this.half === 1) {
        Comm.say('halftime', { score: sc }, 2);
        this.setState('halftime');
        this.showBanner('ПЕРЕРЫВ', sc, 2.5);
        this.aiSubs(true);
      } else {
        Comm.say('fulltime', { score: sc }, 2);
        this.setState('fulltime');
        this.showBanner('КОНЕЦ МАТЧА', sc, 3);
      }
    }
    startSecondHalf() {
      this.half = 2; this.clock = C.GAME_HALF_SEC; this.stoppage = 0; this.addedShown = false; this.addedMin = 0;
      for (const t of this.teams) { t.dir = -t.dir; for (const p of t.players) p.stamina = Math.min(1, p.stamina + 0.3); }
      this.placeKickoff(1 - this.kickoffFirst);
      Comm.say('second', null, 2);
      this.cam.snap = true;
    }
    needsShootout() { return this.o.knockout && this.teams[0].score === this.teams[1].score; }

    // ИИ-замены уставших игроков
    aiSubs(force) {
      for (const t of this.teams) {
        if (t.human || this.mode !== 'match') continue;
        const tired = t.players.filter((p) => !p.off && !p.isGK && p.stamina < (force ? 0.55 : 0.4)).sort((a, b) => a.stamina - b.stamina);
        for (const p of tired.slice(0, 2)) {
          if (t.subsLeft <= C.MAX_SUBS - 3) break;
          const cand = t.bench.find((d) => d.role === p.role && !d.used) || t.bench.find((d) => d.role !== 'GK' && !d.used);
          if (cand) this.substitute(t, p, cand);
        }
      }
    }
    substitute(t, out, inDef) {
      if (t.subsLeft <= 0 || out.off) return false;
      const i = t.players.indexOf(out);
      const p = new Player(this, t, inDef, out.slot);
      p.role = out.role; p.isGK = out.isGK;
      p.setStats(inDef.stats, t.human ? 1 : this.diff.statMul);
      p.sheet = PF.Sprites.sheetFor(p.isGK ? t.gkKit : t.kit, inDef.skin, inDef.hair, PF.Sprites.lookOf(inDef));
      p.place(out.x, out.y); p.facing = out.facing;
      t.players[i] = p;
      inDef.used = true;
      out.subbedOff = true;
      t.subbedOut = t.subbedOut || [];
      t.subbedOut.push(out);
      t.bench = t.bench.filter((d) => d !== inDef);
      t.subsLeft--;
      if (this.ball.owner === out) this.ball.owner = p;
      if (t.controlled === out) this.setControlled(t, p);
      this.stoppage += C.STOPPAGE_SUB;
      Comm.say('sub', { team: t.short, player: p.name }, 1);
      this.refreshAll();
      return true;
    }

    // ---------- Судья ----------
    moveRef(dt) {
      const r = this.ref, b = this.ball;
      const tx = U.clamp(b.x - 9 * Math.sign(b.x - L / 2 || 1), 8, L - 8), ty = U.clamp(b.y + (b.y < MY ? 10 : -10), 4, W - 4);
      AI.moveTo(r, tx, ty, false, false);
      r.faceX = b.x; r.faceY = b.y;
      r.steer(dt);
      r.x += r.vx * dt; r.y += r.vy * dt;
      r.animT += Math.hypot(r.vx, r.vy) * dt * 0.62;
      r.state = r.cardT > 0 ? 'throw' : 'move';
    }

    // ---------- Стандарты ----------
    placeKickoff(teamIdx) {
      const t = this.teams[teamIdx];
      this.ball.reset(L / 2, MY);
      this.possTeam = teamIdx;
      for (const tm of this.teams) {
        for (const p of tm.players) {
          if (p.off) continue;
          const f = tm.slots[p.slot];
          let a = Math.min(4 + f.fx * 74, L / 2 - 1.5), b = 5 + f.fy * (W - 10);
          if (tm !== t && Math.abs(b - MY) < C.CIRCLE_R + 1 && a > L / 2 - C.CIRCLE_R - 1) a = L / 2 - C.CIRCLE_R - 1.5;
          p.place(AI.ax(tm, a), AI.ay(tm, b));
          p.setState('move'); p.charging = false; p.buffer = null; p.offside = false; p.runT = 0; p.holdT = 0;
          p.facing = tm.dir > 0 ? 0 : Math.PI;
          p.tx = p.x; p.ty = p.y;
        }
      }
      // разводящий у мяча
      const fw = t.players.filter((p) => !p.off && !p.isGK).sort((a, b) => t.slots[b.slot].fx - t.slots[a.slot].fx);
      const taker = fw[0];
      if (fw[1]) fw[1].place(L / 2 - t.dir * 1.2, MY - 3);
      taker.place(L / 2 - t.dir * 0.7, MY + 0.3);
      taker.facing = t.dir > 0 ? Math.PI : 0;
      this.sp = { type: 'kickoff', team: teamIdx, x: L / 2, y: MY, taker, t: 0 };
      const aim = this.spDefaultAim(this.sp);
      this.sp.aimX = aim.x; this.sp.aimY = aim.y;
      if (t.human) this.setControlled(t, taker);
      for (const h of this.humans) {
        if (h === t) continue;
        const c = h.players.find((p) => !p.off && p.role === 'FWD') || h.players.find((p) => !p.off && !p.isGK);
        this.setControlled(h, c);
      }
      this.ref.place(L / 2 - 6, MY + 12);
      this.setState(this.state === 'intro' ? 'intro' : 'kickoff');
      this.cam.x = L / 2; this.cam.y = MY;
    }

    beginSetPiece(sp) {
      const b = this.ball, t = this.teams[sp.team];
      b.reset(sp.x, sp.y);
      sp.t = 0;
      this.possTeam = sp.team;
      // ИИ-контекст под новую ситуацию
      for (const tm of this.teams) { tm.ctxT = 0; tm.ctx.inPoss = tm === t; tm.ctx.bx = AI.ax(tm, sp.x); tm.ctx.by = AI.ay(tm, sp.y); tm.ctx.offLine = Math.max(L / 2, tm.ctx.bx); }
      // исполнитель
      let taker;
      const outfield = t.players.filter((p) => !p.off && !p.isGK);
      if (sp.type === 'goalkick') taker = t.players.find((p) => p.isGK && !p.off) || outfield[0];
      else if (sp.type === 'penalty') taker = outfield.slice().sort((a, b) => b.s.sho - a.s.sho)[0];
      else if (sp.type === 'free' && this.isShootingFK(t, sp)) taker = outfield.slice().sort((a, b) => (b.s.sho + b.s.dri) - (a.s.sho + a.s.dri))[0];
      else if (sp.type === 'corner') taker = outfield.slice().sort((a, b) => b.s.pas - a.s.pas)[0];
      else taker = outfield.slice().sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y))[0];
      sp.taker = taker;
      if (sp.so) sp.taker = sp.soTaker;
      taker = sp.taker;
      // позиции всех игроков
      this.spTargets(sp);
      for (const p of this.all) {
        if (p.off) continue;
        p.setState('move'); p.charging = false; p.buffer = null; p.runT = 0; p.offside = false; p.vz = 0; p.z = 0;
        const far = Math.hypot(p.x - sp.x, p.y - sp.y) > 26 || Math.hypot(p.x - p.spX, p.y - p.spY) > 18;
        if (far || sp.so) p.place(p.spX, p.spY);
      }
      // исполнитель за мячом
      const aim = this.spDefaultAim(sp);
      sp.aimX = aim.x; sp.aimY = aim.y;
      const a = Math.atan2(aim.y - sp.y, aim.x - sp.x);
      taker.place(sp.x - Math.cos(a) * 0.9, sp.y - Math.sin(a) * 0.9);
      taker.facing = a;
      if (sp.type === 'throw') { taker.place(sp.x, sp.y < MY ? 0.15 : W - 0.15); taker.facing = sp.y < MY ? Math.PI / 2 : -Math.PI / 2; taker.setState('throw', 99); }
      sp.wall = sp.wall || [];
      this.sp = sp;
      this.spLastType = sp.type;
      if (t.human) this.setControlled(t, taker);
      for (const h of this.humans) {
        if (h === t) continue;
        if (sp.type === 'penalty') this.setControlled(h, h.players.find((p) => p.isGK && !p.off));
        else this.setControlled(h, this.switchCandidate(h, 0, 0) || h.controlled);
      }
      this.setState('setpiece');
      this.cam.x = sp.x; this.cam.y = sp.y;
    }
    isShootingFK(t, sp) {
      const gx = t.dir > 0 ? L : 0;
      return Math.hypot(gx - sp.x, MY - sp.y) < 31 && Math.abs(sp.y - MY) < 20 && !sp.indirect;
    }
    spDefaultAim(sp) {
      const t = this.teams[sp.team], gx = t.dir > 0 ? L : 0;
      if (sp.type === 'penalty' || (sp.type === 'free' && this.isShootingFK(t, sp))) return { x: gx, y: MY };
      if (sp.type === 'corner') return { x: gx - t.dir * 9, y: MY };
      if (sp.type === 'kickoff') return { x: L / 2 - t.dir * 10, y: MY };
      if (sp.type === 'throw') return { x: sp.x + t.dir * 6, y: sp.y < MY ? 8 : W - 8 };
      return { x: sp.x + t.dir * 15, y: U.lerp(sp.y, MY, 0.4) };
    }

    // Расстановка на стандарт: базовая схема + особые правила
    spTargets(sp) {
      const t = this.teams[sp.team], opp = this.teams[1 - sp.team];
      const tmp = { x: 0, y: 0 };
      for (const tm of this.teams) {
        for (const p of tm.players) {
          if (p.off) continue;
          AI.shape(this, tm, p, tmp);
          p.spX = tmp.x; p.spY = tmp.y;
          if (p.isGK) { p.spX = tm.dir > 0 ? 1 : L - 1; p.spY = MY; }
        }
      }
      sp.wall = [];
      const gxOpp = t.dir > 0 ? L : 0; // ворота, которые атакует t
      if (sp.type === 'corner' || (sp.type === 'free' && Math.hypot(gxOpp - sp.x, MY - sp.y) < 40)) {
        // атакующие в штрафной
        const att = t.players.filter((p) => !p.off && !p.isGK).sort((a, b) => (b.s.phy + (b.role === 'FWD' ? 20 : 0)) - (a.s.phy + (a.role === 'FWD' ? 20 : 0)));
        const spots = [[6, -3], [7, 3.5], [11, 0], [13, -6], [4, 4.5], [17, 2]];
        att.slice(0, 6).forEach((p, i) => { p.spX = AI.ax(t, L - spots[i][0]); p.spY = AI.ay(t, MY + spots[i][1]); });
        // защитники: зонально
        const def = opp.players.filter((p) => !p.off && !p.isGK);
        const dsp = [[1.5, -3.5], [5, -2], [5, 2.5], [8, 0], [10, -5], [10, 5], [15, 0]];
        def.sort((a, b) => (b.role === 'DEF' ? 1 : 0) - (a.role === 'DEF' ? 1 : 0)).slice(0, 7).forEach((p, i) => { p.spX = AI.ax(opp, dsp[i][0]); p.spY = AI.ay(opp, MY + dsp[i][1]); });
      }
      if (sp.type === 'free' && this.isShootingFK(t, sp)) {
        // стенка
        const dx = gxOpp - sp.x, dy = MY - sp.y, d = Math.hypot(dx, dy);
        const n = d < 20 ? 4 : d < 26 ? 3 : 2;
        const cx = sp.x + dx / d * C.WALL_DIST, cy = sp.y + dy / d * C.WALL_DIST;
        const px = -dy / d, py = dx / d;
        const wallers = opp.players.filter((p) => !p.off && !p.isGK).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, n);
        wallers.forEach((p, i) => { const o = (i - (n - 1) / 2) * 0.75; p.spX = cx + px * o; p.spY = cy + py * o; p.wall = true; sp.wall.push(p); });
      }
      if (sp.type === 'penalty') {
        for (const tm of this.teams) for (const p of tm.players) {
          if (p.off || p === sp.taker) continue;
          if (p.isGK && tm !== t) { p.spX = gxOpp - t.dir * 0.2; p.spY = MY; continue; }
          if (p.isGK) continue;
          const i = p.slot;
          p.spX = AI.ax(t, L - 21 - (i % 3) * 2.5); p.spY = MY - 14 + i * 2.6 + (tm === t ? 1.2 : 0);
        }
      }
      if (sp.type === 'goalkick') {
        for (const p of opp.players) {
          if (p.off) continue;
          const pa = AI.ax(opp, p.spX);
          if (pa > L - 19) p.spX = AI.ax(opp, L - 19 - Math.random() * 4);
        }
      }
      if (sp.type === 'kickoff') return;
      // соперники не ближе 9.15 м к мячу
      if (sp.type !== 'throw') {
        for (const p of opp.players) {
          if (p.off || p.wall || (p.isGK && sp.type === 'penalty')) continue;
          const dx = p.spX - sp.x, dy = p.spY - sp.y, d = Math.hypot(dx, dy);
          if (d < C.WALL_DIST + 0.5) { const k = (C.WALL_DIST + 0.6) / (d || 1); p.spX = sp.x + dx * k; p.spY = sp.y + dy * k; }
        }
      }
      for (const p of this.all) { p.spX = U.clamp(p.spX, -1, L + 1); p.spY = U.clamp(p.spY, -1, W + 1); }
    }

    updSetPiece(dt) {
      const sp = this.sp, b = this.ball, t = this.teams[sp.team];
      sp.t += dt;
      if (this.state === 'setpiece' && this.timed && !this.so) this.clock += dt * this.clockRate * 0.5;
      b.x = sp.x; b.y = sp.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.owner = null;
      if (sp.type === 'throw') { b.z = 2.0; b.x = sp.taker.x; b.y = sp.y < MY ? 0.3 : W - 0.3; }
      if (sp.type === 'goalkick' && sp.taker.isGK) { /* мяч на земле */ }
      for (const p of this.all) {
        if (p.off) continue;
        if (p === sp.taker) { p.ix = p.iy = 0; p.faceX = sp.aimX; p.faceY = sp.aimY; p.update(dt); continue; }
        const h = p.team.human && p.controlled && this.state === 'setpiece' && sp.type !== 'penalty';
        if (h) { PF.Input.use(p.team.pad); const a = PF.Input.axis(); p.ix = a.x; p.iy = a.y; p.sprint = PF.Input.down('sprint'); PF.Input.use(0); p.faceX = b.x; p.faceY = b.y; }
        else if (this.state === 'kickoff') { p.ix = p.iy = 0; p.faceX = b.x; p.faceY = b.y; }
        else { AI.moveTo(p, p.spX, p.spY, Math.hypot(p.x - p.spX, p.y - p.spY) > 6, false); p.faceX = b.x; p.faceY = b.y; }
        p.update(dt);
      }
      this.moveRef(dt);
      this.cam.x = sp.x + (sp.aimX - sp.x) * 0.25; this.cam.y = sp.y; this.cam.z = 0;
      if (this.state === 'setpiece' && sp.t > C.SETPIECE_PREP + 0.6) {
        // отстающих телепортируем
        for (const p of this.all) if (!p.off && p !== sp.taker && !p.controlled && Math.hypot(p.x - p.spX, p.y - p.spY) > 4) p.place(p.spX, p.spY);
      }
      const ready = sp.t > (this.state === 'kickoff' ? 0.5 : C.SETPIECE_PREP * 0.6);
      if (!ready) return;
      // человек долго не разыгрывает стандарт — за него решает ИИ (кроме пенальти)
      if (t.human && sp.t > 12 && sp.type !== 'penalty') this.spAI(sp);
      else if (t.human) { PF.Input.use(t.pad); this.spHuman(sp, dt); PF.Input.use(0); }
      else if (sp.t > (this.state === 'kickoff' ? 1.0 : C.SETPIECE_PREP + C.AI_SETPIECE_WAIT * (sp.type === 'throw' ? 0.5 : 1))) this.spAI(sp);
      // вратарь-человек на пенальти: выбирает сторону заранее
      if (sp.type === 'penalty') {
        const h = this.teams[1 - sp.team];
        if (h.human && this.state === 'setpiece') { PF.Input.use(h.pad); const a = PF.Input.axis(); sp.gkGuess = a.y < -0.4 ? -1 : a.y > 0.4 ? 1 : sp.gkGuess || 0; PF.Input.use(0); }
      }
    }

    // Человек исполняет стандарт
    spHuman(sp, dt) {
      const I = PF.Input, a = I.axis(), p = sp.taker, t = p.team;
      // прицел
      if (Math.hypot(a.x, a.y) > 0.3) {
        if (sp.type === 'penalty' || (sp.type === 'free' && this.isShootingFK(t, sp))) {
          sp.aimY = U.clamp((sp.aimY || MY) + a.y * dt * 6, Ball.Y1 + 0.4, Ball.Y2 - 0.4);
        } else {
          const ang = Math.atan2(a.y, a.x);
          sp.aimX = sp.x + Math.cos(ang) * 14; sp.aimY = sp.y + Math.sin(ang) * 14;
        }
      }
      const shootType = sp.type === 'penalty' || (sp.type === 'free' && this.isShootingFK(t, sp));
      this.chargeAction(p, dt, a, (pp, act, x, y, power) => this.spExecute(sp, act === 'shoot' && !shootType ? 'lob' : act, a, power));
    }
    spExecute(sp, go, a, power) {
      const p = sp.taker, t = p.team, b = this.ball;
      this.spKick = sp.type;
      b.x = sp.type === 'throw' ? p.x : sp.x; b.y = sp.type === 'throw' ? (sp.y < MY ? 0.3 : W - 0.3) : sp.y; b.z = sp.type === 'throw' ? 1.8 : 0;
      p.setState('move');
      if (go === 'shoot') {
        power = Math.max(0.3, power == null ? 0.3 : power);
        const aimY = sp.aimY || MY;
        const isPen = sp.type === 'penalty';
        const aimZ = isPen ? 0.3 + power * 1.6 : 1.7 + power * 0.6;
        const curve = isPen ? 0 : (sp.y < MY ? 1 : -1) * t.dir * 0.55;
        p.shoot(power * (isPen ? 0.85 : 0.82), aimY, aimZ, curve);
      } else if (sp.type === 'throw') {
        const q = this.passTarget(p, a.x || (sp.aimX - sp.x), a.y || (sp.aimY - sp.y), go === 'lob');
        const tx = q ? q.x : sp.aimX, ty = q ? q.y : sp.aimY;
        // сила вбрасывания ограничивает дальность
        const maxD = power == null ? (go === 'lob' ? 26 : 16) : 6 + power * 22;
        const d = Math.min(maxD, Math.hypot(tx - b.x, ty - b.y));
        const ang = Math.atan2(ty - b.y, tx - b.x);
        p.lobTo(b.x + Math.cos(ang) * d, b.y + Math.sin(ang) * d, 0.6, 'throw', q);
        p.setState('throw', 0.35);
        if (q && t.human) this.setControlled(t, q);
      } else if (sp.type === 'corner' && go !== 'pass') {
        this.humanAction(p, 'lob', 0, 0, power);
      } else {
        this.humanAction(p, go, a.x || (sp.aimX - sp.x) / 14, a.y || (sp.aimY - sp.y) / 14, power);
      }
      p.kickCD = 0.6;
      this.afterSetPiece(sp);
    }
    spAI(sp) {
      const p = sp.taker, t = p.team, b = this.ball;
      const gx = t.dir > 0 ? L : 0;
      this.spKick = sp.type;
      b.x = sp.type === 'throw' ? p.x : sp.x; b.y = sp.type === 'throw' ? (sp.y < MY ? 0.3 : W - 0.3) : sp.y;
      p.setState('move');
      const out = { q: null };
      switch (sp.type) {
        case 'kickoff': {
          const q = t.players.filter((x) => !x.off && x !== p && !x.isGK).sort((x1, x2) => Math.hypot(x1.x - p.x, x1.y - p.y) - Math.hypot(x2.x - p.x, x2.y - p.y))[0];
          p.passTo(q.x, q.y, 5, 'pass', q);
          break;
        }
        case 'penalty': {
          const aimY = Math.random() < 0.5 ? Ball.Y1 + U.rand(0.4, 1.4) : Ball.Y2 - U.rand(0.4, 1.4);
          p.shoot(U.rand(0.6, 0.85), Math.random() < 0.15 ? MY : aimY, U.rand(0.2, 1.8), 0);
          break;
        }
        case 'corner': {
          const tgt = t.players.filter((x) => !x.off && x !== p && this.inBox(x.x, x.y, this.teams[1 - t.idx], 1));
          const q = tgt.length ? tgt[Math.floor(Math.random() * tgt.length)] : null;
          if (q && Math.random() < 0.85) p.lobTo(q.x + U.rand(-1, 1), q.y + U.rand(-1, 1), 1.6, 'cross', q);
          else { AI.evalPasses(this, p, out, true); if (out.q) p.passTo(out.x, out.y, 5, 'pass', out.q); else p.lobTo(gx - t.dir * 8, MY, 1.5, 'cross'); }
          break;
        }
        case 'free':
          if (this.isShootingFK(t, sp) && Math.random() < 0.75) {
            const aimY = Math.random() < 0.5 ? Ball.Y1 + 0.8 : Ball.Y2 - 0.8;
            const curve = (aimY < MY ? 1 : -1) * t.dir * -0.5 * (sp.y < MY ? -1 : 1);
            p.shoot(U.rand(0.62, 0.78), aimY, U.rand(1.6, 2.2), curve);
            break;
          }
        // falls through — обычный штрафной разыгрываем пасом
        case 'goalkick': case 'throw': default: {
          const s = AI.evalPasses(this, p, out, sp.type !== 'goalkick');
          if (sp.type === 'throw') {
            const q = out.q;
            const tx = q ? out.x : sp.x + t.dir * 8, ty = q ? out.y : (sp.y < MY ? 8 : W - 8);
            const d = Math.min(20, Math.hypot(tx - b.x, ty - b.y)), ang = Math.atan2(ty - b.y, tx - b.x);
            b.z = 1.8;
            p.lobTo(b.x + Math.cos(ang) * d, b.y + Math.sin(ang) * d, 0.6, 'throw', q);
            p.setState('throw', 0.35);
          } else if (sp.type === 'goalkick' && (s < 0.05 || Math.random() < 0.6)) {
            const fw = t.players.filter((x) => !x.off && !x.isGK).sort((a1, a2) => AI.ax(t, a2.x) - AI.ax(t, a1.x))[Math.floor(Math.random() * 3)];
            p.lobTo(fw.x, fw.y, 0, 'lob', fw);
          } else if (out.q) {
            if (out.lob) p.lobTo(out.x, out.y, 0, 'lob', out.q); else p.passTo(out.x, out.y, 6, 'pass', out.q);
          } else p.lobTo(sp.x + t.dir * 30, MY, 0, 'lob');
        }
      }
      p.kickCD = 0.6;
      this.afterSetPiece(sp);
    }
    afterSetPiece(sp) {
      // вратарь соперника на пенальти прыгает
      if (sp.type === 'penalty') {
        const opp = this.teams[1 - sp.team];
        const gk = opp.players.find((p) => p.isGK && !p.off);
        if (gk) {
          const h = opp.human;
          let side = h ? sp.gkGuess || 0 : (Math.random() < 0.15 ? 0 : Math.random() < 0.5 ? -1 : 1);
          const reach = 2.4 + gk.s.gk / 60;
          if (side) gk.dive(gk.x, MY + side * reach, U.rand(0.3, 1.4));
          gk.shotSeen = -1;
        }
        if (sp.so) this.so.kickT = 0;
      }
      for (const p of this.all) p.wall = false;
      if (this.state === 'kickoff') snd('whistle', 1);
      this.setState('play');
    }

    // ---------- Серия пенальти ----------
    startShootout() {
      this.so = { kicks: [[], []], turn: this.kickoffFirst, n: [0, 0], done: false, kickT: 0 };
      Comm.say('shootout', null, 3);
      this.showBanner('СЕРИЯ ПЕНАЛЬТИ', null, 2.5);
      this.soNext();
    }
    soNext() {
      const so = this.so, t = this.teams[so.turn], opp = this.teams[1 - so.turn];
      t.dir = 1; opp.dir = -1;
      const takers = t.players.filter((p) => !p.off && !p.isGK).sort((a, b) => b.s.sho - a.s.sho);
      const taker = takers[so.n[so.turn] % takers.length];
      so.n[so.turn]++;
      // остальные — в центральном круге
      for (const tm of this.teams) tm.players.forEach((p, i) => { if (!p.off) p.place(L / 2 + (i % 4) * 1.4 - 2, MY - 6 + Math.floor(i / 4) * 2 + tm.idx * 7); });
      this.beginSetPiece({ type: 'penalty', team: so.turn, x: L - C.PEN_SPOT, y: MY, so: true, soTaker: taker });
      for (const tm of this.teams) for (const p of tm.players) { if (!p.off && p !== taker && !(p.isGK && tm === opp)) { p.spX = p.x; p.spY = p.y; } }
      const gk = opp.players.find((p) => p.isGK && !p.off);
      if (gk) { gk.place(L - 0.3, MY); gk.spX = gk.x; gk.spY = gk.y; }
    }
    soResult(goal) {
      const so = this.so;
      if (so.resolved) return;
      so.resolved = true;
      const t = this.teams[so.turn];
      so.kicks[so.turn].push(goal);
      if (goal) { t.pens++; Comm.say('penGoal', { player: this.sp.taker.name }, 2); }
      else { Comm.say('penMiss', { player: this.sp.taker.name }, 2); snd('ooh'); }
      this.showBanner(goal ? 'ГОЛ!' : 'МИМО!', t.pens + ':' + this.teams[1 - t.idx].pens, 1.5, goal ? C.COL.accent2 : C.COL.red);
      so.wait = 1.6;
      this.setState('soWait');
    }
    updSoWait(dt) {
      const so = this.so, b = this.ball;
      b.update(dt, this.ballEv);
      for (const p of this.all) { p.ix *= 0.9; p.iy *= 0.9; p.update(dt); }
      if (this.stateT < so.wait) return;
      so.resolved = false;
      // проверка победителя
      const a = so.kicks[0].length, c = so.kicks[1].length;
      const ga = this.teams[0].pens, gb = this.teams[1].pens;
      let decided = false;
      if (a <= 5 && c <= 5) {
        if (ga + (5 - a) < gb || gb + (5 - c) < ga) decided = true;
        if (a === 5 && c === 5 && ga !== gb) decided = true;
      } else if (a === c && ga !== gb) decided = true;
      if (decided) { so.done = true; this.setState('fulltime'); this.showBanner('ПОБЕДА ПО ПЕНАЛЬТИ', this.teams[ga > gb ? 0 : 1].short, 3); snd('whistle', 3); return; }
      so.turn = 1 - so.turn;
      this.soNext();
    }

    // ---------- Дуэль 1 на 1 ----------
    // На поле вратарь (слот 0) и один полевой (слот 10) с каждой стороны
    setupDuel() {
      for (const t of this.teams) for (const p of t.players) {
        if (p.slot === 0 || p.slot === 10) continue;
        p.off = true; p.benched = true; p.place(-6, -6);
      }
      this.refreshAll();
      this.all = this.all.filter((p) => !p.off);
    }
    duelRestart(pd) {
      const t = this.teams[pd.team], opp = this.teams[1 - pd.team], b = this.ball;
      const gx = t.dir > 0 ? 0 : L;
      b.reset(pd.x, pd.y);
      for (const p of this.all) { p.setState('move'); p.vx = p.vy = 0; p.charging = false; p.chAct = null; p.buffer = null; }
      let taker;
      if (pd.gk) {
        taker = t.players.find((p) => p.isGK && !p.off);
        taker.place(gx + t.dir * 1.5, MY);
        b.x = taker.x; b.y = taker.y;
        this.gkCatch(taker);
      } else {
        taker = t.players.find((p) => !p.off && !p.isGK);
        taker.place(pd.x - t.dir * 0.6, pd.y);
        taker.facing = t.dir > 0 ? 0 : Math.PI;
        b.owner = taker; b.lastTouch = taker;
        if (t.human) this.setControlled(t, taker);
      }
      // соперник отходит на 7 м
      for (const o of opp.players) {
        if (o.off || o.isGK) continue;
        const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
        if (d < 7) { const k = 7 / (d || 1); o.place(U.clamp(b.x + (d ? dx * k : -t.dir * 7), 1, L - 1), U.clamp(b.y + dy * k, 1, W - 1)); }
      }
      this.possTeam = t.idx;
      this.lastShot = null; this.lastPass = null;
      this.setState('play');
    }

    // ---------- Тренировка ----------
    setupTraining() {
      const opp = this.teams[1 - (this.o.human === 1 ? 1 : 0)];
      for (const p of opp.players) if (!p.isGK) { p.off = true; p.place(-5, -5); }
      this.refreshAll();
      this.all = this.all.filter((p) => !p.off);
    }
    trainingReset(delay) {
      const h = this.human;
      if (this.mode === 'freekick') { this.nextFreeKick(); return; }
      const p = h.controlled || h.players[9];
      this.ball.reset(p.x + h.dir * 0.8, p.y);
      this.ball.owner = p;
      this.possTeam = h.idx;
      this.setState('play');
      void delay;
    }
    updTrainingWatch() {
      const b = this.ball;
      if (b.owner && b.owner.isGK && b.owner.team !== this.human && b.owner.holdT > 0.8) { b.owner.holdT = 0; this.trainingReset(); }
    }
    nextFreeKick() {
      const h = this.human, gx = h.dir > 0 ? L : 0;
      const d = U.rand(18, 28), a = U.rand(-0.7, 0.7);
      const x = gx - h.dir * Math.cos(a) * d, y = MY + Math.sin(a) * d * 1.1;
      this.fk.tries++;
      this.fkWatch = 0;
      this.beginSetPiece({ type: 'free', team: h.idx, x, y });
    }
    updFreeKickWatch(dt) {
      const b = this.ball;
      this.fkWatch += dt;
      if (this.fkWatch > 4.5 || (b.speed() < 0.6 && b.kickT > 1.2) || (b.owner && b.owner.team !== this.human)) { this.fkWatch = 0; this.nextFreeKick(); }
    }

    // ---------- Итоги ----------
    finalRatings() {
      const res = [];
      for (const t of this.teams) {
        const o = this.teams[1 - t.idx];
        const resBonus = t.score > o.score ? 0.35 : t.score < o.score ? -0.3 : 0;
        const list = t.players.concat(t.subbedOut || []);
        for (const p of list) {
          if (p.benched) continue; // в дуэли на поле только двое
          const s = p.st;
          let r = 6.0 + s.goals * 1.0 + s.assists * 0.7 + s.onT * 0.15 + s.shots * 0.04 + s.passOk * 0.025 - (s.passes - s.passOk) * 0.05
            + s.tackles * 0.12 + s.inter * 0.08 + s.saves * 0.35 - s.fouls * 0.1 - s.yellow * 0.3 - s.red * 1.6
            - s.conceded * (p.isGK ? 0.35 : p.role === 'DEF' ? 0.12 : 0) + resBonus;
          if (p.isGK && o.score === 0) r += 0.6;
          p.rating = Math.round(U.clamp(r, 3, 10) * 10) / 10;
          res.push(p);
        }
      }
      res.sort((a, b) => b.rating - a.rating);
      return res;
    }
    result() {
      const r = this.finalRatings();
      return {
        home: this.teams[0].def.id, away: this.teams[1].def.id,
        hs: this.teams[0].score, as: this.teams[1].score,
        hp: this.so ? this.teams[0].pens : null, ap: this.so ? this.teams[1].pens : null,
        winner: this.teams[0].score + (this.teams[0].pens || 0) * 0.01 > this.teams[1].score + (this.teams[1].pens || 0) * 0.01 ? 0
          : this.teams[0].score + (this.teams[0].pens || 0) * 0.01 < this.teams[1].score + (this.teams[1].pens || 0) * 0.01 ? 1 : -1,
        motm: r[0],
      };
    }
  }
  // Расширяем update для состояния ожидания серии пенальти
  const baseUpdate = Match.prototype.update;
  Match.prototype.update = function (dt) {
    if (this.state === 'soWait') {
      this.t += dt; this.stateT += dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
      for (const p of this.all) p.savePrev();
      this.ball.savePrev();
      this.updSoWait(dt);
      for (const p of this.all) p.updatePose();
      PF.FX.update(dt); Comm.update(dt, C.W);
      return;
    }
    baseUpdate.call(this, dt);
    // в серии пенальти: промах фиксируем, когда мяч остановился / вышел / пойман
    if (this.so && this.state === 'play') {
      const b = this.ball;
      this.so.kickT += dt;
      const gkHas = b.owner && b.owner.isGK;
      if (this.so.kickT > 3 || gkHas || (b.speed() < 1 && this.so.kickT > 1) || b.x < 80 || b.y < 0 || b.y > W || (b.x > L + 0.2 && !(b.y > Ball.Y1 && b.y < Ball.Y2))) this.soResult(false);
    }
  };
  PF.Match = Match;
})(window.PF);
