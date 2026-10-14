'use strict';
// Церемонии и пресса: награждение лучшего игрока матча, вручение трофея чемпиону,
// индивидуальные награды сезона и пресс-конференции тренера (вопросы с вариантами ответа).
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL, I = PF.Input, UI = PF.UI, S = PF.Sprites;
  const Cer = {};

  // ---------- Частицы экрана: конфетти и салют (пул без аллокаций в кадре) ----------
  const PN = 260, parts = [];
  for (let i = 0; i < PN; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, col: '#fff', g: 0 });
  let pc = 0;
  const CONF = ['#ff4f5e', '#ffd23c', '#3cf0a0', '#4fa3ff', '#ffffff', '#d070ff'];
  function spawn(x, y, vx, vy, life, col, g) { const p = parts[pc]; pc = (pc + 1) % PN; p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.col = col; p.g = g; }
  function confetti(n) { for (let i = 0; i < n; i++) spawn(Math.random() * C.W, -4 - Math.random() * 30, (Math.random() - 0.5) * 20, 20 + Math.random() * 30, 4 + Math.random() * 2, CONF[i % CONF.length], 6); }
  function firework(x, y) { const col = U.pick(CONF); for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; spawn(x, y, Math.cos(a) * 45, Math.sin(a) * 45, 0.9 + Math.random() * 0.4, col, 40); } PF.Audio.play('pass'); }
  function updParts(dt) { for (const p of parts) { if (!p.on) continue; p.life -= dt; if (p.life <= 0) { p.on = false; continue; } p.vy += p.g * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; } }
  function drawParts(ctx) { for (const p of parts) { if (!p.on) continue; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x | 0, p.y | 0, 2, 2); } ctx.globalAlpha = 1; }
  function clearParts() { for (const p of parts) p.on = false; }

  // ---------- Сцена: ночной стадион, вспышки фотокамер, лучи прожекторов ----------
  let crowd = null;
  function stage(ctx, t) {
    for (let y = 0; y < C.H; y++) { ctx.fillStyle = U.mix('#0a1030', '#05070d', y / C.H); ctx.fillRect(0, y, C.W, 1); }
    if (!crowd) {
      crowd = U.makeCanvas(C.W, 80);
      const c = crowd.getContext('2d'), r = new U.RNG(9);
      for (let y = 0; y < 80; y += 5) for (let x = (y / 5 & 1) * 2; x < C.W; x += 4) {
        c.fillStyle = r.pick(['#3a2a4a', '#2a3a5a', '#4a2a2a', '#2a4a3a', '#5a5a6a']); c.fillRect(x, y + 2, 3, 3);
        c.fillStyle = '#6a5a5a'; c.fillRect(x, y, 2, 2);
      }
    }
    ctx.drawImage(crowd, 0, 40);
    // вспышки камер
    for (let i = 0; i < 6; i++) { const k = Math.floor(t * 7 + i * 13.7); const x = (k * 97) % C.W, y = 42 + (k * 53) % 70; if ((k + i) % 3 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 2, 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - 1, y - 1, 4, 4); } }
    // газон
    ctx.fillStyle = '#2f7a34'; ctx.fillRect(0, 150, C.W, 66);
    for (let x = 0; x < C.W; x += 32) { ctx.fillStyle = '#368a35'; ctx.fillRect(x, 150, 16, 66); }
    // лучи прожекторов
    ctx.fillStyle = 'rgba(255,250,210,0.06)';
    for (const [x0, x1] of [[40, 170], [344, 214]]) for (let y = 0; y < 170; y += 2) { const k = y / 170; ctx.fillRect(Math.round(U.lerp(x0, x1, k)) - 4 - k * 30, y, 8 + k * 60, 2); }
  }
  // Спрайт игрока в увеличении (целый коэффициент — без размытия)
  function bigPlayer(ctx, sheet, pose, dir, x, y, sc) {
    ctx.drawImage(sheet.canvas, pose * 24, dir * 24, 24, 24, Math.round(x - 12 * sc), Math.round(y - 23 * sc), 24 * sc, 24 * sc);
  }
  // Кубок
  function trophy(ctx, x, y, s, col) {
    const c1 = col || COL.gold, c2 = U.shade(c1, -0.3);
    const r = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + a * s), Math.round(y + b * s), Math.ceil(w * s), Math.ceil(h * s)); };
    r(-6, -16, 12, 2, c1); r(-5, -14, 10, 6, c1); r(-4, -8, 8, 2, c2); r(-8, -15, 2, 5, c1); r(6, -15, 2, 5, c1);
    r(-1, -6, 2, 3, c2); r(-4, -3, 8, 3, c1); r(-5, 0, 10, 1, c2); r(-3, -13, 2, 4, '#fff6c0');
  }
  Cer.trophy = trophy;
  function kitOf(team) { return team && team.kit ? team.kit.home : { p: '#e8ecf8', s: '#5a2a8a', pat: 'plain', shorts: '#5a2a8a', socks: '#5a2a8a' }; }

  // ============================================================
  // Лучший игрок матча
  // ============================================================
  Cer.motm = (m, onDone) => {
    const best = m.finalRatings()[0];
    const kit = best.isGK ? best.team.gkKit : best.team.kit;
    const sheet = S.sheetFor(kit, best.def.skin, best.def.hair, S.lookOf(best.def));
    const mine = best.team.human;
    const reward = mine ? 150 : 0;
    let t = 0, paid = false;
    const s = best.st;
    const line = best.isGK ? 'СЕЙВЫ ' + s.saves + '  ·  ПРОПУЩЕНО ' + s.conceded
      : 'ГОЛЫ ' + s.goals + '  ·  ПЕРЕДАЧИ ' + s.assists + '  ·  УДАРЫ ' + s.shots + '  ·  ОТБОРЫ ' + s.tackles;
    return {
      enter() { clearParts(); confetti(80); PF.Audio.play('goal'); },
      update(dt) {
        t += dt; updParts(dt);
        if (Math.random() < dt * 3) confetti(6);
        if (!paid && reward && t > 0.6) { paid = true; PF.Save.data.coins += reward; PF.Save.save(); PF.Audio.play('coin'); }
        if (t > 0.8 && I.pressed('ok')) { PF.Audio.play('select'); onDone(); }
      },
      render(ctx) {
        stage(ctx, t);
        // подиум
        ctx.fillStyle = '#140f1c'; ctx.fillRect(150, 160, 84, 30);
        ctx.fillStyle = '#c8d0dc'; ctx.fillRect(151, 161, 82, 28); ctx.fillStyle = '#e8ecf8'; ctx.fillRect(151, 161, 82, 3);
        F.draw(ctx, '1', 192, 168, '#5a6488', 2, 1);
        const pose = ((t * 3) | 0) & 1 ? PF.POSE.CELEB1 : PF.POSE.CELEB0;
        bigPlayer(ctx, sheet, pose, 0, 192, 160, 3);
        trophy(ctx, 250, 160, 2);
        ctx.drawImage(S.crest(best.team.def, 2), 112, 120);
        // заголовок
        ctx.fillStyle = 'rgba(5,7,13,0.75)'; ctx.fillRect(0, 6, C.W, 30);
        F.draw(ctx, 'ЛУЧШИЙ ИГРОК МАТЧА', C.W / 2, 9, COL.accent2, 2, 1, '#000');
        F.draw(ctx, best.def.first + ' ' + best.name + '  ·  ' + best.team.short, C.W / 2, 27, COL.text, 1, 1);
        // оценка
        UI.panel(ctx, 280, 70, 92, 46, 'ОЦЕНКА', '#806010');
        F.draw(ctx, best.rating.toFixed(1), 326, 86, COL.accent2, 3, 1, '#000');
        F.draw(ctx, line, C.W / 2, 196, COL.dim, 1, 1, '#000');
        if (reward && t > 0.6) UI.coins(ctx, reward, 22, 80);
        drawParts(ctx);
        if (t > 0.8) UI.footer(ctx, [['J', 'ДАЛЕЕ']]);
      },
    };
  };

  // ============================================================
  // Вручение трофея: команда на сцене, капитан поднимает кубок, салют
  // ============================================================
  // o: { team (def), defs (игроки), title, sub, reward }
  Cer.trophyScreen = (o, onDone) => {
    const kit = kitOf(o.team);
    const players = o.defs.filter(Boolean).slice(0, 11);
    const sheets = players.map((d) => S.sheetFor(d.role === 'GK' ? Object.assign({}, kit, { p: '#30c050', s: '#1a6a2a', shorts: '#1a6a2a', socks: '#30c050', gk: true }) : kit, d.skin, d.hair, S.lookOf(d)));
    let t = 0, fw = 0, paid = false;
    return {
      enter() { clearParts(); confetti(120); PF.Audio.playMusic('win'); PF.Audio.play('goal'); },
      update(dt) {
        t += dt; updParts(dt);
        fw -= dt;
        if (fw <= 0) { fw = 0.45 + Math.random() * 0.4; firework(40 + Math.random() * (C.W - 80), 20 + Math.random() * 50); }
        if (Math.random() < dt * 4) confetti(8);
        if (!paid && o.reward && t > 1) { paid = true; PF.Save.data.coins += o.reward; PF.Save.save(); PF.Audio.play('coin'); }
        if (t > 1.2 && I.pressed('ok')) { PF.Audio.play('select'); PF.Audio.playMusic('menu'); onDone(); }
      },
      render(ctx) {
        stage(ctx, t);
        // помост
        ctx.fillStyle = '#140f1c'; ctx.fillRect(30, 164, 324, 18);
        ctx.fillStyle = '#3a4466'; ctx.fillRect(31, 165, 322, 16); ctx.fillStyle = COL.gold; ctx.fillRect(31, 165, 322, 2);
        F.draw(ctx, 'ЧЕМПИОНЫ ' + (o.short || ''), C.W / 2, 171, '#ffffff', 1, 1);
        // игроки: капитан в центре поднимает кубок
        const n = players.length, mid = n >> 1;
        const order = [];
        for (let i = 0; i < n; i++) order.push(i);
        order.sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid)); // дальние рисуем раньше
        for (const i of order) {
          const x = 192 + (i - mid) * 28, jump = ((t * 4 + i) | 0) & 1;
          const pose = i === mid ? PF.POSE.CELEB0 : jump ? PF.POSE.CELEB1 : PF.POSE.CELEB0;
          bigPlayer(ctx, sheets[i], pose, 0, x, 166, 2);
        }
        const lift = Math.min(1, t / 1.2);
        trophy(ctx, 192, 166 - 46 - lift * 10 + Math.sin(t * 6) * 1.5, 2);
        // заголовки
        ctx.fillStyle = 'rgba(5,7,13,0.75)'; ctx.fillRect(0, 4, C.W, 34);
        F.draw(ctx, o.title, C.W / 2, 7, COL.accent2, 2, 1, '#000');
        F.draw(ctx, o.sub || '', C.W / 2, 26, COL.text, 1, 1);
        ctx.drawImage(S.crest(o.team, 2), 8, 6);
        if (o.reward && t > 1) UI.coins(ctx, o.reward, C.W - 8, 44, 2);
        drawParts(ctx);
        if (t > 1.2) UI.footer(ctx, [['J', 'ДАЛЕЕ']]);
      },
    };
  };

  // ============================================================
  // Индивидуальные награды сезона: карточки раскрываются по одной
  // ============================================================
  // items: [{ title, def, team, value }]
  Cer.awards = (title, items, onDone) => {
    let i = -1, t = 0;
    const next = () => { i++; t = 0; if (i < items.length) { PF.Audio.play('pack', 2); confetti(30); } };
    return {
      enter() { clearParts(); next(); },
      update(dt) {
        t += dt; updParts(dt);
        if (t > 0.5 && I.pressed('ok')) { if (i < items.length - 1) next(); else { PF.Audio.play('select'); onDone(); } }
      },
      render(ctx) {
        stage(ctx, t);
        ctx.fillStyle = 'rgba(5,7,13,0.75)'; ctx.fillRect(0, 4, C.W, 22);
        F.draw(ctx, title, C.W / 2, 8, COL.accent2, 2, 1, '#000');
        items.forEach((it, k) => {
          const x = C.W / 2 + (k - (items.length - 1) / 2) * 118;
          const shown = k <= i;
          UI.panel(ctx, x - 54, 40, 108, 128, it.title, shown ? '#806010' : COL.line);
          if (!shown) { F.draw(ctx, '?', x, 96, COL.dim, 3, 1); return; }
          const sc = k === i ? Math.min(1, t * 4) : 1;
          if (it.def) {
            const kit = kitOf(it.team);
            const sh = S.sheetFor(it.def.role === 'GK' ? Object.assign({}, kit, { gk: true, p: '#30c050' }) : kit, it.def.skin, it.def.hair, S.lookOf(it.def));
            if (sc > 0.5) bigPlayer(ctx, sh, ((t * 3) | 0) & 1 ? PF.POSE.CELEB1 : PF.POSE.CELEB0, 0, x, 120, 3);
            F.draw(ctx, it.def.name, x, 126, COL.text, 1, 1);
            F.draw(ctx, it.team ? it.team.short || it.team.name : '', x, 136, COL.dim, 1, 1);
          } else F.draw(ctx, '-', x, 110, COL.dim, 2, 1);
          F.draw(ctx, it.value || '', x, 150, COL.accent2, 1, 1);
          trophy(ctx, x + 38, 76, 1);
        });
        drawParts(ctx);
        if (t > 0.5) UI.footer(ctx, [['J', i < items.length - 1 ? 'СЛЕДУЮЩАЯ НАГРАДА' : 'ДАЛЕЕ']]);
      },
    };
  };

  // ============================================================
  // Пресс-конференция
  // ============================================================
  // Варианты ответа: эффекты на мораль команды (mo), доверие руководства (bo) и болельщиков (fa)
  const ANS = {
    humble: (text) => ({ text, mo: 2, bo: 1, fa: 0, tone: 'СКРОМНО' }),
    confident: (text) => ({ text, mo: 4, bo: 0, fa: 3, tone: 'УВЕРЕННО' }),
    fiery: (text) => ({ text, mo: 6, bo: -3, fa: 4, tone: 'ЭМОЦИОНАЛЬНО' }),
    blame: (text) => ({ text, mo: -6, bo: 2, fa: -1, tone: 'ЖЁСТКО' }),
    calm: (text) => ({ text, mo: 1, bo: 2, fa: -1, tone: 'СПОКОЙНО' }),
  };
  const Q = {
    bigwin: [{ q: 'Разгромная победа! Это лучший матч команды в сезоне?', a: [ANS.humble('Отличный день, но впереди ещё много работы.'), ANS.confident('Мы показали, на что способны. Это только начало!'), ANS.fiery('Пусть вся лига знает: мы идём за титулом!')] }],
    win: [
      { q: 'Три очка в копилке. Чем вы довольны больше всего?', a: [ANS.humble('Дисциплиной. Ребята выполнили план.'), ANS.confident('Мы контролировали игру с первой минуты.'), ANS.calm('Довольны результатом, но игру надо улучшать.')] },
      { q: '{player} сегодня был хорош. Ваша оценка?', a: [ANS.confident('{player} — ключевой игрок. Я в нём не сомневался.'), ANS.humble('Победила команда, а не один игрок.'), ANS.calm('Хорошая игра, но к нему есть вопросы.')] },
    ],
    draw: [
      { q: 'Ничья — справедливый итог?', a: [ANS.calm('Да, обе команды заслужили очко.'), ANS.fiery('Нет! Мы были лучше, судьба отняла у нас победу.'), ANS.blame('Мы сыграли плохо. С игроками будет разговор.')] },
      { q: 'Вам не хватило остроты впереди. Что будете менять?', a: [ANS.calm('Будем больше работать над завершением атак.'), ANS.confident('Голы придут. Я верю в нападающих.'), ANS.blame('Если кто-то не готов — выйдут другие.')] },
    ],
    loss: [
      { q: 'Обидное поражение. Что пошло не так?', a: [ANS.calm('Беру ответственность на себя. Разберём ошибки.'), ANS.blame('Игроки не выполнили установку. Так нельзя.'), ANS.fiery('Мы ответим в следующем матче, обещаю!')] },
      { q: 'Болельщики разочарованы. Что вы им скажете?', a: [ANS.humble('Простите нас. Мы исправимся.'), ANS.confident('Не опускайте руки: команда на верном пути.'), ANS.fiery('Нам нужна ваша поддержка как никогда!')] },
    ],
    bigloss: [{ q: 'Тяжёлое поражение. Ваше место под угрозой?', a: [ANS.calm('Я сосредоточен на работе, а не на слухах.'), ANS.blame('Некоторые игроки играли без желания.'), ANS.fiery('Я не сдамся. Мы поднимемся!')] }],
    pre: [
      { q: 'Впереди матч с командой {opp}. Каков настрой?', a: [ANS.confident('Мы выходим за победой, как всегда.'), ANS.humble('Уважаем соперника, будет непростая игра.'), ANS.fiery('Мы их разорвём! Болельщики, приходите!')] },
      { q: 'Соперник {opp} в отличной форме. Есть план?', a: [ANS.calm('У нас есть план. Подробности оставлю при себе.'), ANS.confident('Форма соперника нас не пугает.'), ANS.humble('Будет трудно, но мы готовы бороться.')] },
    ],
  };
  const REACT = { humble: 'Игроки оценили спокойный тон.', confident: 'Уверенность тренера передалась команде.', fiery: 'Болельщики в восторге, руководство просит сдержанности.', blame: 'В раздевалке недовольны публичной критикой.', calm: 'Руководство одобряет взвешенную позицию.' };

  // ctxType: 'bigwin'|'win'|'draw'|'loss'|'bigloss'|'pre'; vars: { player, opp }; onDone(effect)
  Cer.press = (ctxType, vars, onDone) => {
    let bank = Q[ctxType] || Q.win;
    // вопросы про конкретного игрока задаём, только если знаем его имя
    if (!(vars && vars.player)) bank = bank.filter((it) => it.q.indexOf('{player}') < 0 && !it.a.some((a) => a.text.indexOf('{player}') >= 0));
    if (!bank.length) bank = Q.draw;
    const item = bank[Math.floor(Math.random() * bank.length)];
    const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k]) || '');
    const answers = item.a.map((a) => Object.assign({}, a, { text: fill(a.text) }));
    let sel = 0, chosen = null, t = 0;
    const toneKey = (a) => Object.keys(ANS).find((k) => ANS[k]('').tone === a.tone);
    return {
      enter() { PF.Audio.play('select'); },
      update(dt) {
        t += dt;
        if (!chosen) {
          const d = I.menuDir(dt);
          if (d.dy) { sel = (sel + d.dy + answers.length) % answers.length; PF.Audio.play('move'); }
          if (t > 0.4 && I.pressed('ok')) { chosen = answers[sel]; t = 0; PF.Audio.play('select'); }
        } else if (t > 0.4 && I.pressed('ok')) { onDone({ mo: chosen.mo, bo: chosen.bo, fa: chosen.fa, quote: chosen.text }); }
      },
      render(ctx) {
        // задник с логотипами спонсоров
        ctx.fillStyle = '#10182e'; ctx.fillRect(0, 0, C.W, C.H);
        for (let y = 0; y < 120; y += 20) for (let x = (y / 20 & 1) * 40; x < C.W; x += 80) { F.draw(ctx, 'ПИКСЕЛЬ ЛИГА', x + 4, y + 6, '#1d2a4a'); }
        // стол и микрофоны
        ctx.fillStyle = '#2a3150'; ctx.fillRect(0, 112, C.W, 22); ctx.fillStyle = '#3a4466'; ctx.fillRect(0, 112, C.W, 2);
        for (const mx of [250, 266, 282]) { ctx.fillStyle = '#5a6488'; ctx.fillRect(mx, 100, 2, 12); ctx.fillStyle = '#140f1c'; ctx.fillRect(mx - 1, 96, 4, 5); }
        // тренер (вы) и журналист
        const coach = S.sheetFor({ p: '#1c1c22', s: '#e8ecf8', pat: 'plain', shorts: '#1c1c22', socks: '#1c1c22' }, 0, 3);
        bigPlayer(ctx, coach, PF.POSE.IDLE, 0, 300, 116, 3);
        const jour = S.sheetFor({ p: '#6a4a8a', s: '#e8ecf8', pat: 'plain', shorts: '#3a3a4a', socks: '#3a3a4a' }, 1, 2);
        bigPlayer(ctx, jour, PF.POSE.HOLD, 2, 70, 150, 3);
        F.draw(ctx, 'ПРЕСС-КОНФЕРЕНЦИЯ', 6, 4, COL.accent2);
        // вопрос
        UI.panel(ctx, 100, 18, 176, 52, 'ВОПРОС ЖУРНАЛИСТА', '#6a4a8a');
        F.wrap(fill(item.q), 168).forEach((l, k) => F.draw(ctx, l, 104, 31 + k * 9, COL.text));
        if (!chosen) {
          answers.forEach((a, k) => {
            const y = 134 + k * 22, on = k === sel;
            ctx.fillStyle = on ? COL.accent : '#05070d'; ctx.fillRect(8, y - 1, C.W - 16, 21);
            ctx.fillStyle = COL.panel; ctx.fillRect(9, y, C.W - 18, 19);
            F.draw(ctx, a.tone, 14, y + 2, on ? COL.accent2 : COL.dim);
            F.wrap('«' + a.text + '»', C.W - 100).forEach((l, j) => F.draw(ctx, l, 90, y + 2 + j * 9, on ? COL.text : COL.dim));
          });
        } else {
          UI.panel(ctx, 20, 138, C.W - 40, 62, 'РЕАКЦИЯ', COL.line);
          F.draw(ctx, REACT[toneKey(chosen)] || '', 28, 152, COL.text);
          const fx = [['МОРАЛЬ', chosen.mo], ['РУКОВОДСТВО', chosen.bo], ['БОЛЕЛЬЩИКИ', chosen.fa]];
          fx.forEach(([n, v], k) => F.draw(ctx, n + ' ' + (v > 0 ? '+' : '') + v, 28 + k * 110, 168, v > 0 ? COL.accent : v < 0 ? COL.red : COL.dim));
          UI.footer(ctx, [['J', 'ДАЛЕЕ']]);
        }
        if (!chosen) UI.footer(ctx, [['▲▼', 'ОТВЕТ'], ['J', 'ОТВЕТИТЬ']]);
      },
    };
  };

  PF.Ceremony = Cer;
})(window.PF);
