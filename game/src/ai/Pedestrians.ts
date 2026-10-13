import * as THREE from 'three';
import { CONFIG, type WeaponId } from '../config';
import type { GameContext } from '../core/Context';
import { rand } from '../core/Rng';
import { clamp, dampAngle, wrapAngle, yawFromDir } from '../core/math';
import type { Rect } from '../world/CityLayout';
import { restPose, walkPose, type HumanColors, type HumanPose } from '../player/HumanModel';
import { CrowdRenderer, type CrowdMember } from './Crowd';

export type PedRole = 'civilian' | 'cop' | 'gang' | 'boss';
export type PedState = 'walk' | 'cross' | 'idle' | 'flee' | 'down' | 'dead' | 'script';

const SHIRTS = [0x3d5a80, 0xee6c4d, 0x98c1d9, 0x293241, 0xe0fbfc, 0x8a5a44, 0x6a994e, 0xbc4749, 0xf2e8cf, 0x5e548e, 0xf4a261, 0x2a9d8f];
const PANTS = [0x22223b, 0x4a4e69, 0x3d405b, 0x5c4033, 0x283618, 0x1d3557, 0x6b705c];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa0662f];
const HAIRS = [0x090806, 0x2c222b, 0x71635a, 0xb7a69e, 0xd6c4c2, 0x6a4e42, 0xa56b46];

let nextPedId = 1;

export class Ped implements CrowdMember {
  readonly id = nextPedId++;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  pose: HumanPose = restPose();
  colors: HumanColors;
  armed = false;
  hat = false;
  state: PedState = 'walk';
  timer = 0;
  speed: number = CONFIG.peds.walkSpeed;
  loop = 0;
  p = 0;
  dirSign = 1;
  cross: { x: number; z: number; loop: number; p: number } | null = null;
  health: number;
  maxHealth: number;
  vx = 0;
  vz = 0;
  walkPhase = Math.random() * 6;
  readonly fleeFrom = new THREE.Vector3();
  // Управление извне (полиция, бандиты миссий).
  goalX = 0;
  goalZ = 0;
  goalSpeed = 0;
  faceYaw: number | null = null;
  aiming = false;
  persistent = false;
  weapon: WeaponId | null = null;
  fireCooldown = 0;
  /** Контроллер ИИ (полиция/миссия), которому принадлежит пешеход. */
  controller: unknown = null;
  deadTimer = 0;
  /** Пауза между попытками увернуться от машины. */
  dodgeCd = 0;
  private moved = 0;

  constructor(readonly role: PedRole, colors?: Partial<HumanColors>) {
    this.colors = {
      shirt: colors?.shirt ?? rand.pick(SHIRTS),
      pants: colors?.pants ?? rand.pick(PANTS),
      skin: colors?.skin ?? rand.pick(SKINS),
      hair: colors?.hair ?? rand.pick(HAIRS),
    };
    this.maxHealth = role === 'cop' ? CONFIG.police.copHealth : role === 'boss' ? 260 : role === 'gang' ? 70 : CONFIG.peds.health;
    this.health = this.maxHealth;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + 0.9, this.z);
  }

  /** Двигаться к точке (для внешних контроллеров). */
  moveTo(x: number, z: number, speed: number): void {
    this.goalX = x;
    this.goalZ = z;
    this.goalSpeed = speed;
  }

  get movedSpeed(): number {
    return this.moved;
  }

  setMoved(v: number): void {
    this.moved = v;
  }
}

/**
 * Пешеходы: гуляют по тротуарам вокруг кварталов, переходят дороги по зебрам,
 * разбегаются от стрельбы, взрывов и несущихся машин. Попадание машиной —
 * сбивает или убивает. Отрисовка — CrowdRenderer (инстансинг).
 */
export class Pedestrians {
  readonly list: Ped[] = [];
  private renderer: CrowdRenderer;
  private spawnTimer = 0;
  densityScale = 1;
  private tmp = new THREE.Vector3();

