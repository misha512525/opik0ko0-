'use strict';
// Режимы: Карьера (мини-менеджер), Турнир (кубок на выбывание), Звёздный состав (паки и карточки),
// Тренировка (свободная игра и штрафные).
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL, I = PF.Input, UI = PF.UI, App = PF.App, D = PF.Data;
  const Modes = {};
  const SV = () => PF.Save.data;
  const st = () => SV().settings;

  // ---------- Симуляция матча без игры (для ИИ-пар) ----------
  function poisson(l) { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= Math.random(); } while (p > L); return k - 1; }
  function simMatch(ra, rb, knockout) {
    // ожидаемые голы по разнице рейтингов (Пуассон), с потолком
    const la = Math.min(3.4, 1.35 * Math.exp((ra - rb) / 30)), lb = Math.min(3.4, 1.15 * Math.exp((rb - ra) / 30));
    const a = poisson(la), b = poisson(lb);
    let pa = null, pb = null;
    if (knockout && a === b) { pa = U.randi(2, 5); pb = pa + (Math.random() < 0.5 + (ra - rb) / 100 ? -1 : 1); if (pb < 0) pb = pa + 1; }
    return { a, b, pa, pb };
  }
  Modes.simMatch = simMatch;

  // Общий выбор команды из списка лиг
  function teamPicker(title, onPick) {
    let idx = 0;
    return {
      update(dt) {
        const d = I.menuDir(dt);
        if (d.dx) { idx = (idx + d.dx + D.TEAMS.length) % D.TEAMS.length; PF.Audio.play('move'); }
        if (d.dy) { const lg = (D.TEAMS[idx].league + d.dy + D.LEAGUES.length) % D.LEAGUES.length; idx = D.TEAMS.findIndex((t) => t.league === lg); PF.Audio.play('move'); }
        if (I.pressed('ok')) { PF.Audio.play('select'); onPick(D.TEAMS[idx]); }
        if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, title, '◄► КОМАНДА  ▲▼ ЛИГА');
        const t = D.TEAMS[idx];
        PF.Menus.teamCard(ctx, t, t.kit.home, 117, 30, D.LEAGUES[t.league].name, true);
        // все клубы лиги
        const lg = D.TEAMS.filter((x) => x.league === t.league);
        lg.forEach((x, i) => {
          const xx = 30 + (i % 4) * 84, yy = 124 + Math.floor(i / 4) * 30;
          const on = x === t;
          ctx.fillStyle = on ? COL.accent : '#05070d'; ctx.fillRect(xx - 1, yy - 1, 78, 26);
          ctx.fillStyle = COL.panel; ctx.fillRect(xx, yy, 76, 24);
          ctx.drawImage(PF.Sprites.crest(x, 1), xx + 3, yy + 4);
          F.draw(ctx, x.short, xx + 21, yy + 4, on ? COL.text : COL.dim);
          UI.stars(ctx, x.rating, xx + 21, yy + 14);
        });
        UI.footer(ctx, [['J', 'ВЫБРАТЬ'], ['ESC', 'НАЗАД']]);
      },
    };
  }

  // Запуск матча с учётом сохранённой тактики
  function launch(home, away, side, extra, onDone) {
    const s = st();
    const hs = extra.homeSetup || PF.Save.teamSetup(home), as = extra.awaySetup || PF.Save.teamSetup(away);
    const opts = Object.assign({
      home, away, human: side, halfMin: s.halfMin, diff: extra.diff != null ? extra.diff : s.diff, offside: s.offside, cards: s.cards, night: s.night,
      homeLineup: hs.lineup, awayLineup: as.lineup, homeFormation: hs.formation, awayFormation: as.formation, homeTactics: hs, awayTactics: as,
    }, extra.opts || {});
    App.go(PF.MatchScreen(opts, (res, m) => {
      const gf = side === 0 ? res.hs : res.as, ga = side === 0 ? res.as : res.hs;
      PF.Save.record(gf, ga);
      onDone(res, m);
    }));
  }

  // =====================================================================
  // ТУРНИР
  // =====================================================================
  Modes.cup = () => {
    const S = SV();
    if (S.tournament && !S.tournament.done) return cupHub();
    let size = 8;
    const setup = new UI.ListMenu([
      { label: 'РАЗМЕР КУБКА', value: () => size + ' КОМАНД', left: () => { size = size === 8 ? 16 : 8; }, right: () => { size = size === 8 ? 16 : 8; } },
      { label: 'СЛОЖНОСТЬ', value: () => C.DIFF[st().diff].name, left: () => { st().diff = (st().diff + 2) % 3; PF.Save.save(); }, right: () => { st().diff = (st().diff + 1) % 3; PF.Save.save(); } },
      { label: 'ВЫБРАТЬ КОМАНДУ', action: () => App.go(teamPicker('ТУРНИР: ВАША КОМАНДА', (t) => createCup(t, size))) },
      { label: 'НАЗАД', action: () => App.pop() },
    ]);
    setup.sel = 2;
    return {
      update(dt) { setup.update(dt); if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); } },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'ТУРНИР: ПИКСЕЛЬ КУБОК');
        UI.panel(ctx, 82, 40, 220, 100, 'НОВЫЙ КУБОК', '#8a5a10');
        F.draw(ctx, 'ИГРА НА ВЫБЫВАНИЕ. НИЧЬЯ - СЕРИЯ ПЕНАЛЬТИ.', 192, 56, COL.dim, 1, 1);
        F.draw(ctx, 'ПРИЗ ЧЕМПИОНУ: ' + (size === 8 ? 3000 : 6000) + ' МОНЕТ', 192, 66, COL.accent2, 1, 1);
        setup.render(ctx, 92, 80, 200, 13);
        UI.footer(ctx, [['J', 'ОК'], ['ESC', 'НАЗАД']]);
      },
    };
  };
  function createCup(team, size) {
    const others = U.shuffle(D.TEAMS.filter((t) => t !== team).slice()).sort((a, b) => b.rating - a.rating + (Math.random() - 0.5) * 14).slice(0, size - 1);
    const teams = U.shuffle([team.id].concat(others.map((t) => t.id)));
    const round = [];
    for (let i = 0; i < size; i += 2) round.push({ a: teams[i], b: teams[i + 1], sa: null, sb: null, pa: null, pb: null, w: null });
    SV().tournament = { size, user: team.id, rounds: [round], round: 0, done: false, champion: null, diff: st().diff };
    PF.Save.save();
    App.go(cupHub(), 'replace');
  }
  const ROUND_NAMES = { 16: ['1/8 ФИНАЛА', '1/4 ФИНАЛА', '1/2 ФИНАЛА', 'ФИНАЛ'], 8: ['1/4 ФИНАЛА', '1/2 ФИНАЛА', 'ФИНАЛ'] };
  function cupHub() {
    const T = () => SV().tournament;
    const myMatch = () => T().rounds[T().round].find((m) => (m.a === T().user || m.b === T().user) && m.w == null);
    let msg = null;
    function finishRound() {
      const tr = T(), r = tr.rounds[tr.round];
      for (const mm of r) if (mm.w == null) {
        const ta = D.team(mm.a), tb = D.team(mm.b);
        const s = simMatch(ta.rating, tb.rating, true);
        Object.assign(mm, { sa: s.a, sb: s.b, pa: s.pa, pb: s.pb });
        mm.w = s.a > s.b || (s.a === s.b && s.pa > s.pb) ? mm.a : mm.b;
      }
      const winners = r.map((mm) => mm.w);
      if (!winners.includes(tr.user)) { tr.done = true; tr.champion = null; msg = 'ВЫ ВЫБЫЛИ. ПОПРОБУЙТЕ СНОВА!'; }
      if (winners.length === 1) {
        tr.done = true; tr.champion = winners[0];
        if (tr.champion === tr.user) { const prize = tr.size === 8 ? 3000 : 6000; SV().coins += prize; msg = 'ЧЕМПИОН! +' + prize + ' МОНЕТ'; PF.Audio.playMusic('win'); }
      } else if (!tr.done) {
        const nr = [];
        for (let i = 0; i < winners.length; i += 2) nr.push({ a: winners[i], b: winners[i + 1], sa: null, sb: null, pa: null, pb: null, w: null });
        tr.rounds.push(nr); tr.round++;
      }
      PF.Save.save();
    }
    function play() {
      const mm = myMatch();
      if (!mm) return;
      const tr = T();
      const side = mm.a === tr.user ? 0 : 1;
      launch(D.team(mm.a), D.team(mm.b), side, { diff: tr.diff, opts: { knockout: true } }, (res, m) => {
        mm.sa = res.hs; mm.sb = res.as; mm.pa = res.hp; mm.pb = res.ap;
        mm.w = res.winner === 0 ? mm.a : mm.b;
        finishRound();
        App.go(PF.PostMatchScreen(m, res, 'ТУРНИР: ' + ROUND_NAMES[tr.size][Math.min(tr.round, ROUND_NAMES[tr.size].length - 1)], () => App.go(cupHub(), 'replace')), 'replace');
      });
    }
    const menu = new UI.ListMenu([
      { label: 'ИГРАТЬ МАТЧ', action: () => { if (T().done) { SV().tournament = null; PF.Save.save(); App.pop(); } else play(); } },
      { label: 'СОСТАВ', action: () => { const tm = D.team(T().user); App.go(PF.Menus.lineup(tm, PF.Save.teamSetup(tm), (s) => PF.Save.setTeamSetup(tm.id, s))); } },
      { label: 'ПОКИНУТЬ', action: () => App.go(UI.confirm('Покинуть турнир? Прогресс будет потерян.', () => { SV().tournament = null; PF.Save.save(); App.pop(); })) },
    ]);
    return {
      enter() { PF.Audio.playMusic('menu'); },
      update(dt) {
        menu.items[0].label = T() && T().done ? 'ЗАВЕРШИТЬ' : 'ИГРАТЬ МАТЧ';
        menu.update(dt);
        if (I.pressed('back')) { PF.Audio.play('back'); App.go(PF.Menus.main(), 'reset'); }
      },
      render(ctx) {
        const tr = T();
        UI.bg(ctx, App.t);
        if (!tr) return;
        UI.header(ctx, 'ПИКСЕЛЬ КУБОК · ' + tr.size + ' КОМАНД', tr.done ? 'ЗАВЕРШЕН' : ROUND_NAMES[tr.size][tr.round]);
        // сетка
        const nR = Math.log2(tr.size);
        const colW = 290 / nR;
        for (let r = 0; r < nR; r++) {
          const round = tr.rounds[r];
          const n = tr.size / Math.pow(2, r + 1);
          const h = 150 / n;
          for (let i = 0; i < n; i++) {
            const x = 4 + r * colW, y = 22 + i * h + h / 2 - 9;
            const mm = round ? round[i] : null;
            ctx.fillStyle = '#05070d'; ctx.fillRect(x, y, colW - 8, 18);
            ctx.fillStyle = COL.panel; ctx.fillRect(x + 1, y + 1, colW - 10, 16);
            if (r < nR - 1) { ctx.fillStyle = COL.line; ctx.fillRect(x + colW - 8, y + 9, 8, 1); }
            if (!mm) continue;
            for (let k = 0; k < 2; k++) {
              const id = k ? mm.b : mm.a, tm = D.team(id), sc = k ? mm.sb : mm.sa, pen = k ? mm.pb : mm.pa;
              const me = id === tr.user;
              const lost = mm.w && mm.w !== id;
              F.draw(ctx, tm.short, x + 3, y + 2 + k * 8, me ? COL.accent2 : lost ? '#4a5478' : COL.text);
              if (sc != null) F.draw(ctx, sc + (pen != null && mm.sa === mm.sb ? '(' + pen + ')' : ''), x + colW - 12, y + 2 + k * 8, lost ? '#4a5478' : COL.text, 1, 2);
            }
          }
        }
        // кубок
        const cx = 330, cy = 60;
        ctx.fillStyle = COL.accent2; ctx.fillRect(cx, cy, 30, 6); ctx.fillRect(cx + 3, cy + 6, 24, 16); ctx.fillRect(cx - 5, cy + 4, 5, 10); ctx.fillRect(cx + 30, cy + 4, 5, 10);
        ctx.fillRect(cx + 12, cy + 22, 6, 8); ctx.fillStyle = '#c08a10'; ctx.fillRect(cx + 6, cy + 30, 18, 5);
        ctx.fillStyle = '#fff6c0'; ctx.fillRect(cx + 6, cy + 8, 3, 8);
        if (tr.champion) { const ch = D.team(tr.champion); ctx.drawImage(PF.Sprites.crest(ch, 1), cx + 8, cy + 40); F.draw(ctx, ch.short, cx + 15, cy + 58, COL.accent2, 1, 1); }
        if (msg || tr.done) F.draw(ctx, msg || (tr.champion === tr.user ? 'ВЫ - ЧЕМПИОН!' : 'ТУРНИР ЗАВЕРШЕН'), 192, 166, COL.accent2, 1, 1, '#000');
        const mm = !tr.done && myMatch();
        if (mm) F.draw(ctx, 'СЛЕДУЮЩИЙ МАТЧ: ' + D.team(mm.a).name + ' - ' + D.team(mm.b).name, 192, 166, COL.text, 1, 1);
        menu.render(ctx, 282, 128, 98, 11);
        UI.footer(ctx, [['J', 'ОК'], ['ESC', 'МЕНЮ']]);
      },
    };
  }

  // =====================================================================
  // КАРЬЕРА (мини-менеджер)
  // =====================================================================
  Modes.career = () => {
    if (SV().career) return careerHub();
    return teamPicker('КАРЬЕРА: ВЫБЕРИТЕ КЛУБ', (t) => {
      const lg = D.TEAMS.filter((x) => x.league === t.league).map((x) => x.id);
      SV().career = {
        club: t.id, league: t.league, season: 1, round: 0,
        budget: Math.round(800 + (90 - t.rating) * 120) * 10,
        squad: PF.Save.teamSetup(t).lineup.slice(),
        setup: PF.Save.teamSetup(t),
        fixtures: makeFixtures(lg), table: freshTable(lg), market: [], history: [], news: 'ДОБРО ПОЖАЛОВАТЬ В КЛУБ ' + t.name + '!',
      };
      refreshMarket();
      PF.Save.save();
      App.go(careerHub(), 'replace');
    });
  };
  function freshTable(ids) { const t = {}; for (const id of ids) t[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; return t; }
  // Двухкруговой турнир (метод круга)
  function makeFixtures(ids) {
    const n = ids.length, arr = ids.slice(), rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; games.push(r % 2 ? [b, a] : [a, b]); }
      rounds.push(games);
      arr.splice(1, 0, arr.pop());
    }
    return rounds.concat(rounds.map((g) => g.map(([a, b]) => [b, a])));
  }
  function playerValue(p) { return Math.round(Math.pow(Math.max(40, p.ovr) - 40, 2) * 0.4) * 10 + (p.age < 24 ? 300 : 0); }
  function refreshMarket() {
    const car = SV().career;
    const pool = Object.values(D.PLAYERS).filter((p) => !p.icon && D.team(p.team) && D.team(p.team).league !== car.league && !car.squad.includes(p.id));
    const r = D.team(car.club).rating;
    car.market = U.shuffle(pool.filter((p) => p.ovr >= r - 12 && p.ovr <= r + 6)).slice(0, 8).sort((a, b) => b.ovr - a.ovr).map((p) => p.id);
  }
  function careerSetupTeam() {
    const car = SV().career;
    const base = D.team(car.club);
    car.setup.lineup = car.squad.slice();
    return { team: base, setup: car.setup };
  }
  function recordResult(car, a, b, sa, sb) {
    const T = car.table;
    const A = T[a], B = T[b];
    A.p++; B.p++; A.gf += sa; A.ga += sb; B.gf += sb; B.ga += sa;
    if (sa > sb) { A.w++; B.l++; A.pts += 3; } else if (sa < sb) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  function sortedTable(car) {
    return Object.keys(car.table).sort((x, y) => {
      const a = car.table[x], b = car.table[y];
      return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
    });
  }
  function careerHub() {
    const car = () => SV().career;
    let msg = '';
    function myFixture() {
      const c = car();
      if (c.round >= c.fixtures.length) return null;
      return c.fixtures[c.round].find((g) => g.includes(c.club));
    }
    function completeRound(mySa, mySb) {
      const c = car();
      const games = c.fixtures[c.round];
      for (const g of games) {
        if (g.includes(c.club)) { recordResult(c, g[0], g[1], mySa, mySb); continue; }
        const s = simMatch(D.team(g[0]).rating, D.team(g[1]).rating, false);
        recordResult(c, g[0], g[1], s.a, s.b);
      }
      const my = c.club === games.find((g) => g.includes(c.club))[0] ? [mySa, mySb] : [mySb, mySa];
      const income = my[0] > my[1] ? 900 : my[0] === my[1] ? 450 : 200;
      c.budget += income;
      SV().coins += Math.round(income / 3);
      c.history.push(my[0] + ':' + my[1]);
      c.round++;
      c.news = (my[0] > my[1] ? 'ПОБЕДА! ' : my[0] === my[1] ? 'НИЧЬЯ. ' : 'ПОРАЖЕНИЕ. ') + 'ДОХОД +' + income + '. МЕСТО: ' + (sortedTable(c).indexOf(c.club) + 1);
      if (c.round >= c.fixtures.length) {
        const pos = sortedTable(c).indexOf(c.club) + 1;
        const bonus = [5000, 3000, 2000, 1200, 800, 600, 400, 300][pos - 1] || 300;
        c.news = pos === 1 ? 'ВЫ ЧЕМПИОН ЛИГИ! ПРЕМИЯ ' + bonus : 'СЕЗОН ЗАВЕРШЕН. МЕСТО ' + pos + '. ПРЕМИЯ ' + bonus;
        c.budget += bonus; SV().coins += Math.round(bonus / 2);
        c.finished = true;
        if (pos === 1) PF.Audio.playMusic('win');
      }
      refreshMarket();
      PF.Save.save();
    }
    function play(sim) {
      const c = car(), g = myFixture();
      if (!g) return;
      if (sim) {
        const avg = Math.round(c.squad.slice(0, 11).reduce((s, id) => s + D.PLAYERS[id].ovr, 0) / 11);
        const isHome = g[0] === c.club;
        const s = isHome ? simMatch(avg + 2, D.team(g[1]).rating, false) : simMatch(D.team(g[0]).rating + 2, avg, false);
        completeRound(s.a, s.b);
        msg = 'СИМУЛЯЦИЯ: ' + D.team(g[0]).short + ' ' + s.a + ':' + s.b + ' ' + D.team(g[1]).short;
        return;
      }
      const side = g[0] === c.club ? 0 : 1;
      const mine = careerSetupTeam();
      const extra = side === 0 ? { homeSetup: mine.setup } : { awaySetup: mine.setup };
      launch(D.team(g[0]), D.team(g[1]), side, extra, (res, m) => {
        completeRound(res.hs, res.as);
        App.go(PF.PostMatchScreen(m, res, 'КАРЬЕРА · ТУР ' + car().round, () => App.go(careerHub(), 'replace')), 'replace');
      });
    }
    const menu = new UI.ListMenu([
      { label: 'ИГРАТЬ МАТЧ', action: () => { if (car().finished) newSeason(); else play(false); } },
      { label: 'СИМУЛИРОВАТЬ', action: () => { if (!car().finished) play(true); } },
      { label: 'СОСТАВ', action: () => { const m = careerSetupTeam(); App.go(PF.Menus.lineup(m.team, m.setup, (s) => { car().setup = s; car().squad = s.lineup.slice(); PF.Save.save(); })); } },
      { label: 'ТРАНСФЕРЫ', action: () => App.go(transfers()) },
      { label: 'УВОЛИТЬСЯ', action: () => App.go(UI.confirm('Завершить карьеру? Сохранение карьеры будет удалено.', () => { SV().career = null; PF.Save.save(); App.go(PF.Menus.main(), 'reset'); })) },
    ]);
    function newSeason() {
      const c = car();
      const lg = Object.keys(c.table);
      c.season++; c.round = 0; c.finished = false; c.table = freshTable(lg); c.fixtures = makeFixtures(U.shuffle(lg.slice())); c.history = [];
      // игроки растут/стареют
      c.news = 'НОВЫЙ СЕЗОН ' + c.season + '! БЮДЖЕТ ' + U.fmtCoins(c.budget);
      PF.Save.save();
    }
    function transfers() {
      let sel = 0, choosing = null, sub = 0;
      return {
        update(dt) {
          const c = car();
          const d = I.menuDir(dt);
          if (!choosing) {
            if (d.dy) { sel = (sel + d.dy + c.market.length) % c.market.length; PF.Audio.play('move'); }
            if (I.pressed('ok')) {
              const p = D.PLAYERS[c.market[sel]];
              if (playerValue(p) > c.budget) { PF.Audio.play('back'); msg = 'НЕ ХВАТАЕТ БЮДЖЕТА'; }
              else { choosing = p; sub = 11; PF.Audio.play('select'); }
            }
            if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
          } else {
            if (d.dy) { sub = (sub + d.dy + c.squad.length) % c.squad.length; PF.Audio.play('move'); }
            if (I.pressed('ok')) {
              const out = D.PLAYERS[c.squad[sub]];
              const price = playerValue(choosing), sale = Math.round(playerValue(out) * 0.6);
              c.budget += sale - price;
              c.squad[sub] = choosing.id;
              c.market = c.market.filter((id) => id !== choosing.id);
              c.setup.lineup = c.squad.slice();
              msg = 'КУПЛЕН ' + choosing.name + ' ЗА ' + price + '. ПРОДАН ' + out.name + ' ЗА ' + sale;
              PF.Audio.play('coin');
              choosing = null; sel = 0;
              PF.Save.save();
              if (!c.market.length) App.pop();
            }
            if (I.pressed('back')) { choosing = null; PF.Audio.play('back'); }
          }
        },
        render(ctx) {
          const c = car();
          UI.bg(ctx, App.t);
          UI.header(ctx, choosing ? 'КОГО ПРОДАТЬ ВЗАМЕН?' : 'ТРАНСФЕРНЫЙ РЫНОК', 'БЮДЖЕТ ' + U.fmtCoins(c.budget));
          const list = choosing ? c.squad : c.market;
          const cur = choosing ? sub : sel;
          UI.panel(ctx, 8, 22, 230, 178, choosing ? 'ВАШ СОСТАВ' : 'ДОСТУПНЫЕ ИГРОКИ', COL.line);
          const start = Math.max(0, Math.min(cur - 7, list.length - 15));
          list.slice(start, start + 15).forEach((id, k) => {
            const i = start + k, p = D.PLAYERS[id], y = 34 + k * 11, on = i === cur;
            if (on) { ctx.fillStyle = COL.panel2; ctx.fillRect(10, y - 1, 226, 10); }
            F.draw(ctx, p.pos, 14, y, COL.dim);
            F.draw(ctx, p.name, 44, y, on ? COL.text : COL.dim);
            F.draw(ctx, String(p.ovr), 160, y, UI.statColor(p.ovr), 1, 2);
            F.draw(ctx, U.fmtCoins(choosing ? Math.round(playerValue(p) * 0.6) : playerValue(p)), 232, y, playerValue(p) > c.budget && !choosing ? COL.red : COL.accent2, 1, 2);
          });
          const p = D.PLAYERS[list[cur]];
          if (p) drawCard(ctx, p, 268, 30, 1);
          if (choosing) F.draw(ctx, 'ПОКУПКА: ' + choosing.name + ' (' + choosing.ovr + ')', 246, 120, COL.accent2);
          if (msg) F.wrap(msg, 130).forEach((l, i) => F.draw(ctx, l, 246, 140 + i * 9, COL.text));
          UI.footer(ctx, [['J', choosing ? 'ПРОДАТЬ' : 'КУПИТЬ'], ['ESC', 'НАЗАД']]);
        },
      };
    }
    return {
      enter() { PF.Audio.playMusic('menu'); },
      resume() { PF.Audio.playMusic('menu'); },
      update(dt) {
        menu.items[0].label = car() && car().finished ? 'НОВЫЙ СЕЗОН' : 'ИГРАТЬ МАТЧ';
        menu.items[1].disabled = !!(car() && car().finished);
        menu.update(dt);
        if (I.pressed('back')) { PF.Audio.play('back'); App.go(PF.Menus.main(), 'reset'); }
      },
      render(ctx) {
        const c = car();
        UI.bg(ctx, App.t);
        if (!c) return;
        const club = D.team(c.club);
        UI.header(ctx, 'КАРЬЕРА: ' + club.name, 'СЕЗОН ' + c.season + ' · ТУР ' + Math.min(c.round + 1, c.fixtures.length) + '/' + c.fixtures.length);
        // таблица
        UI.panel(ctx, 6, 22, 220, 110, D.LEAGUES[c.league].name, COL.line);
        F.draw(ctx, 'И  В  Н  П  РМ  О', 220, 34, COL.dim, 1, 2);
        sortedTable(c).forEach((id, i) => {
          const r = c.table[id], tm = D.team(id), y = 44 + i * 11, me = id === c.club;
          if (me) { ctx.fillStyle = '#1d3a6a'; ctx.fillRect(7, y - 2, 218, 11); }
          F.draw(ctx, (i + 1) + '.', 10, y, COL.dim);
          ctx.drawImage(PF.Sprites.crest(tm, 1), 22, y - 4, 7, 8);
          F.draw(ctx, tm.name.slice(0, 15), 32, y, me ? COL.accent2 : COL.text);
          const gd = r.gf - r.ga;
          F.draw(ctx, [r.p, r.w, r.d, r.l].map((v) => String(v).padStart(2, ' ')).join(' ') + ' ' + (gd > 0 ? '+' : '') + gd + ' ' + String(r.pts).padStart(2, ' '), 220, y, me ? COL.accent2 : COL.text, 1, 2);
        });
        // следующий матч
        UI.panel(ctx, 6, 138, 220, 50, c.finished ? 'СЕЗОН ЗАВЕРШЕН' : 'СЛЕДУЮЩИЙ МАТЧ', '#1d3a8a');
        const g = myFixture();
        if (g) {
          const a = D.team(g[0]), b = D.team(g[1]);
          ctx.drawImage(PF.Sprites.crest(a, 1), 14, 152);
          ctx.drawImage(PF.Sprites.crest(b, 1), 204, 152);
          F.draw(ctx, a.short + '  -  ' + b.short, 116, 156, COL.text, 1, 1);
          F.draw(ctx, g[0] === c.club ? 'ДОМА' : 'В ГОСТЯХ', 116, 167, COL.dim, 1, 1);
        }
        F.draw(ctx, (msg || c.news).slice(0, 36), 116, 178, COL.accent2, 1, 1);
        // меню + бюджет
        UI.panel(ctx, 232, 22, 146, 166, 'ОФИС ТРЕНЕРА', COL.line);
        F.draw(ctx, 'БЮДЖЕТ', 238, 34, COL.dim); F.draw(ctx, U.fmtCoins(c.budget), 372, 34, COL.accent2, 1, 2);
        const avg = Math.round(c.squad.slice(0, 11).reduce((s, id) => s + D.PLAYERS[id].ovr, 0) / 11);
        F.draw(ctx, 'РЕЙТИНГ', 238, 44, COL.dim); F.draw(ctx, String(avg), 372, 44, COL.accent, 1, 2);
        F.draw(ctx, 'ФОРМА', 238, 54, COL.dim);
        c.history.slice(-5).forEach((h, i) => { const [x, y] = h.split(':').map(Number); ctx.fillStyle = x > y ? COL.accent : x === y ? COL.accent2 : COL.red; ctx.fillRect(310 + i * 12, 55, 9, 6); });
        menu.render(ctx, 238, 70, 134, 13);
        UI.footer(ctx, [['J', 'ОК'], ['ESC', 'МЕНЮ']]);
      },
    };
  }

  // =====================================================================
  // ЗВЁЗДНЫЙ СОСТАВ (паки, карточки, сборка состава)
  // =====================================================================
  const RAR_COL = { bronze: ['#8a5530', '#c08050', '#f0c090'], silver: ['#7a8494', '#c8d0dc', '#ffffff'], gold: ['#a07a10', '#ffcf40', '#fff0a0'], icon: ['#5a2a8a', '#d070ff', '#ffffff'] };
  const cardCache = new Map();
  // Пиксельная карточка игрока 40x56 (scale — множитель)
  function drawCard(ctx, p, x, y, scale) {
    const key = p.id;
    let c = cardCache.get(key);
    if (!c) {
      c = U.makeCanvas(40, 56);
      const g = c.getContext('2d');
      const r = D.rarity(p), col = RAR_COL[r];
      g.fillStyle = '#140f1c'; g.fillRect(1, 0, 38, 56); g.fillRect(0, 1, 40, 54);
      for (let yy = 1; yy < 55; yy++) { g.fillStyle = U.mix(col[2], col[0], yy / 55); g.fillRect(1, yy, 38, 1); }
      g.fillStyle = col[1]; g.fillRect(2, 2, 36, 1);
      // узор
      g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) g.fillRect(22 + i * 2, 3 + i * 3, 14 - i * 2, 1);
      F.draw(g, String(p.ovr), 4, 3, '#140f1c');
      F.draw(g, p.pos, 4, 12, '#140f1c');
      const team = D.team(p.team);
      const kit = team ? team.kit.home : { p: '#e8ecf8', s: '#5a2a8a', pat: 'plain', shorts: '#5a2a8a', socks: '#5a2a8a' };
      g.drawImage(PF.Sprites.portrait(p, p.role === 'GK' ? Object.assign({}, kit, { gk: true, p: '#30c050' }) : kit), 0, 0, 30, 22, 16, 3, 22, 17);
      g.fillStyle = 'rgba(20,15,28,0.85)'; g.fillRect(2, 21, 36, 9);
      const nm = p.name.length > 7 ? p.name.slice(0, 7) : p.name;
      F.draw(g, nm, 20, 22, '#ffffff', 1, 1);
      const keys = p.role === 'GK' ? [['ВРТ', 'gk'], ['ФИЗ', 'phy'], ['ПАС', 'pas'], ['СКР', 'spd']] : [['СКР', 'spd'], ['УДР', 'sho'], ['ПАС', 'pas'], ['ДРБ', 'dri'], ['ЗАЩ', 'def'], ['ФИЗ', 'phy']];
      keys.forEach((k, i) => {
        const xx = 3 + (i % 2) * 19, yy = 32 + Math.floor(i / 2) * 7;
        F.drawSmall(g, String(p.stats[k[1]]), xx, yy, '#140f1c');
        g.fillStyle = 'rgba(20,15,28,0.55)'; g.fillRect(xx + 9, yy + 2, 8, 1);
      });
      if (p.icon) F.draw(g, '*', 31, 47, '#ffffff');
      cardCache.set(key, c);
    }
    const s = scale || 1;
    ctx.drawImage(c, Math.round(x), Math.round(y), 40 * s, 56 * s);
  }
  Modes.drawCard = drawCard;
  // Компактная карточка 30x18 для схемы состава
  function drawMini(ctx, p, x, y) {
    const col = RAR_COL[D.rarity(p)];
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#140f1c'; ctx.fillRect(x - 1, y - 1, 32, 20);
    ctx.fillStyle = col[1]; ctx.fillRect(x, y, 30, 18);
    ctx.fillStyle = col[2]; ctx.fillRect(x, y, 30, 1);
    ctx.fillStyle = 'rgba(20,15,28,0.8)'; ctx.fillRect(x, y + 9, 30, 9);
    F.drawSmall(ctx, String(p.ovr), x + 2, y + 2, '#140f1c');
    F.draw(ctx, p.pos.slice(0, 3), x + 28, y + 1, '#140f1c', 1, 2);
    F.draw(ctx, p.name.slice(0, 5), x + 15, y + 10, '#ffffff', 1, 1);
  }
  Modes.drawMini = drawMini;

  function rollRarity(odds) {
    let r = Math.random();
    for (const k of ['icon', 'gold', 'silver', 'bronze']) { if (r < odds[k]) return k; r -= odds[k]; }
    return 'bronze';
  }
  function randomCard(rar) {
    if (rar === 'icon') return U.pick(D.ICONS);
    const pool = Object.values(D.PLAYERS).filter((p) => !p.icon && D.rarity(p) === rar);
    return U.pick(pool);
  }
  function ensureClub() {
    const S = SV();
    if (S.club) return S.club;
    // стартовый набор: 2 вратаря + 16 полевых бронза/серебро
    const cards = [];
    const add = (p) => { if (!cards.includes(p.id)) cards.push(p.id); };
    const pool = Object.values(D.PLAYERS).filter((p) => !p.icon && p.ovr < 72);
    const by = (role, n) => { const a = U.shuffle(pool.filter((p) => p.role === role).slice()); for (let i = 0; i < n; i++) add(a[i]); };
    by('GK', 2); by('DEF', 6); by('MID', 6); by('FWD', 4);
    const lineup = [];
    const roles = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'];
    const left = cards.slice();
    for (const r of roles) { const i = left.findIndex((id) => D.PLAYERS[id].role === r); lineup.push(left[i]); left.splice(i, 1); }
    S.club = { name: 'ЗВЕЗДНЫЙ КЛУБ', cards, lineup: lineup.concat(left).slice(0, 18), formation: '4-4-2', press: 1, width: 1, line: 1, played: 0, won: 0 };
    PF.Save.save();
    return S.club;
  }
  function clubTeamDef() {
    const club = ensureClub();
    return {
      id: 'club', name: club.name, short: 'ЗВК', league: 0, style: 'en', rating: 75,
      kit: { home: { p: '#ffcf40', s: '#1a1a1a', pat: 'sleeves', shorts: '#1a1a1a', socks: '#ffcf40' }, away: { p: '#1a1a1a', s: '#ffcf40', pat: 'plain', shorts: '#1a1a1a', socks: '#1a1a1a' } },
      crest: { shape: 1, band: 2 }, formation: club.formation, tactics: { press: club.press, width: club.width, line: club.line },
      squad: club.lineup.map((id) => D.PLAYERS[id]),
    };
  }
  Modes.squad = () => {
    ensureClub();
    let msg = '';
    const menu = new UI.ListMenu([
      { label: 'ИГРАТЬ МАТЧ', hint: 'ПОБЕДА ' + C.COINS_WIN + ', НИЧЬЯ ' + C.COINS_DRAW + ', ПОРАЖЕНИЕ ' + C.COINS_LOSS + ' + ' + C.COINS_GOAL + ' ЗА ГОЛ', action: () => playUT() },
      { label: 'МАГАЗИН ПАКОВ', action: () => App.go(packShop()) },
      { label: 'СОСТАВ И ТАКТИКА', action: () => { const club = SV().club; const def = clubTeamDef(); App.go(PF.Menus.lineup(def, { formation: club.formation, press: club.press, width: club.width, line: club.line, lineup: club.lineup.slice() }, (s) => { Object.assign(club, { formation: s.formation, press: s.press, width: s.width, line: s.line, lineup: s.lineup }); PF.Save.save(); })); } },
      { label: 'КОЛЛЕКЦИЯ', action: () => App.go(collection()) },
      { label: 'НАЗАД', action: () => App.pop() },
    ], { hintY: 196, hintX: 8 });
    function playUT() {
      const club = SV().club;
      if (club.lineup.length < 11) { msg = 'НУЖНО 11 ИГРОКОВ В СОСТАВЕ'; return; }
      const def = clubTeamDef();
      const avg = Math.round(club.lineup.slice(0, 11).reduce((s, id) => s + D.PLAYERS[id].ovr, 0) / 11);
      const opp = U.pick(D.TEAMS.filter((t) => Math.abs(t.rating - avg) < 6)) || U.pick(D.TEAMS);
      const setup = { formation: club.formation, press: club.press, width: club.width, line: club.line, lineup: club.lineup };
      launch(def, opp, 0, { homeSetup: setup }, (res, m) => {
        const gf = res.hs, ga = res.as;
        const reward = (gf > ga ? C.COINS_WIN : gf === ga ? C.COINS_DRAW : C.COINS_LOSS) + gf * C.COINS_GOAL;
        SV().coins += reward; club.played++; if (gf > ga) club.won++;
        PF.Save.save();
        App.go(PF.PostMatchScreen(m, res, 'ЗВЕЗДНЫЙ СОСТАВ: +' + reward + ' МОНЕТ', () => App.go(Modes.squad(), 'replace')), 'replace');
      });
    }
    return {
      enter() { PF.Audio.playMusic('menu'); },
      resume() { PF.Audio.playMusic('menu'); },
      update(dt) { menu.update(dt); if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); } },
      render(ctx) {
        const club = SV().club;
        UI.bg(ctx, App.t);
        UI.header(ctx, 'ЗВЕЗДНЫЙ СОСТАВ');
        UI.coins(ctx, SV().coins, C.W - 6, 5, 2);
        menu.render(ctx, 8, 26, 130, 14);
        // состав в виде карточек
        const slots = PF.FORMATIONS[club.formation];
        UI.panel(ctx, 146, 22, 232, 172, club.formation + '  ·  ' + 'МАТЧЕЙ ' + club.played + ', ПОБЕД ' + club.won, '#6a2a8a');
        ctx.fillStyle = '#2f7a34'; ctx.fillRect(148, 33, 228, 160);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(148, 113, 228, 1);
        slots.forEach((sl, i) => {
          const p = D.PLAYERS[club.lineup[i]];
          if (!p) return;
          // вертикальное поле: свои ворота внизу
          const x = 148 + sl.fy * 196 + 2, y = 33 + (1 - Math.min(1, sl.fx * 1.45)) * 118;
          drawMini(ctx, p, x, y + 8);
        });
        const avg = Math.round(club.lineup.slice(0, 11).reduce((s, id) => s + D.PLAYERS[id].ovr, 0) / 11);
        F.draw(ctx, 'РЕЙТИНГ ' + avg, 8, 108, COL.accent2);
        F.draw(ctx, 'КАРТОЧЕК ' + club.cards.length, 8, 118, COL.dim);
        if (msg) F.draw(ctx, msg, 8, 130, COL.red);
        UI.footer(ctx, [['J', 'ОК'], ['ESC', 'НАЗАД']]);
      },
    };
  };
  function packShop() {
    let sel = 0;
    return {
      update(dt) {
        const d = I.menuDir(dt);
        if (d.dx || d.dy) { sel = (sel + (d.dx || d.dy) + C.PACKS.length) % C.PACKS.length; PF.Audio.play('move'); }
        if (I.pressed('ok')) {
          const pk = C.PACKS[sel];
          if (SV().coins < pk.price) { PF.Audio.play('back'); this.msg = 'НЕДОСТАТОЧНО МОНЕТ'; return; }
          SV().coins -= pk.price;
          const cards = [];
          for (let i = 0; i < pk.n; i++) cards.push(randomCard(rollRarity(pk.odds)));
          cards.sort((a, b) => a.ovr - b.ovr);
          PF.Save.save();
          App.go(packOpen(pk, cards));
        }
        if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'МАГАЗИН ПАКОВ');
        UI.coins(ctx, SV().coins, C.W - 6, 5, 2);
        C.PACKS.forEach((pk, i) => {
          const x = 14 + i * 92, y = 34, on = sel === i;
          const col = RAR_COL[pk.id === 'prime' ? 'icon' : pk.id];
          ctx.fillStyle = on ? COL.accent : '#05070d'; ctx.fillRect(x - 2, y - 2, 84, 124);
          for (let yy = 0; yy < 120; yy++) { ctx.fillStyle = U.mix(col[2], col[0], yy / 120); ctx.fillRect(x, y + yy, 80, 1); }
          ctx.fillStyle = 'rgba(20,15,28,0.35)'; ctx.fillRect(x + 8, y + 20 + (on ? Math.round(Math.sin(App.t * 4) * 2) : 0), 64, 60);
          F.draw(ctx, 'ПАК', x + 40, y + 36, '#ffffff', 2, 1, '#140f1c');
          F.draw(ctx, pk.n + ' КАРТ', x + 40, y + 60, '#ffffff', 1, 1, '#140f1c');
          F.draw(ctx, pk.name, x + 40, y + 88, '#140f1c', 1, 1);
          UI.coins(ctx, pk.price, x + 18, y + 104);
        });
        const pk = C.PACKS[sel];
        const o = pk.odds;
        F.draw(ctx, 'ШАНСЫ: БРОНЗА ' + Math.round(o.bronze * 100) + '%  СЕРЕБРО ' + Math.round(o.silver * 100) + '%  ЗОЛОТО ' + Math.round(o.gold * 100) + '%  ИКОНА ' + Math.round(o.icon * 100) + '%', 192, 168, COL.dim, 1, 1);
        if (this.msg) F.draw(ctx, this.msg, 192, 180, COL.red, 1, 1);
        UI.footer(ctx, [['◄►', 'ПАК'], ['J', 'КУПИТЬ'], ['ESC', 'НАЗАД']]);
      },
    };
  }
  // Анимация открытия пака: карточки по одной, редкие — со вспышкой
  function packOpen(pk, cards) {
    let i = -1, t = 0, flash = 0;
    const results = [];
    const club = SV().club;
    function reveal() {
      i++; t = 0;
      if (i >= cards.length) return;
      const p = cards[i];
      const r = D.rarity(p);
      const dup = club.cards.includes(p.id);
      if (dup) { const v = { bronze: 80, silver: 200, gold: 600, icon: 3000 }[r]; SV().coins += v; results.push({ p, dup: v }); }
      else { club.cards.push(p.id); results.push({ p }); }
      if (club.lineup.length < 18 && !dup) club.lineup.push(p.id);
      PF.Save.save();
      const lvl = { bronze: 0, silver: 1, gold: 2, icon: 3 }[r];
      PF.Audio.play('pack', lvl);
      if (lvl >= 2) { flash = 1; }
    }
    return {
      enter() { reveal(); },
      update(dt) {
        t += dt; flash = Math.max(0, flash - dt * 1.5);
        if (I.pressed('ok')) {
          if (i < cards.length - 1) reveal();
          else App.pop();
        }
        if (I.pressed('back')) { while (i < cards.length - 1) reveal(); App.pop(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'ОТКРЫТИЕ ПАКА: ' + pk.name, (i + 1) + '/' + cards.length);
        const cur = results[i];
        if (cur) {
          const r = D.rarity(cur.p);
          // лучи для редких
          if (r === 'gold' || r === 'icon') {
            ctx.fillStyle = r === 'icon' ? 'rgba(208,112,255,0.18)' : 'rgba(255,207,64,0.18)';
            for (let k = 0; k < 12; k++) {
              const a = k / 12 * Math.PI * 2 + App.t;
              for (let d = 20; d < 120; d += 3) ctx.fillRect(Math.round(192 + Math.cos(a) * d), Math.round(92 + Math.sin(a) * d * 0.7), 3, 3);
            }
          }
          const sc = Math.min(2, 0.3 + t * 5);
          const w = 40 * sc;
          drawCard(ctx, cur.p, 192 - w / 2, 92 - 28 * sc, sc);
          F.draw(ctx, cur.p.first + ' ' + cur.p.name, 192, 156, '#ffffff', 1, 1, '#000');
          F.draw(ctx, { bronze: 'БРОНЗА', silver: 'СЕРЕБРО', gold: 'ЗОЛОТО', icon: 'ИКОНА!' }[r] + (cur.dup ? '  ·  ДУБЛИКАТ: +' + cur.dup + ' МОНЕТ' : '  ·  НОВАЯ КАРТОЧКА'), 192, 166, cur.dup ? COL.dim : COL.accent2, 1, 1);
        }
        // уже открытые
        results.slice(0, i).forEach((res, k) => drawMini(ctx, res.p, 8 + k * 34, 176));
        if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.8 + ')'; ctx.fillRect(0, 0, C.W, C.H); }
        UI.footer(ctx, [['J', i < cards.length - 1 ? 'СЛЕДУЮЩАЯ' : 'ГОТОВО'], ['ESC', 'ОТКРЫТЬ ВСЕ']]);
      },
    };
  }
  function collection() {
    let sel = 0;
    const club = SV().club;
    const list = () => club.cards.slice().sort((a, b) => D.PLAYERS[b].ovr - D.PLAYERS[a].ovr);
    return {
      update(dt) {
        const L = list();
        const d = I.menuDir(dt);
        if (d.dx) sel = (sel + d.dx + L.length) % L.length;
        if (d.dy) sel = U.clamp(sel + d.dy * 7, 0, L.length - 1);
        if (d.dx || d.dy) PF.Audio.play('move');
        if (I.pressed('ok')) {
          // быстрая продажа (если не в составе)
          const id = L[sel];
          if (club.lineup.includes(id)) { this.msg = 'ИГРОК В СОСТАВЕ - СНАЧАЛА ЗАМЕНИТЕ'; PF.Audio.play('back'); }
          else {
            const p = D.PLAYERS[id];
            const v = { bronze: 80, silver: 200, gold: 600, icon: 3000 }[D.rarity(p)];
            club.cards = club.cards.filter((x) => x !== id); SV().coins += v; PF.Save.save();
            this.msg = 'ПРОДАН ' + p.name + ' ЗА ' + v; PF.Audio.play('coin');
            sel = Math.min(sel, club.cards.length - 1);
          }
        }
        if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
      },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'КОЛЛЕКЦИЯ: ' + club.cards.length + ' КАРТ', 'J - ПРОДАТЬ');
        UI.coins(ctx, SV().coins, C.W - 74, 5, 2);
        const L = list();
        const row = Math.floor(sel / 7), start = Math.max(0, row - 1) * 7;
        L.slice(start, start + 21).forEach((id, k) => {
          const i = start + k, x = 10 + (k % 7) * 53, y = 22 + Math.floor(k / 7) * 58;
          if (i === sel) { ctx.fillStyle = COL.accent; ctx.fillRect(x - 2, y - 2, 44, 60); }
          drawCard(ctx, D.PLAYERS[id], x, y, 1);
          if (club.lineup.includes(id)) { ctx.fillStyle = COL.accent; ctx.fillRect(x + 34, y + 50, 4, 4); }
        });
        if (this.msg) F.draw(ctx, this.msg, 192, 196, COL.accent2, 1, 1, '#000');
        UI.footer(ctx, [['СТРЕЛКИ', 'ВЫБОР'], ['J', 'ПРОДАТЬ'], ['ESC', 'НАЗАД']]);
      },
    };
  }

  // =====================================================================
  // ТРЕНИРОВКА
  // =====================================================================
  Modes.training = () => {
    const q = SV().quick;
    let ti = Math.max(0, D.TEAMS.findIndex((t) => t.id === q.home));
    const start = (mode) => {
      const team = D.TEAMS[ti];
      const opp = D.TEAMS[(ti + 9) % D.TEAMS.length];
      const s = PF.Save.teamSetup(team);
      App.go(PF.MatchScreen({ home: team, away: opp, human: 0, mode, diff: st().diff, homeLineup: s.lineup, homeFormation: s.formation, homeTactics: s }, () => App.pop()));
    };
    const menu = new UI.ListMenu([
      { label: 'КОМАНДА', value: () => D.TEAMS[ti].short, left: () => { ti = (ti + D.TEAMS.length - 1) % D.TEAMS.length; }, right: () => { ti = (ti + 1) % D.TEAMS.length; } },
      { label: 'СВОБОДНАЯ ИГРА', hint: 'ВАША КОМАНДА ПРОТИВ ВРАТАРЯ. ОТРАБАТЫВАЙТЕ ПАСЫ И УДАРЫ.', action: () => start('training') },
      { label: 'ШТРАФНЫЕ УДАРЫ', hint: 'СТЕНКА И ВРАТАРЬ. ▲▼ ПРИЦЕЛ, L - УДАР С ЗАКРУТКОЙ.', action: () => start('freekick') },
      { label: 'НАЗАД', action: () => App.pop() },
    ], { hintY: 150, hintX: 192 - 140 });
    menu.sel = 1;
    return {
      enter() { PF.Audio.playMusic('menu'); },
      resume() { PF.Audio.playMusic('menu'); },
      update(dt) { menu.update(dt); if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); } },
      render(ctx) {
        UI.bg(ctx, App.t);
        UI.header(ctx, 'ТРЕНИРОВКА', 'ESC В ИГРЕ - ВЫХОД');
        UI.panel(ctx, 52, 30, 280, 136, 'ТРЕНИРОВОЧНЫЙ ЦЕНТР', '#2a6a6a');
        ctx.drawImage(PF.Sprites.crest(D.TEAMS[ti], 2), 62, 46);
        F.draw(ctx, D.TEAMS[ti].name, 96, 52, COL.text);
        UI.stars(ctx, D.TEAMS[ti].rating, 96, 62);
        menu.render(ctx, 62, 84, 260, 13);
        UI.footer(ctx, [['J', 'ОК'], ['ESC', 'НАЗАД']]);
      },
    };
  };

  PF.Modes = Modes;
})(window.PF);
