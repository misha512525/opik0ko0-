import * as THREE from 'three';
import { CONFIG } from '../config';
import { DIRS, rightOf, type CityLayout, type Dir } from '../world/CityLayout';

/** Кусок маршрута: ломаная с накопленной длиной. */
export class Path {
  readonly pts: THREE.Vector2[];
  readonly cum: number[] = [0];
  readonly length: number;

  constructor(
    pts: THREE.Vector2[],
    readonly kind: 'segment' | 'turn',
    /** Для отрезка: узел в конце, направление и полоса. */
    readonly from: number,
    readonly to: number,
    readonly dir: Dir,
    readonly lane: number,
  ) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  pointAt(s: number, out = new THREE.Vector2()): THREE.Vector2 {
    if (s <= 0) return out.copy(this.pts[0]);
    if (s >= this.length) return out.copy(this.pts[this.pts.length - 1]);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const t = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], t);
  }

  /** Проекция точки на ломаную → длина дуги. */
  project(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const abx = b.x - a.x, abz = b.y - a.y;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / len2)) : 0;
      const px = a.x + abx * t, pz = a.y + abz * t;
      const d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < bd) {
        bd = d;
        best = this.cum[i - 1] + Math.sqrt(len2) * t;
      }
    }
    return best;
  }
}

/** Геометрия полос на сетке улиц (правостороннее движение, 2 полосы в каждую сторону). */
export class Roads {
  readonly laneW = CONFIG.world.laneWidth;
  readonly stop = CONFIG.traffic.stopLineOffset;

  constructor(readonly city: CityLayout) {}

  laneOffset(lane: number): number {
    return (lane + 0.5) * this.laneW;
  }

  /** Прямой участок полосы от узла from к узлу to (между стоп-линиями). */
  segment(from: number, to: number, lane: number): Path {
    const a = this.city.nodes[from], b = this.city.nodes[to];
    const dir = this.city.dirBetween(a, b);
    const d = DIRS[dir], r = DIRS[rightOf(dir)];
    const off = this.laneOffset(lane);
    const start = new THREE.Vector2(a.x + d.x * this.stop + r.x * off, a.z + d.z * this.stop + r.z * off);
    const end = new THREE.Vector2(b.x - d.x * this.stop + r.x * off, b.z - d.z * this.stop + r.z * off);
    return new Path([start, end], 'segment', from, to, dir, lane);
  }

  /** Поворот внутри перекрёстка: квадратичная кривая Безье. */
  turn(node: number, inDir: Dir, outDir: Dir, lane: number, outLane: number): Path {
    const n = this.city.nodes[node];
    const d1 = DIRS[inDir], r1 = DIRS[rightOf(inDir)];
    const d2 = DIRS[outDir], r2 = DIRS[rightOf(outDir)];
    const o1 = this.laneOffset(lane), o2 = this.laneOffset(outLane);
    const p0 = new THREE.Vector2(n.x - d1.x * this.stop + r1.x * o1, n.z - d1.z * this.stop + r1.z * o1);
    const p2 = new THREE.Vector2(n.x + d2.x * this.stop + r2.x * o2, n.z + d2.z * this.stop + r2.z * o2);
    let p1: THREE.Vector2;
    if (inDir === outDir) p1 = p0.clone().add(p2).multiplyScalar(0.5);
    else p1 = new THREE.Vector2(n.x + r1.x * o1 + r2.x * o2, n.z + r1.z * o1 + r2.z * o2);
    const pts: THREE.Vector2[] = [];
    const N = inDir === outDir ? 2 : 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      pts.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y));
    }
    return new Path(pts, 'turn', node, node, outDir, outLane);
  }

  /** Случайный следующий узел (без разворота). */
  nextNode(from: number, at: number, rnd: () => number): number {
    const n = this.city.nodes[at];
    const options = n.links.filter((l) => l >= 0 && l !== from);
    if (options.length === 0) return from;
    // Немного чаще едем прямо.
    const a = this.city.nodes[from];
    const inDir = this.city.dirBetween(a, n);
    const straight = n.links[inDir];
    if (straight >= 0 && rnd() < 0.45) return straight;
    return options[Math.floor(rnd() * options.length)];
  }

  /** Направление (yaw) движения по полосе. */
  static yawOf(dir: Dir): number {
    const d = DIRS[dir];
    return Math.atan2(d.x, d.z);
  }
}