  constructor(private readonly ctx: GameContext) {
    this.renderer = new CrowdRenderer(ctx.scene, CONFIG.peds.max + 40);
    ctx.events.on('gunshot', ({ position }) => this.scare(position, CONFIG.peds.fleeRadius * 1.6));
    ctx.events.on('explosion', ({ position, radius, byPlayer }) => this.onExplosion(position, radius, byPlayer));
    ctx.events.on('driverEjected', ({ vehicle, position }) => {
      if (vehicle.spec.id === 'police') return;
      const ped = this.spawnAt('civilian', position.x, position.z);
      ped.persistent = false;
      this.flee(ped, vehicle.position, CONFIG.peds.fleeSeconds);
    });
  }

  get civilianTarget(): number {
    return Math.round(CONFIG.peds.max * this.ctx.settings.quality.pedScale * this.densityScale);
  }

  // ------------------------------------------------------------ геометрия колец

  private loopPoint(r: Rect, p: number, out: { x: number; z: number }) {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const P = 2 * (w + h);
    p = ((p % P) + P) % P;
    if (p < w) {
      out.x = r.x0 + p;
      out.z = r.z0;
    } else if (p < w + h) {
      out.x = r.x1;
      out.z = r.z0 + (p - w);
    } else if (p < 2 * w + h) {
      out.x = r.x1 - (p - w - h);
      out.z = r.z1;
    } else {
      out.x = r.x0;
      out.z = r.z1 - (p - 2 * w - h);
    }
    return out;
  }

  private corners(r: Rect): { x: number; z: number; p: number }[] {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    return [
      { x: r.x0, z: r.z0, p: 0 },
      { x: r.x1, z: r.z0, p: w },
      { x: r.x1, z: r.z1, p: w + h },
      { x: r.x0, z: r.z1, p: 2 * w + h },
    ];
  }

  private section(r: Rect, p: number): number {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const P = 2 * (w + h);
    p = ((p % P) + P) % P;
    return p < w ? 0 : p < w + h ? 1 : p < 2 * w + h ? 2 : 3;
  }

  /** Найти угол соседнего квартала через улицу (для перехода по зебре). */
  private crossingTarget(x: number, z: number, ownLoop: number) {
    const loops = this.ctx.city.walkLoops;
    const found: { x: number; z: number; loop: number; p: number }[] = [];
    for (let i = 0; i < loops.length; i++) {
      if (i === ownLoop) continue;
      const r = loops[i];
      if (r.x0 > x + 30 || r.x1 < x - 30 || r.z0 > z + 30 || r.z1 < z - 30) continue;
      for (const c of this.corners(r)) {
        const dx = Math.abs(c.x - x), dz = Math.abs(c.z - z);
        if ((dx < 1 && dz > 10 && dz < 26) || (dz < 1 && dx > 10 && dx < 26)) found.push({ x: c.x, z: c.z, loop: i, p: c.p });
      }
    }
    return found.length ? rand.pick(found) : null;
  }

  // ------------------------------------------------------------ спавн

