import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';
import { rand } from '../core/Rng';

type PickupKind = 'cash' | 'health' | 'armor';

interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  amount: number;
  mesh: THREE.Mesh;
  /** Для постоянных пикапов — таймер появления. */
  respawn: number;
  fixed: boolean;
  ttl: number;
}

const COLORS: Record<PickupKind, number> = { cash: 0x3cff6e, health: 0xff4d6d, armor: 0x4da6ff };

/**
 * Подбираемые предметы: деньги, выпавшие из NPC, и постоянные аптечки/бронежилеты
 * в нескольких точках города (появляются снова через минуту).
 */
export class Pickups {
  private list: Pickup[] = [];
  private time = 0;
  private geos: Record<PickupKind, THREE.BufferGeometry> = {
    cash: new THREE.BoxGeometry(0.45, 0.12, 0.25),
    health: new THREE.BoxGeometry(0.5, 0.5, 0.5),
    armor: new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8),
  };

  constructor(private readonly ctx: GameContext) {
    ctx.events.on('pedKilled', ({ position, role, byPlayer }) => {
      if (!byPlayer) return;
      const base = rand.int(CONFIG.peds.cashDropMin, CONFIG.peds.cashDropMax);
      const amount = role === 'boss' ? 1000 : role === 'cop' || role === 'gang' ? base * 2 : base;
      this.add('cash', position.x + rand.range(-0.5, 0.5), position.z + rand.range(-0.5, 0.5), amount, false);
    });
    // Постоянные пикапы: у больниц — аптечки, в паре дворов — броня.
    const c = ctx.city;
    const hosp = c.poi('hospital');
    this.add('health', hosp.x + 4, hosp.z, 50, true);
    const pd = c.poi('police');
    this.add('armor', pd.x + 4, pd.z, 50, true);
    const safe = c.poi('safehouse');
    this.add('health', safe.x - 4, safe.z + 2, 50, true);
    this.add('armor', c.xs[6] + 10, (c.promenade.z0 + c.promenade.z1) / 2, 50, true);
  }

  private add(kind: PickupKind, x: number, z: number, amount: number, fixed: boolean): void {
    const mesh = new THREE.Mesh(this.geos[kind], new THREE.MeshStandardMaterial({ color: COLORS[kind], emissive: COLORS[kind], emissiveIntensity: 0.6 }));
    mesh.position.set(x, 0.6, z);
    this.ctx.scene.add(mesh);
    this.list.push({ kind, x, z, amount, mesh, respawn: 0, fixed, ttl: 60 });
  }

  update(dt: number): void {
    this.time += dt;
    const { player, vehicles, economy, damage, events } = this.ctx;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.position : player.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.respawn > 0) {
        p.respawn -= dt;
        p.mesh.visible = p.respawn <= 0;
        continue;
      }
      p.mesh.rotation.y = this.time * 2;
      p.mesh.position.y = 0.6 + Math.sin(this.time * 3 + p.x) * 0.12;
      if (!p.fixed) {
        p.ttl -= dt;
        if (p.ttl <= 0) {
          this.ctx.scene.remove(p.mesh);
          this.list.splice(i, 1);
          continue;
        }
      }
      if (!player.alive) continue;
      const r = player.mode === 'vehicle' ? 2.8 : 1.3;
      if (Math.hypot(pos.x - p.x, pos.z - p.z) > r) continue;
      if (p.kind === 'health' && player.health >= CONFIG.player.maxHealth) continue;
      if (p.kind === 'armor' && player.armor >= CONFIG.player.maxArmor) continue;
      if (p.kind === 'cash') economy.add(p.amount);
      else if (p.kind === 'health') damage.heal(p.amount);
      else player.armor = Math.min(CONFIG.player.maxArmor, player.armor + p.amount);
      events.emit('pickup', { kind: p.kind });
      if (p.kind !== 'cash') events.emit('notify', { text: p.kind === 'health' ? 'Аптечка +50' : 'Бронежилет +50' });
      if (p.fixed) {
        p.respawn = 60;
        p.mesh.visible = false;
      } else {
        this.ctx.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}
