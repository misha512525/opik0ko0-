'use strict';
// Частицы (трава, пыль, конфетти) из заранее выделенного пула — без аллокаций в цикле.
(function (PF) {
  const N = 320;
  const pool = [];
  for (let i = 0; i < N; i++) pool.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, col: '#fff', g: 1, size: 1 });
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, col, g, size) {
    const p = pool[cursor];
    cursor = (cursor + 1) % N;
    p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.col = col; p.g = g; p.size = size || 1;
  }
  const GRASS = ['#2c7a2c', '#4caa44', '#5cc050', '#3a8a35'];
  const DUST = ['#b8a888', '#9a8c70', '#d0c4a8'];
  const CONF = ['#ff4f5e', '#ffd23c', '#3cf0a0', '#4fa3ff', '#ffffff', '#d070ff'];

  PF.FX = {
    grass(x, y, n, power) {
      for (let i = 0; i < n; i++) spawn(x, y, 0.05, (Math.random() - 0.5) * 3 * power, (Math.random() - 0.5) * 3 * power, 1.5 + Math.random() * 2.5 * power, 0.35 + Math.random() * 0.3, GRASS[i & 3], 10);
    },
    dust(x, y, n) {
      for (let i = 0; i < n; i++) spawn(x, y, 0.1, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, 0.6 + Math.random(), 0.5 + Math.random() * 0.4, DUST[i % 3], 2, 2);
    },
    confetti(x, y, n) {
      for (let i = 0; i < n; i++) spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 2 + Math.random() * 5, 1.6 + Math.random(), CONF[i % CONF.length], 4);
    },
    sparkle(x, y) {
      for (let i = 0; i < 8; i++) spawn(x, y, 0.4, Math.cos(i) * 3, Math.sin(i) * 3, 1.5, 0.35, '#ffffff', 3);
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = pool[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
        if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; }
      }
    },
    draw(ctx, cam) {
      for (let i = 0; i < N; i++) {
        const p = pool[i];
        if (!p.on) continue;
        const sx = Math.round(PF.Proj.sx(p.x, p.y) - cam.left), sy = Math.round(PF.Proj.sy(p.y, p.z) - cam.top);
        if (sx < -2 || sy < -2 || sx > cam.vw + 2 || sy > cam.vh + 2) continue;
        ctx.globalAlpha = p.life < 0.2 ? p.life / 0.2 : 1;
        ctx.fillStyle = p.col;
        ctx.fillRect(sx, sy, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    },
    clear() { for (const p of pool) p.on = false; },
  };
})(window.PF);
