import { CONFIG } from '../config';
import { Rng } from '../core/Rng';

/**
 * Чистые данные города (без three.js): сетка улиц, перекрёстки, кварталы,
 * здания, парковки, реквизит и точки интереса. Из них строится и меш,
 * и физика, и граф трафика, и миникарта.
 */

export type Dir = 0 | 1 | 2 | 3; // 0:N(-z) 1:E(+x) 2:S(+z) 3:W(-x)
export const DIRS: readonly { x: number; z: number }[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir;
export const rightOf = (d: Dir) => ((d + 1) % 4) as Dir;
export const leftOf = (d: Dir) => ((d + 3) % 4) as Dir;

export type District = 'downtown' | 'midtown' | 'residential' | 'industrial' | 'park' | 'waterfront';

export interface RoadNode {
  id: number;
  i: number;
  j: number;
  x: number;
  z: number;
  /** Соседний узел по направлению N/E/S/W или -1. */
  links: [number, number, number, number];
  /** Сдвиг фазы светофора (с). */
  lightOffset: number;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Block extends Rect {
  bi: number;
  bj: number;
  district: District;
}

export interface BuildingBox {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: number;
  seed: number;
  /** Можно ли повесить на крышу мелкие детали (кондиционеры и т. п.). */
  roofProps: boolean;
}

export interface ParkingSpot {
  x: number;
  z: number;
  yaw: number;
}

export type PropKind = 'tree' | 'lamp' | 'bench' | 'container' | 'bush';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  color?: number;
  /** Для фонарей — направление «вылета» плафона к дороге. */
  dirX?: number;
  dirZ?: number;
}

export type PoiKind = 'safehouse' | 'hospital' | 'police' | 'gunshop' | 'paintshop';

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  x: number;
  z: number;
}

export interface TrafficLightPost {
  node: number;
  /** Направление движения машин, которым светит этот светофор. */
  dir: Dir;
  x: number;
  z: number;
}

export interface Fountain {
  x: number;
  z: number;
  r: number;
}

export class CityLayout {
  readonly cfg = CONFIG.world;
  readonly xs: number[] = [];
  readonly zs: number[] = [];
  readonly nodes: RoadNode[] = [];
  readonly blocks: Block[] = [];
  readonly buildings: BuildingBox[] = [];
  readonly parking: ParkingSpot[] = [];
  readonly props: Prop[] = [];
  readonly pois: Poi[] = [];
  readonly lights: TrafficLightPost[] = [];
  readonly fountains: Fountain[] = [];
  /** Пешеходные кольца по тротуарам (прямоугольники). */
  readonly walkLoops: Rect[] = [];
  /** Зоны без построек (парки/площади) для миникарты. */
  readonly greens: Rect[] = [];
  readonly paths: Rect[] = [];
  readonly parkingLots: Rect[] = [];
  readonly promenade: Rect;
  readonly halfRoad: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;

  constructor(seed = CONFIG.world.seed) {
    const c = this.cfg;
    const rng = new Rng(seed);
    this.halfRoad = c.roadWidth / 2;
    const half = (c.cols * c.blockSize) / 2;
    for (let i = 0; i <= c.cols; i++) this.xs.push(-half + i * c.blockSize);
    for (let j = 0; j <= c.rows; j++) this.zs.push(-half + j * c.blockSize);
    this.minX = this.xs[0];
    this.maxX = this.xs[c.cols];
    this.minZ = this.zs[0];
    this.maxZ = this.zs[c.rows];
    this.promenade = { x0: this.minX - 20, z0: this.maxZ + this.halfRoad, x1: this.maxX + 20, z1: c.waterZ };

    this.buildNodes(rng);
    this.buildBlocks(rng);
    this.buildLights();
    this.buildPromenade(rng);
    this.buildOutskirts(rng);
    this.buildObstacleHash();
  }

  // ---------------------------------------------------------------- препятствия для NPC

  private obstacleCells = new Map<number, Rect[]>();
  private static readonly CELL = 25;

