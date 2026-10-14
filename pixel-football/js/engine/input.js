'use strict';
// Ввод: клавиатура, геймпад (Gamepad API) и сенсорный экран.
// Всё сводится к логическим действиям. Нажатия «защёлкиваются» до ближайшего
// тика физики, чтобы не терять короткие нажатия при фиксированном шаге.
(function (PF) {
  const KEYS = {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    pass: ['KeyJ'], lob: ['KeyK'], shoot: ['KeyL'], through: ['KeyU'], skill: ['KeyI'], press: ['Space'],
    pause: ['Escape', 'KeyP'],
    ok: ['Enter', 'NumpadEnter', 'KeyJ', 'Space'], back: ['Escape', 'Backspace'],
    tabL: ['KeyQ'], tabR: ['KeyE'],
  };
  // Режим «вдвоём за одной клавиатурой»: игрок 1 — левая половина, игрок 2 — стрелки и правая
  const KEYS_P1 = {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'],
    pass: ['KeyF'], lob: ['KeyG'], shoot: ['KeyH'], through: ['KeyR'], skill: ['KeyT'], press: ['KeyE'],
    pause: ['Escape', 'KeyP'], ok: ['Enter', 'NumpadEnter', 'KeyF', 'Space'], back: ['Escape', 'Backspace'], tabL: [], tabR: [],
  };
  const KEYS_P2 = {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['ShiftRight', 'Numpad0'],
    pass: ['Period', 'Numpad1'], lob: ['Comma', 'Numpad3'], shoot: ['Slash', 'Numpad2'], through: ['Semicolon', 'Numpad4'], skill: ['Quote', 'Numpad5'], press: ['Backslash', 'Numpad6'],
    pause: [], ok: ['Period', 'Numpad1'], back: [], tabL: [], tabR: [],
  };
  // Стандартная раскладка геймпада
  const PAD = {
    pass: [0], ok: [0], shoot: [1], back: [1], lob: [2], through: [3], press: [4, 6], tabL: [4], skill: [5, 10], tabR: [5],
    sprint: [7], pause: [9], up: [12], down: [13], left: [14], right: [15],
  };
  const ACTIONS = Object.keys(KEYS);
  const keyDown = new Set();
  const touchAxis = { x: 0, y: 0, on: false, full: false }; // full — стик до упора = спринт
  const listeners = [];

  // Набор ввода одного игрока: своя раскладка, свой геймпад, свои «защёлки» нажатий
  function makeSet(keys) {
    const set = { keys, codes: {}, state: {}, padPrev: {}, padX: 0, padY: 0, axis: { x: 0, y: 0 }, any: false, stick: { x: 0, y: 0 }, stickT: 0 };
    for (const a of ACTIONS) set.state[a] = { down: false, pressed: false, released: false, held: 0, latchP: false, latchR: false, rep: 0 };
    mapKeys(set, keys);
    return set;
  }
  function mapKeys(set, keys) {
    set.keys = keys; set.codes = {};
    for (const a of ACTIONS) for (const k of keys[a] || []) (set.codes[k] = set.codes[k] || []).push(a);
  }
  const EMPTY = {};
  for (const a of ACTIONS) EMPTY[a] = [];
  const sets = [makeSet(KEYS), makeSet(EMPTY)];
  let cur = 0, two = false;

  function isDownByKeys(set, a) { const ks = set.keys[a] || []; for (let i = 0; i < ks.length; i++) if (keyDown.has(ks[i])) return true; return false; }

  function onKey(code, down) {
    if (down) { if (keyDown.has(code)) return; keyDown.add(code); }
    else keyDown.delete(code);
    for (const set of sets) {
      const acts = set.codes[code];
      if (!acts) continue;
      for (const a of acts) {
        const s = set.state[a];
        if (down) s.latchP = true; else if (!isDownByKeys(set, a)) s.latchR = true;
      }
    }
    if (down) for (const f of listeners) f(code);
  }

  const I = {};
  I.init = (canvas) => {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Slash', 'Quote']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (!e.repeat) onKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => onKey(e.code, false));
    window.addEventListener('blur', () => { for (const k of [...keyDown]) onKey(k, false); });
    I.initTouch();
  };
  I.onAnyKey = (f) => listeners.push(f);
  I.setKey = onKey;
  // Включить/выключить режим двух игроков (раскладки и геймпады делятся)
  I.setTwoPlayer = (on) => {
    two = !!on;
    mapKeys(sets[0], two ? KEYS_P1 : KEYS);
    mapKeys(sets[1], two ? KEYS_P2 : EMPTY);
    for (const set of sets) for (const a of ACTIONS) { const s = set.state[a]; s.down = false; s.latchP = s.latchR = false; s.held = 0; }
  };
  I.isTwoPlayer = () => two;
  // Чей ввод сейчас читают down/pressed/axis (0 — игрок 1, 1 — игрок 2)
  I.use = (pl) => { cur = pl ? 1 : 0; };

  // Опрос геймпадов и подготовка состояния на тик
  I.beginTick = (dt) => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const conn = [];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) conn.push(pads[i]);
    sets.forEach((set, si) => {
      const p = two ? conn[si] : si === 0 ? conn[0] : null;
      let padDown = null;
      set.padX = set.padY = 0;
      if (p) {
        padDown = {};
        for (const a in PAD) {
          const btns = PAD[a];
          for (let j = 0; j < btns.length; j++) { const b = p.buttons[btns[j]]; if (b && (b.pressed || b.value > 0.5)) padDown[a] = true; }
        }
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.22) { set.padX = ax; set.padY = ay; }
      }
      const touch = si === 0 && touchAxis.on;
      set.any = false;
      for (const a of ACTIONS) {
        const s = set.state[a];
        const pd = !!(padDown && padDown[a]) || (a === 'sprint' && touch && touchAxis.full);
        if (pd && !set.padPrev[a]) s.latchP = true;
        if (!pd && set.padPrev[a] && !isDownByKeys(set, a)) s.latchR = true;
        set.padPrev[a] = pd;
        const was = s.down;
        s.down = isDownByKeys(set, a) || pd;
        s.pressed = s.latchP;
        s.released = s.latchR && !s.down;
        if (s.pressed) { set.any = true; s.rep = 0; }
        s.held = s.down ? s.held + dt : 0;
        if (!was && s.down && !s.pressed) s.pressed = true;
      }
      // Аналоговый вектор движения: стик > тач > клавиши
      let x = 0, y = 0;
      if (set.padX || set.padY) { x = set.padX; y = set.padY; }
      else if (touch) { x = touchAxis.x; y = touchAxis.y; }
      if (!x && !y) {
        x = (set.state.right.down ? 1 : 0) - (set.state.left.down ? 1 : 0);
        y = (set.state.down.down ? 1 : 0) - (set.state.up.down ? 1 : 0);
      }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      set.axis.x = x; set.axis.y = y;
    });
  };
  I.endTick = () => { for (const set of sets) for (const a of ACTIONS) { const s = set.state[a]; s.latchP = false; s.latchR = false; s.pressed = false; s.released = false; } };

  I.down = (a) => sets[cur].state[a].down;
  I.pressed = (a) => sets[cur].state[a].pressed;
  I.released = (a) => sets[cur].state[a].released;
  I.held = (a) => sets[cur].state[a].held;
  I.any = () => sets[cur].any;
  I.axis = () => sets[cur].axis;
  // Автоповтор для навигации по меню
  I.repeat = (a, dt) => {
    const s = sets[cur].state[a];
    if (s.pressed) return true;
    if (s.down && s.held > 0.32) { s.rep -= dt; if (s.rep <= 0) { s.rep = 0.085; return true; } }
    return false;
  };
  // Направление меню с учётом стика
  I.menuDir = (dt) => {
    const set = sets[cur];
    let dx = 0, dy = 0;
    if (I.repeat('left', dt)) dx = -1; else if (I.repeat('right', dt)) dx = 1;
    if (I.repeat('up', dt)) dy = -1; else if (I.repeat('down', dt)) dy = 1;
    if (!dx && !dy && (set.padX || set.padY)) {
      const sx = Math.abs(set.padX) > 0.6 ? Math.sign(set.padX) : 0, sy = Math.abs(set.padY) > 0.6 ? Math.sign(set.padY) : 0;
      if (sx !== set.stick.x || sy !== set.stick.y) { set.stickT = 0.35; dx = sx; dy = sy; }
      else if ((sx || sy) && (set.stickT -= dt) <= 0) { set.stickT = 0.1; dx = sx; dy = sy; }
      set.stick.x = sx; set.stick.y = sy;
    } else if (!set.padX && !set.padY) { set.stick.x = set.stick.y = 0; }
    return { dx, dy };
  };

  // Сенсорное управление: виртуальный стик + кнопки
  I.initTouch = () => {
    const touchUI = document.getElementById('touch');
    if (!touchUI) return;
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) return;
    touchUI.hidden = false;
    document.body.classList.add('touch');
    // тап по экрану в меню = «ОК» (в матче экран не трогаем — там кнопки)
    const cv = document.getElementById('screen');
    if (cv) cv.addEventListener('touchstart', (e) => {
      e.preventDefault();
      PF.Audio && PF.Audio.unlock();
      if (PF.App && PF.App.top && !PF.App.top.m) { onKey('Enter', true); setTimeout(() => onKey('Enter', false), 80); }
    }, { passive: false });
    // полноэкранный режим + альбомная ориентация (где поддерживается)
    const fs = document.getElementById('fs');
    const de = document.documentElement;
    if (fs && (de.requestFullscreen || de.webkitRequestFullscreen)) {
      fs.hidden = false;
      fs.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const req = de.requestFullscreen ? de.requestFullscreen() : de.webkitRequestFullscreen();
        Promise.resolve(req).then(() => { const so = window.screen.orientation; if (so && so.lock) return so.lock('landscape'); }).catch(() => {});
      }, { passive: false });
      document.addEventListener('fullscreenchange', () => { fs.hidden = !!document.fullscreenElement; });
    }
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let id = null;
    const move = (t) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      touchAxis.x = l < 0.18 ? 0 : dx; touchAxis.y = l < 0.18 ? 0 : dy; touchAxis.on = true; touchAxis.full = l > 0.92;
      knob.style.transform = `translate(${dx * r.width * 0.35}px, ${dy * r.height * 0.35}px)`;
      // для навигации по меню
      onKey('ArrowLeft', dx < -0.6); onKey('ArrowRight', dx > 0.6); onKey('ArrowUp', dy < -0.6); onKey('ArrowDown', dy > 0.6);
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; id = t.identifier; move(t); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === id) move(t); }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; touchAxis.on = false; touchAxis.full = false; touchAxis.x = touchAxis.y = 0; knob.style.transform = '';
        onKey('ArrowLeft', false); onKey('ArrowRight', false); onKey('ArrowUp', false); onKey('ArrowDown', false);
      }
    };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    for (const b of document.querySelectorAll('#tbtns button')) {
      const code = b.dataset.k;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('on'); onKey(code, true); if (code === 'KeyJ') onKey('Enter', true); PF.Audio && PF.Audio.unlock(); }, { passive: false });
      const up = (e) => { e.preventDefault(); b.classList.remove('on'); onKey(code, false); if (code === 'KeyJ') onKey('Enter', false); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    }
  };

  PF.Input = I;
})(window.PF);
