import * as THREE from 'three';
import { CONFIG, GROUP, WEAPON_ORDER, type WeaponId } from '../config';
import type { GameContext } from '../core/Context';
import { rayPointDistance } from '../core/math';
import type { HumanPose } from '../player/HumanModel';
import type { Ped } from '../ai/Pedestrians';
import { Vehicle } from '../vehicles/Vehicle';

type WeaponDef = (typeof CONFIG.weapons)[WeaponId];

export interface AmmoState {
  mag: number;
  reserve: number;
}

const MAX_TRACERS = 48;

/**
 * Оружие игрока и общая баллистика (hitscan) для NPC: кулаки, пистолет, автомат.
 * Прицел — ПКМ, стрельба — ЛКМ, разброс растёт при стрельбе и движении,
 * отдача поднимает камеру. Трассеры — один LineSegments.
 */
export class Weapons {
  current: WeaponId = 'fists';
  readonly owned = new Set<WeaponId>(['fists']);
  readonly ammo: Record<WeaponId, AmmoState> = {
    fists: { mag: 0, reserve: 0 },
    pistol: { mag: 0, reserve: 0 },
    rifle: { mag: 0, reserve: 0 },
  };
  private cooldown = 0;
  private reloadTimer = 0;
  private bloom = 0;
  private lastShot = 10;
  private punchTimer = 0;
  private punchHit = false;
  private tracerGeo: THREE.BufferGeometry;
  private tracerPos: Float32Array;
  private tracerLife: Float32Array;
  private tracerCursor = 0;
  private origin = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private readonly ctx: GameContext) {
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(
      this.tracerGeo,
      new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lines.frustumCulled = false;
    ctx.scene.add(lines);
  }

  get def(): WeaponDef {
    return CONFIG.weapons[this.current];
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  give(id: WeaponId, ammo: number): void {
    this.owned.add(id);
    const a = this.ammo[id];
    a.reserve += ammo;
    if (a.mag === 0) this.fillMag(id);
  }

  private fillMag(id: WeaponId): void {
    const a = this.ammo[id];
    const need = CONFIG.weapons[id].magazine - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    a.reserve -= take;
  }

  select(id: WeaponId): void {
    if (!this.owned.has(id) || id === this.current) return;
    this.current = id;
    this.reloadTimer = 0;
    this.ctx.player.model.setWeapon(id);
    this.ctx.events.emit('weaponChanged', { id });
  }

  cycle(step: number): void {
    const owned = WEAPON_ORDER.filter((w) => this.owned.has(w));
    const i = owned.indexOf(this.current);
    this.select(owned[(i + step + owned.length) % owned.length]);
  }

  isAiming(): boolean {
    const p = this.ctx.player;
    return this.ctx.input.rmb && p.mode === 'foot';
  }

  firingRecently(): boolean {
    return this.lastShot < 0.6 || this.punchTimer > 0;
  }

  /** Поза рук: прицел, удар, оружие в руке. */
  applyArmPose(pose: HumanPose): void {
    const pitch = this.ctx.cameraRig.pitch;
    if (this.punchTimer > 0) {
      const t = this.punchTimer / 0.35;
      pose.armR = -Math.PI / 2 * Math.sin(t * Math.PI);
      pose.armL = -0.6;
      return;
    }
    if (this.current === 'fists') return;
    if (this.isAiming() || this.lastShot < 0.6) {
      pose.armR = -Math.PI / 2 - pitch;
      pose.armL = this.current === 'rifle' ? -Math.PI / 2 - pitch + 0.25 : -0.2;
    } else if (this.current === 'rifle') {
      pose.armR = -0.5;
      pose.armL = -0.7;
    }
  }

  // ------------------------------------------------------------ трассеры

  addTracer(a: THREE.Vector3, b: THREE.Vector3): void {
    const i = this.tracerCursor;
    this.tracerCursor = (i + 1) % MAX_TRACERS;
    this.tracerPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.tracerLife[i] = 0.06;
  }

  // ------------------------------------------------------------ выстрел игрока

  private muzzlePoint(out: THREE.Vector3): THREE.Vector3 {
    const p = this.ctx.player;
    const yaw = p.yaw;
    return out.set(
      p.renderPosition.x + Math.sin(yaw) * 0.6 - Math.cos(yaw) * 0.3,
      p.renderPosition.y + 1.45,
      p.renderPosition.z + Math.cos(yaw) * 0.6 + Math.sin(yaw) * 0.3,
    );
  }

  private fire(): void {
    const { ctx } = this;
    const def = this.def;
    const a = this.ammo[this.current];
    if (a.mag <= 0) {
      if (a.reserve > 0) this.startReload();
      else ctx.events.emit('dryFire', {});
      this.cooldown = 0.3;
      return;
    }
    a.mag--;
    this.cooldown = def.fireInterval;
    this.lastShot = 0;
    const cam = ctx.camera;
    cam.getWorldDirection(this.dir);
    if (this.isAiming()) this.aimAssist(cam.position, this.dir);
    // Разброс: базовый × (бедро/прицел) + раскачка от стрельбы и бега.
    const moving = Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) > 3 ? 1.6 : 1;
    const spread = def.spread * (this.isAiming() ? 1 : 2.4) * moving + this.bloom;
    this.dir.x += (Math.random() - 0.5) * 2 * spread;
    this.dir.y += (Math.random() - 0.5) * 2 * spread;
    this.dir.z += (Math.random() - 0.5) * 2 * spread;
    this.dir.normalize();
    // Луч из камеры, но начиная от плоскости игрока — чтобы не попадать в то, что за спиной.
    const head = ctx.player.head;
    const along = Math.max(0, this.tmp.subVectors(head, cam.position).dot(this.dir));
    this.origin.copy(cam.position).addScaledVector(this.dir, along);
    const muzzle = this.muzzlePoint(new THREE.Vector3());
    const end = this.traceShot(this.origin, this.dir, def.range, def.damage, true, null);
    this.addTracer(muzzle, end);
    ctx.effects.muzzle(muzzle);
    this.bloom = Math.min(0.06, this.bloom + def.spread * 0.6);
    ctx.cameraRig.addRecoil(def.recoil * (0.7 + Math.random() * 0.6));
    ctx.events.emit('gunshot', { position: muzzle.clone(), byPlayer: true, weapon: this.current });
    if (a.mag === 0 && a.reserve > 0) this.startReload();
  }

  /** Мягкий автоприцел: если человек почти под прицелом — доводим на центр корпуса. */
  private aimAssist(from: THREE.Vector3, dir: THREE.Vector3): void {
    let best: Ped | null = null;
    let bestAng = 0.07;
    const to = new THREE.Vector3();
    for (const p of this.ctx.peds.list) {
      if (!p.alive || p.state === 'down') continue;
      to.set(p.x - from.x, p.y + 1.15 - from.y, p.z - from.z);
      const d = to.length();
      if (d > this.def.range || d < 1) continue;
      const ang = dir.angleTo(to);
      // Угловой допуск растёт вблизи (тело занимает больше экрана).
      if (ang < bestAng * (1 + 6 / d)) {
        bestAng = ang;
        best = p;
      }
    }
    if (best) dir.set(best.x - from.x, best.y + 1.15 - from.y, best.z - from.z).normalize();
  }

  /**
   * Трассировка выстрела: статика/машины через Rapier, люди — через пересечение
   * луча с «капсулой» (тело + голова). Возвращает точку попадания.
   */
  traceShot(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    damage: number,
    byPlayer: boolean,
    shooter: Ped | null,
  ): THREE.Vector3 {
    const { ctx } = this;
    const exclude = byPlayer ? undefined : undefined;
    const hit = ctx.physics.raycast(origin, dir, range, GROUP.STATIC | GROUP.VEHICLE, exclude);
    let best = hit ? hit.distance : range;
    let pedHit: Ped | null = null;
    let headshot = false;
    for (const p of ctx.peds.list) {
      if (!p.alive || p === shooter) continue;
      if (Math.abs(p.x - origin.x) > range || Math.abs(p.z - origin.z) > range) continue;
      const lying = p.state === 'down';
      const body = rayPointDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, p.x, p.y + (lying ? 0.25 : 1.05), p.z);
      if (body.d < (lying ? 0.6 : 0.42) && body.t < best) {
        best = body.t;
        pedHit = p;
        headshot = false;
      }
      if (!lying) {
        const h = rayPointDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, p.x, p.y + 1.72, p.z);
        if (h.d < 0.17 && h.t < best + 0.3) {
          best = Math.min(best, h.t);
          pedHit = p;
          headshot = true;
        }
      }
    }
    // Игрок как цель NPC.
    let playerHit = false;
    if (!byPlayer && ctx.player.mode !== 'vehicle' && ctx.player.alive) {
      const pp = ctx.player.position;
      const r = rayPointDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, pp.x, pp.y + 0.2, pp.z);
      if (r.d < 0.5 && r.t < best) {
        best = r.t;
        playerHit = true;
        pedHit = null;
      }
    }
    const point = new THREE.Vector3().copy(origin).addScaledVector(dir, best);
    if (playerHit) {
      ctx.damage.damagePlayer(damage, origin);
    } else if (pedHit) {
      const dmg = damage * (headshot ? CONFIG.weapons.headshotMultiplier : 1);
      ctx.peds.damage(pedHit, dmg, byPlayer, origin);
    } else if (hit) {
      const owner = hit.owner;
      if (owner instanceof Vehicle) {
        owner.damage(damage * 1.3, byPlayer);
        if (owner.driver === 'player' && !byPlayer) ctx.damage.damagePlayer(damage * 0.25, origin);
        if (byPlayer && owner.spec.id === 'police') ctx.events.emit('crime', { kind: 'attackCop', position: point.clone() });
        ctx.effects.sparks(point, hit.normal, 0xffffff);
      } else ctx.effects.sparks(point, hit.normal);
    }
    return point;
  }

  private startReload(): void {
    const a = this.ammo[this.current];
    if (this.current === 'fists' || a.reserve <= 0 || a.mag >= this.def.magazine || this.reloadTimer > 0) return;
    this.reloadTimer = CONFIG.weapons.reloadSeconds;
    this.ctx.events.emit('reload', {});
  }

  private punch(): void {
    if (this.punchTimer > 0) return;
    this.punchTimer = 0.35;
    this.punchHit = false;
    this.cooldown = CONFIG.weapons.fists.fireInterval;
  }

  private resolvePunch(): void {
    const { ctx } = this;
    const p = ctx.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const reach = CONFIG.weapons.fists.range;
    for (const ped of ctx.peds.list) {
      if (!ped.alive) continue;
      const dx = ped.x - p.position.x, dz = ped.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      ctx.peds.damage(ped, CONFIG.weapons.fists.damage, true, p.position);
      ped.vx = fx * 3;
      ped.vz = fz * 3;
      ctx.events.emit('punch', { position: ped.position });
      return;
    }
  }

  // ------------------------------------------------------------ кадр

  update(dt: number): void {
    const { input, player } = this.ctx;
    this.cooldown -= dt;
    this.lastShot += dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.08);
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      if (!this.punchHit && this.punchTimer < 0.2) {
        this.punchHit = true;
        this.resolvePunch();
      }
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.fillMag(this.current);
    }
    // Трассеры гаснут.
    let dirty = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        dirty = true;
        if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6);
      }
    }
    if (dirty) this.tracerGeo.attributes.position.needsUpdate = true;

    if (player.mode !== 'foot') return;
    if (input.wheel !== 0) this.cycle(input.wheel > 0 ? 1 : -1);
    if (input.pressed('Digit1')) this.select('fists');
    if (input.pressed('Digit2')) this.select('pistol');
    if (input.pressed('Digit3')) this.select('rifle');
    if (input.pressed('KeyR')) this.startReload();
    const def = this.def;
    const trigger = def.auto ? input.lmb : input.lmbPressed;
    if (trigger && this.cooldown <= 0 && this.reloadTimer <= 0) {
      if (this.current === 'fists') this.punch();
      else this.fire();
    }
  }

  /** Сохранение/загрузка. */
  serialize() {
    return { current: this.current, owned: [...this.owned], ammo: this.ammo };
  }

  restore(data: { current: WeaponId; owned: WeaponId[]; ammo: Record<WeaponId, AmmoState> }): void {
    this.owned.clear();
    for (const w of data.owned) this.owned.add(w);
    this.owned.add('fists');
    for (const k of WEAPON_ORDER) if (data.ammo[k]) this.ammo[k] = { ...data.ammo[k] };
    this.current = this.owned.has(data.current) ? data.current : 'fists';
    this.ctx.player.model.setWeapon(this.current);
  }
}
