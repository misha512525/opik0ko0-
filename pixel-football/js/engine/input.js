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
  // Стандартная раскладка геймпада
  const PAD = {
    pass: [0], ok: [0], shoot: [1], back: [1], lob: [2], through: [3], press: [4, 6], tabL: [4], skill: [5, 10], tabR: [5],
    sprint: [7], pause: [9], up: [12], down: [13], left: [14], right: [15],
  };
  const ACTIONS = Object.keys(KEYS).concat(['__']).filter((a) => a !== '__');
  const keyDown = new Set();
  const state = {}; // action -> {down, pressed, released, held, latchP, latchR, rep}
  for (const a of ACTIONS) state[a] = { down: false, pressed: false, released: false, held: 0, latchP: false, latchR: false, rep: 0 };
  const codeToActions = {};
  for (const a of ACTIONS) for (const k of KEYS[a]) (codeToActions[k] = codeToActions[k] || []).push(a);

  const padPrev = {};
  const axis = { x: 0, y: 0 };
  const touchAxis = { x: 0, y: 0, on: false, full: false }; // full — стик до упора = спринт
  let padAxisX = 0, padAxisY = 0;
  let anyPressed = false;
  const listeners = [];

  function isDownByKeys(a) { const ks = KEYS[a]; for (let i = 0; i < ks.length; i++) if (keyDown.has(ks[i])) return true; return false; }

  function onKey(code, down) {
    if (down) { if (keyDown.has(code)) return; keyDown.add(code); }
    else keyDown.delete(code);
    const acts = codeToActions[code];
    if (!acts) return;
    for (const a of acts) {
      const s = state[a];
      if (down) s.latchP = true; else if (!isDownByKeys(a)) s.latchR = true;
    }
    if (down) for (const f of listeners) f(code);
  }

  const I = {};
  I.init = (canvas) => {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace']);
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

  // Опрос геймпада и подготовка состояния на тик
  I.beginTick = (dt) => {
    let padDown = null;
    padAxisX = padAxisY = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      padDown = padDown || {};
      for (const a in PAD) {
        const btns = PAD[a];
        for (let j = 0; j < btns.length; j++) { const b = p.buttons[btns[j]]; if (b && (b.pressed || b.value > 0.5)) padDown[a] = true; }
      }
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) { padAxisX = ax; padAxisY = ay; }
      break; // одного геймпада достаточно
    }
    anyPressed = false;
    for (const a of ACTIONS) {
      const s = state[a];
      const pd = !!(padDown && padDown[a]) || (a === 'sprint' && touchAxis.on && touchAxis.full);
      if (pd && !padPrev[a]) s.latchP = true;
      if (!pd && padPrev[a] && !isDownByKeys(a)) s.latchR = true;
      padPrev[a] = pd;
      const was = s.down;
      s.down = isDownByKeys(a) || pd;
      s.pressed = s.latchP;
      s.released = s.latchR && !s.down;
      if (s.pressed) { anyPressed = true; s.rep = 0; }
      s.held = s.down ? s.held + dt : 0;
      if (!was && s.down && !s.pressed) s.pressed = true;
    }
    // Аналоговый вектор движения: стик > тач > клавиши
    let x = 0, y = 0;
    if (padAxisX || padAxisY) { x = padAxisX; y = padAxisY; }
    else if (touchAxis.on) { x = touchAxis.x; y = touchAxis.y; }
    if (!x && !y) {
      x = (state.right.down ? 1 : 0) - (state.left.down ? 1 : 0);
      y = (state.down.down ? 1 : 0) - (state.up.down ? 1 : 0);
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    axis.x = x; axis.y = y;
  };
  I.endTick = () => { for (const a of ACTIONS) { const s = state[a]; s.latchP = false; s.latchR = false; s.pressed = false; s.released = false; } };

  I.down = (a) => state[a].down;
  I.pressed = (a) => state[a].pressed;
  I.released = (a) => state[a].released;
  I.held = (a) => state[a].held;
  I.any = () => anyPressed;
  I.axis = () => axis;
  // Автоповтор для навигации по меню
  I.repeat = (a, dt) => {
    const s = state[a];
    if (s.pressed) return true;
    if (s.down && s.held > 0.32) { s.rep -= dt; if (s.rep <= 0) { s.rep = 0.085; return true; } }
    return false;
  };
  // Направление меню с учётом стика
  let stickLatch = { x: 0, y: 0 }, stickT = 0;
  I.menuDir = (dt) => {
    let dx = 0, dy = 0;
    if (I.repeat('left', dt)) dx = -1; else if (I.repeat('right', dt)) dx = 1;
    if (I.repeat('up', dt)) dy = -1; else if (I.repeat('down', dt)) dy = 1;
    if (!dx && !dy && (padAxisX || padAxisY)) {
      const sx = Math.abs(padAxisX) > 0.6 ? Math.sign(padAxisX) : 0, sy = Math.abs(padAxisY) > 0.6 ? Math.sign(padAxisY) : 0;
      if (sx !== stickLatch.x || sy !== stickLatch.y) { stickT = 0.35; dx = sx; dy = sy; }
      else if ((sx || sy) && (stickT -= dt) <= 0) { stickT = 0.1; dx = sx; dy = sy; }
      stickLatch.x = sx; stickLatch.y = sy;
    } else if (!padAxisX && !padAxisY) { stickLatch.x = stickLatch.y = 0; }
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