  spawnAt(role: PedRole, x: number, z: number, colors?: Partial<HumanColors>): Ped {
    const ped = new Ped(role, colors);
    ped.x = x;
    ped.z = z;
    ped.y = this.ctx.city.surfaceHeight(x, z);
    ped.yaw = rand.range(-Math.PI, Math.PI);
    // Привязываем к ближайшему кольцу тротуара (для обычной прогулки).
    let best = 0, bd = Infinity;
    const loops = this.ctx.city.walkLoops;
    for (let i = 0; i < loops.length; i++) {
      const r = loops[i];
      const cx = clamp(x, r.x0, r.x1), cz = clamp(z, r.z0, r.z1);
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    ped.loop = best;
    ped.p = this.projectToLoop(loops[best], x, z);
    ped.dirSign = rand.chance(0.5) ? 1 : -1;
    if (role === 'cop') {
      ped.colors.shirt = 0x1d3557;
      ped.colors.pants = 0x14213d;
      ped.hat = true;
    }
    this.list.push(ped);
    return ped;
  }

  private projectToLoop(r: Rect, x: number, z: number): number {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const cands = [
      { d: Math.abs(z - r.z0), p: clamp(x - r.x0, 0, w) },
      { d: Math.abs(x - r.x1), p: w + clamp(z - r.z0, 0, h) },
      { d: Math.abs(z - r.z1), p: w + h + clamp(r.x1 - x, 0, w) },
      { d: Math.abs(x - r.x0), p: 2 * w + h + clamp(r.z1 - z, 0, h) },
    ];
    cands.sort((a, b) => a.d - b.d);
    return cands[0].p;
  }

  private trySpawnCivilian(): void {
    const { city, camera } = this.ctx;
    const focus = this.focus();
    const cfg = CONFIG.peds;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    for (let attempt = 0; attempt < 10; attempt++) {
      const pt = city.randomSidewalkPoint(rand);
      const d = Math.hypot(pt.x - focus.x, pt.z - focus.z);
      if (d < cfg.spawnRadiusMin || d > cfg.spawnRadiusMax) continue;
      this.tmp.set(pt.x - camera.position.x, 0, pt.z - camera.position.z).normalize();
      if (d < 60 && this.tmp.dot(camDir) > 0.4) continue;
      const ped = this.spawnAt('civilian', pt.x, pt.z);
      ped.loop = pt.loop;
      ped.p = this.projectToLoop(city.walkLoops[pt.loop], pt.x, pt.z);
      ped.speed = CONFIG.peds.walkSpeed * rand.range(0.8, 1.2);
      return;
    }
  }

  private focus(): THREE.Vector3 {
    const { player, vehicles } = this.ctx;
    return player.mode === 'vehicle' && vehicles.playerVehicle ? vehicles.playerVehicle.position : player.position;
  }

  remove(ped: Ped): void {
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
  }

  // ------------------------------------------------------------ реакции

  flee(ped: Ped, from: THREE.Vector3, seconds: number): void {
    if (!ped.alive || ped.state === 'down' || ped.role !== 'civilian') return;
    ped.fleeFrom.copy(from);
    ped.timer = seconds;
    if (ped.state !== 'cross') ped.state = 'flee';
    const r = this.ctx.city.walkLoops[ped.loop];
    const a = this.loopPoint(r, ped.p + 2, { x: 0, z: 0 });
    const b = this.loopPoint(r, ped.p - 2, { x: 0, z: 0 });
    ped.dirSign = Math.hypot(a.x - from.x, a.z - from.z) > Math.hypot(b.x - from.x, b.z - from.z) ? 1 : -1;
  }

  scare(p: THREE.Vector3, radius: number): void {
    for (const ped of this.list) {
      if (Math.hypot(ped.x - p.x, ped.z - p.z) < radius) this.flee(ped, p, CONFIG.peds.fleeSeconds);
    }
  }

  /** Урон пешеходу. Возвращает true, если пешеход погиб. */
  damage(ped: Ped, amount: number, byPlayer: boolean, from?: THREE.Vector3): boolean {
    if (!ped.alive) return false;
    ped.health -= amount;
    const pos = ped.position;
    this.ctx.effects.blood(pos);
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.deadTimer = 30;
      ped.armed = false;
      this.ctx.events.emit('pedKilled', { position: pos, role: ped.role, byPlayer, ped });
      if (byPlayer) this.ctx.events.emit('crime', { kind: ped.role === 'cop' ? 'killCop' : 'killPed', position: pos });
      return true;
    }
    if (byPlayer) {
      this.ctx.events.emit('crime', { kind: ped.role === 'cop' ? 'attackCop' : 'hitPed', position: pos });
    }
    this.ctx.events.emit('pedHurt', { ped, byPlayer });
    if (from) this.flee(ped, from, CONFIG.peds.fleeSeconds);
    return false;
  }

  private knock(ped: Ped, vx: number, vz: number, seconds: number): void {
    ped.vx = vx;
    ped.vz = vz;
    if (ped.alive) {
      ped.state = 'down';
      ped.timer = seconds;
    }
  }

