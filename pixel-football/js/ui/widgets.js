'use strict';
// Менеджер экранов и пиксельные виджеты интерфейса в стиле консольного меню.
(function (PF) {
  const C = PF.C, U = PF.U, F = PF.Font, COL = C.COL, I = PF.Input;

  // ---------- Менеджер экранов (стек) с затемнением при переходе ----------
  const App = {
    stack: [], fade: 0, fadeDir: 0, next: null, t: 0, queue: [],
    get top() { return this.stack[this.stack.length - 1]; },
    // mode: 'push' | 'replace' | 'reset' — переходы ставятся в очередь
    go(screen, mode) { this.queue.push({ screen, mode: mode || 'push' }); this.kick(); },
    pop() { this.queue.push({ mode: 'pop' }); this.kick(); },
    kick() { if (!this.fadeDir && this.queue.length) { this.next = this.queue.shift(); this.fadeDir = 1; } },
    apply() {
      const n = this.next;
      this.next = null;
      if (n.mode === 'pop') { const s = this.stack.pop(); s && s.exit && s.exit(); this.top && this.top.resume && this.top.resume(); return; }
      if (n.mode === 'replace') { const s = this.stack.pop(); s && s.exit && s.exit(); }
      if (n.mode === 'reset') { while (this.stack.length) { const s = this.stack.pop(); s.exit && s.exit(); } }
      this.stack.push(n.screen);
      n.screen.enter && n.screen.enter();
    },
    update(dt) {
      this.t += dt;
      if (this.fadeDir === 1) { this.fade += dt * 7; if (this.fade >= 1) { this.fade = 1; this.apply(); this.fadeDir = -1; } }
      else if (this.fadeDir === -1) { this.fade -= dt * 7; if (this.fade <= 0) { this.fade = 0; this.fadeDir = 0; this.kick(); } }
      const s = this.top;
      if (s && !this.fadeDir) s.update(dt);
      else if (s && s.alwaysUpdate) s.update(dt);
    },
    render(ctx, alpha, ft) {
      const s = this.top;
      if (s) s.render(ctx, alpha, ft);
      if (this.fade > 0) { ctx.fillStyle = 'rgba(5,7,13,' + this.fade + ')'; ctx.fillRect(0, 0, C.W, C.H); }
    },
  };
  PF.App = App;

  // ---------- Рисование ----------
  const UI = {};
  UI.panel = (ctx, x, y, w, h, title, accent) => {
    ctx.fillStyle = '#05070d'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = COL.panel; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COL.panel2; ctx.fillRect(x, y, w, 1);
    if (title) {
      ctx.fillStyle = accent || COL.line; ctx.fillRect(x, y, w, 10);
      F.draw(ctx, title, x + 4, y + 2, COL.text);
    }
  };
  // Анимированный фон меню: градиент, бегущие диагонали, «прожекторы»
  let bgCache = null;
  UI.bg = (ctx, t) => {
    if (!bgCache) {
      bgCache = U.makeCanvas(C.W, C.H);
      const c = bgCache.getContext('2d');
      for (let y = 0; y < C.H; y++) { c.fillStyle = U.mix('#101830', '#05070d', y / C.H); c.fillRect(0, y, C.W, 1); }
      // силуэт стадиона
      c.fillStyle = '#0c1226';
      for (let x = 0; x < C.W; x++) { const h = 30 + Math.round(Math.sin(x / 40) * 4 + Math.sin(x / 13) * 2); c.fillRect(x, C.H - h, 1, h); }
      c.fillStyle = '#16301c'; c.fillRect(0, C.H - 18, C.W, 18);
      c.fillStyle = '#1a3a22'; for (let x = 0; x < C.W; x += 32) c.fillRect(x, C.H - 18, 16, 18);
    }
    ctx.drawImage(bgCache, 0, 0);
    ctx.fillStyle = 'rgba(60,240,160,0.05)';
    const off = Math.floor(t * 12) % 24;
    for (let x = -C.H; x < C.W; x += 24) { for (let y = 0; y < C.H - 30; y += 2) ctx.fillRect(x + off + y, y, 6, 1); }
    // прожекторы
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 100, b = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.fillStyle = 'rgba(255,250,220,' + (0.25 + b * 0.35) + ')';
      ctx.fillRect(x, C.H - 44, 10, 3);
      ctx.fillStyle = '#3a4466'; ctx.fillRect(x + 4, C.H - 41, 2, 12);
    }
  };
  UI.header = (ctx, title, sub) => {
    ctx.fillStyle = 'rgba(5,7,13,0.85)'; ctx.fillRect(0, 0, C.W, 16);
    ctx.fillStyle = COL.accent; ctx.fillRect(0, 16, C.W, 1);
    F.draw(ctx, title, 6, 5, COL.text);
    if (sub) F.draw(ctx, sub, C.W - 6, 5, COL.accent2, 1, 2);
  };
  UI.footer = (ctx, hints) => {
    ctx.fillStyle = 'rgba(5,7,13,0.85)'; ctx.fillRect(0, C.H - 11, C.W, 11);
    ctx.fillStyle = COL.line; ctx.fillRect(0, C.H - 11, C.W, 1);
    let x = 6;
    for (const h of hints) {
      const kw = F.width(h[0]) + 4;
      ctx.fillStyle = COL.panel2; ctx.fillRect(x, C.H - 9, kw, 8);
      F.draw(ctx, h[0], x + 2, C.H - 8, COL.accent2);
      x += kw + 3;
      F.draw(ctx, h[1], x, C.H - 8, COL.dim);
      x += F.width(h[1]) + 9;
    }
  };
  UI.coins = (ctx, n, x, y, align) => {
    const s = U.fmtCoins(n);
    const w = F.width(s) + 9;
    const xx = align === 2 ? x - w : x;
    ctx.fillStyle = '#c08a10'; ctx.fillRect(xx, y + 1, 6, 5); ctx.fillStyle = '#ffd23c'; ctx.fillRect(xx + 1, y, 4, 7); ctx.fillRect(xx, y + 2, 6, 3);
    F.draw(ctx, s, xx + 9, y, COL.accent2);
  };
  UI.stars = (ctx, rating, x, y) => {
    const n = U.clamp((rating - 58) / 6, 0.5, 5);
    for (let i = 0; i < 5; i++) {
      const col = n >= i + 1 ? COL.accent2 : n >= i + 0.5 ? '#a08020' : '#2f3d66';
      F.draw(ctx, '*', x + i * 7, y, col);
    }
  };
  UI.bar = (ctx, x, y, w, v, col) => {
    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = col || (v >= 80 ? COL.accent : v >= 65 ? COL.accent2 : COL.red);
    ctx.fillRect(x, y, Math.round(w * U.clamp(v / 99, 0, 1)), 3);
  };
  UI.statColor = (v) => (v >= 80 ? COL.accent : v >= 70 ? '#b0f060' : v >= 60 ? COL.accent2 : COL.red);
  UI.kitIcon = (ctx, kit, x, y) => {
    const sh = PF.Sprites.sheetFor(kit, 0, 3);
    PF.Sprites.drawPlayer(ctx, sh, PF.POSE.IDLE, 0, x, y, null);
  };

  // ---------- Список пунктов меню ----------
  // item: { label, value() -> строка, left(), right(), action(), disabled, hint }
  class ListMenu {
    constructor(items, opts) {
      this.items = items; this.sel = 0; this.o = opts || {};
      this.scroll = 0;
      while (this.items[this.sel] && this.items[this.sel].disabled) this.sel++;
    }
    update(dt) {
      const d = I.menuDir(dt);
      const n = this.items.length;
      if (d.dy) {
        let s = this.sel;
        for (let k = 0; k < n; k++) { s = (s + d.dy + n) % n; if (!this.items[s].disabled) break; }
        if (s !== this.sel) { this.sel = s; PF.Audio.play('move'); }
      }
      const it = this.items[this.sel];
      if (!it) return;
      if (d.dx < 0 && it.left) { it.left(); PF.Audio.play('move'); }
      if (d.dx > 0 && it.right) { it.right(); PF.Audio.play('move'); }
      if (I.pressed('ok') && it.action && !it.disabled) { PF.Audio.play('select'); it.action(); }
    }
    render(ctx, x, y, w, rowH) {
      const h = rowH || 12;
      const max = this.o.visible || 99;
      if (this.sel < this.scroll) this.scroll = this.sel;
      if (this.sel >= this.scroll + max) this.scroll = this.sel - max + 1;
      const end = Math.min(this.items.length, this.scroll + max);
      for (let i = this.scroll; i < end; i++) {
        const it = this.items[i], yy = y + (i - this.scroll) * h;
        const on = i === this.sel;
        if (on) {
          ctx.fillStyle = COL.accent; ctx.fillRect(x, yy, w, h - 2);
          ctx.fillStyle = COL.panel; ctx.fillRect(x + 1, yy + 1, w - 2, h - 4);
          ctx.fillStyle = COL.accent; ctx.fillRect(x + 1, yy + 1, 2, h - 4);
        } else { ctx.fillStyle = 'rgba(20,27,46,0.85)'; ctx.fillRect(x, yy, w, h - 2); }
        const col = it.disabled ? '#4a5478' : on ? COL.text : COL.dim;
        F.draw(ctx, it.label, x + 6, yy + Math.floor((h - 9) / 2), col);
        if (it.value) {
          const v = it.value();
          if (it.left || it.right) {
            F.draw(ctx, '◄', x + w - 70, yy + Math.floor((h - 9) / 2), on ? COL.accent : '#3a4466');
            F.draw(ctx, '►', x + w - 8, yy + Math.floor((h - 9) / 2), on ? COL.accent : '#3a4466');
            F.draw(ctx, v, x + w - 38, yy + Math.floor((h - 9) / 2), on ? COL.accent2 : COL.text, 1, 1);
          } else F.draw(ctx, v, x + w - 6, yy + Math.floor((h - 9) / 2), on ? COL.accent2 : COL.text, 1, 2);
        }
      }
      if (this.scroll > 0) F.draw(ctx, '▲', x + w / 2, y - 7, COL.dim, 1, 1);
      if (end < this.items.length) F.draw(ctx, '▼', x + w / 2, y + max * h - 1, COL.dim, 1, 1);
      const it = this.items[this.sel];
      if (it && it.hint && this.o.hintY) F.draw(ctx, it.hint, this.o.hintX || x, this.o.hintY, COL.dim);
    }
  }
  UI.ListMenu = ListMenu;

  // Диалог подтверждения
  UI.confirm = (text, onYes) => ({
    sel: 1,
    enter() { this.sel = 1; },
    update(dt) {
      const d = I.menuDir(dt);
      if (d.dx) { this.sel = 1 - this.sel; PF.Audio.play('move'); }
      if (I.pressed('ok')) { PF.Audio.play('select'); App.pop(); if (this.sel === 0) onYes(); }
      if (I.pressed('back')) { PF.Audio.play('back'); App.pop(); }
    },
    render(ctx) {
      const below = App.stack[App.stack.length - 2];
      if (below) below.render(ctx, 0, 0);
      ctx.fillStyle = 'rgba(5,7,13,0.7)'; ctx.fillRect(0, 0, C.W, C.H);
      UI.panel(ctx, 92, 74, 200, 64, 'ПОДТВЕРЖДЕНИЕ', COL.red);
      const lines = F.wrap(text, 186);
      lines.forEach((l, i) => F.draw(ctx, l, 192, 90 + i * 9, COL.text, 1, 1));
      ['ДА', 'НЕТ'].forEach((s, i) => {
        const x = 132 + i * 80, on = this.sel === i;
        ctx.fillStyle = on ? COL.accent : COL.panel2; ctx.fillRect(x - 20, 120, 40, 11);
        F.draw(ctx, s, x, 122, on ? '#0b0f1a' : COL.text, 1, 1);
      });
    },
  });

  PF.UI = UI;
})(window.PF);
