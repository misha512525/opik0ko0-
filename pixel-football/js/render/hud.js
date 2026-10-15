'use strict';
// HUD в стиле телетрансляции: табло со счётом и временем, радар, имя и стамина игрока,
// баннеры событий, бегущая строка комментатора, подсказки на стандартах.
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL;
  const H = {};
  let clockStr = '', clockSec = -1;

  function box(ctx, x, y, w, h, bg, border) {
    ctx.fillStyle = border || '#05070d'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  }
  H.box = box;

  function scoreboard(ctx, m) {
    const t0 = m.teams[0], t1 = m.teams[1];
    const x = 4, y = 4;
    // ширина блока счёта подстраивается под двузначные числа
    const sc = t0.score + '-' + t1.score, sw = F.width(sc) + 6, ex = sw - 18;
    box(ctx, x, y, 102 + ex, 11, '#0e1424');
    // цветные плашки команд
    ctx.fillStyle = t0.kit.p; ctx.fillRect(x, y, 2, 11);
    ctx.fillStyle = t1.kit.p; ctx.fillRect(x + 62 + ex, y, 2, 11);
    F.draw(ctx, t0.short, x + 4, y + 2, COL.text);
    box(ctx, x + 23, y, sw, 11, '#e8ecf8');
    F.draw(ctx, sc, x + 23 + sw / 2, y + 2, '#0e1424', 1, 1);
    F.draw(ctx, t1.short, x + 25 + sw, y + 2, COL.text);
    // время
    let secs;
    if (m.timed) {
      const half = m.half === 1 ? 0 : C.GAME_HALF_SEC;
      secs = Math.min(m.clock, half + C.GAME_HALF_SEC);
    } else secs = -1;
    const s = Math.floor(secs);
    if (secs < 0) clockStr = m.duelTarget ? 'ДО ' + m.duelTarget : '--:--';
    else if (s !== clockSec) { clockSec = s; clockStr = U.fmtTime(secs); }
    F.draw(ctx, clockStr, x + 67 + ex, y + 2, COL.accent);
    if (m.addedShown && m.timed) {
      box(ctx, x + 104 + ex, y, 14, 11, COL.accent);
      F.draw(ctx, '+' + m.addedMin, x + 111 + ex, y + 2, '#0e1424', 1, 1);
    }
    // красные карточки
    for (let i = 0; i < 2; i++) {
      const n = m.teams[i].stats.red;
      for (let k = 0; k < n; k++) { ctx.fillStyle = '#ff3030'; ctx.fillRect(x + (i ? 58 - k * 3 : 19 - k * 3), y + 12, 2, 3); }
    }
  }

  function radar(ctx, m) {
    const w = 66, h = 28, x = C.W - w - 5, y = 5;
    ctx.fillStyle = 'rgba(8,14,24,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(80,200,120,0.25)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + w / 2, y, 1, h);
    ctx.fillRect(x, y + h / 2 - 4, 1, 8); ctx.fillRect(x + w - 1, y + h / 2 - 4, 1, 8);
    const sx = w / C.PITCH_L, sy = h / C.PITCH_W;
    for (const p of m.all) {
      if (p.off) continue;
      if (p.controlled) { ctx.fillStyle = '#140f1c'; ctx.fillRect(x + Math.round(p.x * sx) - 1, y + Math.round(p.y * sy) - 1, 4, 4); }
      ctx.fillStyle = p.controlled ? COL.accent2 : m.radarCol[p.team.idx];
      ctx.fillRect(x + Math.round(p.x * sx), y + Math.round(p.y * sy), 2, 2);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + Math.round(m.ball.x * sx), y + Math.round(m.ball.y * sy), 1, 1);
  }

  function playerInfo(ctx, m) {
    const hs = m.humans;
    if (hs.length > 1) { infoBox(ctx, hs[0].controlled, 4, 0, '1'); infoBox(ctx, hs[1].controlled, C.W - 4, 2, '2'); return; }
    const h = m.human;
    const b = m.ball;
    const p = h && h.controlled ? h.controlled : b.owner;
    if (!p) return;
    const x = 4, y = C.H - 26;
    const name = p.num + ' ' + p.name;
    const w = Math.max(52, F.width(name) + 8);
    box(ctx, x, y, w, 13, '#0e1424');
    ctx.fillStyle = p.team.kit.p; ctx.fillRect(x, y, 2, 13);
    F.draw(ctx, name, x + 5, y + 1, COL.text);
    // стамина
    ctx.fillStyle = '#2a3150'; ctx.fillRect(x + 5, y + 10, w - 9, 2);
    ctx.fillStyle = p.stamina > 0.5 ? COL.accent : p.stamina > 0.25 ? COL.accent2 : COL.red;
    ctx.fillRect(x + 5, y + 10, Math.round((w - 9) * p.stamina), 2);
    // владелец мяча (если это не управляемый)
    if (b.owner && b.owner !== p && m.state === 'play') {
      const o = b.owner, s = o.num + ' ' + o.name;
      const ww = F.width(s) + 8;
      box(ctx, C.W - ww - 4, y, ww, 9, '#0e1424');
      ctx.fillStyle = o.team.kit.p; ctx.fillRect(C.W - ww - 4, y, 2, 9);
      F.draw(ctx, s, C.W - ww, y + 1, COL.dim);
    }
  }

  // Карточка игрока при игре вдвоём (align 0 — слева, 2 — справа)
  function infoBox(ctx, p, ax, align, label) {
    if (!p) return;
    const y = C.H - 26, name = label + '· ' + p.num + ' ' + p.name;
    const w = Math.max(52, F.width(name) + 8), x = align ? ax - w : ax;
    box(ctx, x, y, w, 13, '#0e1424');
    ctx.fillStyle = p.team.kit.p; ctx.fillRect(x, y, 2, 13);
    F.draw(ctx, name, x + 5, y + 1, label === '1' ? COL.accent2 : '#40e0e0');
    ctx.fillStyle = '#2a3150'; ctx.fillRect(x + 5, y + 10, w - 9, 2);
    ctx.fillStyle = p.stamina > 0.5 ? COL.accent : p.stamina > 0.25 ? COL.accent2 : COL.red;
    ctx.fillRect(x + 5, y + 10, Math.round((w - 9) * p.stamina), 2);
  }

  function ticker(ctx) {
    const c = PF.Comm;
    const y = C.H - 9;
    ctx.fillStyle = 'rgba(6,10,20,0.82)'; ctx.fillRect(0, y, C.W, 9);
    ctx.fillStyle = COL.accent; ctx.fillRect(0, y, C.W, 1);
    if (c.cur) F.draw(ctx, c.cur.text, Math.round(c.x), y + 1, COL.text);
  }

  function banner(ctx, m) {
    const b = m.banner;
    if (!b) return;
    const k = Math.min(1, b.t / 0.18), out = Math.max(0, (b.t - (b.dur - 0.25)) / 0.25);
    const big = b.text === 'ГОЛ!';
    const scale = big ? 3 : 2;
    const tw = F.width(b.text, scale);
    const cy = big ? 26 : 50;
    const hh = big ? 30 : 22;
    const w = Math.round((tw + 30) * k * (1 - out));
    ctx.fillStyle = 'rgba(6,10,20,0.85)'; ctx.fillRect(Math.round(C.W / 2 - w / 2), cy - 4, w, hh + (b.sub ? 10 : 0));
    ctx.fillStyle = b.col; ctx.fillRect(Math.round(C.W / 2 - w / 2), cy - 4, w, 1); ctx.fillRect(Math.round(C.W / 2 - w / 2), cy - 5 + hh + (b.sub ? 10 : 0), w, 1);
    if (k < 1 || out > 0.6) return;
    if (big) {
      // прыгающие буквы
      let x = C.W / 2 - tw / 2;
      for (let i = 0; i < b.text.length; i++) {
        const ch = b.text[i];
        const dy = Math.round(Math.sin(b.t * 10 + i * 0.9) * 2);
        F.draw(ctx, ch, x, cy + dy, b.col, scale, 0, '#000');
        x += F.width(ch, scale) + scale;
      }
    } else F.draw(ctx, b.text, C.W / 2, cy, b.col, scale, 1, '#000');
    if (b.sub) F.draw(ctx, b.sub, C.W / 2, cy + hh - 5, COL.text, 1, 1);
  }

  function hint(ctx, m) {
    const sp = m.sp;
    if (!sp || (m.state !== 'setpiece' && m.state !== 'kickoff') || !sp.taker || !sp.taker.team.human) {
      if (m.state === 'setpiece' && sp && sp.type === 'penalty' && m.human && m.human.idx !== sp.team) {
        F.draw(ctx, '▲/▼ - СТОРОНА ПРЫЖКА ВРАТАРЯ', C.W / 2, C.H - 52, COL.accent2, 1, 1, '#000');
      }
      return;
    }
    const t = sp.taker.team;
    const hold = PF.passHold() ? '  (ДЕРЖИ = СИЛА)' : '';
    let s;
    if (sp.type === 'penalty' || (sp.type === 'free' && m.isShootingFK(t, sp))) s = '▲▼ ПРИЦЕЛ  L (ДЕРЖАТЬ) - УДАР  J - ПАС';
    else if (sp.type === 'throw') s = 'J - КОРОТКИЙ   K - ДАЛЬНИЙ АУТ' + hold;
    else if (sp.type === 'corner') s = 'K - ПОДАЧА   J - РОЗЫГРЫШ' + hold;
    else s = 'J - ПАС   K - ДЛИННЫЙ   U - НА ХОД' + hold;
    const w = F.width(s) + 8;
    box(ctx, Math.round(C.W / 2 - w / 2), C.H - 53, w, 9, 'rgba(6,10,20,0.8)');
    F.draw(ctx, s, C.W / 2, C.H - 52, COL.accent2, 1, 1);
  }

  H.draw = (ctx, m, opts) => {
    if (m.state === 'replay') {
      // плашка повтора
      const blink = ((m.t * 2) | 0) & 1;
      box(ctx, 6, 6, 52, 11, '#c0202a');
      F.draw(ctx, (blink ? '● ' : '  ') + 'ПОВТОР', 9, 8, '#fff');
      F.draw(ctx, 'J/ENTER - ПРОПУСТИТЬ', C.W - 6, C.H - 18, COL.dim, 1, 2, '#000');
      ticker(ctx);
      return;
    }
    scoreboard(ctx, m);
    if (m.state !== 'intro') {
      radar(ctx, m);
      playerInfo(ctx, m);
    }
    hint(ctx, m);
    banner(ctx, m);
    ticker(ctx);
    if (m.so) {
      // счёт серии пенальти
      const x = C.W - 70, y = 38;
      box(ctx, x, y, 66, 21, '#0e1424');
      for (let i = 0; i < 2; i++) {
        F.draw(ctx, m.teams[i].short, x + 3, y + 2 + i * 10, COL.text);
        const ks = m.so.kicks[i];
        for (let k = 0; k < Math.max(5, ks.length); k++) {
          ctx.fillStyle = k < ks.length ? (ks[k] ? COL.accent : COL.red) : '#3a4466';
          ctx.fillRect(x + 25 + k * 7, y + 4 + i * 10, 5, 4);
        }
      }
    }
    if (m.mode === 'freekick') {
      box(ctx, C.W - 80, 38, 76, 11, '#0e1424');
      F.draw(ctx, 'ГОЛЫ ' + m.fk.goals + '/' + Math.max(0, m.fk.tries - (m.state === 'play' || m.state === 'setpiece' ? 1 : 0)), C.W - 76, 40, COL.accent2);
    }
    if (m.state === 'intro') {
      const t0 = m.teams[0], t1 = m.teams[1];
      box(ctx, 70, 70, 244, 50, 'rgba(10,14,28,0.9)');
      ctx.drawImage(PF.Sprites.crest(t0.def, 2), 80, 77);
      ctx.drawImage(PF.Sprites.crest(t1.def, 2), 276, 77);
      F.draw(ctx, t0.name, 192, 80, COL.text, 1, 1);
      F.draw(ctx, 'ПРОТИВ', 192, 92, COL.dim, 1, 1);
      F.draw(ctx, t1.name, 192, 104, COL.text, 1, 1);
    }
    if (opts && opts.fps) F.draw(ctx, PF.Loop.fps + ' FPS', C.W - 5, 36, COL.dim, 1, 2);
  };

  PF.HUD = H;
})(window.PF);