  private onExplosion(p: THREE.Vector3, radius: number, byPlayer: boolean): void {
    for (const ped of this.list) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d > radius * 1.4) continue;
      const k = 1 - d / (radius * 1.4);
      const dx = (ped.x - p.x) / (d || 1), dz = (ped.z - p.z) / (d || 1);
      this.damage(ped, CONFIG.vehicles.explosionDamage * k * 1.5, byPlayer);
      this.knock(ped, dx * 10 * k, dz * 10 * k, 2.5);
    }
    this.scare(p, radius * 5);
  }

  // ------------------------------------------------------------ шаг симуляции

  private checkVehicleHits(ped: Ped): void {
    if (ped.state === 'dead' && Math.hypot(ped.vx, ped.vz) > 1) return;
    for (const v of this.ctx.vehicles.list) {
      const sp = v.speed;
      const dx = v.position.x - ped.x, dz = v.position.z - ped.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
      if (sp > 3 && v.containsXZ(ped.x, ped.z, 0.35)) {
        const lv = v.body.linvel();
        const byPlayer = v.driver === 'player';
        if (ped.alive) {
          this.ctx.events.emit('pedHitByCar', { ped, vehicle: v, speed: sp });
          this.damage(ped, sp * 6, byPlayer, v.position);
        }
        this.knock(ped, lv.x * 0.9, lv.z * 0.9, 3);
        return;
      }
      // Уклонение: машина несётся прямо на пешехода.
      if (ped.alive && ped.role === 'civilian' && ped.state !== 'down' && sp > 6) {
        const lv = v.body.linvel();
        const fx = v.position.x + lv.x * 0.9, fz = v.position.z + lv.z * 0.9;
        if (Math.hypot(fx - ped.x, fz - ped.z) < 3 && ped.state !== 'flee' && ped.dodgeCd <= 0) {
          // Успевают отскочить не все.
          ped.dodgeCd = 2;
          if (rand.chance(0.45)) this.flee(ped, v.position, 4);
        }
      }
    }
  }

  private stepPed(ped: Ped, dt: number): void {
    const city = this.ctx.city;
    const cfg = CONFIG.peds;
    let mvx = 0, mvz = 0;
    // Инерция от удара.
    if (Math.abs(ped.vx) + Math.abs(ped.vz) > 0.05) {
      const nx = ped.x + ped.vx * dt, nz = ped.z + ped.vz * dt;
      if (!city.blocked(nx, nz, 0.3)) {
        ped.x = nx;
        ped.z = nz;
      } else {
        ped.vx *= -0.3;
        ped.vz *= -0.3;
      }
      const k = Math.exp(-3.5 * dt);
      ped.vx *= k;
      ped.vz *= k;
    }
    switch (ped.state) {
      case 'dead':
        ped.deadTimer -= dt;
        break;
      case 'down':
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.state = ped.role === 'civilian' ? 'flee' : 'script';
          ped.timer = cfg.fleeSeconds;
        }
        break;
      case 'idle':
        ped.timer -= dt;
        if (ped.timer <= 0) ped.state = 'walk';
        break;
      case 'walk':
      case 'flee': {
        const r = city.walkLoops[ped.loop];
        const run = ped.state === 'flee';
        const sp = run ? cfg.runSpeed : ped.speed;
        const before = this.section(r, ped.p);
        const old = this.loopPoint(r, ped.p, { x: 0, z: 0 });
        ped.p += ped.dirSign * sp * dt;
        const after = this.section(r, ped.p);
        const np = this.loopPoint(r, ped.p, { x: 0, z: 0 });
        // Ped мог быть сдвинут ударом — плавно возвращаем на кольцо.
        const tx = np.x + (ped.x - old.x) * Math.exp(-2 * dt);
        const tz = np.z + (ped.z - old.z) * Math.exp(-2 * dt);
        mvx = tx - ped.x;
        mvz = tz - ped.z;
        ped.x = tx;
        ped.z = tz;
        if (run) {
          ped.timer -= dt;
          if (ped.timer <= 0) ped.state = 'walk';
        } else if (before !== after) {
          // На углу: иногда переходим улицу, иногда разворачиваемся.
          const roll = rand.next();
          if (roll < 0.35) {
            const c = this.crossingTarget(np.x, np.z, ped.loop);
            if (c) {
              ped.cross = c;
              ped.state = 'cross';
            }
          } else if (roll < 0.45) ped.dirSign *= -1;
        } else if (rand.next() < dt * 0.02) {
          ped.state = 'idle';
          ped.timer = rand.range(2, 6);
        }
        break;
      }
      case 'cross': {
        const c = ped.cross!;
        const dx = c.x - ped.x, dz = c.z - ped.z;
        const d = Math.hypot(dx, dz);
        const sp = ped.timer > 0 ? cfg.runSpeed : ped.speed * 1.1;
        if (ped.timer > 0) ped.timer -= dt;
        if (d < 0.3) {
          ped.loop = c.loop;
          ped.p = c.p;
          ped.cross = null;
          ped.state = ped.timer > 0 ? 'flee' : 'walk';
        } else {
          const step = Math.min(d, sp * dt);
          mvx = (dx / d) * step;
          mvz = (dz / d) * step;
          ped.x += mvx;
          ped.z += mvz;
        }
        break;
      }
      case 'script': {
        const dx = ped.goalX - ped.x, dz = ped.goalZ - ped.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2 && ped.goalSpeed > 0) {
          const step = Math.min(d, ped.goalSpeed * dt);
          let sx = (dx / d) * step, sz = (dz / d) * step;
          // Скольжение вдоль стен.
          if (city.blocked(ped.x + sx, ped.z + sz)) {
            if (!city.blocked(ped.x + sx, ped.z)) sz = 0;
            else if (!city.blocked(ped.x, ped.z + sz)) sx = 0;
            else {
              sx = 0;
              sz = 0;
            }
          }
          mvx = sx;
          mvz = sz;
          ped.x += sx;
          ped.z += sz;
        }
        break;
      }
    }
    const moved = Math.hypot(mvx, mvz) / Math.max(dt, 1e-4);
    ped.setMoved(moved);
    if (ped.alive && ped.state !== 'down') {
      if (ped.faceYaw !== null && (ped.state === 'script' || ped.aiming)) ped.yaw = dampAngle(ped.yaw, ped.faceYaw, 12, dt);
      else if (moved > 0.2) ped.yaw = dampAngle(ped.yaw, yawFromDir(mvx, mvz), 10, dt);
    }
    ped.fireCooldown = Math.max(0, ped.fireCooldown - dt);
    ped.dodgeCd = Math.max(0, ped.dodgeCd - dt);
  }

  fixedUpdate(dt: number): void {
    for (const ped of this.list) {
      this.stepPed(ped, dt);
      this.checkVehicleHits(ped);
    }
  }

  update(dt: number): void {
    const city = this.ctx.city;
    // Анимация.
    for (const ped of this.list) {
      const surf = city.surfaceHeight(ped.x, ped.z);
      ped.y = surf;
      const pose = ped.pose;
      if (ped.state === 'dead' || ped.state === 'down') {
        Object.assign(pose, restPose());
        pose.lying = 1;
        pose.armL = -0.3;
        pose.armR = 0.5;
      } else {
        const mv = ped.movedSpeed;
        ped.walkPhase += dt * mv * (mv > 3 ? 1.5 : 2.6);
        walkPose(pose, ped.walkPhase, clamp(mv / 1.4, 0, 1), mv > 3);
        if (ped.aiming) {
          pose.armR = -Math.PI / 2;
          pose.armL = -Math.PI / 2.4;
        } else if (ped.state === 'flee' && ped.role === 'civilian') {
          // Руки вверх от испуга.
          pose.armL = -2.6 + Math.sin(ped.walkPhase) * 0.3;
          pose.armR = -2.6 - Math.sin(ped.walkPhase) * 0.3;
        }
      }
    }
    this.renderer.render(this.list);

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.25;
    const focus = this.focus();
    let civilians = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ped = this.list[i];
      const d = Math.hypot(ped.x - focus.x, ped.z - focus.z);
      const expired = ped.state === 'dead' && ped.deadTimer <= 0;
      if (expired || (!ped.persistent && d > CONFIG.peds.despawnRadius)) {
        this.list.splice(i, 1);
        continue;
      }
      if (ped.role === 'civilian') civilians++;
    }
    if (civilians < this.civilianTarget) this.trySpawnCivilian();
  }

  /** Ближайший живой пешеход к лучу/точке — для прицеливания и миссий. */
  nearest(x: number, z: number, maxDist: number, filter?: (p: Ped) => boolean): Ped | null {
    let best: Ped | null = null;
    let bd = maxDist;
    for (const p of this.list) {
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Угол между направлением и пешеходом — помогает при «мягком» автоприцеле. */
  static angleTo(ped: Ped, from: THREE.Vector3, yaw: number): number {
    return Math.abs(wrapAngle(yawFromDir(ped.x - from.x, ped.z - from.z) - yaw));
  }
}
