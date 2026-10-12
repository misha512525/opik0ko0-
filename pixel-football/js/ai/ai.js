'use strict';
// ИИ команды: позиционная игра по схеме, линия обороны, опека, прессинг,
// открывания под пас, забегания за спину, решения владельца мяча и вратарь.
// Работает в «атакующих координатах» команды: ax — расстояние от своих ворот (0..105),
// ay — от левого фланга с точки зрения атакующей команды (0..68).
(function (PF) {
  const C = PF.C, U = PF.U, Ball = PF.Ball;
  const L = C.PITCH_L, W = C.PITCH_W, MY = W / 2;
  const PX = Ball.PRED_X, PY = Ball.PRED_Y, PZ = Ball.PRED_Z;

  const ax = (t, x) => (t.dir > 0 ? x : L - x);
  const ay = (t, y) => (t.dir > 0 ? y : W - y);
  const wx = ax, wy = ay; // преобразование симметрично

  const AI = {};
  AI.ax = ax; AI.ay = ay;

  // Ценность позиции для атаки (чем ближе к центру чужих ворот — тем выше)
  function posValue(t, x, y) {
    const a = ax(t, x), b = ay(t, y);
    let v = Math.pow(a / L, 1.7);
    const dc = Math.abs(b - MY);
    if (a > L - C.BOX_DEPTH && dc < C.BOX_HALF) v += 0.28 - dc / 120;
    else if (a > 70) v -= dc / 260;
    return v;
  }

  // Время перехвата мяча игроком по предсказанной траектории
  AI.intercept = (m, p) => {
    if (p.off || p.state === 'down' || p.state === 'slide' || p.state === 'getup') { p.icT = 99; p.icI = C.PRED_STEPS - 1; return; }
    const vmax = (C.BASE_SPEED + C.SPEED_STAT_K * p.s.spd / 100) * (p.stamina > 0.1 ? C.SPRINT_MUL : 1);
    const reach = p.isGK ? 1.0 : 0.6;
    const zmax = p.isGK && m.inOwnBox(p, 0) ? C.GK_REACH_Z : 1.9;
    for (let i = 0; i < C.PRED_STEPS; i++) {
      const t = i * C.PRED_DT;
      const d = Math.hypot(PX[i] - p.x, PY[i] - p.y) - reach;
      if (PZ[i] < zmax && d <= vmax * Math.max(0, t - 0.12)) { p.icT = t; p.icI = i; return; }
    }
    p.icT = 99; p.icI = C.PRED_STEPS - 1;
  };

  // ------------------------------------------------------------
  // Командный контекст (раз в несколько тиков)
  // ------------------------------------------------------------
  function teamContext(m, t) {
    const b = m.ball, opp = m.teams[1 - t.idx];
    const ctx = t.ctx;
    ctx.inPoss = m.possTeam === t.idx;
    ctx.bx = ax(t, b.x); ctx.by = ay(t, b.y);
    // линия офсайда соперника: второй с конца игрок соперника (в наших атакующих координатах)
    let a1 = 0, a2 = 0;
    for (const o of opp.players) {
      if (o.off) continue;
      const a = ax(t, o.x);
      if (a > a1) { a2 = a1; a1 = a; } else if (a > a2) a2 = a;
    }
    ctx.offLine = Math.max(a2, L / 2, ctx.bx);
    // лучший перехватчик (кто первым успеет к мячу)
    let best = null, bt = 1e9, best2 = null, bt2 = 1e9;
    for (const p of t.players) {
      if (p.off || p.isGK) continue;
      if (p.icT < bt) { best2 = best; bt2 = bt; best = p; bt = p.icT; } else if (p.icT < bt2) { best2 = p; bt2 = p.icT; }
    }
    ctx.chaser = best; ctx.chaser2 = best2; ctx.chaseT = bt;
    // ближайший к владельцу мяча (для прессинга)
    const carrier = b.owner && b.owner.team !== t ? b.owner : null;
    ctx.carrier = carrier;
    ctx.press1 = null; ctx.press2 = null;
    if (carrier) {
      let d1 = 1e9, d2 = 1e9;
      for (const p of t.players) {
        if (p.off || p.isGK) continue;
        const d = Math.hypot(p.x - carrier.x, p.y - carrier.y) + (p.role === 'FWD' && ax(t, carrier.x) < 40 ? 8 : 0);
        if (d < d1) { ctx.press2 = ctx.press1; d2 = d1; ctx.press1 = p; d1 = d; } else if (d < d2) { ctx.press2 = p; d2 = d; }
      }
      ctx.pressD2 = d2;
    }
  }

  // ------------------------------------------------------------
  // Позиция по схеме с учётом мяча, фазы и тактики
  // ------------------------------------------------------------
  function shapeTarget(m, t, p, out) {
    const ctx = t.ctx, f = t.slots[p.slot], tac = t.tac;
    const inPoss = ctx.inPoss;
    const bx = ctx.bx, by = ctx.by;
    const lineAdj = tac.line;
    let center = inPoss ? U.clamp(bx * 0.6 + 24 + lineAdj * 0.5, 34, 76) : U.clamp(bx * 0.68 + 9 + lineAdj, 22, 66);
    const depth = inPoss ? 50 : 34;
    const n = (f.fx - 0.38) / 0.22;
    let a = center + n * depth / 2;
    const width = (inPoss ? 60 : 42) * tac.width;
    let b = MY + (f.fy - 0.5) * width + (by - MY) * (inPoss ? 0.18 : 0.38);
    if (f.role === 'DEF') {
      if (!inPoss) {
        // единая линия обороны
        const line = U.clamp(bx * 0.55 + 3 + lineAdj, 7, 42);
        a = Math.min(line + (f.tag === 'FB' ? 1.5 : 0), bx - 2.5);
        a = Math.max(a, 4);
      } else {
        a = U.clamp(a, 6, 64);
        if (f.tag === 'FB') { a += 6; b = MY + (f.fy - 0.5) * W * 0.92; }
      }
    } else if (f.role === 'FWD') {
      if (!inPoss) a = Math.max(a, 38 + lineAdj * 0.5);
    } else if (f.tag === 'W' && inPoss) {
      b = MY + (f.fy - 0.5) * W * 0.88;
    }
    if (inPoss && f.role !== 'DEF') a = Math.min(a, ctx.offLine - 0.8); // не стоим в офсайде
    a = U.clamp(a, 3, L - 3);
    b = U.clamp(b, 2.5, W - 2.5);
    out.x = wx(t, a); out.y = wy(t, b);
  }
  const tmp = { x: 0, y: 0 };

  // Опека: встаём между соперником и своими воротами
  function markTarget(t, p, o, out) {
    const gx = t.dir > 0 ? 0 : L;
    const dx = gx - o.x, dy = MY - o.y, d = Math.hypot(dx, dy) || 1;
    out.x = o.x + dx / d * 1.8; out.y = o.y + dy / d * 1.8;
  }

  // ------------------------------------------------------------
  // Игрок без мяча
  // ------------------------------------------------------------
  function offBall(m, t, p, dt) {
    const ctx = t.ctx, b = m.ball, diff = t.human ? m.diffHumanMates : m.diff;
    let sprint = false, tgtX, tgtY, urgent = false;
    // реакция: цель пересчитывается не каждый тик
    p.aiT -= dt;
    const loose = !b.owner;
    // На свободный мяч идёт лучший перехватчик. Если это игрок человека, а человек ведёт его в сторону, —
    // за мячом бежит второй по скорости партнёр. Адресат паса всегда идёт навстречу мячу.
    const ctrl = t.human ? t.controlled : null;
    const intendedMe = loose && b.intended === p && b.kickT < 3.5 && p.icT < 3.5;
    const chasing = (loose && (ctx.chaser === p || (ctrl && ctx.chaser === ctrl && t.humanSteering && ctx.chaser2 === p))) || intendedMe ||
      (!loose && !ctx.inPoss && ctx.press1 === p && !(ctrl && t.humanSteering && Math.hypot(ctrl.x - b.x, ctrl.y - b.y) < 9));
    const pressCall = t.human && t.pressCall && !ctx.inPoss && p === t.pressHelper;
    if (chasing || pressCall) {
      // перехват / прессинг владельца
      if (loose) { const i = Math.min(p.icI + 2, C.PRED_STEPS - 1); tgtX = PX[i]; tgtY = PY[i]; }
      else {
        const c = b.owner;
        const lead = Math.min(0.5, Math.hypot(c.x - p.x, c.y - p.y) / 12);
        tgtX = c.x + c.vx * lead; tgtY = c.y + c.vy * lead;
        // у человека-соперника не прилипаем вплотную, а держим дистанцию для отбора
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
        if (d < 2.6 && p.tackleCD > 0) { tgtX = c.x + dx / d * 1.2; tgtY = c.y + dy / d * 1.2; }
      }
      sprint = true; urgent = true;
      p.faceX = b.x; p.faceY = b.y;
      AI.defendActions(m, t, p, dt, pressCall ? 1 : t.human ? 0.75 : 1);
    } else if (!ctx.inPoss && !loose && ctx.press2 === p && ctx.pressD2 < 16 * t.tac.press * diff.press) {
      // второй игрок страхует: между мячом и воротами
      const c = b.owner, gx = t.dir > 0 ? 0 : L;
      const dx = gx - c.x, dy = MY - c.y, d = Math.hypot(dx, dy) || 1;
      tgtX = c.x + dx / d * 4.5; tgtY = c.y + dy / d * 4.5;
      sprint = Math.hypot(tgtX - p.x, tgtY - p.y) > 6;
      p.faceX = b.x; p.faceY = b.y;
      AI.defendActions(m, t, p, dt, 0.35);
    } else {
      if (p.aiT <= 0 || p.tgtStale) {
        p.aiT = diff.react * (0.7 + Math.random() * 0.6);
        p.tgtStale = false;
        shapeTarget(m, t, p, tmp);
        let x = tmp.x, y = tmp.y;
        if (!ctx.inPoss && p.slot > 0) {
          // опека ближайшего соперника рядом с зоной
          const o = p.markOn;
          if (o && !o.off) {
            const oa = ax(t, o.x);
            if (oa < ctx.bx + 25 && Math.hypot(o.x - x, o.y - y) < 14) {
              markTarget(t, p, o, tmp);
              const k = p.def.role === 'DEF' || t.slots[p.slot].role === 'DEF' ? 0.65 : 0.45;
              x = U.lerp(x, tmp.x, k); y = U.lerp(y, tmp.y, k);
            }
          }
        } else if (ctx.inPoss && b.owner && b.owner.team === t) {
          // поддержка владельца и забегания
          const c = b.owner;
          if (p.runT > 0) { x = p.runX; y = p.runY; }
          else if (p.support === 1 || p.support === 2) {
            const ca = ax(t, c.x), cb = ay(t, c.y);
            const side = cb < MY ? 1 : -1;
            const sa = p.support === 1 ? ca + 9 : ca - 5, sb = p.support === 1 ? cb + side * 9 : cb + side * -11;
            x = U.lerp(x, wx(t, U.clamp(sa, 4, ctx.offLine - 1)), 0.65); y = U.lerp(y, wy(t, U.clamp(sb, 3, W - 3)), 0.65);
          }
        }
        p.tx = x; p.ty = y;
      }
      tgtX = p.tx; tgtY = p.ty;
      if (p.runT > 0) { p.runT -= dt; sprint = true; tgtX = p.runX; tgtY = p.runY; }
      p.faceX = b.x; p.faceY = b.y;
      // поздний перехват мимо летящего мяча
      if (loose && p.icT < 0.6 && ctx.chaseT > 0.8) { const i = p.icI; tgtX = PX[i]; tgtY = PY[i]; sprint = true; }
    }
    moveTo(p, tgtX, tgtY, sprint, urgent);
  }

  AI.offBall = offBall;

  function moveTo(p, x, y, sprint, urgent) {
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    if (d < (urgent ? 0.15 : 0.7)) { p.ix = 0; p.iy = 0; p.sprint = false; return; }
    // без спешки — трусцой, с ускорением по мере отставания от позиции
    const mag = urgent ? 1 : U.clamp(d / 8, 0.18, 0.85);
    p.ix = dx / d * mag; p.iy = dy / d * mag;
    p.sprint = sprint || d > 18;
  }
  AI.moveTo = moveTo;

  // Отбор/подкат для ИИ-защитника
  AI.defendActions = (m, t, p, dt, k) => {
    const c = m.ball.owner;
    if (!c || c.team === t || p.state !== 'move' || p.tackleCD > 0) return;
    if (c.isGK && m.ball.held) return;
    const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
    const diff = t.human ? m.diffHumanMates : m.diff;
    const facing = Math.cos(U.angDiff(p.facing, Math.atan2(dy, dx)));
    if (d < C.TACKLE_RANGE * 0.95 && facing > 0.3) {
      const rate = 2.6 * diff.tackle * (0.6 + p.s.def / 160) * k;
      if (Math.random() < rate * dt) p.tackle();
    } else if (d < 3.4 && d > 1.4 && facing > 0.7 && !t.human) {
      // подкат: когда соперник убегает к нашим воротам
      const toGoal = (t.dir > 0 ? -c.vx : c.vx) > 3;
      const rate = (toGoal ? 0.55 : 0.12) * diff.tackle * (p.s.def / 80) * k;
      if (Math.random() < rate * dt) p.slide();
    }
  };

  // ------------------------------------------------------------
  // Владелец мяча
  // ------------------------------------------------------------
  // Оценка паса: возвращает очки и заполняет out (точка, тип)
  const laneOut = { risk: 0, open: 0 };
  function laneRisk(m, t, sx, sy, tx, ty) {
    const opp = m.teams[1 - t.idx];
    const d = Math.hypot(tx - sx, ty - sy);
    let risk = 0, open = 12;
    for (const o of opp.players) {
      if (o.off) continue;
      const s = U.segDist(o.x, o.y, sx, sy, tx, ty);
      const width = 1.3 + s.t * d * 0.07 + (o.isGK ? 0.6 : 0);
      if (s.d < width) risk += (1 - s.d / width) * (0.6 + s.t * 0.6);
      const dt = Math.hypot(o.x - tx, o.y - ty);
      if (dt < open) open = dt;
    }
    laneOut.risk = risk; laneOut.open = open;
    return laneOut;
  }

  AI.laneRisk = laneRisk;

  AI.evalPasses = (m, p, out, allowBack) => {
    const t = p.team, b = m.ball;
    let best = -9;
    const myVal = posValue(t, p.x, p.y);
    const ctx = t.ctx;
    for (const q of t.players) {
      if (q === p || q.off || q.state === 'down') continue;
      for (let kind = 0; kind < 2; kind++) {
        let tx = q.x + q.vx * 0.35, ty = q.y + q.vy * 0.35, type = 'pass';
        if (kind === 1) {
          // пас на ход: в зону за линию обороны
          const qa = ax(t, q.x);
          if (q.isGK || qa < ctx.bx - 5 || q.role === 'DEF' && qa < 60) continue;
          const lead = 7 + (q.runT > 0 ? 3 : 0);
          tx = wx(t, U.clamp(qa + lead, 0, L - 4)); ty = q.y + q.vy * 0.6;
          ty = U.clamp(ty, 3, W - 3);
          type = 'through';
          if (q.offside || ax(t, q.x) > ctx.offLine + 0.3) continue;
        }
        const d = Math.hypot(tx - b.x, ty - b.y);
        if (d < 5 || d > 46) continue;
        if (q.isGK && !allowBack) continue;
        if (ax(t, q.x) > ctx.offLine + 0.2 && ax(t, q.x) > L / 2) continue; // адресат в офсайде
        const lr = laneRisk(m, t, b.x, b.y, tx, ty);
        // кто раньше успеет к точке паса: адресат или соперник
        const rcvD = Math.hypot(q.x - tx, q.y - ty);
        const margin = lr.open - rcvD;
        if (type === 'through' && margin < 2.5) continue;
        let lob = false, risk = lr.risk;
        if (risk > 0.6 && d > 14 && type === 'pass') { lob = true; risk *= 0.4; } // перекинуть верхом
        let s = (posValue(t, tx, ty) - myVal) * 2.0 + U.clamp(margin, -4, 8) / 8 * 0.5 - risk * 1.1 - d / 120;
        if (type === 'through') s -= 0.06;
        if (lob) s -= 0.12;
        if (q.isGK) s -= 0.35;
        if (q.offside) s -= 1;
        if (s > best) { best = s; out.q = q; out.x = tx; out.y = ty; out.type = type; out.lob = lob; }
      }
    }
    out.score = best;
    return best;
  };
  const passOut = { q: null, x: 0, y: 0, type: 'pass', lob: false, score: 0 };

  // Точка удара по воротам с учётом положения вратаря
  AI.shotAim = (m, p) => {
    const t = p.team, opp = m.teams[1 - t.idx];
    const gk = opp.players.find((q) => q.isGK && !q.off);
    const y1 = Ball.Y1 + 0.55, y2 = Ball.Y2 - 0.55;
    let aimY;
    if (gk) aimY = Math.abs(gk.y - y1) > Math.abs(gk.y - y2) ? y1 : y2;
    else aimY = MY;
    aimY += U.gauss() * 0.4;
    return aimY;
  };

  function carrier(m, t, p, dt) {
    const diff = m.diff;
    p.holdT += dt;
    p.aiT -= dt;
    const opp = m.teams[1 - t.idx];
    // давление
    let pd = 99, near = null;
    for (const o of opp.players) { if (o.off) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < pd) { pd = d; near = o; } }
    const gx = t.dir > 0 ? L : 0;
    const pa = ax(t, p.x), pb = ay(t, p.y);
    const urgent = pd < 1.8 && p.holdT > 0.25;
    if (p.aiT <= 0 || urgent) {
      p.aiT = diff.decide * (0.75 + Math.random() * 0.5);
      if (p.holdT > 0.18) {
        const noise = () => U.gauss() * 0.1 * diff.err;
        // --- удар ---
        const dGoal = Math.hypot(gx - p.x, MY - p.y);
        let shotQ = -1;
        if (dGoal < 30) {
          const a1 = Math.atan2(Ball.Y1 - p.y, gx - p.x), a2 = Math.atan2(Ball.Y2 - p.y, gx - p.x);
          const ang = Math.abs(U.angDiff(a1, a2));
          let blockers = 0;
          for (const o of opp.players) {
            if (o.off || o.isGK) continue;
            const s = U.segDist(o.x, o.y, p.x, p.y, gx, MY);
            if (s.d < 1.4 && s.t > 0.05) blockers++;
          }
          shotQ = (1 - dGoal / 34) * U.clamp(ang / 0.42, 0.25, 1.3) * (1 - blockers * 0.2) * (0.7 + p.s.sho / 330) * 1.6 + noise();
          if (pa > L - 8 && Math.abs(pb - MY) > 12) shotQ -= 0.4; // слишком острый угол
        }
        // --- пас ---
        const passQ = AI.evalPasses(m, p, passOut, pa < 30) + noise();
        // --- навес ---
        let crossQ = -9, crossTarget = null;
        if (pa > C.CROSS_ZONE_X && Math.abs(pb - MY) > 13) {
          for (const q of t.players) {
            if (q === p || q.off || q.isGK) continue;
            const qa = ax(t, q.x), qb = ay(t, q.y);
            if (qa > L - C.BOX_DEPTH && Math.abs(qb - MY) < 12) {
              const s = 0.45 + (q.s.phy - 60) / 200 + Math.random() * 0.2;
              if (s > crossQ) { crossQ = s; crossTarget = q; }
            }
          }
        }
        // --- дриблинг ---
        let space = 14;
        for (const o of opp.players) {
          if (o.off) continue;
          const dx = ax(t, o.x) - pa, dy = ay(t, o.y) - pb;
          if (dx > -1 && dx < 14 && Math.abs(dy) < dx * 0.9 + 2) space = Math.min(space, Math.hypot(dx, dy));
        }
        let dribQ = 0.08 + space / 14 * 0.5 - (pd < 1.6 ? 0.35 : 0) + (p.s.dri - 65) / 220 + noise();
        if (p.isGK) dribQ = -9;
        // защитник под давлением у своих ворот — вынос
        const danger = pa < 22 && pd < 3 && passQ < 0.05;
        const best = Math.max(shotQ, passQ, crossQ, dribQ);
        if (danger && !p.isGK) {
          p.clear(t.dir, p.y < MY ? -0.6 : 0.6, 24, 6, 'clear');
          return;
        }
        if (shotQ > 0.4 && shotQ >= best - 0.12) {
          const power = U.clamp(0.42 + dGoal / 50 + Math.random() * 0.18, 0.45, 0.9);
          const aimZ = dGoal < 12 ? U.rand(0.2, 1.2) : U.rand(0.3, 2.0);
          p.shoot(power, AI.shotAim(m, p), aimZ, U.gauss() * 0.35);
          return;
        }
        if (crossQ > 0.3 && crossQ >= best - 0.1 && crossTarget) {
          p.lobTo(crossTarget.x + U.rand(-1.5, 1.5), crossTarget.y + U.rand(-1.5, 1.5), 1.5, 'cross', crossTarget);
          return;
        }
        if (passQ >= best && passQ > (pd < 2.2 ? -0.45 : 0.02) && passOut.q) {
          const q = passOut.q;
          if (passOut.lob) p.lobTo(passOut.x, passOut.y, 0, passOut.type === 'through' ? 'through' : 'lob', q);
          else p.passTo(passOut.x, passOut.y, passOut.type === 'through' ? 8 : C.PASS_ARRIVE, passOut.type, q);
          if (passOut.type === 'through') { q.runT = 2.2; q.runX = passOut.x; q.runY = passOut.y; }
          return;
        }
        // финт при плотной опеке
        if (pd < 1.7 && near && p.s.dri > 62 && Math.random() < 0.5 * (p.s.dri / 100)) {
          const sx = -(near.y - p.y), sy = near.x - p.x;
          p.skill(sx + t.dir * 2, sy);
          return;
        }
      }
    }
    // --- ведение: к воротам с обходом соперников и бровок ---
    let dxw = t.dir, dyw = 0;
    if (pa > 68) { dxw = gx - p.x; dyw = MY - p.y; const l = Math.hypot(dxw, dyw); dxw /= l; dyw /= l; }
    for (const o of opp.players) {
      if (o.off) continue;
      const ox = o.x - p.x, oy = o.y - p.y, d = Math.hypot(ox, oy);
      if (d < 6 && d > 0.01 && (ox * dxw + oy * dyw) > -0.5) {
        // отталкивание от соперника, сильнее поперёк направления атаки
        const w = (6 - d) / 6 * 1.4;
        dxw -= ox / d * w * 0.4; dyw -= oy / d * w * 0.8;
      }
    }
    if (p.y < 4) dyw += 0.8; if (p.y > W - 4) dyw -= 0.8;
    const l = Math.hypot(dxw, dyw) || 1;
    p.ix = dxw / l; p.iy = dyw / l;
    p.sprint = pd > 3 && p.stamina > 0.25;
    if (p.isGK) { p.ix = 0; p.iy = 0; }
  }

  // ------------------------------------------------------------
  // Вратарь
  // ------------------------------------------------------------
  function goalkeeper(m, t, p, dt) {
    const b = m.ball, diff = t.human ? m.diffHumanMates : m.diff;
    const gx = t.dir > 0 ? 0 : L, out = t.dir;
    if (p.state === 'dive' || p.state === 'down' || p.state === 'getup') return;
    if (b.owner === p) {
      // мяч в руках: подождать и распасовать
      p.holdT += dt;
      p.faceX = t.dir > 0 ? L : 0; p.faceY = MY;
      p.ix = 0; p.iy = 0;
      const wait = t.human && p.controlled ? 4.5 : C.GK_HOLD_TIME + Math.random() * 0.4;
      if (p.holdT > wait) gkDistribute(m, t, p);
      return;
    }
    p.faceX = b.x; p.faceY = b.y;
    // летит ли мяч в створ?
    if (!b.owner && b.speed() > 7 && (gx === 0 ? b.vx < -3 : b.vx > 3)) {
      let hit = -1;
      for (let i = 1; i < C.PRED_STEPS; i++) {
        const cross = gx === 0 ? PX[i] <= p.x + 0.2 : PX[i] >= p.x - 0.2;
        if (cross) { hit = i; break; }
      }
      if (hit > 0 && PY[hit] > Ball.Y1 - 1.2 && PY[hit] < Ball.Y2 + 1.2 && PZ[hit] < C.GK_REACH_Z + 0.3) {
        p.shotSeen = (p.shotSeen || 0) + dt;
        if (p.shotSeen < diff.gkReact * (1.25 - p.s.gk / 200)) { p.ix = p.iy = 0; return; }
        const tHit = hit * C.PRED_DT;
        const dy = PY[hit] - p.y;
        const runReach = 4.5 * tHit + 0.5;
        if (Math.abs(dy) > runReach || PZ[hit] > 1.8) {
          if (Math.abs(dy) > 0.6 || PZ[hit] > 1.8) { p.dive(p.x + (PX[hit] - p.x) * 0.3, PY[hit], PZ[hit]); return; }
        }
        moveTo(p, p.x, PY[hit], true, true);
        return;
      }
    }
    p.shotSeen = 0;
    // выход на перехват (навесы и мяч в штрафной)
    const inBox = m.inBox(b.x, b.y, t, 0.5);
    const opp = m.teams[1 - t.idx];
    if (!b.owner && inBox && (p.icT < opp.ctx.chaseT - 0.15 || p.icT < 0.35)) {
      const i = p.icI;
      moveTo(p, PX[i], PY[i], true, true);
      return;
    }
    // вызов вратаря (Space) у человека
    if (t.human && t.pressCall && b.owner && b.owner.team !== t && Math.hypot(b.x - gx, b.y - MY) < 24) {
      moveTo(p, b.owner.x, b.owner.y, true, true);
      AI.defendActions(m, t, p, dt, 1.5);
      return;
    }
    // выход один на один: соперник с мячом в штрафной
    if (b.owner && b.owner.team !== t && inBox) {
      const c = b.owner;
      const dGoal = Math.hypot(c.x - gx, c.y - MY);
      if (dGoal < 13) {
        const k = U.clamp(1 - dGoal / 20, 0.25, 0.7);
        moveTo(p, U.lerp(gx + out * 1, c.x, k), U.lerp(MY, c.y, k), true, true);
        if (Math.hypot(c.x - p.x, c.y - p.y) < 1.6 && Math.random() < 3 * dt) p.tackle();
        return;
      }
    }
    // позиционирование на биссектрисе
    const dBall = Math.hypot(b.x - gx, b.y - MY);
    const off = dBall > 50 ? 7 : U.clamp(dBall * 0.11, 0.6, 4.2);
    const ux = (b.x - gx) / (dBall || 1), uy = (b.y - MY) / (dBall || 1);
    let tx = gx + ux * off, ty = MY + uy * off * 1.1;
    ty = U.clamp(ty, Ball.Y1 - 0.5, Ball.Y2 + 0.5);
    if (out > 0) tx = Math.max(tx, 0.4); else tx = Math.min(tx, L - 0.4);
    moveTo(p, tx, ty, dBall < 30, false);
  }

  function gkDistribute(m, t, p) {
    const b = m.ball;
    p.holdT = 0;
    const n = AI.evalPasses(m, p, passOut, false);
    if (n > -0.15 && passOut.q && Math.hypot(passOut.x - p.x, passOut.y - p.y) < 35 && !passOut.lob) {
      p.passTo(passOut.x, passOut.y, 6, 'pass', passOut.q);
    } else {
      // длинный удар к нападающим
      let best = null, bs = -1;
      for (const q of t.players) {
        if (q.off || q.isGK) continue;
        const s = ax(t, q.x) + Math.random() * 15;
        if (s > bs) { bs = s; best = q; }
      }
      const tx = best ? best.x : (t.dir > 0 ? 65 : 40), ty = best ? best.y : MY;
      p.lobTo(tx, ty, 0, 'lob', best);
    }
    b.held = false;
  }
  AI.gkDistribute = gkDistribute;

  // ------------------------------------------------------------
  // Главный апдейт команды
  // ------------------------------------------------------------
  AI.updateTeam = (m, t, dt) => {
    t.ctxT -= dt;
    if (t.ctxT <= 0) {
      t.ctxT = 0.1;
      teamContext(m, t);
      assignRoles(m, t);
    }
    // помощник по кнопке прессинга — ближайший к мячу, кроме управляемого
    if (t.human) {
      let best = null, bd = 1e9;
      for (const p of t.players) {
        if (p.off || p.isGK || p === t.controlled) continue;
        const d = Math.hypot(p.x - m.ball.x, p.y - m.ball.y);
        if (d < bd) { bd = d; best = p; }
      }
      t.pressHelper = best;
    }
    for (const p of t.players) {
      if (p.off || (t.human && p === t.controlled)) continue;
      if (p.state !== 'move' && p.state !== 'hold') { continue; }
      if (m.so && !p.isGK && p !== m.ball.owner) { p.ix = p.iy = 0; continue; }
      if (p.isGK) { goalkeeper(m, t, p, dt); continue; }
      if (m.ball.owner === p) { carrier(m, t, p, dt); continue; }
      offBall(m, t, p, dt);
    }
  };

  // Распределение ролей: опека, поддержка, забегания
  function assignRoles(m, t) {
    const ctx = t.ctx, b = m.ball, opp = m.teams[1 - t.idx];
    for (const p of t.players) { p.support = 0; }
    if (!ctx.inPoss) {
      // жадная опека: каждый полевой берёт ближайшего свободного соперника в своей зоне
      const taken = t.taken || (t.taken = new Set());
      taken.clear();
      for (const p of t.players) {
        p.markOn = null;
        if (p.off || p.isGK) continue;
        let best = null, bd = 13;
        for (const o of opp.players) {
          if (o.off || o.isGK || taken.has(o) || o === b.owner) continue;
          const d = Math.hypot(o.x - p.tx, o.y - p.ty);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { taken.add(best); p.markOn = best; }
      }
    } else if (b.owner && b.owner.team === t) {
      const c = b.owner;
      // двое ближайших — поддержка
      let s1 = null, s2 = null, d1 = 1e9, d2 = 1e9;
      for (const p of t.players) {
        if (p === c || p.off || p.isGK || p.runT > 0) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < d1) { s2 = s1; d2 = d1; s1 = p; d1 = d; } else if (d < d2) { s2 = p; d2 = d; }
      }
      if (s1) s1.support = 1;
      if (s2) s2.support = 2;
      // забегания за спину
      const ca = ax(t, c.x);
      for (const p of t.players) {
        if (p === c || p.off || p.isGK || p.runT > 0 || p.support) continue;
        const f = t.slots[p.slot];
        if (f.role === 'DEF' && f.tag !== 'FB') continue;
        const pa = ax(t, p.x);
        const chance = (f.role === 'FWD' ? 0.22 : f.tag === 'W' ? 0.14 : f.tag === 'FB' ? 0.05 : 0.06);
        if (ca > 30 && pa < ctx.offLine - 0.5 && pa > ca - 10 && Math.random() < chance) {
          p.runT = 1.6 + Math.random();
          const lane = ay(t, p.y);
          p.runX = wx(t, U.clamp(ctx.offLine + 9, 0, L - 7));
          p.runY = wy(t, U.clamp(U.lerp(lane, MY, 0.25), 4, W - 4));
        }
      }
    }
  }

  // Позиция по схеме (для расстановки на стандартах)
  AI.shape = (m, t, p, out) => {
    if (t.ctx.offLine == null) t.ctx.offLine = L / 2;
    shapeTarget(m, t, p, out);
  };

  PF.AI = AI;
})(window.PF);
