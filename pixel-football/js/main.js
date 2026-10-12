'use strict';
// Точка входа: инициализация, масштабирование холста целым коэффициентом, игровой цикл.
(function (PF) {
  const C = PF.C;
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  // Масштаб: целый коэффициент, если помещается; иначе дробный (маленькие экраны)
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    let k = Math.floor(Math.min(w / C.W, h / C.H));
    if (k < 1) k = Math.min(w / C.W, h / C.H);
    canvas.style.width = Math.round(C.W * k) + 'px';
    canvas.style.height = Math.round(C.H * k) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  PF.Font.init();
  PF.Sprites.init();
  PF.Input.init(canvas);
  const save = PF.Save.load();
  PF.Audio.setVolumes(save.settings.master, save.settings.music, save.settings.sfx);
  // Звук можно включить только после жеста пользователя
  const unlock = () => PF.Audio.unlock();
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchstart', unlock);

  const params = new URLSearchParams(location.search);
  PF.debug = params.has('debug');
  if (params.has('quick')) {
    // Быстрый старт для тестов: ?quick[&human=-1][&mode=training]
    const T = PF.Data.TEAMS;
    const human = params.has('human') ? +params.get('human') : 0;
    const opts = { home: T[+params.get('h') || 0], away: T[+params.get('a') || 9], human, halfMin: +(params.get('half') || 3), diff: +(params.get('diff') || 1), mode: params.get('mode') || 'match', knockout: params.has('ko') };
    PF.App.go(PF.MatchScreen(opts, () => PF.App.go(PF.Menus ? PF.Menus.main() : PF.MatchScreen(opts), 'reset')), 'reset');
  } else {
    PF.App.go(PF.Menus.title(), 'reset');
  }

  PF.Loop.start((dt) => {
    PF.Input.beginTick(dt);
    PF.App.update(dt);
    PF.Input.endTick();
  }, (alpha, ft) => {
    PF.App.render(ctx, alpha, ft);
  });
  PF.ctx = ctx;
})(window.PF);