  private buildObstacleHash(): void {
    const add = (r: Rect) => {
      const C = CityLayout.CELL;
      for (let cx = Math.floor(r.x0 / C); cx <= Math.floor(r.x1 / C); cx++) {
        for (let cz = Math.floor(r.z0 / C); cz <= Math.floor(r.z1 / C); cz++) {
          const k = (cx + 1000) * 4000 + (cz + 1000);
          let arr = this.obstacleCells.get(k);
          if (!arr) this.obstacleCells.set(k, (arr = []));
          arr.push(r);
        }
      }
    };
    for (const b of this.buildings) {
      if (b.y > this.cfg.plinthHeight + 0.01) continue;
      add({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
    }
    for (const f of this.fountains) add({ x0: f.x - f.r, x1: f.x + f.r, z0: f.z - f.r, z1: f.z + f.r });
    for (const p of this.props) {
      if (p.kind === 'container') add({ x0: p.x - 1.2, x1: p.x + 1.2, z0: p.z - 6 * p.scale, z1: p.z });
    }
  }

  /** Занята ли точка зданием/фонтаном (для пешеходов без физики). */
  blocked(x: number, z: number, r = 0.4): boolean {
    if (x < -this.cfg.boundary || x > this.cfg.boundary || z < -this.cfg.boundary || z > this.cfg.waterZ - 0.6) return true;
    const C = CityLayout.CELL;
    const arr = this.obstacleCells.get((Math.floor(x / C) + 1000) * 4000 + (Math.floor(z / C) + 1000));
    if (!arr) return false;
    for (const b of arr) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }

  // ---------------------------------------------------------------- дороги

  nodeIndex(i: number, j: number): number {
    if (i < 0 || j < 0 || i > this.cfg.cols || j > this.cfg.rows) return -1;
    return j * (this.cfg.cols + 1) + i;
  }

  private buildNodes(rng: Rng): void {
    const { cols, rows } = this.cfg;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        this.nodes.push({
          id: this.nodeIndex(i, j),
          i,
          j,
          x: this.xs[i],
          z: this.zs[j],
          links: [this.nodeIndex(i, j - 1), this.nodeIndex(i + 1, j), this.nodeIndex(i, j + 1), this.nodeIndex(i - 1, j)],
          lightOffset: rng.range(0, 30),
        });
      }
    }
  }

  /** Направление от узла a к соседнему узлу b. */
  dirBetween(a: RoadNode, b: RoadNode): Dir {
    if (b.x > a.x) return 1;
    if (b.x < a.x) return 3;
    if (b.z > a.z) return 2;
    return 0;
  }

  /** На проезжей части? */
  isOnRoad(x: number, z: number, margin = 0): boolean {
    const h = this.halfRoad + margin;
    if (z >= this.minZ - h && z <= this.maxZ + h && x >= this.minX - h && x <= this.maxX + h) {
      for (const rx of this.xs) if (Math.abs(x - rx) <= h) return true;
      for (const rz of this.zs) if (Math.abs(z - rz) <= h) return true;
    }
    return false;
  }

  /** Высота поверхности под точкой (тротуары и кварталы приподняты). */
  surfaceHeight(x: number, z: number): number {
    if (this.isOnRoad(x, z)) return 0;
    return this.cfg.plinthHeight;
  }

