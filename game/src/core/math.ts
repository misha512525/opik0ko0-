import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Нормализация угла в (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

/** Угол поворота вокруг Y так, чтобы локальная +Z смотрела вдоль (dx, dz). */
export const yawFromDir = (dx: number, dz: number) => Math.atan2(dx, dz);

export const dist2D = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export const tmpV1 = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpV3 = new THREE.Vector3();
export const tmpQ = new THREE.Quaternion();
export const tmpM = new THREE.Matrix4();
export const UP = new THREE.Vector3(0, 1, 0);

/** Расстояние от точки до луча (для попаданий по NPC без физики). */
export function rayPointDistance(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  px: number, py: number, pz: number,
): { t: number; d: number } {
  const vx = px - ox, vy = py - oy, vz = pz - oz;
  const t = vx * dx + vy * dy + vz * dz;
  if (t < 0) return { t, d: Infinity };
  const cx = ox + dx * t - px, cy = oy + dy * t - py, cz = oz + dz * t - pz;
  return { t, d: Math.sqrt(cx * cx + cy * cy + cz * cz) };
}
