import type { CityLayout } from '../world/CityLayout';
import { CONFIG } from '../config';

export type BlipKind =
  | 'player' | 'mission' | 'objective' | 'enemy' | 'police' | 'gunshop' | 'paintshop'
  | 'safehouse' | 'hospital' | 'policeStation' | 'checkpoint' | 'pickup' | 'vehicle';

export interface Blip {
  kind: BlipKind;
  x: number;
  z: number;
  label?: string;
  /** Показывать на краю миникарты, если за её пределами. */
  pinned?: boolean;
}

export const BLIP_STYLE: Record<BlipKind, { color: string; glyph: string; size: number }> = {
  player: { color: '#ffffff', glyph: '▲', size: 14 },
  mission: { color: '#ffd23f', glyph: '!', size: 16 },
  objective: { color: '#ffd23f', glyph: '●', size: 13 },
  enemy: { color: '#ff3b3b', glyph: '●', size: 10 },
  police: { color: '#4f8bff', glyph: '■', size: 9 },
  gunshop: { color: '#ff7b54', glyph: '⌖', size: 15 },
  paintshop: { color: '#b07bff', glyph: '✎', size: 14 },
  safehouse: { color: '#5cd65c', glyph: '⌂', size: 16 },
  hospital: { color: '#ff6b81', glyph: '+', size: 16 },
  policeStation: { color: '#6fa8ff', glyph: '★', size: 13 },
  checkpoint: { color: '#ffd23f', glyph: '◆', size: 13 },
  pickup: { color: '#7dff7d', glyph: '$', size: 12 },
  vehicle: { color: '#5ad1ff', glyph: '▣', size: 12 },
};

/**
 * Растровая карта города (1 px = 1 м), рисуется один раз и используется
 * миникартой (поворот вместе с камерой) и полноэкранной картой (M).
 */
export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  /** Мировая координата левого верхнего угла карты. */
  readonly origin = -600;
  readonly size = 1200;

  constructor(private readonly city: CityLayout) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
    this.draw();
  }

  toMap(x: number, z: number): [number, number] {
    return [x - this.origin, z - this.origin];
  }

  private draw(): void {
    const c = this.canvas.getContext('2d')!;
    const L = this.city;
    const o = -this.origin;
    c.fillStyle = '#4b5a3c';
    c.fillRect(0, 0, this.size, this.size);
    // Вода.
    c.fillStyle = '#1f4e66';
    c.fillRect(0, CONFIG.world.waterZ + o, this.size, this.size);
    // Набережная и кварталы.
    c.fillStyle = '#9b968c';
    c.fillRect(L.promenade.x0 + o, L.promenade.z0 + o, L.promenade.x1 - L.promenade.x0, L.promenade.z1 - L.promenade.z0);
    for (const b of L.blocks) {
      c.fillStyle = b.district === 'industrial' ? '#8d8a80' : '#a7a299';
      c.fillRect(b.x0 + o, b.z0 + o, b.x1 - b.x0, b.z1 - b.z0);
    }
    c.fillStyle = '#5f8f48';
    for (const g of L.greens) c.fillRect(g.x0 + o, g.z0 + o, g.x1 - g.x0, g.z1 - g.z0);
    c.fillStyle = '#6f6f6f';
    for (const r of L.parkingLots) c.fillRect(r.x0 + o, r.z0 + o, r.x1 - r.x0, r.z1 - r.z0);
    // Здания.
    for (const b of L.buildings) {
      if (b.y > CONFIG.world.plinthHeight + 0.01) continue;
      const shade = Math.min(1, b.h / 120);
      const v = Math.round(120 - shade * 50);
      c.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      c.fillRect(b.x - b.w / 2 + o, b.z - b.d / 2 + o, b.w, b.d);
    }
    for (const f of L.fountains) {
      c.fillStyle = '#3f8fb0';
      c.beginPath();
      c.arc(f.x + o, f.z + o, f.r, 0, Math.PI * 2);
      c.fill();
    }
    // Дороги.
    const h = L.halfRoad;
    c.fillStyle = '#2b2d31';
    for (const z of L.zs) c.fillRect(L.minX - h + o, z - h + o, L.maxX - L.minX + 2 * h, 2 * h);
    for (const x of L.xs) c.fillRect(x - h + o, L.minZ - h + o, 2 * h, L.maxZ - L.minZ + 2 * h);
    c.strokeStyle = 'rgba(230,190,60,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    for (const z of L.zs) {
      c.moveTo(L.minX + o, z + o);
      c.lineTo(L.maxX + o, z + o);
    }
    for (const x of L.xs) {
      c.moveTo(x + o, L.minZ + o);
      c.lineTo(x + o, L.maxZ + o);
    }
    c.stroke();
  }

  /** Нарисовать значок. */
  static drawBlip(c: CanvasRenderingContext2D, b: Blip, x: number, y: number, scale = 1, rot = 0): void {
    const st = BLIP_STYLE[b.kind];
    const s = st.size * scale;
    c.save();
    c.translate(x, y);
    if (b.kind === 'player') {
      c.rotate(rot);
      c.fillStyle = '#fff';
      c.strokeStyle = '#000';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -s * 0.7);
      c.lineTo(s * 0.5, s * 0.55);
      c.lineTo(0, s * 0.3);
      c.lineTo(-s * 0.5, s * 0.55);
      c.closePath();
      c.stroke();
      c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.beginPath();
      c.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = st.color;
      c.font = `bold ${Math.round(s)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(st.glyph, 0, 1);
    }
    c.restore();
  }
}