  /** Ближайшая точка на полосе: для спавна машин и навигации полиции. */
  nearestLane(x: number, z: number): { x: number; z: number; dir: Dir; from: number; to: number } {
    // Ближайшая улица по X (вертикальная) или по Z (горизонтальная).
    let best = { d: Infinity, x: 0, z: 0, dir: 0 as Dir, from: -1, to: -1 };
    const lane = this.cfg.laneWidth * 1.5;
    const ci = Math.round((x - this.minX) / this.cfg.blockSize);
    const cj = Math.round((z - this.minZ) / this.cfg.blockSize);
    // вертикальная улица i=ci
    if (ci >= 0 && ci <= this.cfg.cols) {
      const zz = Math.max(this.minZ, Math.min(this.maxZ, z));
      const rx = this.xs[ci];
      const southbound = x < rx; // правостороннее: идущие на юг — западнее оси
      const lx = rx + (southbound ? -lane : lane);
      const d = Math.abs(x - lx) + Math.abs(z - zz);
      if (d < best.d) {
        const j0 = Math.max(0, Math.min(this.cfg.rows - 1, Math.floor((zz - this.minZ) / this.cfg.blockSize)));
        const a = this.nodeIndex(ci, j0), b = this.nodeIndex(ci, j0 + 1);
        best = { d, x: lx, z: zz, dir: southbound ? 2 : 0, from: southbound ? a : b, to: southbound ? b : a };
      }
    }
    if (cj >= 0 && cj <= this.cfg.rows) {
      const xx = Math.max(this.minX, Math.min(this.maxX, x));
      const rz = this.zs[cj];
      const eastbound = z > rz;
      const lz = rz + (eastbound ? lane : -lane);
      const d = Math.abs(z - lz) + Math.abs(x - xx);
      if (d < best.d) {
        const i0 = Math.max(0, Math.min(this.cfg.cols - 1, Math.floor((xx - this.minX) / this.cfg.blockSize)));
        const a = this.nodeIndex(i0, cj), b = this.nodeIndex(i0 + 1, cj);
        best = { d, x: xx, z: lz, dir: eastbound ? 1 : 3, from: eastbound ? a : b, to: eastbound ? b : a };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- кварталы

  private districtOf(bi: number, bj: number): District {
    if ((bi === 4 || bi === 5) && bj === 4) return 'park';
    if ((bi >= 5 && bi <= 8 && bj >= 1 && bj <= 3) || (bi === 6 && bj === 4)) return 'downtown';
    if (bi >= 7 && bj >= 6) return 'industrial';
    if (bi <= 3 && bj >= 4) return 'residential';
    if (bi <= 2 && bj <= 2) return 'residential';
    return 'midtown';
  }

  private buildBlocks(rng: Rng): void {
    const { cols, rows, sidewalk } = this.cfg;
    const h = this.halfRoad;
    for (let bj = 0; bj < rows; bj++) {
      for (let bi = 0; bi < cols; bi++) {
        const b: Block = {
          bi,
          bj,
          x0: this.xs[bi] + h,
          x1: this.xs[bi + 1] - h,
          z0: this.zs[bj] + h,
          z1: this.zs[bj + 1] - h,
          district: this.districtOf(bi, bj),
        };
        this.blocks.push(b);
        this.walkLoops.push({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z1 - 2 });
        this.addStreetFurniture(b, rng);
        const inner: Rect = { x0: b.x0 + sidewalk, z0: b.z0 + sidewalk, x1: b.x1 - sidewalk, z1: b.z1 - sidewalk };
        if (b.district === 'park') this.buildPark(b, inner, rng);
        else this.buildLots(b, inner, rng);
      }
    }
    this.placePois();
  }

  private addStreetFurniture(b: Block, rng: Rng): void {
    const sp = this.cfg.lampSpacing;
    const edge = 0.8;
    const sides: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[] = [
      { x0: b.x0, z0: b.z0 + edge, x1: b.x1, z1: b.z0 + edge, nx: 0, nz: -1 },
      { x0: b.x0, z0: b.z1 - edge, x1: b.x1, z1: b.z1 - edge, nx: 0, nz: 1 },
      { x0: b.x0 + edge, z0: b.z0, x1: b.x0 + edge, z1: b.z1, nx: -1, nz: 0 },
      { x0: b.x1 - edge, z0: b.z0, x1: b.x1 - edge, z1: b.z1, nx: 1, nz: 0 },
    ];
    const treeLine = b.district === 'residential' || b.district === 'park' || b.district === 'midtown';
    for (const s of sides) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const n = Math.max(1, Math.round(len / sp));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = s.x0 + (s.x1 - s.x0) * t;
        const z = s.z0 + (s.z1 - s.z0) * t;
        this.props.push({ kind: 'lamp', x, z, rot: 0, scale: 1, dirX: s.nx, dirZ: s.nz });
        if (treeLine && rng.chance(0.85)) {
          const t2 = (k + 1) / n;
          if (t2 < 0.97) {
            const tx = s.x0 + (s.x1 - s.x0) * t2 - s.nx * 1.4;
            const tz = s.z0 + (s.z1 - s.z0) * t2 - s.nz * 1.4;
            this.props.push({ kind: 'tree', x: tx, z: tz, rot: rng.range(0, 6.28), scale: rng.range(0.75, 1.05) });
          }
        }
      }
    }
  }

  private buildPark(b: Block, inner: Rect, rng: Rng): void {
    this.greens.push(inner);
    const cx = (inner.x0 + inner.x1) / 2;
    const cz = (inner.z0 + inner.z1) / 2;
    const w = inner.x1 - inner.x0;
    // Дорожки крест-накрест и фонтан в центре.
    this.paths.push({ x0: inner.x0, z0: cz - 2, x1: inner.x1, z1: cz + 2 });
    this.paths.push({ x0: cx - 2, z0: inner.z0, x1: cx + 2, z1: inner.z1 });
    if (b.bi === 4) this.fountains.push({ x: cx, z: cz, r: 7 });
    else {
      // Во втором блоке — круглая площадка с лавочками.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.props.push({ kind: 'bench', x: cx + Math.cos(a) * 9, z: cz + Math.sin(a) * 9, rot: -a + Math.PI / 2, scale: 1 });
      }
    }
    for (let k = 0; k < 70; k++) {
      const x = rng.range(inner.x0 + 2, inner.x1 - 2);
      const z = rng.range(inner.z0 + 2, inner.z1 - 2);
      if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
      if (Math.hypot(x - cx, z - cz) < 14) continue;
      this.props.push({ kind: rng.chance(0.75) ? 'tree' : 'bush', x, z, rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.5) });
    }
    for (let k = 0; k < 10; k++) {
      const along = rng.range(-w / 2 + 6, w / 2 - 6);
      if (Math.abs(along) < 15) continue;
      this.props.push({ kind: 'bench', x: cx + along, z: cz + 3.4, rot: 0, scale: 1 });
    }
  }

  private buildLots(b: Block, inner: Rect, rng: Rng): void {
    const d = b.district;
    let nx = 2, nz = 2;
    if (d === 'downtown') [nx, nz] = rng.chance(0.4) ? [1, 1] : [2, 2];
    else if (d === 'residential') [nx, nz] = rng.chance(0.5) ? [3, 3] : [3, 2];
    else if (d === 'industrial') [nx, nz] = rng.chance(0.5) ? [1, 2] : [2, 1];
    else [nx, nz] = rng.chance(0.5) ? [2, 2] : [3, 2];
    const lw = (inner.x1 - inner.x0) / nx;
    const ld = (inner.z1 - inner.z0) / nz;
    const special = this.specialFor(b);
    for (let a = 0; a < nx; a++) {
      for (let c = 0; c < nz; c++) {
        const lot: Rect = {
          x0: inner.x0 + a * lw,
          x1: inner.x0 + (a + 1) * lw,
          z0: inner.z0 + c * ld,
          z1: inner.z0 + (c + 1) * ld,
        };
        // Первый участок «особого» квартала оставляем под двор/парковку с маркером.
        const isSpecialYard = special !== null && a === 0 && c === 0;
        const r = rng.next();
        if (isSpecialYard || r < (d === 'industrial' ? 0.22 : 0.13)) this.buildParkingLot(lot, rng);
        else if (r < 0.18 && d !== 'industrial') this.buildPlaza(lot, rng);
        else this.buildBuilding(lot, d, rng);
      }
    }
  }

  private buildParkingLot(lot: Rect, rng: Rng): void {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    const rows = Math.max(1, Math.floor((d - 6) / 12));
    const perRow = Math.floor((w - 4) / 3);
    for (let r = 0; r < rows; r++) {
      const z = lot.z0 + 5 + r * 12;
      for (let k = 0; k < perRow; k++) {
        const x = lot.x0 + 3.5 + k * 3;
        this.parking.push({ x, z, yaw: rng.chance(0.5) ? 0 : Math.PI });
      }
    }
    this.parkingLots.push({ x0: lot.x0 + 0.5, z0: lot.z0 + 0.5, x1: lot.x1 - 0.5, z1: lot.z1 - 0.5 });
  }

  private buildPlaza(lot: Rect, rng: Rng): void {
    this.greens.push({ x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 });
    const n = rng.int(3, 7);
    for (let k = 0; k < n; k++) {
      this.props.push({
        kind: 'tree',
        x: rng.range(lot.x0 + 3, lot.x1 - 3),
        z: rng.range(lot.z0 + 3, lot.z1 - 3),
        rot: rng.range(0, 6.28),
        scale: rng.range(0.8, 1.3),
      });
    }
    this.props.push({ kind: 'bench', x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2, rot: 0, scale: 1 });
  }

  private buildBuilding(lot: Rect, d: District, rng: Rng): void {
    const lw = lot.x1 - lot.x0;
    const ld = lot.z1 - lot.z0;
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const y = this.cfg.plinthHeight;
    const palettes: Record<string, number[]> = {
      downtown: [0x8a9bab, 0x6f7f8f, 0xa7b4c2, 0x5c6b7a, 0xb8c4cc, 0x7d8a96, 0x99a3a4],
      midtown: [0xb5a48b, 0x9c8a74, 0xc9b79c, 0x8f7f6f, 0xa65f4a, 0xb7795d, 0xd3c4a9, 0x7a8b8c],
      residential: [0xd9c5a0, 0xc98f6f, 0xe0d6c3, 0xb76e57, 0xa3b18a, 0xcfb38c, 0xe8c9a0, 0x9fb4c0],
      industrial: [0x8c8c84, 0x7a6f62, 0x9e9a8e, 0x6c7a7a, 0xa18c6e],
      waterfront: [0xc7b9a0],
      park: [0x999999],
    };
    const color = rng.pick(palettes[d]);
    const seed = rng.next();
    const m = d === 'residential' ? rng.range(2.5, 4.5) : rng.range(1.5, 3.5);
    const w = Math.max(8, lw - 2 * m - rng.range(0, lw * 0.15));
    const dd = Math.max(8, ld - 2 * m - rng.range(0, ld * 0.15));
    let hgt: number;
    switch (d) {
      case 'downtown':
        hgt = rng.range(40, 120);
        break;
      case 'industrial':
        hgt = rng.range(8, 15);
        break;
      case 'residential':
        hgt = rng.range(6, 16);
        break;
      default:
        hgt = rng.range(12, 38);
    }
    // Чуть выше к центру города.
    const centerBoost = Math.max(0, 1 - Math.hypot(cx - 150, cz + 150) / 500);
    if (d !== 'industrial' && d !== 'residential') hgt *= 0.8 + centerBoost * 0.5;
    hgt = Math.round(hgt / 3.4) * 3.4 + 0.6;

    if (d === 'downtown' && hgt > 45) {
      // Стилобат + башня + надстройка.
      const baseH = rng.range(7, 12);
      this.buildings.push({ x: cx, z: cz, y, w, d: dd, h: baseH, color: rng.pick(palettes.midtown), seed: rng.next(), roofProps: false });
      const tw = w * rng.range(0.55, 0.8);
      const td = dd * rng.range(0.55, 0.8);
      this.buildings.push({ x: cx, z: cz, y: y + baseH, w: tw, d: td, h: hgt - baseH, color, seed, roofProps: false });
      this.buildings.push({ x: cx, z: cz, y: y + hgt, w: tw * 0.6, d: td * 0.6, h: rng.range(3, 8), color, seed, roofProps: true });
    } else if (d === 'midtown' && rng.chance(0.4)) {
      const h1 = hgt * rng.range(0.55, 0.75);
      this.buildings.push({ x: cx, z: cz, y, w, d: dd, h: h1, color, seed, roofProps: false });
      this.buildings.push({ x: cx, z: cz, y: y + h1, w: w * 0.7, d: dd * 0.7, h: hgt - h1, color, seed, roofProps: true });
    } else if (d === 'industrial') {
      this.buildings.push({ x: cx, z: cz, y, w, d: dd, h: hgt, color, seed, roofProps: true });
      // Контейнеры у склада.
      for (let k = 0; k < 4; k++) {
        if (!rng.chance(0.6)) continue;
        this.props.push({
          kind: 'container',
          x: lot.x0 + 3 + k * 3.2,
          z: lot.z1 - 2,
          rot: 0,
          scale: 1 + (rng.chance(0.3) ? 1 : 0),
          color: rng.pick([0xb23a48, 0x2e86ab, 0xf18f01, 0x3b8b5a, 0x7d4e57]),
        });
      }
    } else {
      this.buildings.push({ x: cx, z: cz, y, w, d: dd, h: hgt, color, seed, roofProps: true });
    }
  }

  // ---------------------------------------------------------------- POI

  private readonly specialBlocks: { bi: number; bj: number; kind: PoiKind; name: string; id: string }[] = [
    { bi: 1, bj: 6, kind: 'safehouse', name: 'Убежище', id: 'safehouse' },
    { bi: 3, bj: 2, kind: 'hospital', name: 'Больница св. Агаты', id: 'hospital' },
    { bi: 6, bj: 5, kind: 'police', name: 'Полицейский участок', id: 'police' },
    { bi: 2, bj: 4, kind: 'gunshop', name: 'Оружейная «Калибр»', id: 'gunshop_w' },
    { bi: 7, bj: 4, kind: 'gunshop', name: 'Оружейная «Калибр»', id: 'gunshop_e' },
    { bi: 3, bj: 7, kind: 'paintshop', name: 'Покраска «Хамелеон»', id: 'paint_s' },
    { bi: 8, bj: 0, kind: 'paintshop', name: 'Покраска «Хамелеон»', id: 'paint_n' },
  ];

  private specialFor(b: Block) {
    return this.specialBlocks.find((s) => s.bi === b.bi && s.bj === b.bj) ?? null;
  }

  private placePois(): void {
    const sw = this.cfg.sidewalk;
    for (const s of this.specialBlocks) {
      const b = this.blocks.find((bb) => bb.bi === s.bi && bb.bj === s.bj)!;
      // Маркер — во дворе первого участка (северо-западный угол квартала).
      const x = b.x0 + sw + 12;
      const z = b.z0 + sw + 9;
      this.pois.push({ id: s.id, kind: s.kind, name: s.name, x, z });
    }
  }

  poi(id: string): Poi {
    const p = this.pois.find((q) => q.id === id);
    if (!p) throw new Error(`POI ${id} not found`);
    return p;
  }

  nearestPoi(kind: PoiKind, x: number, z: number): Poi {
    let best = this.pois[0];
    let bd = Infinity;
    for (const p of this.pois) {
      if (p.kind !== kind) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- светофоры

  private buildLights(): void {
    const h = this.halfRoad;
    for (const n of this.nodes) {
      const count = n.links.filter((l) => l >= 0).length;
      if (count < 3) continue;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        // Машины, едущие в направлении d, приезжают со стороны opposite(d).
        const from = n.links[opposite(d)];
        if (from < 0) continue;
        const dir = DIRS[d];
        const right = DIRS[rightOf(d)];
        this.lights.push({
          node: n.id,
          dir: d,
          x: n.x - dir.x * (h + 2.2) + right.x * (h + 1.2),
          z: n.z - dir.z * (h + 2.2) + right.z * (h + 1.2),
        });
      }
    }
  }

  // ---------------------------------------------------------------- набережная

  private buildPromenade(rng: Rng): void {
    const p = this.promenade;
    this.walkLoops.push({ x0: this.minX + 10, z0: p.z0 + 3, x1: this.maxX - 10, z1: p.z1 - 4 });
    for (let x = p.x0 + 10; x < p.x1 - 5; x += 18) {
      this.props.push({ kind: 'lamp', x, z: p.z1 - 1.2, rot: 0, scale: 1, dirX: 0, dirZ: -1 });
      if (rng.chance(0.8)) this.props.push({ kind: 'tree', x: x + 9, z: p.z0 + 12, rot: rng.range(0, 6), scale: rng.range(0.8, 1.2) });
      if (rng.chance(0.5)) this.props.push({ kind: 'bench', x: x + 4, z: p.z1 - 3, rot: Math.PI, scale: 1 });
    }
    this.greens.push({ x0: p.x0 + 5, z0: p.z0 + 9, x1: p.x1 - 5, z1: p.z0 + 15 });
  }

  private buildOutskirts(rng: Rng): void {
    const b = this.cfg.boundary;
    const edge = this.halfRoad + 6;
    for (let k = 0; k < 220; k++) {
      const side = rng.int(0, 2);
      let x: number, z: number;
      if (side === 0) {
        x = rng.range(-b, b);
        z = rng.range(-b, this.minZ - edge);
      } else if (side === 1) {
        x = rng.range(this.maxX + edge, b);
        z = rng.range(-b, this.maxZ);
      } else {
        x = rng.range(-b, this.minX - edge);
        z = rng.range(-b, this.maxZ);
      }
      this.props.push({ kind: rng.chance(0.8) ? 'tree' : 'bush', x, z, rot: rng.range(0, 6), scale: rng.range(1, 1.8) });
    }
  }

  /** Случайная точка на тротуаре (для спавна пешеходов). */
  randomSidewalkPoint(rng: { range(a: number, b: number): number; int(a: number, b: number): number }): { x: number; z: number; loop: number } {
    const loop = rng.int(0, this.walkLoops.length - 1);
    const r = this.walkLoops[loop];
    const side = rng.int(0, 3);
    const t = rng.range(0, 1);
    const x = side === 0 || side === 2 ? r.x0 + (r.x1 - r.x0) * t : side === 1 ? r.x1 : r.x0;
    const z = side === 1 || side === 3 ? r.z0 + (r.z1 - r.z0) * t : side === 0 ? r.z0 : r.z1;
    return { x, z, loop };
  }
}
