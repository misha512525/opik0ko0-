import * as THREE from 'three';
import { Textures } from '../world/Textures';

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  grow?: number;
  color: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

/**
 * Пул частиц на одном THREE.Points (1 draw call): дым, огонь, искры, вода.
 * Обновление на CPU — для сотен частиц это дёшево.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private baseAlpha: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private tmpColor = new THREE.Color();

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: Textures.particle() }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number): void {
    this.material.uniforms.uScale.value = h * 0.9;
  }

  emit(o: EmitOptions): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx ?? 0;
    this.vel[i3 + 1] = o.vy ?? 0;
    this.vel[i3 + 2] = o.vz ?? 0;
    this.tmpColor.setHex(o.color);
    this.col[i3] = this.tmpColor.r;
    this.col[i3 + 1] = this.tmpColor.g;
    this.col[i3 + 2] = this.tmpColor.b;
    this.size[i] = o.size;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.grow[i] = o.grow ?? 0;
    this.baseAlpha[i] = o.alpha ?? 1;
    this.alpha[i] = o.alpha ?? 1;
    this.gravity[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k + this.gravity[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, t * 2.5) * (this.life[i] > 0 ? 1 : 0);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[name].needsUpdate = true;
  }
}

/** Набор эффектов: дым, огонь, взрывы, искры попаданий, вспышка света. */
export class Effects {
  readonly smoke = new ParticleSystem(1500, false);
  readonly glow = new ParticleSystem(1200, true);
  private flash: THREE.PointLight;
  private flashTime = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.smoke.points, this.glow.points);
    this.flash = new THREE.PointLight(0xffa040, 0, 40, 1.5);
    scene.add(this.flash);
  }

  resize(h: number): void {
    this.smoke.setViewportHeight(h);
    this.glow.setViewportHeight(h);
  }

  carSmoke(p: THREE.Vector3, heavy: boolean): void {
    this.smoke.emit({
      x: p.x + (Math.random() - 0.5) * 0.6,
      y: p.y,
      z: p.z + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 1.5 + Math.random(),
      vz: (Math.random() - 0.5) * 0.6,
      life: heavy ? 2.4 : 1.6,
      size: heavy ? 1.2 : 0.8,
      grow: heavy ? 1.6 : 1.1,
      color: heavy ? 0x1c1c1c : 0x9a9a9a,
      alpha: heavy ? 0.75 : 0.45,
      drag: 0.5,
    });
  }

  fire(p: THREE.Vector3, scale = 1): void {
    this.glow.emit({
      x: p.x + (Math.random() - 0.5) * 0.8 * scale,
      y: p.y + Math.random() * 0.3,
      z: p.z + (Math.random() - 0.5) * 0.8 * scale,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 2 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 0.5,
      life: 0.45 + Math.random() * 0.3,
      size: (0.9 + Math.random() * 0.6) * scale,
      grow: -0.6,
      color: Math.random() < 0.5 ? 0xff7a1a : 0xffc040,
      alpha: 0.9,
    });
  }

  explosion(p: THREE.Vector3): void {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9;
      const s = 4 + Math.random() * 9;
      this.glow.emit({
        x: p.x, y: p.y + 0.5, z: p.z,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.5 + Math.random() * 0.5, size: 2 + Math.random() * 2, grow: 2, drag: 3,
        color: Math.random() < 0.4 ? 0xffe080 : 0xff6a10, alpha: 1,
      });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      this.smoke.emit({
        x: p.x, y: p.y + 1, z: p.z,
        vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s,
        life: 2.5 + Math.random() * 2, size: 2.5, grow: 2.5, drag: 1.2,
        color: 0x222222, alpha: 0.8,
      });
    }
    this.flash.position.copy(p).setY(p.y + 2);
    this.flashTime = 0.5;
  }

  sparks(p: THREE.Vector3, n: THREE.Vector3 | null, color = 0xffd27a): void {
    for (let i = 0; i < 6; i++) {
      const nx = (n?.x ?? 0) * 3 + (Math.random() - 0.5) * 4;
      const ny = (n?.y ?? 0) * 3 + Math.random() * 3;
      const nz = (n?.z ?? 0) * 3 + (Math.random() - 0.5) * 4;
      this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: nx, vy: ny, vz: nz, life: 0.25, size: 0.18, color, gravity: -15, alpha: 1 });
    }
    this.smoke.emit({ x: p.x, y: p.y, z: p.z, vy: 0.5, life: 0.6, size: 0.35, grow: 0.8, color: 0x8a8a8a, alpha: 0.4 });
  }

  blood(p: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      this.smoke.emit({
        x: p.x, y: p.y, z: p.z,
        vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2,
        life: 0.5, size: 0.25, grow: 0.3, gravity: -9, color: 0x7a0a0a, alpha: 0.85,
      });
    }
  }

  muzzle(p: THREE.Vector3): void {
    this.glow.emit({ x: p.x, y: p.y, z: p.z, life: 0.06, size: 0.6, color: 0xffd080, alpha: 1 });
    this.flash.position.copy(p);
    this.flashTime = Math.max(this.flashTime, 0.05);
  }

  splash(p: THREE.Vector3): void {
    this.smoke.emit({
      x: p.x + (Math.random() - 0.5) * 0.4, y: p.y, z: p.z + (Math.random() - 0.5) * 0.4,
      vx: (Math.random() - 0.5) * 1.5, vy: 4 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5,
      life: 1.1, size: 0.35, grow: 0.3, gravity: -9, color: 0xcfe8ff, alpha: 0.55,
    });
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.glow.update(dt);
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flash.intensity = Math.max(0, this.flashTime) * 400;
    } else this.flash.intensity = 0;
  }
}
