import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CityLayout, Dir } from './CityLayout';

export type LightState = 'green' | 'yellow' | 'red';

const RED_ON = new THREE.Color(0xff2a1a);
const YEL_ON = new THREE.Color(0xffc21a);
const GRN_ON = new THREE.Color(0x2aff6a);
const OFF = new THREE.Color(0x221c18);

/**
 * Светофоры: цикл «С-Ю зелёный → жёлтый → все красные → З-В зелёный → …»
 * со сдвигом фазы на каждом перекрёстке. Лампы — один InstancedMesh.
 */
export class TrafficLights {
  private time = 0;
  private refresh = 0;
  private readonly green = CONFIG.traffic.greenSeconds;
  private readonly yellow = CONFIG.traffic.yellowSeconds;
  private readonly allRed = 1.5;
  private readonly cycle: number;
  private readonly hasLights = new Set<number>();

  constructor(
    private readonly city: CityLayout,
    private readonly bulbs: THREE.InstancedMesh,
  ) {
    this.cycle = 2 * (this.green + this.yellow + this.allRed);
    for (const l of city.lights) this.hasLights.add(l.node);
  }

  nodeHasLights(node: number): boolean {
    return this.hasLights.has(node);
  }

  /** Сигнал для машин, въезжающих в узел в направлении dir. */
  state(node: number, dir: Dir): LightState {
    if (!this.hasLights.has(node)) return 'green';
    const t = (this.time + this.city.nodes[node].lightOffset) % this.cycle;
    const half = this.cycle / 2;
    const ns = dir === 0 || dir === 2;
    // Первая половина цикла — для С-Ю, вторая — для З-В.
    const local = ns ? t : (t + half) % this.cycle;
    if (local < this.green) return 'green';
    if (local < this.green + this.yellow) return 'yellow';
    return 'red';
  }

  update(dt: number): void {
    this.time += dt;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.25;
    const lights = this.city.lights;
    for (let i = 0; i < lights.length; i++) {
      const s = this.state(lights[i].node, lights[i].dir);
      this.bulbs.setColorAt(i * 3, s === 'red' ? RED_ON : OFF);
      this.bulbs.setColorAt(i * 3 + 1, s === 'yellow' ? YEL_ON : OFF);
      this.bulbs.setColorAt(i * 3 + 2, s === 'green' ? GRN_ON : OFF);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
