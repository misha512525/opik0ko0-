import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';
import type { CrimeKind } from '../core/Events';

/**
 * Розыск 0–5 звёзд. Преступления добавляют «жару», если есть свидетели
 * (пешеходы/полиция рядом) или розыск уже идёт. Пока полиция видит игрока,
 * центр зоны поиска следует за ним; если уйти из зоны и не попадаться на глаза
 * evadeSeconds — звёзды гаснут.
 */
export class Wanted {
  heat = 0;
  stars = 0;
  /** Видит ли игрока полиция прямо сейчас (выставляет Police). */
  seen = false;
  readonly lastKnown = new THREE.Vector3();
  evadeTimer = 0;
  private lastShotCrime = 0;
  private lastReckless = 0;
  private time = 0;

  constructor(private readonly ctx: GameContext) {
    ctx.events.on('crime', ({ kind, position }) => this.onCrime(kind, position));
    ctx.events.on('gunshot', ({ position, byPlayer }) => {
      if (!byPlayer || this.time - this.lastShotCrime < 2) return;
      this.lastShotCrime = this.time;
      this.onCrime('shootNearPeople', position);
    });
    ctx.events.on('vehicleDestroyed', ({ position, police, byPlayer }) => {
      if (byPlayer) this.onCrime(police ? 'destroyPoliceCar' : 'destroyCar', position);
    });
    ctx.events.on('vehicleImpact', ({ vehicle, strength }) => {
      // Таран других машин игроком — «опасное вождение».
      if (vehicle.driver === 'player' || strength < 6 || this.time - this.lastReckless < 1.5) return;
      const pv = ctx.vehicles.playerVehicle;
      if (!pv || pv.position.distanceTo(vehicle.position) > vehicle.spec.half.z + pv.spec.half.z + 1.5) return;
      this.lastReckless = this.time;
      this.onCrime(vehicle.spec.id === 'police' ? 'attackCop' : 'reckless', vehicle.position);
    });
  }

  get searchRadius(): number {
    return CONFIG.wanted.searchRadius[this.stars];
  }

  /** Есть ли свидетели рядом с местом преступления. */
  private witnessed(p: THREE.Vector3): boolean {
    if (this.stars > 0) return true;
    const r = CONFIG.wanted.witnessRange;
    for (const ped of this.ctx.peds.list) {
      if (ped.alive && Math.hypot(ped.x - p.x, ped.z - p.z) < r) return true;
    }
    for (const v of this.ctx.vehicles.list) {
      if ((v.driver === 'traffic' || v.driver === 'police') && v.position.distanceTo(p) < r) return true;
    }
    return false;
  }

  onCrime(kind: CrimeKind, p: THREE.Vector3): void {
    if (!this.ctx.player.alive || this.ctx.damage.respawning) return;
    // Стрельба без людей вокруг никого не волнует.
    if (kind === 'shootNearPeople' && !this.witnessed(p)) return;
    if (!this.witnessed(p) && kind !== 'killCop' && kind !== 'attackCop' && kind !== 'destroyPoliceCar') return;
    this.add(CONFIG.wanted.crimes[kind]);
    if (kind === 'killCop' && this.stars < 2) this.setStars(2);
    this.lastKnown.copy(this.ctx.player.position);
    this.evadeTimer = 0;
  }

  add(points: number): void {
    this.heat = Math.min(CONFIG.wanted.thresholds[5] + 200, this.heat + points);
    let stars = 0;
    for (let i = 1; i <= 5; i++) if (this.heat >= CONFIG.wanted.thresholds[i]) stars = i;
    if (stars > this.stars) this.setStars(stars);
  }

  setStars(n: number): void {
    n = Math.max(0, Math.min(5, n));
    if (n === this.stars) return;
    this.stars = n;
    if (this.heat < CONFIG.wanted.thresholds[n]) this.heat = CONFIG.wanted.thresholds[n];
    if (n > 0) this.lastKnown.copy(this.ctx.player.position);
    this.ctx.events.emit('wantedChanged', { stars: n });
  }

  clear(): void {
    this.heat = 0;
    this.evadeTimer = 0;
    if (this.stars !== 0) {
      this.stars = 0;
      this.ctx.events.emit('wantedChanged', { stars: 0 });
    }
  }

  /** Звёзды мигают, когда полиция потеряла игрока из виду. */
  get evading(): boolean {
    return this.stars > 0 && !this.seen;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.stars === 0) return;
    const pos = this.ctx.player.mode === 'vehicle' && this.ctx.vehicles.playerVehicle ? this.ctx.vehicles.playerVehicle.position : this.ctx.player.position;
    if (this.seen) {
      this.lastKnown.copy(pos);
      this.evadeTimer = 0;
      return;
    }
    const outside = Math.hypot(pos.x - this.lastKnown.x, pos.z - this.lastKnown.z) > this.searchRadius;
    if (outside) {
      this.evadeTimer += dt;
      if (this.evadeTimer >= CONFIG.wanted.evadeSeconds[this.stars]) {
        this.clear();
        this.ctx.events.emit('notify', { text: 'Вы ушли от погони' });
      }
    } else this.evadeTimer = Math.max(0, this.evadeTimer - dt * 0.5);
  }
}
