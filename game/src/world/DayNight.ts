import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep } from '../core/math';
import { buildingUniforms } from './BuildingMaterial';
import type { CityVisuals } from './CityBuilder';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
varying vec3 vDir;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.6, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.7));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
  // Луна напротив солнца.
  float m = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.8, 0.85, 1.0) * pow(m, 900.0) * 3.0 * uNight;
  // Звёзды.
  vec3 g = floor(d * 220.0);
  float star = step(0.9985, h3(g)) * uNight * smoothstep(0.05, 0.3, d.y);
  col += vec3(star);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.6, clamp(-d.y * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

interface Key {
  h: number;
  top: number;
  hor: number;
  sun: number;
  sunI: number;
  amb: number;
}

// Ключевые кадры суток: цвет неба, горизонта, солнца и яркость.
const KEYS: Key[] = [
  { h: 0, top: 0x050a1a, hor: 0x1a2440, sun: 0x9fb0e0, sunI: 0.45, amb: 0.7 },
  { h: 5, top: 0x070c20, hor: 0x222c4c, sun: 0x9fb0e0, sunI: 0.4, amb: 0.7 },
  { h: 6.3, top: 0x2b3d6b, hor: 0xf09a64, sun: 0xffb27a, sunI: 0.9, amb: 0.4 },
  { h: 8, top: 0x3c76c4, hor: 0xb9d4ea, sun: 0xfff1d6, sunI: 2.2, amb: 0.75 },
  { h: 16, top: 0x3a72c0, hor: 0xbcd6ec, sun: 0xfff1d6, sunI: 2.3, amb: 0.75 },
  { h: 18.2, top: 0x2f3f70, hor: 0xf2884a, sun: 0xff9a5a, sunI: 1.1, amb: 0.45 },
  { h: 19.6, top: 0x0c1430, hor: 0x3b2d4c, sun: 0x9fb0e0, sunI: 0.45, amb: 0.7 },
  { h: 24, top: 0x050a1a, hor: 0x1a2440, sun: 0x9fb0e0, sunI: 0.45, amb: 0.7 },
];

/**
 * Смена дня и ночи: небо, солнце/луна, туман, окна и фонари.
 * Тень от солнца «едет» за игроком, чтобы карта теней была плотной.
 */
export class DayNight {
  hour: number = CONFIG.dayNight.startHour;
  night = 0;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private fog: THREE.Fog;
  private sunDir = new THREE.Vector3();
  private cTop = new THREE.Color();
  private cHor = new THREE.Color();
  private cSun = new THREE.Color();
  private ca = new THREE.Color();
  private cb = new THREE.Color();
  private waterOffset = 0;
  speed = 1;

  constructor(
    scene: THREE.Scene,
    private readonly visuals: CityVisuals,
    drawDistance: number,
  ) {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uNight: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.name = 'sky';
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4238, 0.7);
    scene.add(this.hemi);
    this.fog = new THREE.Fog(0xbcd6ec, 60, drawDistance);
    scene.fog = this.fog;
  }

  configureShadows(enabled: boolean, size: number): void {
    this.sun.castShadow = enabled;
    if (enabled) {
      this.sun.shadow.mapSize.set(size, size);
      const s = 70;
      const cam = this.sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 500;
      cam.updateProjectionMatrix();
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  setDrawDistance(d: number): void {
    this.fog.far = d;
    this.fog.near = Math.min(80, d * 0.2);
  }

  private sample(h: number): void {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = (h - a.h) / Math.max(0.001, b.h - a.h);
    this.cTop.copy(this.ca.setHex(a.top)).lerp(this.cb.setHex(b.top), t);
    this.cHor.copy(this.ca.setHex(a.hor)).lerp(this.cb.setHex(b.hor), t);
    this.cSun.copy(this.ca.setHex(a.sun)).lerp(this.cb.setHex(b.sun), t);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.intensity = a.amb + (b.amb - a.amb) * t;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.hour = (this.hour + (dt * 24 * this.speed) / CONFIG.dayNight.dayLengthSec) % 24;
    // Солнце: восход в 6, закат в 18, лёгкий наклон орбиты.
    const ang = ((this.hour - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), Math.max(elev, -0.3), 0.35).normalize();
    this.night = 1 - smoothstep(-0.12, 0.18, elev);
    this.sample(this.hour);

    // Ночью «солнцем» работает луна — светит с противоположной стороны.
    const lightDir = this.night > 0.5 ? this.sunDir.clone().multiplyScalar(-1).setY(0.6).normalize() : this.sunDir;
    const snap = 4;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + lightDir.x * 200, lightDir.y * 200, fz + lightDir.z * 200);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.color.copy(this.cSun);
    this.hemi.color.copy(this.cTop).lerp(this.ca.setHex(0xffffff), 0.35).lerp(this.cb.setHex(0x5a6c9c), this.night * 0.7);
    this.hemi.groundColor.setHex(0x3a3530).multiplyScalar(1 - this.night * 0.6);

    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(this.cTop);
    (u.uHorizon.value as THREE.Color).copy(this.cHor);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).copy(this.cSun).multiplyScalar(1 - this.night);
    u.uNight.value = this.night;
    this.sky.position.copy(camera.position);
    this.fog.color.copy(this.cHor).lerp(this.cTop, 0.25);

    buildingUniforms.uNight.value = this.night;
    const v = this.visuals;
    v.lampHeadMaterial.emissiveIntensity = this.night * 3;
    v.lightPoolMaterial.opacity = this.night * 0.75;
    const poolsOn = this.night > 0.05;
    for (const p of v.lightPools) p.visible = poolsOn;
    this.waterOffset += dt * 0.01;
    if (v.waterMaterial.normalMap) v.waterMaterial.normalMap.offset.set(this.waterOffset, this.waterOffset * 0.6);
  }

  /** Строка «ЧЧ:ММ» для HUD. */
  clock(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
