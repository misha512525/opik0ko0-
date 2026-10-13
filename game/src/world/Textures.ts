import * as THREE from 'three';
import { Rng } from '../core/Rng';

/** Процедурные текстуры из canvas — никаких внешних файлов. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, size: number, base: [number, number, number], amp: number, rng: Rng, count = 6000) {
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = (rng.next() - 0.5) * amp;
    const s = rng.range(1, 3);
    ctx.fillStyle = `rgba(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0},0.6)`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), s, s);
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export const Textures = {
  asphalt: () =>
    cached('asphalt', () => {
      const [c, ctx] = canvas(256);
      const rng = new Rng(11);
      noise(ctx, 256, [58, 60, 64], 26, rng, 9000);
      ctx.strokeStyle = 'rgba(30,30,32,0.5)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        let x = rng.range(0, 256), y = rng.range(0, 256);
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += rng.range(-20, 20);
          y += rng.range(-20, 20);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return toTexture(c);
    }),

  sidewalk: () =>
    cached('sidewalk', () => {
      const [c, ctx] = canvas(256);
      const rng = new Rng(12);
      noise(ctx, 256, [150, 148, 142], 20, rng, 5000);
      ctx.strokeStyle = 'rgba(90,88,84,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 64, 0);
        ctx.lineTo(i * 64, 256);
        ctx.moveTo(0, i * 64);
        ctx.lineTo(256, i * 64);
        ctx.stroke();
      }
      return toTexture(c);
    }),

  grass: () =>
    cached('grass', () => {
      const [c, ctx] = canvas(256);
      const rng = new Rng(13);
      noise(ctx, 256, [74, 112, 52], 34, rng, 12000);
      return toTexture(c);
    }),

  ground: () =>
    cached('ground', () => {
      const [c, ctx] = canvas(256);
      const rng = new Rng(14);
      noise(ctx, 256, [96, 112, 70], 30, rng, 9000);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(120,105,80,${rng.range(0.1, 0.3)})`;
        ctx.beginPath();
        ctx.arc(rng.range(0, 256), rng.range(0, 256), rng.range(6, 30), 0, Math.PI * 2);
        ctx.fill();
      }
      return toTexture(c);
    }),

  gravel: () =>
    cached('gravel', () => {
      const [c, ctx] = canvas(128);
      noise(ctx, 128, [176, 164, 140], 30, new Rng(15), 4000);
      return toTexture(c);
    }),

  /** Радиальное пятно света фонаря на асфальте (аддитивное). */
  lightPool: () =>
    cached('lightPool', () => {
      const [c, ctx] = canvas(128);
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,220,160,0.9)');
      g.addColorStop(0.45, 'rgba(255,200,130,0.35)');
      g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return toTexture(c, false);
    }),

  /** Мягкая круглая частица (дым, огонь, искры). */
  particle: () =>
    cached('particle', () => {
      const [c, ctx] = canvas(64);
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return toTexture(c, false);
    }),

  /** Карта нормалей ряби для воды. */
  waterNormal: () =>
    cached('waterNormal', () => {
      const size = 256;
      const [c, ctx] = canvas(size);
      const h = new Float32Array(size * size);
      const rng = new Rng(16);
      const waves = Array.from({ length: 12 }, () => ({
        fx: rng.int(1, 6), fy: rng.int(1, 6), p: rng.range(0, 6.28), a: rng.range(0.3, 1),
      }));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          let v = 0;
          for (const w of waves) v += Math.sin(((x * w.fx + y * w.fy) / size) * Math.PI * 2 + w.p) * w.a;
          h[y * size + x] = v;
        }
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
          const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
          let nx = (l - r) * 0.5, ny = (u - d) * 0.5, nz = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len; ny /= len; nz /= len;
          const i = (y * size + x) * 4;
          img.data[i] = (nx * 0.5 + 0.5) * 255;
          img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
          img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      return toTexture(c, true, false);
    }),
};
