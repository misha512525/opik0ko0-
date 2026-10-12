'use strict';
// Отрисовка игрового мира: трибуны, поле, ворота, тени, игроки и мяч с сортировкой по глубине.
(function (PF) {
  const C = PF.C, U = PF.U, S = PF.Sprites, Proj = PF.Proj;
  // Пул элементов сортировки — без аллокаций в кадре
  const items = [];
  for (let i = 0; i < 40; i++) items.push({ y: 0, k: 0, o: null });
  const K_PLAYER = 0, K_BALL = 1, K_GOAL = 2;

  function prepare(m, alpha, replay) {
    const b = m.ball;
    if (!replay) {
      for (const p of m.all) {
        p.rx = p.px + (p.x - p.px) * alpha; p.ry = p.py + (p.y - p.py) * alpha; p.rz = p.pz + (p.z - p.pz) * alpha;
        p.rpose = p.pose; p.rdir = p.dir; p.rvis = !p.off;
      }
      const r = m.ref;
      r.rx = r.px + (r.x - r.px) * alpha; r.ry = r.py + (r.y - r.py) * alpha; r.rz = 0; r.rpose = r.pose; r.rdir = r.dir; r.rvis = true;
      b.rx = b.px + (b.x - b.px) * alpha; b.ry = b.py + (b.y - b.py) * alpha; b.rz = b.pz + (b.z - b.pz) * alpha; b.rframe = b.frame;
    }
  }

  function drawStadiumScreen(ctx, m, cam) {
    // большое табло на трибуне
    const wx = Proj.sx(C.PITCH_L / 2, -4) - 34, wy = PF.Pitch.standsTop() + 16;
    const x = Math.round(wx - cam.left), y = Math.round(wy - cam.top);
    if (x > cam.vw || x + 68 < 0 || y > cam.vh || y + 24 < 0) return;
    ctx.fillStyle = '#0a0c14'; ctx.fillRect(x, y, 68, 24);
    ctx.fillStyle = '#3a4466'; ctx.fillRect(x - 1, y - 1, 70, 1); ctx.fillRect(x - 1, y + 24, 70, 1);
    ctx.fillStyle = '#5a6488'; ctx.fillRect(x + 30, y + 25, 8, 10);
    const t0 = m.teams[0], t1 = m.teams[1];
    if (m.state === 'goal' && ((m.t * 4) | 0) & 1) {
      PF.Font.draw(ctx, 'ГОЛ!', x + 34, y + 9, '#ffd23c', 1, 1);
    } else {
      PF.Font.draw(ctx, t0.short, x + 3, y + 3, '#e8ecf8');
      PF.Font.draw(ctx, t1.short, x + 65, y + 3, '#e8ecf8', 1, 2);
      PF.Font.draw(ctx, t0.score + ' - ' + t1.score, x + 34, y + 13, '#ffd23c', 1, 1);
    }
  }

  const W = {};
  W.draw = (ctx, m, cam, alpha, replay, rt) => {
    prepare(m, alpha, replay);
    const zoom = cam.zoom;
    ctx.save();
    if (zoom !== 1) ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    PF.Pitch.drawGround(ctx, cam);
    const exc = m.excite > 0.6 || m.state === 'goal';
    PF.Pitch.drawStands(ctx, cam, Math.floor(rt * (exc ? 8 : 3)), exc);
    drawStadiumScreen(ctx, m, cam);
    // задние части ворот
    PF.Pitch.drawGoal(ctx, cam, 0, false, m.netBulge[0] > 0);
    PF.Pitch.drawGoal(ctx, cam, 1, false, m.netBulge[1] > 0);
    const ox = cam.left, oy = cam.top;
    // тени
    const ents = m.replayEnts;
    for (let i = 0; i < ents.length; i++) {
      const p = ents[i];
      if (!p.rvis) continue;
      const sx = Proj.sx(p.rx, p.ry) - ox, sy = Proj.sy(p.ry, 0) - oy;
      if (sx < -20 || sx > cam.vw + 20 || sy < -30 || sy > cam.vh + 30) continue;
      S.drawShadow(ctx, sx, sy, false);
    }
    const b = m.ball;
    const bsx = Proj.sx(b.rx, b.ry) - ox, bsy = Proj.sy(b.ry, 0) - oy;
    S.drawShadow(ctx, bsx + b.rz * 0.6, bsy, true, Math.max(0.5, 1 - b.rz * 0.08));
    // сортировка по глубине
    let n = 0;
    for (let i = 0; i < ents.length; i++) {
      const p = ents[i];
      if (!p.rvis) continue;
      const it = items[n++]; it.y = p.ry; it.k = K_PLAYER; it.o = p;
    }
    let it = items[n++]; it.y = b.ry + (b.held ? 0.05 : 0); it.k = K_BALL; it.o = b;
    it = items[n++]; it.y = PF.Ball.Y2 + 0.01; it.k = K_GOAL; it.o = 0;
    it = items[n++]; it.y = PF.Ball.Y2 + 0.01; it.k = K_GOAL; it.o = 1;
    U.insertionSort(items, n, 'y');
    for (let i = 0; i < n; i++) {
      const e = items[i];
      if (e.k === K_PLAYER) {
        const p = e.o;
        const sx = Math.round(Proj.sx(p.rx, p.ry) - ox), sy = Math.round(Proj.sy(p.ry, p.rz) - oy);
        if (sx < -16 || sx > cam.vw + 16 || sy < -4 || sy > cam.vh + 30) continue;
        S.drawPlayer(ctx, p.sheet, p.rpose, p.rdir, sx, sy, p.num);
      } else if (e.k === K_BALL) {
        const sx = Proj.sx(b.rx, b.ry) - ox, sy = Proj.sy(b.ry, b.rz) - oy;
        S.drawBall(ctx, sx, sy, b.rframe, b.rz > 2.5);
      } else {
        PF.Pitch.drawGoal(ctx, cam, e.o, true, false);
      }
    }
    PF.FX.draw(ctx, cam);
    if (m.o.night) {
      // вечерний матч: синеватая тень и пятна прожекторов на газоне
      ctx.fillStyle = 'rgba(6,10,40,0.32)'; ctx.fillRect(0, 0, cam.vw + 1, cam.vh + 1);
      ctx.fillStyle = 'rgba(255,250,210,0.05)';
      for (let i = 0; i < 4; i++) {
        const lx = Proj.sx(10 + i * 28, 34) - ox;
        if (lx < -90 || lx > cam.vw + 90) continue;
        ctx.fillRect(Math.round(lx - 70), 0, 140, cam.vh);
        ctx.fillRect(Math.round(lx - 40), 0, 80, cam.vh);
      }
    }
    if (!replay) W.overlays(ctx, m, cam, rt);
    ctx.restore();
  };

  // Маркер управляемого игрока, шкала силы удара, прицел стандарта, карточка судьи
  W.overlays = (ctx, m, cam, rt) => {
    const ox = cam.left, oy = cam.top;
    const h = m.human;
    if (h && h.controlled && !h.controlled.off && m.state !== 'goal') {
      const p = h.controlled;
      const sx = Math.round(Proj.sx(p.rx, p.ry) - ox), sy = Math.round(Proj.sy(p.ry, p.rz) - oy);
      const bob = ((rt * 6) | 0) & 1;
      const col = C.COL.accent2;
      if (sx > -4 && sx < cam.vw + 4 && sy > 0 && sy < cam.vh + 24) {
        ctx.fillStyle = '#140f1c'; ctx.fillRect(sx - 3, sy - 27 + bob, 7, 1); ctx.fillRect(sx - 2, sy - 26 + bob, 5, 1); ctx.fillRect(sx - 1, sy - 25 + bob, 3, 1);
        ctx.fillStyle = col; ctx.fillRect(sx - 2, sy - 27 + bob, 5, 1); ctx.fillRect(sx - 1, sy - 26 + bob, 3, 1);
        // шкала силы удара
        if (p.charging || (p.buffer === 'shoot' && p.charge > 0)) {
          const w = 16, f = Math.min(1, p.charge);
          ctx.fillStyle = '#140f1c'; ctx.fillRect(sx - w / 2 - 1, sy - 33, w + 2, 4);
          ctx.fillStyle = f > 0.9 ? C.COL.red : f > 0.6 ? C.COL.accent2 : C.COL.accent;
          ctx.fillRect(sx - w / 2, sy - 32, Math.round(w * f), 2);
        }
      } else {
        // стрелка у края экрана
        const cx = U.clamp(sx, 6, cam.vw - 6), cy = U.clamp(sy - 12, 14, cam.vh - 20);
        ctx.fillStyle = col; ctx.fillRect(cx - 2, cy - 2, 5, 5);
        ctx.fillStyle = '#140f1c'; ctx.fillRect(cx - 1, cy - 1, 3, 3);
      }
    }
    // прицел стандарта
    const sp = m.sp;
    if ((m.state === 'setpiece' || m.state === 'kickoff') && sp && sp.taker && sp.taker.team.human && sp.aimX != null) {
      const t = sp.taker.team;
      const shoot = sp.type === 'penalty' || (sp.type === 'free' && m.isShootingFK(t, sp));
      if (shoot) {
        const gx = t.dir > 0 ? C.PITCH_L : 0;
        const z = 0.3 + Math.min(1, sp.taker.charge) * 1.6;
        const sx = Math.round(Proj.sx(gx, sp.aimY) - ox), sy = Math.round(Proj.sy(sp.aimY, z) - oy);
        ctx.fillStyle = (rt * 4 | 0) & 1 ? '#ff4f5e' : '#fff';
        ctx.fillRect(sx - 3, sy, 7, 1); ctx.fillRect(sx, sy - 3, 1, 7);
      } else {
        const ang = Math.atan2(sp.aimY - sp.y, sp.aimX - sp.x);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 1; i <= 5; i++) {
          const d = i * 1.6 + ((rt * 3) % 1) * 1.6;
          const x = sp.x + Math.cos(ang) * d, y = sp.y + Math.sin(ang) * d;
          ctx.fillRect(Math.round(Proj.sx(x, y) - ox), Math.round(Proj.sy(y, 0) - oy), 1, 1);
        }
      }
    }
    // вратарь-человек на пенальти: подсказка стороны
    if (sp && sp.type === 'penalty' && m.state === 'setpiece' && h && h.idx !== sp.team && sp.gkGuess) {
      const gk = h.players.find((q) => q.isGK && !q.off);
      if (gk) {
        const sx = Math.round(Proj.sx(gk.rx, gk.ry) - ox), sy = Math.round(Proj.sy(gk.ry, 0) - oy);
        PF.Font.draw(ctx, sp.gkGuess < 0 ? '▲' : '▼', sx, sy + (sp.gkGuess < 0 ? -34 : 2), C.COL.accent2, 1, 1);
      }
    }
    // карточка у судьи
    const r = m.ref;
    if (r.cardT > 0) {
      const sx = Math.round(Proj.sx(r.rx, r.ry) - ox), sy = Math.round(Proj.sy(r.ry, 0) - oy);
      ctx.fillStyle = '#140f1c'; ctx.fillRect(sx - 2, sy - 30, 5, 7);
      ctx.fillStyle = r.cardCol; ctx.fillRect(sx - 1, sy - 29, 3, 5);
    }
  };

  PF.World = W;
})(window.PF);
