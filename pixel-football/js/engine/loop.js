'use strict';
// Игровой цикл: фиксированный шаг физики + интерполяция при отрисовке.
(function (PF) {
  const C = PF.C;
  const L = { timeScale: 1, fps: 60, running: false };
  let acc = 0, last = 0, upd = null, rnd = null, fpsAcc = 0, fpsN = 0;

  function frame(t) {
    if (!L.running) return;
    requestAnimationFrame(frame);
    let ft = (t - last) / 1000;
    last = t;
    if (ft > C.MAX_FRAME) ft = C.MAX_FRAME;
    if (ft < 0) ft = 0;
    fpsAcc += ft; fpsN++;
    if (fpsAcc >= 1) { L.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    acc += ft * L.timeScale;
    let n = 0;
    while (acc >= C.DT && n < 8) { upd(C.DT); acc -= C.DT; n++; }
    if (n >= 8) acc = 0;
    rnd(acc / C.DT, ft);
  }
  L.start = (update, render) => {
    upd = update; rnd = render; L.running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };
  // Детерминированный прогон для тестов (без rAF)
  L.step = (n) => { for (let i = 0; i < n; i++) upd(C.DT); rnd(0, C.DT); };
  PF.Loop = L;
})(window.PF);
