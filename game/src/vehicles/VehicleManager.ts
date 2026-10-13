import * as THREE from 'three';
import { CONFIG, GROUP, type VehicleTypeId, type VehicleSpec } from '../config';
import type { GameContext } from '../core/Context';
import { rand } from '../core/Rng';
import { Vehicle } from './Vehicle';
import { setVehicleNight, updateSirens } from './VehicleModel';

const TYPES = CONFIG.vehicles.types as Record<VehicleTypeId, VehicleSpec>;

/**
 * Реестр всех машин: спавн/удаление, припаркованные машины, посадка игрока (F),
 * управление машиной игрока с клавиатуры, LOD и мигалки.
 */
export class VehicleManager {
  readonly list: Vehicle[] = [];
  playerVehicle: Vehicle | null = null;
  private time = 0;
  private tmp = new THREE.Vector3();

  constructor(private readonly ctx: GameContext) {
    ctx.events.on('explosion', ({ position, radius, source }) => this.onExplosion(position, radius, source as Vehicle | undefined));
  }

  spec(id: VehicleTypeId): VehicleSpec {
    return TYPES[id];
  }

  spawn(type: VehicleTypeId, x: number, z: number, yaw: number, paint?: number): Vehicle {
    const v = new Vehicle(this.ctx, TYPES[type], x, z, yaw, paint);
    this.list.push(v);
    return v;
  }

  remove(v: Vehicle): void {
    const i = this.list.indexOf(v);
    if (i < 0) return;
    if (v === this.playerVehicle) return;
    this.list.splice(i, 1);
    v.dispose();
  }

  randomTrafficType(): VehicleTypeId {
    const ids = (Object.keys(TYPES) as VehicleTypeId[]).filter((k) => TYPES[k].trafficWeight > 0);
    return rand.weighted(ids, (k) => TYPES[k].trafficWeight);
  }

  /** Расставить машины по парковкам города. */
  spawnParked(): void {
    const spots = [...this.ctx.city.parking];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const n = Math.min(CONFIG.vehicles.parkedCars, spots.length);
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      const type = i % 9 === 0 ? 'sports' : this.randomTrafficType();
      const v = this.spawn(type, s.x, s.z, s.yaw);
      v.persistent = true;
      v.body.sleep();
    }
  }

  /** Ближайшая машина к точке, у которой ближайший борт в пределах range. */
  nearest(p: THREE.Vector3, range: number, filter?: (v: Vehicle) => boolean): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = Infinity;
    for (const v of this.list) {
      if (filter && !filter(v)) continue;
      const d = Math.hypot(v.position.x - p.x, v.position.z - p.z) - v.spec.half.x;
      if (d < range && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // -------------------------------------------------------------- игрок

  enter(v: Vehicle): void {
    const { player, events } = this.ctx;
    if (v.destroyed) return;
    if (v.driver !== 'none' && v.driver !== 'player') {
      // Угон: водителя вытаскивают — дальше им займутся пешеходы.
      events.emit('driverEjected', { vehicle: v, position: v.localToWorld(v.spec.half.x + 0.9, 0, 0) });
      events.emit('crime', { kind: 'carjack', position: v.position.clone() });
    }
    v.driver = 'player';
    v.agent = null;
    v.persistent = true;
    this.playerVehicle = v;
    player.mode = 'vehicle';
    player.setPhysicsEnabled(false);
    events.emit('playerEnteredVehicle', { vehicleId: v.id });
  }

  exit(force = false): boolean {
    const v = this.playerVehicle;
    const { player, physics, events } = this.ctx;
    if (!v) return false;
    if (!force && Math.abs(v.forwardSpeed) > 9) return false;
    // Ищем свободное место: левая дверь, правая, сзади, сверху.
    const candidates: [number, number][] = [
      [v.spec.half.x + 0.8, 0],
      [-(v.spec.half.x + 0.8), 0],
      [0, -(v.spec.half.z + 1)],
      [0, v.spec.half.z + 1],
    ];
    let spot: THREE.Vector3 | null = null;
    const origin = v.position.clone().setY(1);
    for (const [lx, lz] of candidates) {
      const target = v.localToWorld(lx, 0, lz).setY(1);
      const dir = target.clone().sub(origin);
      const len = dir.length();
      dir.normalize();
      const hit = physics.raycast(origin, dir, len + 0.4, GROUP.STATIC | GROUP.VEHICLE, v.body);
      if (!hit) {
        spot = target.setY(0.2);
        break;
      }
    }
    if (!spot) spot = v.position.clone().setY(v.spec.half.y * 2 + 0.6);
    v.driver = 'none';
    v.controls.throttle = 0;
    v.controls.steer = 0;
    v.controls.brake = 1;
    v.controls.handbrake = false;
    this.playerVehicle = null;
    player.mode = 'foot';
    player.setPhysicsEnabled(true);
    player.teleport(spot, v.yaw);
    events.emit('playerExitedVehicle', { vehicleId: v.id });
    return true;
  }

  private handlePlayerInput(): void {
    const { input, player } = this.ctx;
    const v = this.playerVehicle;
    if (v) {
      if (v.destroyed && player.mode === 'vehicle') {
        // Машина взорвалась вместе с игроком.
        this.exit(true);
        return;
      }
      if (input.pressed('KeyF')) this.exit();
      return;
    }
    if (player.mode === 'foot' && input.pressed('KeyF')) {
      const target = this.nearest(player.position, CONFIG.player.enterVehicleRange, (c) => !c.destroyed);
      if (target) this.enter(target);
    }
  }

  // -------------------------------------------------------------- взрывы

  private onExplosion(p: THREE.Vector3, radius: number, source?: Vehicle): void {
    for (const v of this.list) {
      if (v === source) continue;
      const d = v.position.distanceTo(p);
      if (d > radius * 1.5) continue;
      const k = 1 - d / (radius * 1.5);
      this.tmp.subVectors(v.position, p).setY(0).normalize();
      const imp = CONFIG.vehicles.explosionImpulse * k;
      v.body.applyImpulse({ x: this.tmp.x * imp, y: imp * 0.3, z: this.tmp.z * imp }, true);
      v.damage(CONFIG.vehicles.explosionDamage * 3 * k, source?.lastDamagedByPlayer ?? false);
    }
  }

  // -------------------------------------------------------------- циклы

  fixedUpdate(dt: number): void {
    this.handlePlayerInputFixed();
    for (const v of this.list) v.fixedUpdate(dt);
  }

  /** Непрерывный ввод читаем в фиксированном шаге. */
  private handlePlayerInputFixed(): void {
    const v = this.playerVehicle;
    const { input } = this.ctx;
    if (!v) return;
    v.controls.throttle = input.axis('KeyS', 'KeyW');
    v.controls.steer = input.axis('KeyA', 'KeyD');
    v.controls.handbrake = input.isDown('Space');
    v.controls.brake = 0;
  }

  postStep(dt: number): void {
    for (const v of this.list) v.postStep(dt);
  }

  update(dt: number, alpha: number): void {
    this.time += dt;
    this.handlePlayerInput();
    const cam = this.ctx.camera.position;
    let sirens = false;
    for (const v of this.list) {
      v.update(dt, alpha);
      v.setLod(v.renderPosition.distanceTo(cam));
      if (v.sirenOn) sirens = true;
    }
    updateSirens(this.time, sirens);
    setVehicleNight(this.ctx.dayNight.night);
  }
}
