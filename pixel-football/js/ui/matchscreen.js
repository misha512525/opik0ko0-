'use strict';
// Экран матча: камера, замедление, пауза (замены, тактика, управление, звук),
// перерыв/конец матча и итоговая статистика.
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL, I = PF.Input, UI = PF.UI, App = PF.App;

  // ---------- Таблица статистики (используется в перерыве и после матча) ----------
  function statRows(m) {
    const a = m.teams[0].stats, b = m.teams[1].stats;
    const tp = a.poss + b.poss || 1;
    const pct = (x, y) => (y ? Math.round(x / y * 100) : 0);
    return [
      ['ВЛАДЕНИЕ %', Math.round(a.poss / tp * 100), Math.round(b.poss / tp * 100)],
      ['УДАРЫ', a.shots, b.shots], ['В СТВОР', a.onT, b.onT], ['УГЛОВЫЕ', a.corners, b.corners],
      ['ФОЛЫ', a.fouls, b.fouls], ['ЖЕЛТЫЕ', a.yellow, b.yellow], ['КРАСНЫЕ', a.red, b.red],
      ['ОФСАЙДЫ', a.offsides, b.offsides], ['ТОЧНОСТЬ ПАСОВ %', pct(a.passOk, a.passes), pct(b.passOk, b.passes)],
      ['ОТБОРЫ', a.tackles, b.tackles], ['СЕЙВЫ', a.saves, b.saves],
    ];
  }
  function drawStats(ctx, m, x, y, w) {
    const rows = statRows(m);
    rows.forEach((r, i) => {
      const yy = y + i * 11;
      F.draw(ctx, String(r[1]), x + 4, yy, COL.text);
      F.draw(ctx, String(r[2]), x + w - 4, yy, COL.text, 1, 2);
      F.draw(ctx, r[0], x + w / 2, yy, COL.dim, 1, 1);
      const tot = (r[1] + r[2]) || 1, bw = w - 8;
      const l = Math.round(bw * r[1] / tot);
      ctx.fillStyle = m.radarCol[0]; ctx.fillRect(x + 4, yy + 8, l, 1);
      ctx.fillStyle = m.radarCol[1]; ctx.fillRect(x + 4 + l, yy + 8, bw - l, 1);
    });
  }
  function scoreLine(ctx, m, y) {
    const t0 = m.teams[0], t1 = m.teams[1];
    ctx.drawImage(PF.Sprites.crest(t0.def, 1), 112, y - 4);
    ctx.drawImage(PF.Sprites.crest(t1.def, 1), 258, y - 4);
    F.draw(ctx, t0.short, 150, y, COL.text, 1, 2);
    F.draw(ctx, t0.score + ' : ' + t1.score, 192, y - 2, COL.accent2, 2, 1);
    F.draw(ctx, t1.short, 234, y, COL.text);
    if (m.so) F.draw(ctx, 'ПЕН. ' + t0.pens + ':' + t1.pens, 192, y + 14, COL.dim, 1, 1);
  }
  function scorers(ctx, m, y) {
    for (let side = 0; side < 2; side++) {
      const all = m.goals.filter((g) => g.team === side);
      const list = all.slice(0, all.length > 3 ? 2 : 3);
      list.forEach((g, i) => {
        const s = g.name + ' ' + g.min + "'" + (g.own ? ' (АГ)' : g.pen ? ' (П)' : '');
        F.draw(ctx, s, side ? 200 : 184, y + i * 9, COL.dim, 1, side ? 0 : 2);
      });
      if (all.length > 3) F.draw(ctx, '+ ЕЩЕ ' + (all.length - 2), side ? 200 : 184, y + 18, COL.dim, 1, side ? 0 : 2);
    }
  }

  // ---------- Экран матча ----------
  PF.MatchScreen = (opts, onEnd) => {
    const S = {
      m: null, cam: null, rt: 0, pause: null, overlayT: 0, fps: false,
      enter() {
        this.m = new PF.Match(opts);
        this.cam = new PF.Camera();
        this.cam.snap(this.m.cam.x, this.m.cam.y);
        PF.Audio.stopMusic();
        PF.Audio.crowdStart();
        this.fps = PF.Save.data.settings.fps;
        this.prevGoalState = false;
      },
      exit() { PF.Audio.crowdStop(); PF.Loop.timeScale = 1; },
      update(dt) {
        const m = this.m;
        if (this.pause) { this.pause.update(dt); return; }
        if (I.pressed('pause') && m.state !== 'halftime' && m.state !== 'fulltime') { this.openPause(); return; }
        // повтор: пропуск
        if (m.state === 'replay' && (I.pressed('ok') || I.pressed('pass'))) m.skipReplay = true;
        if (m.state === 'goal' && this.m.stateT > 1.2 && (I.pressed('ok'))) m.stateT = C.GOAL_CELEB_TIME;
        if (m.state === 'halftime') {
          this.overlayT += dt;
          if (this.overlayT > 0.8 && I.pressed('ok')) { this.overlayT = 0; m.startSecondHalf(); this.cam.snap(m.cam.x, m.cam.y); }
        } else if (m.state === 'fulltime') {
          this.overlayT += dt;
          if (this.overlayT > 1.0 && I.pressed('ok')) {
            this.overlayT = 0;
            if (m.needsShootout() && !m.so) { m.startShootout(); this.cam.snap(m.cam.x, m.cam.y); }
            else { this.finish(); return; }
          }
        } else this.overlayT = 0;
        // замедление при голе
        // m.slowmo — в реальных секундах: при timeScale тиков меньше, поэтому делим
        if (m.slowmo > 0) { PF.Loop.timeScale = C.GOAL_SLOWMO; m.slowmo -= dt / C.GOAL_SLOWMO; if (m.slowmo <= 0) PF.Loop.timeScale = 1; }
        else PF.Loop.timeScale = 1;
        m.update(dt);
        if (m.state === 'goal' && !this.prevGoalState) this.cam.addShake(C.SHAKE_GOAL);
        this.prevGoalState = m.state === 'goal';
        if (m.cam.snap) { this.cam.snap(m.cam.x, m.cam.y); m.cam.snap = false; }
        else this.cam.follow(m.cam.x, m.cam.y, m.cam.z, dt, m.cam.rate);
        this.cam.zoomTarget = m.cam.zoom;
        this.cam.update(dt);
      },
      finish() {
        const m = this.m;
        m.finished = true;
        PF.Loop.timeScale = 1;
        const res = m.result();
        if (onEnd) onEnd(res, m);
      },
      openPause() {
        PF.Audio.play('select');
        this.pause = pauseMenu(this);
      },
      render(ctx, alpha, ft) {
        const m = this.m;
        if (!this.pause) this.rt += ft || 0;
        this.cam.compute();
        PF.World.draw(ctx, m, this.cam, this.pause ? 1 : alpha, m.state === 'replay', this.rt);
        if (m.state === 'replay') {
          // киношные полосы и шумовая рамка повтора
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.W, 6); ctx.fillRect(0, C.H - 15, C.W, 6);
          if (m.replay.slowmo()) F.draw(ctx, 'ЗАМЕДЛЕННО', C.W - 6, 9, '#ffffff', 1, 2, '#000');
        }
        PF.HUD.draw(ctx, m, { fps: this.fps });
        if (m.state === 'halftime' || (m.state === 'fulltime' && !this.pauseAfter)) this.drawBreak(ctx);
        if (this.pause) this.pause.render(ctx);
      },
      drawBreak(ctx) {
        const m = this.m;
        if (this.overlayT < 0.25) return;
        ctx.fillStyle = 'rgba(5,7,13,0.65)'; ctx.fillRect(0, 0, C.W, C.H);
        const full = m.state === 'fulltime';
        UI.panel(ctx, 72, 18, 240, 182, full ? (m.so && m.so.done ? 'ИТОГ: СЕРИЯ ПЕНАЛЬТИ' : 'КОНЕЦ МАТЧА') : 'ПЕРЕРЫВ', full ? COL.red : COL.line);
        scoreLine(ctx, m, 36);
        drawStats(ctx, m, 80, m.so ? 66 : 60, 224);
        const msg = full ? (m.needsShootout() && !m.so ? 'J - К СЕРИИ ПЕНАЛЬТИ' : 'J - ПРОДОЛЖИТЬ') : 'J - ВТОРОЙ ТАЙМ';
        if (((this.overlayT * 2) | 0) & 1 || this.overlayT < 1) F.draw(ctx, msg, 192, 189, COL.accent2, 1, 1);
      },
    };
    return S;
  };

  // ---------- Меню паузы ----------
  function pauseMenu(scr) {
    const m = scr.m, h = m.human;
    const P = { page: 'main', menu: null, subOut: null };
    const st = PF.Save.data.settings;
    const back = () => { P.page = 'main'; P.menu = mainMenu(); };
    function mainMenu() {
      const items = [
        { label: 'ПРОДОЛЖИТЬ', action: () => { scr.pause = null; } },
        { label: 'ЗАМЕНЫ', disabled: !h || m.mode !== 'match', value: () => (h ? 'ОСТАЛОСЬ ' + h.subsLeft : ''), action: () => { P.page = 'subs'; P.subOut = null; P.menu = subsMenu(); } },
        { label: 'ТАКТИКА', disabled: !h, action: () => { P.page = 'tactics'; P.menu = tacticsMenu(); } },
        { label: 'СТАТИСТИКА', action: () => { P.page = 'stats'; P.menu = new UI.ListMenu([{ label: 'НАЗАД', action: back }]); } },
        { label: 'УПРАВЛЕНИЕ', action: () => { P.page = 'controls'; P.menu = new UI.ListMenu([{ label: 'НАЗАД', action: back }]); } },
        { label: 'ГРОМКОСТЬ МУЗЫКИ', value: () => Math.round(st.music * 10) + '/10', left: () => vol('music', -0.1), right: () => vol('music', 0.1) },
        { label: 'ГРОМКОСТЬ ЗВУКОВ', value: () => Math.round(st.sfx * 10) + '/10', left: () => vol('sfx', -0.1), right: () => vol('sfx', 0.1) },
        { label: 'ВЫЙТИ ИЗ МАТЧА', action: () => App.go(UI.confirm('Выйти из матча? Результат не будет засчитан.', () => { scr.pause = null; App.go(PF.Menus.main(), 'reset'); })) },
      ];
      return new UI.ListMenu(items);
    }
    function vol(k, d) { st[k] = U.clamp(Math.round((st[k] + d) * 10) / 10, 0, 1); PF.Audio.setVolumes(st.master, st.music, st.sfx); PF.Save.save(); }
    function subsMenu() {
      const items = [];
      if (!P.subOut) {
        for (const p of h.players) {
          if (p.off) continue;
          items.push({ label: p.num + ' ' + p.name, value: () => p.def.pos + ' ' + Math.round(p.stamina * 100) + '%', action: () => { if (h.subsLeft > 0) { P.subOut = p; P.menu = subsMenu(); } } });
        }
      } else {
        for (const d of h.bench) {
          items.push({ label: d.num + ' ' + d.name, value: () => d.pos + ' ' + d.ovr, action: () => { m.substitute(h, P.subOut, d); P.subOut = null; P.menu = subsMenu(); PF.Audio.play('coin'); } });
        }
        if (!items.length) items.push({ label: 'СКАМЕЙКА ПУСТА', disabled: true });
      }
      items.push({ label: 'НАЗАД', action: () => { if (P.subOut) { P.subOut = null; P.menu = subsMenu(); } else back(); } });
      return new UI.ListMenu(items, { visible: 13 });
    }
    function tacticsMenu() {
      const T = PF.TACTICS;
      const cyc = (k, d, n) => { h.tactics[k] = (h.tactics[k] + d + n) % n; h.tac[k] = T[k].val[h.tactics[k]]; };
      return new UI.ListMenu([
        { label: 'СХЕМА', value: () => h.formation, left: () => setForm(-1), right: () => setForm(1) },
        { label: 'ПРЕССИНГ', value: () => T.press.names[h.tactics.press], left: () => cyc('press', -1, 3), right: () => cyc('press', 1, 3) },
        { label: 'ШИРИНА', value: () => T.width.names[h.tactics.width], left: () => cyc('width', -1, 3), right: () => cyc('width', 1, 3) },
        { label: 'ЛИНИЯ ОБОРОНЫ', value: () => T.line.names[h.tactics.line], left: () => cyc('line', -1, 3), right: () => cyc('line', 1, 3) },
        { label: 'НАЗАД', action: back },
      ]);
    }
    function setForm(d) {
      const names = PF.FORMATION_NAMES;
      const i = (names.indexOf(h.formation) + d + names.length) % names.length;
      h.formation = names[i]; h.slots = PF.FORMATIONS[h.formation];
      for (const p of h.players) { p.role = h.slots[p.slot].role; p.tgtStale = true; }
    }
    P.menu = mainMenu();
    P.update = (dt) => {
      if (I.pressed('back') || (I.pressed('pause') && P.page === 'main')) {
        PF.Audio.play('back');
        if (P.page === 'main') { scr.pause = null; return; }
        if (P.page === 'subs' && P.subOut) { P.subOut = null; P.menu = subsMenu(); return; }
        back(); return;
      }
      P.menu.update(dt);
    };
    P.render = (ctx) => {
      ctx.fillStyle = 'rgba(5,7,13,0.72)'; ctx.fillRect(0, 0, C.W, C.H);
      const titles = { main: 'ПАУЗА', subs: P.subOut ? 'КТО ВЫХОДИТ ВМЕСТО ' + P.subOut.name : 'ЗАМЕНЫ: КТО УХОДИТ', tactics: 'ТАКТИКА', controls: 'УПРАВЛЕНИЕ', stats: 'СТАТИСТИКА' };
      UI.panel(ctx, 70, 14, 244, 190, titles[P.page], COL.line);
      if (P.page === 'controls') { drawControls(ctx, 80, 30); P.menu.render(ctx, 80, 186, 224); return; }
      if (P.page === 'stats') { scoreLine(ctx, m, 32); drawStats(ctx, m, 78, 56, 228); P.menu.render(ctx, 80, 186, 224); return; }
      P.menu.render(ctx, 80, 30, 224, 12);
    };
    return P;
  }

  function drawControls(ctx, x, y) {
    const rows = [
      ['СТРЕЛКИ / WASD', 'ДВИЖЕНИЕ'], ['SHIFT', 'СПРИНТ'],
      ['АТАКА:', ''], ['J', 'КОРОТКИЙ ПАС'], ['K', 'ДЛИННЫЙ ПАС / НАВЕС'], ['L (ДЕРЖАТЬ)', 'УДАР, СИЛА'], ['U', 'ПАС НА ХОД'], ['I', 'ФИНТ / ОБВОДКА'],
      ['ЗАЩИТА:', ''], ['J', 'СМЕНА ИГРОКА'], ['K', 'ОТБОР'], ['L', 'ПОДКАТ'], ['SPACE', 'ПРЕССИНГ / ВРАТАРЬ'],
      ['ESC / P', 'ПАУЗА'],
    ];
    rows.forEach((r, i) => {
      const head = !r[1];
      F.draw(ctx, r[0], x, y + i * 11, head ? COL.accent : COL.accent2);
      if (r[1]) F.draw(ctx, r[1], x + 100, y + i * 11, COL.text);
    });
    F.draw(ctx, 'ГЕЙМПАД: A ПАС, B УДАР, X НАВЕС, Y НА ХОД', x, y + rows.length * 11 + 2, COL.dim);
  }
  PF.drawControls = drawControls;

  // ---------- Экран после матча ----------
  PF.PostMatchScreen = (m, res, title, onContinue) => {
    const ratings = m.finalRatings();
    const S = {
      tab: 0, t: 0,
      enter() { PF.Audio.playMusic('menu'); },
      update(dt) {
        this.t += dt;
        const d = I.menuDir(dt);
        if (d.dx || I.pressed('tabL') || I.pressed('tabR')) { this.tab = (this.tab + (d.dx || (I.pressed('tabL') ? -1 : 1)) + 3) % 3; PF.Audio.play('move'); }
        if (I.pressed('ok') && this.t > 0.5) { PF.Audio.play('select'); onContinue(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, title || 'ИТОГИ МАТЧА', ['СТАТИСТИКА', 'КАРТА УДАРОВ', 'ОЦЕНКИ'][this.tab] + '  ◄ ►');
        scoreLine(ctx, m, 26);
        scorers(ctx, m, 42);
        const y0 = 42 + Math.max(1, Math.min(3, Math.max(m.goals.filter((g) => g.team === 0).length, m.goals.filter((g) => g.team === 1).length))) * 9 + 2;
        if (this.tab === 0) { UI.panel(ctx, 70, y0, 244, C.H - y0 - 16); drawStats(ctx, m, 76, y0 + 4, 232); }
        else if (this.tab === 1) this.shotMap(ctx, y0);
        else this.ratings(ctx, y0);
        UI.footer(ctx, [['◄►', 'ВКЛАДКИ'], ['J', 'ДАЛЕЕ']]);
      },
      shotMap(ctx, y0) {
        const w = 240, h = Math.min(110, C.H - y0 - 24), x = 72, y = y0 + 4;
        ctx.fillStyle = '#2f7a34'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h); ctx.fillRect(x + w / 2, y, 1, h);
        const bx = C.BOX_DEPTH / C.PITCH_L * w, by = C.BOX_HALF / C.PITCH_W * h;
        ctx.fillRect(x, y + h / 2 - by, bx, 1); ctx.fillRect(x, y + h / 2 + by, bx, 1); ctx.fillRect(x + bx, y + h / 2 - by, 1, by * 2);
        ctx.fillRect(x + w - bx, y + h / 2 - by, bx, 1); ctx.fillRect(x + w - bx, y + h / 2 + by, bx, 1); ctx.fillRect(x + w - bx, y + h / 2 - by, 1, by * 2);
        // все удары рисуем так, будто команда 0 атакует вправо
        for (const s of m.shotMap) {
          const attacksRight = (s.team === 0) === (s.half === 1);
          let sx = s.x, sy = s.y;
          const toRight = s.team === 0;
          if (attacksRight !== toRight) { sx = C.PITCH_L - sx; sy = C.PITCH_W - sy; }
          const px = Math.round(x + sx / C.PITCH_L * w), py = Math.round(y + sy / C.PITCH_W * h);
          const col = s.res === 'goal' ? COL.accent2 : s.res === 'on' || s.res === 'save' ? '#ffffff' : s.res === 'post' ? '#ff9a3c' : COL.red;
          ctx.fillStyle = '#000'; ctx.fillRect(px - 2, py - 2, 5, 5);
          ctx.fillStyle = m.radarCol[s.team]; ctx.fillRect(px - 1, py - 1, 3, 3);
          ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1);
          if (s.res === 'goal') { ctx.fillStyle = COL.accent2; ctx.fillRect(px - 2, py - 3, 5, 1); }
        }
        const ly = y + h + 3;
        [['ГОЛ', COL.accent2], ['В СТВОР', '#ffffff'], ['ШТАНГА', '#ff9a3c'], ['МИМО', COL.red]].forEach((l, i) => {
          ctx.fillStyle = l[1]; ctx.fillRect(x + i * 62, ly + 2, 3, 3);
          F.draw(ctx, l[0], x + i * 62 + 6, ly, COL.dim);
        });
      },
      ratings(ctx, y0) {
        const motm = ratings[0];
        UI.panel(ctx, 8, y0, 120, 60, 'ЛУЧШИЙ ИГРОК', '#806010');
        ctx.drawImage(PF.Sprites.portrait(motm.def, motm.isGK ? motm.team.gkKit : motm.team.kit), 12, y0 + 14);
        F.draw(ctx, motm.name, 50, y0 + 16, COL.text);
        F.draw(ctx, motm.team.short, 50, y0 + 26, COL.dim);
        F.draw(ctx, motm.rating.toFixed(1), 50, y0 + 36, COL.accent2, 2);
        for (let side = 0; side < 2; side++) {
          const t = m.teams[side];
          const list = ratings.filter((p) => p.team === t).slice(0, 14);
          const x = side ? 258 : 134;
          F.draw(ctx, t.short, x, y0, m.radarCol[side]);
          list.forEach((p, i) => {
            const yy = y0 + 10 + i * 9;
            if (yy > C.H - 22) return;
            F.draw(ctx, p.name.slice(0, 11), x, yy, COL.dim);
            F.draw(ctx, p.rating.toFixed(1), x + 118, yy, p.rating >= 7.5 ? COL.accent : p.rating >= 6.5 ? COL.text : COL.red, 1, 2);
          });
        }
      },
    };
    return S;
  };
})(window.PF);
