'use strict';
// Камера: плавное слежение, упреждение по скорости мяча, тряска экрана и зум (крупный план).
(function (PF) {
  const C = PF.C, U = PF.U;
  class Camera {
    constructor() {
      this.x = 52.5 * C.PPM; this.y = 34 * C.PPM_Y; // центр обзора в мировых пикселях
      this.zoom = 1; this.zoomTarget = 1;
      this.shake = 0; this.sx = 0; this.sy = 0;
      this.left = 0; this.top = 0; this.vw = C.W; this.vh = C.H;
      this.bounds = { x0: -150, x1: 990, y0: C.WORLD_Y0 * C.PPM_Y - C.STANDS_H, y1: C.WORLD_Y1 * C.PPM_Y };
    }
    // Следим за точкой в мировых метрах (x, y, z)
    follow(wx, wy, wz, dt, rate) {
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
      const tx = PF.Proj.sx(wx, wy), ty = wy * C.PPM_Y - wz * C.PPM_Z * 0.5 - 10;
      const k = U.smooth(dt, rate || C.CAM_SMOOTH);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    }
    snap(wx, wy) { this.x = PF.Proj.sx(wx, wy); this.y = wy * C.PPM_Y - 10; }
    addShake(v) { this.shake = Math.max(this.shake, v); }
    update(dt) {
      this.zoom += (this.zoomTarget - this.zoom) * U.smooth(dt, 5);
      if (Math.abs(this.zoom - this.zoomTarget) < 0.01) this.zoom = this.zoomTarget;
      this.shake = Math.max(0, this.shake - C.SHAKE_DECAY * dt);
      this.sx = this.shake > 0.1 ? Math.round((Math.random() * 2 - 1) * this.shake) : 0;
      this.sy = this.shake > 0.1 ? Math.round((Math.random() * 2 - 1) * this.shake) : 0;
    }
    // Вычисляем левый-верхний угол видимой области (целые пиксели — без дрожания спрайтов)
    compute() {
      const z = this.zoom;
      this.vw = C.W / z; this.vh = C.H / z;
      const b = this.bounds;
      let l = this.x - this.vw / 2, t = this.y - this.vh / 2;
      l = U.clamp(l, b.x0, b.x1 - this.vw);
      t = U.clamp(t, b.y0, b.y1 - this.vh);
      this.left = Math.round(l) + this.sx;
      this.top = Math.round(t) + this.sy;
    }
  }
  PF.Camera = Camera;
})(window.PF);
