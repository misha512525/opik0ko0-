import * as THREE from 'three';

export interface MarkerSpec {
  x: number;
  z: number;
  radius: number;
  color: number;
  kind: 'cylinder' | 'ring' | 'arrow';
  y?: number;
}

/**
 * Маркеры в мире: светящиеся цилиндры (точки миссий и магазинов), кольца
 * контрольных точек и стрелки над целями. Пул мешей, переиспользуется каждый кадр.
 */
export class Markers {
  private cylinders: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private arrows: THREE.Mesh[] = [];
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  private ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 40);
  private arrowGeo = new THREE.ConeGeometry(0.35, 0.7, 4).rotateX(Math.PI);
  private time = 0;
  private providers: (() => MarkerSpec[])[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  addProvider(fn: () => MarkerSpec[]): void {
    this.providers.push(fn);
  }

  private mat(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  }

  private take(pool: THREE.Mesh[], i: number, geo: THREE.BufferGeometry, opacity: number): THREE.Mesh {
    let m = pool[i];
    if (!m) {
      m = new THREE.Mesh(geo, this.mat(0xffffff, opacity));
      m.renderOrder = 6;
      this.scene.add(m);
      pool[i] = m;
    }
    m.visible = true;
    return m;
  }

  update(dt: number): void {
    this.time += dt;
    let ci = 0, ri = 0, ai = 0;
    const bob = Math.sin(this.time * 3) * 0.15;
    for (const fn of this.providers) {
      for (const s of fn()) {
        if (s.kind === 'cylinder') {
          const m = this.take(this.cylinders, ci++, this.cylGeo, 0.35);
          m.position.set(s.x, 0.1, s.z);
          m.scale.set(s.radius, 1.4 + bob, s.radius);
          (m.material as THREE.MeshBasicMaterial).color.setHex(s.color);
          const a = this.take(this.arrows, ai++, this.arrowGeo, 0.9);
          a.position.set(s.x, 2.4 + bob, s.z);
          a.rotation.y = this.time * 2;
          (a.material as THREE.MeshBasicMaterial).color.setHex(s.color);
        } else if (s.kind === 'ring') {
          const m = this.take(this.rings, ri++, this.ringGeo, 0.8);
          m.position.set(s.x, s.radius * 0.6, s.z);
          m.scale.setScalar(s.radius * 0.6);
          m.rotation.y = this.time * 0.8;
          (m.material as THREE.MeshBasicMaterial).color.setHex(s.color);
        } else {
          const a = this.take(this.arrows, ai++, this.arrowGeo, 0.9);
          a.position.set(s.x, (s.y ?? 3) + bob, s.z);
          a.rotation.y = this.time * 2;
          (a.material as THREE.MeshBasicMaterial).color.setHex(s.color);
        }
      }
    }
    for (let i = ci; i < this.cylinders.length; i++) this.cylinders[i].visible = false;
    for (let i = ri; i < this.rings.length; i++) this.rings[i].visible = false;
    for (let i = ai; i < this.arrows.length; i++) this.arrows[i].visible = false;
  }
}
