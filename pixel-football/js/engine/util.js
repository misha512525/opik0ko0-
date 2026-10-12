'use strict';
// Математика, ГСЧ и мелкие хелперы. Без аллокаций в горячих функциях.
(function (PF) {
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sign = (v) => (v < 0 ? -1 : 1);
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.len = (x, y) => Math.hypot(x, y);
  // Разница углов в диапазоне [-PI, PI]
  U.angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  U.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  U.smooth = (dt, rate) => 1 - Math.exp(-dt * rate); // коэффициент экспоненциального сглаживания
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1], колокол

  // Расстояние от точки до отрезка + параметр проекции (пишется в out, без аллокаций)
  const segOut = { d: 0, t: 0 };
  U.segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-6;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    segOut.t = t;
    segOut.d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    return segOut;
  };

  // Детерминированный ГСЧ (mulberry32) — составы команд одинаковы при каждом запуске
  class RNG {
    constructor(seed) { this.s = seed >>> 0; }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
  }
  U.RNG = RNG;
  U.hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // Цвета
  U.hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  U.rgb2hex = (r, g, b) => '#' + ((1 << 24) | (U.clamp(r | 0, 0, 255) << 16) | (U.clamp(g | 0, 0, 255) << 8) | U.clamp(b | 0, 0, 255)).toString(16).slice(1);
  U.shade = (h, k) => { const c = U.hex2rgb(h); return k < 0 ? U.rgb2hex(c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)) : U.rgb2hex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k); };
  U.mix = (a, b, t) => { const x = U.hex2rgb(a), y = U.hex2rgb(b); return U.rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
  U.luma = (h) => { const c = U.hex2rgb(h); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; };
  U.colorDist = (a, b) => { const x = U.hex2rgb(a), y = U.hex2rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

  U.makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return c;
  };

  // Форматирование
  U.fmtTime = (sec) => { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };
  U.fmtCoins = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Сортировка вставками: почти отсортированные списки (порядок отрисовки) — O(n)
  U.insertionSort = (arr, n, key) => {
    for (let i = 1; i < n; i++) {
      const v = arr[i], k = v[key];
      let j = i - 1;
      while (j >= 0 && arr[j][key] > k) { arr[j + 1] = arr[j]; j--; }
      arr[j + 1] = v;
    }
  };

  U.shuffle = (arr, rng) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((rng ? rng.next() : Math.random()) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  PF.U = U;
})(window.PF);
