'use strict';
// Меню: титульный экран (демо-матч ИИ на фоне), главное меню-плитки, быстрый матч,
// состав и тактика, настройки, управление.
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL, I = PF.Input, UI = PF.UI, App = PF.App, D = PF.Data;
  const M = {};
  const settings = () => PF.Save.data.settings;
  const teamIdx = (id) => Math.max(0, D.TEAMS.findIndex((t) => t.id === id));

  // ---------- Логотип ----------
  let logo = null;
  function buildLogo() {
    const c = U.makeCanvas(290, 64), x = c.getContext('2d');
    const draw = (txt, px, py, sc, col, outl) => {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) F.draw(x, txt, px + dx * sc, py + dy * sc, outl, sc, 1);
      F.draw(x, txt, px + sc, py + sc * 2, '#05070d', sc, 1);
      F.draw(x, txt, px, py, col, sc, 1);
    };
    draw('ПИКСЕЛЬ ЛИГА', 104, 4, 3, '#e8ecf8', '#1d2a5a');
    // градиентный блик на надписи
    const g = x.getImageData(0, 0, 290, 30);
    for (let yy = 0; yy < 30; yy++) for (let xx = 0; xx < 290; xx++) {
      const o = (yy * 290 + xx) * 4;
      if (g.data[o] > 200 && g.data[o + 1] > 200) { const k = yy < 12 ? 1 : 0.8; g.data[o] *= k; g.data[o + 1] *= k * 1.02; }
    }
    x.putImageData(g, 0, 0);
    draw('27', 256, 2, 4, COL.accent, '#0a4030');
    x.fillStyle = COL.accent2; x.fillRect(14, 34, 180, 2);
    F.draw(x, 'ФУТБОЛ В 16 БИТ', 104, 40, COL.accent2, 1, 1);
    logo = c;
  }

  // ---------- Титульный экран: демо-матч ИИ против ИИ ----------
  M.title = () => {
    let scr = null, t = 0;
    return {
      enter() {
        const T = D.TEAMS;
        const a = U.randi(0, T.length - 1);
        let b = U.randi(0, T.length - 1); if (b === a) b = (a + 7) % T.length;
        scr = PF.MatchScreen({ home: T[a], away: T[b], human: -1, halfMin: 6, diff: 1, mode: 'match' }, null);
        scr.enter();
        scr.m.state = 'kickoff';
        PF.Audio.playMusic('menu');
        if (!logo) buildLogo();
      },
      exit() { PF.Audio.crowdStop(); },
      update(dt) {
        t += dt;
        const m = scr.m;
        if (m.state === 'halftime') m.startSecondHalf();
        if (m.state === 'fulltime' || m.state === 'replay') { if (m.state === 'replay') m.skipReplay = true; else { scr.exit(); scr.enter(); scr.m.state = 'kickoff'; } }
        m.update(dt);
        scr.cam.follow(m.cam.x, m.cam.y, m.cam.z, dt, 2.5);
        scr.cam.zoomTarget = 1;
        scr.cam.update(dt);
        if (t > 0.6 && (I.pressed('ok') || I.pressed('pause') || I.any())) { PF.Audio.unlock(); PF.Audio.play('select'); PF.Audio.playMusic('menu'); App.go(M.main(), 'reset'); }
      },
      render(ctx, alpha, ft) {
        scr.rt += ft || 0;
        scr.cam.compute();
        PF.World.draw(ctx, scr.m, scr.cam, alpha, false, scr.rt);
        ctx.fillStyle = 'rgba(5,7,13,0.55)'; ctx.fillRect(0, 0, C.W, C.H);
        ctx.fillStyle = 'rgba(5,7,13,0.6)'; ctx.fillRect(0, 40, C.W, 70);
        ctx.drawImage(logo, Math.round(C.W / 2 - 140), 46 + Math.round(Math.sin(t * 2) * 2));
        if (((t * 2) | 0) & 1) F.draw(ctx, 'НАЖМИТЕ ENTER ИЛИ J', C.W / 2, 140, COL.text, 1, 1, '#000');
        F.draw(ctx, 'ВСЕ КОМАНДЫ И ИГРОКИ ВЫМЫШЛЕНЫ', C.W / 2, C.H - 22, COL.dim, 1, 1, '#000');
        F.draw(ctx, 'v1.0  ' + (PF.Audio.ready ? '' : 'ЗВУК ВКЛЮЧИТСЯ ПОСЛЕ НАЖАТИЯ КЛАВИШИ'), C.W / 2, C.H - 12, '#4a5478', 1, 1);
      },
    };
  };

  // ---------- Главное меню-плитки ----------
  const TILES = [
    { id: 'quick', x: 8, y: 24, w: 184, h: 112, title: 'БЫСТРЫЙ МАТЧ', sub: 'ВЫБЕРИ КОМАНДУ И ИГРАЙ', col: '#1d6a3a' },
    { id: 'career', x: 198, y: 24, w: 178, h: 54, title: 'КАРЬЕРА', sub: 'СЕЗОН ТРЕНЕРА-МЕНЕДЖЕРА', col: '#1d3a8a' },
    { id: 'cup', x: 198, y: 82, w: 87, h: 54, title: 'ТУРНИР', sub: 'КУБОК 8/16', col: '#8a5a10' },
    { id: 'squad', x: 289, y: 82, w: 87, h: 54, title: 'ЗВЕЗДНЫЙ', sub: 'СОСТАВ', col: '#6a2a8a' },
    { id: 'train', x: 8, y: 142, w: 120, h: 50, title: 'ТРЕНИРОВКА', sub: 'ИГРА И ШТРАФНЫЕ', col: '#2a6a6a' },
    { id: 'settings', x: 132, y: 142, w: 120, h: 50, title: 'НАСТРОЙКИ', sub: 'ЗВУК, МАТЧ, ПРАВИЛА', col: '#3a4466' },
    { id: 'controls', x: 256, y: 142, w: 120, h: 50, title: 'УПРАВЛЕНИЕ', sub: 'КЛАВИАТУРА И ГЕЙМПАД', col: '#5a3a3a' },
  ];
  function tileIcon(ctx, id, x, y, t) {
    const px = (cx, cy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + cx, y + cy, w, h); };
    switch (id) {
      case 'career': px(0, 6, 14, 10, '#d0a060'); px(3, 3, 8, 3, '#d0a060'); px(1, 7, 12, 1, '#7a5020'); px(6, 9, 2, 3, '#ffd23c'); break;
      case 'cup': px(2, 0, 12, 2, COL.accent2); px(3, 2, 10, 6, COL.accent2); px(0, 2, 2, 4, COL.accent2); px(14, 2, 2, 4, COL.accent2); px(7, 8, 2, 4, COL.accent2); px(4, 12, 8, 2, '#c08a10'); px(5, 3, 2, 3, '#fff6c0'); break;
      case 'squad': { const b = ((t * 3) | 0) & 1; px(2, 0, 12, 16, b ? COL.gold : '#d0a020'); px(3, 1, 10, 14, '#2a1a40'); px(5, 3, 6, 5, '#f2c69a'); px(5, 3, 6, 2, '#2b1d14'); px(4, 9, 8, 5, '#ffd23c'); break; }
      case 'train': px(0, 12, 16, 2, '#fff'); for (let i = 0; i < 3; i++) px(2 + i * 5, 4, 2, 8, '#ff8020'); px(1, 2, 4, 2, '#ff8020'); break;
      case 'settings': px(4, 0, 8, 16, '#8a94b8'); px(0, 4, 16, 8, '#8a94b8'); px(5, 5, 6, 6, '#3a4466'); px(7, 7, 2, 2, '#8a94b8'); break;
      case 'controls': px(0, 4, 16, 9, '#c0c8e0'); px(1, 5, 14, 7, '#2a3150'); px(3, 7, 4, 1, '#c0c8e0'); px(4, 6, 2, 3, '#c0c8e0'); px(10, 6, 2, 2, COL.red); px(12, 8, 2, 2, COL.accent); break;
      default: break;
    }
  }
  M.main = () => {
    let sel = 0, t = 0;
    const S = {
      enter() { PF.Audio.playMusic('menu'); },
      resume() { PF.Audio.playMusic('menu'); },
      update(dt) {
        t += dt;
        const d = I.menuDir(dt);
        if (d.dx || d.dy) {
          // ближайшая плитка в направлении
          // соседняя плитка: ближайшая по краю в направлении, с перекрытием по другой оси
          const a = TILES[sel];
          let best = -1, bs = 1e9;
          TILES.forEach((b, i) => {
            if (i === sel) return;
            const along = d.dx > 0 ? b.x - (a.x + a.w) : d.dx < 0 ? a.x - (b.x + b.w) : d.dy > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
            if (along < -2) return;
            const gap = d.dx ? Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)) : Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
            const align = d.dx ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
            const s = along + gap * 3 + align * 0.1;
            if (s < bs) { bs = s; best = i; }
          });
          if (best >= 0) { sel = best; PF.Audio.play('move'); }
        }
        if (I.pressed('ok')) {
          PF.Audio.play('select');
          const id = TILES[sel].id;
          if (id === 'quick') App.go(M.quick());
          else if (id === 'settings') App.go(M.settings());
          else if (id === 'controls') App.go(M.controls());
          else if (id === 'career') App.go(PF.Modes.career());
          else if (id === 'cup') App.go(PF.Modes.cup());
          else if (id === 'squad') App.go(PF.Modes.squad());
          else if (id === 'train') App.go(PF.Modes.training());
        }
        if (I.pressed('back')) { PF.Audio.play('back'); App.go(M.title(), 'reset'); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'ПИКСЕЛЬ ЛИГА 27  ·  ГЛАВНОЕ МЕНЮ');
        UI.coins(ctx, PF.Save.data.coins, C.W - 6, 5, 2);
        TILES.forEach((tl, i) => {
          const on = i === sel;
          const pulse = on ? Math.round(Math.sin(t * 6) + 1) : 0;
          ctx.fillStyle = on ? COL.accent : '#05070d'; ctx.fillRect(tl.x - 1 - (on ? 1 : 0), tl.y - 1 - (on ? 1 : 0), tl.w + 2 + (on ? 2 : 0), tl.h + 2 + (on ? 2 : 0));
          ctx.fillStyle = on ? U.shade(tl.col, 0.15) : tl.col; ctx.fillRect(tl.x, tl.y, tl.w, tl.h);
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(tl.x, tl.y, tl.w, Math.floor(tl.h / 2));
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(tl.x, tl.y + tl.h - 20, tl.w, 20);
          F.draw(ctx, tl.title + (tl.id === 'squad' ? '' : ''), tl.x + 5, tl.y + tl.h - 18, on ? '#ffffff' : COL.text);
          F.draw(ctx, tl.id === 'squad' ? 'СОСТАВ' : tl.sub, tl.x + 5, tl.y + tl.h - 9, on ? COL.accent2 : COL.dim);
          if (tl.id === 'quick') this.quickArt(ctx, tl, t);
          else tileIcon(ctx, tl.id, tl.x + tl.w - 22, tl.y + 6 - pulse, t);
          if (tl.id === 'career' && PF.Save.data.career) F.draw(ctx, 'СЕЗОН ' + PF.Save.data.career.season + ', ТУР ' + (PF.Save.data.career.round + 1), tl.x + 5, tl.y + 6, COL.accent2);
          if (tl.id === 'cup' && PF.Save.data.tournament && !PF.Save.data.tournament.done) F.draw(ctx, 'ИДЕТ', tl.x + 5, tl.y + 6, COL.accent2);
        });
        const r = PF.Save.data.records;
        UI.footer(ctx, [['СТРЕЛКИ', 'ВЫБОР'], ['J', 'ОК'], ['ESC', 'НАЗАД']]);
        F.draw(ctx, 'МАТЧИ ' + r.played + '  В ' + r.won + ' Н ' + r.drawn + ' П ' + r.lost, C.W - 6, C.H - 8, COL.dim, 1, 2);
      },
      quickArt(ctx, tl, tt) {
        // мини-поле с бегущими игроками
        const x = tl.x + 8, y = tl.y + 8, w = tl.w - 16, h = 62;
        ctx.fillStyle = '#2f7a34'; ctx.fillRect(x, y, w, h);
        for (let i = 0; i < w; i += 16) { ctx.fillStyle = '#368a35'; ctx.fillRect(x + i, y, 8, h); }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w / 2, y, 1, h);
        const q = PF.Save.data.quick;
        const ht = D.team(q.home) || D.TEAMS[0], at = D.team(q.away) || D.TEAMS[1];
        ctx.drawImage(PF.Sprites.crest(ht, 1), x + 6, y + 6);
        ctx.drawImage(PF.Sprites.crest(at, 1), x + w - 20, y + 6);
        const sh1 = PF.Sprites.sheetFor(ht.kit.home, 0, 0), sh2 = PF.Sprites.sheetFor(PF.Data.pickKits(ht, at)[1], 2, 3);
        const f = (Math.floor(tt * 8) & 3);
        const bx = x + w / 2 + Math.round(Math.sin(tt * 1.3) * 40);
        PF.Sprites.drawPlayer(ctx, sh1, PF.POSE.RUN0 + f, PF.DIR.RIGHT, bx - 10, y + 44, null);
        PF.Sprites.drawPlayer(ctx, sh2, PF.POSE.RUN0 + ((f + 2) & 3), PF.DIR.LEFT, bx + 14, y + 40, null);
        PF.Sprites.drawBall(ctx, bx - 3, y + 44, f, false);
        F.draw(ctx, ht.short + ' - ' + at.short, x + w / 2, y + 6, '#fff', 1, 1, '#000');
      },
    };
    return S;
  };

  // ---------- Карточка команды (выбор) ----------
  function teamCard(ctx, team, kit, x, y, label, on) {
    UI.panel(ctx, x, y, 150, 84, label, on ? '#1d6a3a' : COL.line);
    ctx.drawImage(PF.Sprites.crest(team, 2), x + 6, y + 16);
    F.draw(ctx, team.name, x + 40, y + 16, COL.text);
    F.draw(ctx, D.LEAGUES[team.league].name, x + 40, y + 26, COL.dim);
    UI.stars(ctx, team.rating, x + 40, y + 36);
    const r = D.teamRatings(team);
    F.draw(ctx, 'АТК ' + r.att + '  ПЗ ' + r.mid + '  ЗЩ ' + r.def, x + 6, y + 52, COL.accent);
    F.draw(ctx, 'ОБЩИЙ ' + r.ovr, x + 6, y + 63, COL.accent2);
    UI.kitIcon(ctx, kit, x + 132, y + 80);
    if (on) { F.draw(ctx, '◄', x - 9, y + 38, COL.accent); F.draw(ctx, '►', x + 153, y + 38, COL.accent); }
  }
  M.teamCard = teamCard;

  // ---------- Быстрый матч ----------
  const SIDES = [0, 1, -1], SIDE_NAMES = ['ХОЗЯЕВ', 'ГОСТЕЙ', 'ЗРИТЕЛЬ'];
  M.quick = () => {
    const q = PF.Save.data.quick, st = settings();
    let hi = teamIdx(q.home), ai = teamIdx(q.away);
    if (ai === hi) ai = (hi + 1) % D.TEAMS.length;
    const cyc = (v, d) => (v + d + D.TEAMS.length) % D.TEAMS.length;
    const jumpLeague = (v, d) => { const lg = (D.TEAMS[v].league + d + D.LEAGUES.length) % D.LEAGUES.length; return D.TEAMS.findIndex((t) => t.league === lg); };
    const saveQ = () => { q.home = D.TEAMS[hi].id; q.away = D.TEAMS[ai].id; PF.Save.save(); };
    const menu = new UI.ListMenu([
      { label: 'ХОЗЯЕВА', value: () => D.TEAMS[hi].short, left: () => { hi = cyc(hi, -1); if (hi === ai) hi = cyc(hi, -1); saveQ(); }, right: () => { hi = cyc(hi, 1); if (hi === ai) hi = cyc(hi, 1); saveQ(); } },
      { label: 'ГОСТИ', value: () => D.TEAMS[ai].short, left: () => { ai = cyc(ai, -1); if (hi === ai) ai = cyc(ai, -1); saveQ(); }, right: () => { ai = cyc(ai, 1); if (hi === ai) ai = cyc(ai, 1); saveQ(); } },
      { label: 'ВЫ ИГРАЕТЕ ЗА', value: () => SIDE_NAMES[SIDES.indexOf(q.side)], left: () => { q.side = SIDES[(SIDES.indexOf(q.side) + 2) % 3]; PF.Save.save(); }, right: () => { q.side = SIDES[(SIDES.indexOf(q.side) + 1) % 3]; PF.Save.save(); } },
      { label: 'СЛОЖНОСТЬ', value: () => C.DIFF[st.diff].name, left: () => { st.diff = (st.diff + 2) % 3; PF.Save.save(); }, right: () => { st.diff = (st.diff + 1) % 3; PF.Save.save(); } },
      { label: 'ДЛИНА ТАЙМА', value: () => st.halfMin + ' МИН', left: () => { st.halfMin = Math.max(1, st.halfMin - 1); PF.Save.save(); }, right: () => { st.halfMin = Math.min(6, st.halfMin + 1); PF.Save.save(); } },
      { label: 'ВРЕМЯ МАТЧА', value: () => (st.night ? 'ВЕЧЕР' : 'ДЕНЬ'), left: () => { st.night = !st.night; PF.Save.save(); }, right: () => { st.night = !st.night; PF.Save.save(); } },
      { label: 'СОСТАВ И ТАКТИКА', action: () => { const tm = D.TEAMS[q.side === 1 ? ai : hi]; App.go(M.lineup(tm, PF.Save.teamSetup(tm), (s) => PF.Save.setTeamSetup(tm.id, s))); } },
      { label: 'НАЧАТЬ МАТЧ', action: () => start() },
    ]);
    menu.sel = 7;
    function start() {
      saveQ();
      const home = D.TEAMS[hi], away = D.TEAMS[ai];
      const hs = PF.Save.teamSetup(home), as = PF.Save.teamSetup(away);
      const opts = {
        home, away, human: q.side, halfMin: st.halfMin, diff: st.diff, offside: st.offside, cards: st.cards, night: st.night,
        homeLineup: hs.lineup, awayLineup: as.lineup, homeFormation: hs.formation, awayFormation: as.formation,
        homeTactics: hs, awayTactics: as,
      };
      App.go(PF.MatchScreen(opts, (res, m) => {
        if (q.side >= 0) {
          const my = q.side, gf = my === 0 ? res.hs : res.as, ga = my === 0 ? res.as : res.hs;
          PF.Save.record(gf, ga);
          PF.Save.data.coins += gf > ga ? C.COINS_WIN / 2 : gf === ga ? C.COINS_DRAW / 2 : C.COINS_LOSS / 2;
          PF.Save.save();
        }
        App.go(PF.PostMatchScreen(m, res, 'БЫСТРЫЙ МАТЧ', () => App.go(M.main(), 'reset')), 'replace');
      }), 'push');
    }
    return {
      update(dt) {
        if (I.pressed('tabL') || I.pressed('tabR')) {
          const d = I.pressed('tabL') ? -1 : 1;
          if (menu.sel === 0) { hi = jumpLeague(hi, d); if (hi === ai) hi = cyc(hi, 1); saveQ(); }
          if (menu.sel === 1) { ai = jumpLeague(ai, d); if (hi === ai) ai = cyc(ai, 1); saveQ(); }
        }
        menu.update(dt);
        if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'БЫСТРЫЙ МАТЧ', 'Q/E - СМЕНА ЛИГИ');
        const home = D.TEAMS[hi], away = D.TEAMS[ai];
        const kits = D.pickKits(home, away);
        teamCard(ctx, home, kits[0], 22, 24, q.side === 0 ? 'ХОЗЯЕВА (ВЫ)' : 'ХОЗЯЕВА', menu.sel === 0);
        teamCard(ctx, away, kits[1], 212, 24, q.side === 1 ? 'ГОСТИ (ВЫ)' : 'ГОСТИ', menu.sel === 1);
        F.draw(ctx, 'VS', 192, 60, COL.accent2, 2, 1, '#000');
        menu.render(ctx, 92, 114, 200, 11);
        UI.footer(ctx, [['▲▼', 'ПУНКТ'], ['◄►', 'ИЗМЕНИТЬ'], ['J', 'ОК'], ['ESC', 'НАЗАД']]);
      },
    };
  };

  // ---------- Состав и тактика ----------
  // setup: { formation, press, width, line, lineup[18] }; onSave(setup)
  M.lineup = (team, setup, onSave, opts) => {
    const s = JSON.parse(JSON.stringify(setup));
    const o = opts || {};
    const T = PF.TACTICS;
    let pick = -1;
    const P = (i) => (o.resolve ? o.resolve(s.lineup[i]) : D.PLAYERS[s.lineup[i]]);
    const items = [
      { label: 'СХЕМА', value: () => s.formation, left: () => { const n = PF.FORMATION_NAMES; s.formation = n[(n.indexOf(s.formation) + n.length - 1) % n.length]; }, right: () => { const n = PF.FORMATION_NAMES; s.formation = n[(n.indexOf(s.formation) + 1) % n.length]; } },
      { label: 'ПРЕССИНГ', value: () => T.press.names[s.press], left: () => { s.press = (s.press + 2) % 3; }, right: () => { s.press = (s.press + 1) % 3; } },
      { label: 'ШИРИНА', value: () => T.width.names[s.width], left: () => { s.width = (s.width + 2) % 3; }, right: () => { s.width = (s.width + 1) % 3; } },
      { label: 'ЛИНИЯ ОБОРОНЫ', value: () => T.line.names[s.line], left: () => { s.line = (s.line + 2) % 3; }, right: () => { s.line = (s.line + 1) % 3; } },
    ];
    const N = s.lineup.length;
    for (let i = 0; i < N; i++) {
      items.push({
        idx: i,
        label: '',
        action: () => {
          if (pick < 0) { pick = i; return; }
          if (pick !== i) { const tmp = s.lineup[pick]; s.lineup[pick] = s.lineup[i]; s.lineup[i] = tmp; PF.Audio.play('coin'); }
          pick = -1;
        },
      });
    }
    items.push({ label: 'АВТОСОСТАВ', action: () => autoPick() });
    items.push({ label: 'ГОТОВО', action: () => { onSave(s); App.pop(); } });
    const menu = new UI.ListMenu(items, { visible: 16 });
    function autoPick() {
      // лучшие по OVR на каждую позицию схемы
      const slots = PF.FORMATIONS[s.formation];
      const pool = s.lineup.slice();
      const out = [];
      for (const sl of slots) {
        let bi = -1, bv = -1;
        pool.forEach((id, k) => { const p = o.resolve ? o.resolve(id) : D.PLAYERS[id]; if (!p) return; const v = p.ovr + (p.role === sl.role ? 30 : 0) + (sl.role === 'GK' && p.role !== 'GK' ? -100 : 0); if (v > bv) { bv = v; bi = k; } });
        out.push(pool[bi]); pool.splice(bi, 1);
      }
      s.lineup = out.concat(pool.sort((a, b) => ((o.resolve ? o.resolve(b) : D.PLAYERS[b]).ovr - (o.resolve ? o.resolve(a) : D.PLAYERS[a]).ovr)));
      PF.Audio.play('coin');
    }
    return {
      update(dt) {
        menu.update(dt);
        if (I.pressed('back')) { PF.Audio.play('back'); if (pick >= 0) pick = -1; else { onSave(s); App.pop(); } }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'СОСТАВ И ТАКТИКА: ' + team.name, 'J - ВЫБРАТЬ/ПОМЕНЯТЬ');
        // схема на мини-поле
        const px = 6, py = 22, pw = 150, ph = 96;
        ctx.fillStyle = '#2f7a34'; ctx.fillRect(px, py, pw, ph);
        for (let i = 0; i < pw; i += 20) { ctx.fillStyle = '#368a35'; ctx.fillRect(px + i, py, 10, ph); }
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(px, py, pw, 1); ctx.fillRect(px, py + ph - 1, pw, 1); ctx.fillRect(px + pw / 2, py, 1, ph);
        ctx.fillRect(px, py + ph / 2 - 20, 22, 1); ctx.fillRect(px, py + ph / 2 + 20, 22, 1); ctx.fillRect(px + 22, py + ph / 2 - 20, 1, 40);
        const slots = PF.FORMATIONS[s.formation];
        const curIdx = menu.items[menu.sel].idx;
        slots.forEach((sl, i) => {
          const p = P(i);
          const x = px + 6 + sl.fx * (pw - 12) * 1.35, y = py + 6 + sl.fy * (ph - 12);
          const on = curIdx === i || pick === i;
          ctx.fillStyle = '#05070d'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 9, 9);
          ctx.fillStyle = on ? COL.accent2 : (p && p.role === sl.role ? '#e8ecf8' : COL.red); ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
          F.drawSmall(ctx, String(p ? p.ovr : 0), Math.round(x), Math.round(y) - 2, '#0b0f1a', 1);
        });
        // карточка выбранного игрока
        const cur = curIdx != null ? P(curIdx) : null;
        UI.panel(ctx, 6, 124, 150, 76, cur ? cur.name : 'ТАКТИКА', COL.line);
        if (cur) {
          F.draw(ctx, cur.pos + '  ' + cur.ovr + '  ' + (cur.age || '') + ' Л.', 10, 136, COL.accent2);
          const keys = ['spd', 'sho', 'pas', 'dri', 'def', 'phy', 'gk'];
          keys.forEach((k, j) => {
            const xx = 10 + (j % 2) * 72, yy = 147 + Math.floor(j / 2) * 12;
            F.draw(ctx, D.STAT_NAMES[k], xx, yy, COL.dim);
            F.draw(ctx, String(cur.stats[k]), xx + 40, yy, UI.statColor(cur.stats[k]), 1, 2);
            UI.bar(ctx, xx + 42, yy + 2, 24, cur.stats[k]);
          });
        } else {
          F.draw(ctx, 'ПРЕССИНГ: ' + T.press.names[s.press], 10, 138, COL.dim);
          F.draw(ctx, 'ШИРИНА: ' + T.width.names[s.width], 10, 150, COL.dim);
          F.draw(ctx, 'ЛИНИЯ: ' + T.line.names[s.line], 10, 162, COL.dim);
          const r = D.teamRatings(team, s.lineup.slice(0, 11).filter((id) => D.PLAYERS[id]));
          F.draw(ctx, 'РЕЙТИНГ СОСТАВА ' + r.ovr, 10, 180, COL.accent2);
        }
        // список
        for (const it of menu.items) {
          if (it.idx == null) continue;
          const p = P(it.idx), i = it.idx;
          const pos = i < 11 ? slots[i].pos : 'ЗАП';
          it.label = (pick === i ? '> ' : '') + pos.padEnd(4, ' ') + (p ? p.name : '---');
          it.value = () => (p ? p.pos + ' ' + p.ovr : '');
          if (i === 11) it.sep = true;
        }
        menu.render(ctx, 162, 22, 216, 11);
        UI.footer(ctx, [['▲▼', 'ВЫБОР'], ['J', 'ПОМЕНЯТЬ'], ['ESC', 'СОХРАНИТЬ']]);
      },
    };
  };

  // ---------- Настройки ----------
  M.settings = () => {
    const st = settings();
    const vol = (k, d) => { st[k] = U.clamp(Math.round((st[k] + d) * 10) / 10, 0, 1); PF.Audio.setVolumes(st.master, st.music, st.sfx); PF.Save.save(); PF.Audio.play('move'); };
    const tog = (k) => { st[k] = !st[k]; PF.Save.save(); };
    const menu = new UI.ListMenu([
      { label: 'ДЛИНА ТАЙМА', value: () => st.halfMin + ' МИН', left: () => { st.halfMin = Math.max(1, st.halfMin - 1); PF.Save.save(); }, right: () => { st.halfMin = Math.min(6, st.halfMin + 1); PF.Save.save(); } },
      { label: 'СЛОЖНОСТЬ', value: () => C.DIFF[st.diff].name, left: () => { st.diff = (st.diff + 2) % 3; PF.Save.save(); }, right: () => { st.diff = (st.diff + 1) % 3; PF.Save.save(); } },
      { label: 'ОФСАЙД', value: () => (st.offside ? 'ВКЛ' : 'ВЫКЛ'), left: () => tog('offside'), right: () => tog('offside') },
      { label: 'КАРТОЧКИ', value: () => (st.cards ? 'ВКЛ' : 'ВЫКЛ'), left: () => tog('cards'), right: () => tog('cards') },
      { label: 'ОБЩАЯ ГРОМКОСТЬ', value: () => Math.round(st.master * 10) + '/10', left: () => vol('master', -0.1), right: () => vol('master', 0.1) },
      { label: 'МУЗЫКА', value: () => Math.round(st.music * 10) + '/10', left: () => vol('music', -0.1), right: () => vol('music', 0.1) },
      { label: 'ЗВУКИ', value: () => Math.round(st.sfx * 10) + '/10', left: () => vol('sfx', -0.1), right: () => vol('sfx', 0.1) },
      { label: 'ПОКАЗ FPS', value: () => (st.fps ? 'ВКЛ' : 'ВЫКЛ'), left: () => tog('fps'), right: () => tog('fps') },
      { label: 'СБРОСИТЬ ПРОГРЕСС', action: () => App.go(UI.confirm('Удалить все сохранения: монеты, карточки, карьеру и турнир?', () => { PF.Save.reset(); })) },
      { label: 'НАЗАД', action: () => App.pop() },
    ]);
    return {
      update(dt) { menu.update(dt); if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); } },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'НАСТРОЙКИ');
        UI.panel(ctx, 72, 26, 240, 150, 'ПАРАМЕТРЫ', COL.line);
        menu.render(ctx, 80, 42, 224, 13);
        UI.footer(ctx, [['▲▼', 'ПУНКТ'], ['◄►', 'ИЗМЕНИТЬ'], ['ESC', 'НАЗАД']]);
      },
    };
  };

  M.controls = () => ({
    update() { if (I.pressed('back') || I.pressed('ok')) { PF.Audio.play('back'); App.pop(); } },
    render(ctx) {
      UI.bg(ctx, App.t);
      UI.header(ctx, 'УПРАВЛЕНИЕ');
      UI.panel(ctx, 70, 22, 244, 182, 'КЛАВИАТУРА', COL.line);
      PF.drawControls(ctx, 80, 38);
      UI.footer(ctx, [['ESC', 'НАЗАД']]);
    },
  });

  PF.Menus = M;
})(window.PF);
