import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleSpec } from '../config';

/**
 * Процедурная модель машины: кузов+салон слиты в одну геометрию с вертикальными
 * цветами (1 draw call), колёса и фары — отдельные меши для анимации и LOD.
 */

const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
const wreckMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1, metalness: 0 });
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.4, metalness: 0.7 });
export const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0.4 });
const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x990000, emissive: 0xff2020, emissiveIntensity: 2.5 });
export const sirenRed = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0 });
export const sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2050ff, emissiveIntensity: 0 });

/** Вызывается системой дня/ночи: фары ярче ночью. */
export function setVehicleNight(night: number): void {
  headlightMaterial.emissiveIntensity = 0.3 + night * 2.2;
  tailMaterial.emissiveIntensity = 0.3 + night * 1.2;
}

/** Мигание мигалок полиции (общий материал для всех машин). */
export function updateSirens(time: number, anyActive: boolean): void {
  const phase = Math.floor(time * 6) % 2;
  sirenRed.emissiveIntensity = anyActive ? (phase ? 4 : 0.2) : 0;
  sirenBlue.emissiveIntensity = anyActive ? (phase ? 0.2 : 4) : 0;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number): THREE.BufferGeometry {
  return colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
}

export const CLEARANCE = 0.28;

function bodyGeometry(spec: VehicleSpec, paint: number): THREE.BufferGeometry {
  const key = `${spec.id}-${paint}`;
  const cached = geoCache.get(key);
  if (cached) return cached;
  const W = spec.half.x * 2;
  const L = spec.half.z * 2;
  const H = spec.half.y * 2;
  const glass = 0x1b2530;
  const dark = 0x1e1e1e;
  const parts: THREE.BufferGeometry[] = [];
  const c = CLEARANCE;
  if (spec.id === 'van') {
    const bodyH = H * 0.86;
    parts.push(box(W, bodyH, L, 0, c + bodyH / 2, 0, paint));
    parts.push(box(W * 1.01, bodyH * 0.32, L * 0.16, 0, c + bodyH * 0.72, L * 0.38, glass)); // лобовое
    parts.push(box(W * 1.01, bodyH * 0.25, L * 0.12, 0, c + bodyH * 0.74, L * 0.24, glass)); // боковые окна кабины
    parts.push(box(W * 0.98, 0.08, L * 0.6, 0, c + bodyH * 0.45, -L * 0.15, 0x333333)); // молдинг
  } else {
    const sports = spec.id === 'sports';
    const bodyH = H * (sports ? 0.42 : 0.48);
    const cabH = H * (sports ? 0.38 : 0.42);
    const cabL = L * (sports ? 0.38 : 0.46);
    const cabZ = sports ? -L * 0.06 : -L * 0.04;
    parts.push(box(W, bodyH, L, 0, c + bodyH / 2, 0, paint));
    // Салон: стёкла + крыша в цвет кузова.
    parts.push(box(W * 0.84, cabH, cabL, 0, c + bodyH + cabH / 2, cabZ, glass));
    parts.push(box(W * 0.86, 0.07, cabL * 0.8, 0, c + bodyH + cabH, cabZ, paint));
    // Стойки.
    for (const sx of [-1, 1]) parts.push(box(0.06, cabH, 0.12, sx * W * 0.42, c + bodyH + cabH / 2, cabZ + cabL * 0.38, paint));
    // Капот чуть ниже, решётка.
    parts.push(box(W * 0.7, 0.18, 0.06, 0, c + bodyH * 0.6, L / 2 + 0.01, dark));
    if (sports) parts.push(box(W * 0.9, 0.06, 0.35, 0, c + bodyH + 0.28, -L / 2 + 0.25, dark)); // спойлер
    if (spec.id === 'police') {
      parts.push(box(W * 1.01, bodyH * 0.45, L * 0.45, 0, c + bodyH * 0.55, -L * 0.02, 0xf0f0f0)); // белые двери
      parts.push(box(W * 0.5, 0.1, 0.25, 0, c + bodyH + cabH + 0.08, cabZ, 0x222222)); // основание мигалки
    }
  }
  // Бамперы и пороги.
  const bh = 0.22;
  parts.push(box(W * 1.02, bh, 0.2, 0, c + 0.12, L / 2, dark));
  parts.push(box(W * 1.02, bh, 0.2, 0, c + 0.12, -L / 2, dark));
  parts.push(box(W * 1.02, 0.12, L * 0.6, 0, c + 0.06, 0, dark));
  const g = mergeGeometries(parts)!;
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

const wheelGeoCache = new Map<number, THREE.BufferGeometry>();
function wheelGeometry(r: number): THREE.BufferGeometry {
  let g = wheelGeoCache.get(r);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, 0.26, 12).rotateZ(Math.PI / 2);
    wheelGeoCache.set(r, g);
  }
  return g;
}
const rimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.28, 6).rotateZ(Math.PI / 2);

export class VehicleModel {
  readonly root = new THREE.Group();
  readonly body: THREE.Mesh;
  private readonly detail = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  readonly frontPivots: THREE.Object3D[] = [];
  private tails: THREE.Mesh[] = [];
  private braking = false;
  private wrecked = false;

  constructor(readonly spec: VehicleSpec, paint: number) {
    this.body = new THREE.Mesh(bodyGeometry(spec, paint), bodyMaterial);
    this.body.castShadow = true;
    this.root.add(this.body, this.detail);
    const W = spec.half.x * 2;
    const L = spec.half.z * 2;
    const r = spec.wheelRadius;
    const wx = spec.half.x - 0.12;
    const wz = spec.wheelBase / 2;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(sx * wx, r, sz * wz);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeometry(r), wheelMaterial);
      const rim = new THREE.Mesh(rimGeo, rimMaterial);
      rim.position.x = sx * 0.01;
      wheel.add(tire, rim);
      pivot.add(wheel);
      this.detail.add(pivot);
      this.wheels.push(wheel);
      if (sz > 0) this.frontPivots.push(pivot);
    }
    const lightY = CLEARANCE + spec.half.y * (spec.id === 'van' ? 0.9 : 0.62);
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.14, 0.06), headlightMaterial);
      head.position.set(sx * W * 0.33, lightY, L / 2 + 0.02);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, 0.12, 0.06), tailMaterial);
      tail.position.set(sx * W * 0.34, lightY, -L / 2 - 0.02);
      this.tails.push(tail);
      this.detail.add(head, tail);
    }
    if (spec.id === 'police') {
      const H = spec.half.y * 2;
      const y = CLEARANCE + H * 0.9 + 0.2;
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), sirenRed);
      red.position.set(-0.24, y, -L * 0.04);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), sirenBlue);
      blue.position.set(0.24, y, -L * 0.04);
      this.detail.add(red, blue);
    }
  }

  setBraking(b: boolean): void {
    if (b === this.braking || this.wrecked) return;
    this.braking = b;
    for (const t of this.tails) t.material = b ? brakeMaterial : tailMaterial;
  }

  setPaint(paint: number): void {
    this.body.geometry = bodyGeometry(this.spec, paint);
  }

  setWrecked(): void {
    this.wrecked = true;
    this.body.material = wreckMaterial;
    for (const t of this.tails) t.material = wreckMaterial;
    this.detail.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== wheelMaterial) m.material = wreckMaterial;
    });
  }

  /** LOD: вдали прячем колёса и фары. */
  setDetail(visible: boolean): void {
    this.detail.visible = visible;
  }

  animate(steer: number, spin: number): void {
    for (const p of this.frontPivots) p.rotation.y = steer;
    for (const w of this.wheels) w.rotation.x = spin;
  }
}
