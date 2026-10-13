import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { yawFromDir } from '../core/math';
import type { Ped } from './Pedestrians';

export interface HostileOptions {
  /** Стрелять ли (иначе — бежать к игроку, например чтобы арестовать). */
  shoot: boolean;
  minRange: number;
  maxRange: number;
  accuracy: number;
  damage: number;
  interval: number;
  runSpeed: number;
  /** Куда идти, если цель не видна (полиция идёт к последнему известному месту). */
  searchPoint?: THREE.Vector3;
}

interface Memory {
  losTimer: number;
  los: boolean;
  strafe: number;
}

const memory = new WeakMap<Ped, Memory>();
const eye = new THREE.Vector3();
const target = new THREE.Vector3();

/** Цель для NPC: игрок или его машина. */
export function playerTarget(ctx: GameContext, out: THREE.Vector3): THREE.Vector3 {
  const pv = ctx.vehicles.playerVehicle;
  if (ctx.player.mode === 'vehicle' && pv) return out.copy(pv.position).setY(pv.position.y + 0.4);
  return out.copy(ctx.player.position).setY(ctx.player.position.y + 0.3);
}

/** Видит ли пешеход игрока (с кешем на 0.3 с). */
export function pedSeesPlayer(ctx: GameContext, ped: Ped, dt: number, range: number): boolean {
  let m = memory.get(ped);
  if (!m) memory.set(ped, (m = { losTimer: 0, los: false, strafe: Math.random() < 0.5 ? 1 : -1 }));
  m.losTimer -= dt;
  if (m.losTimer <= 0) {
    m.losTimer = 0.3 + Math.random() * 0.15;
    playerTarget(ctx, target);
    eye.set(ped.x, ped.y + 1.6, ped.z);
    m.los = eye.distanceTo(target) < range && ctx.physics.lineOfSight(eye, target);
  }
  return m.los;
}

/** Выстрел NPC по игроку: шанс попадания зависит от дистанции и скорости цели. */
export function npcShoot(ctx: GameContext, ped: Ped, accuracy: number, damage: number): void {
  playerTarget(ctx, target);
  const origin = new THREE.Vector3(ped.x + Math.sin(ped.yaw) * 0.5, ped.y + 1.45, ped.z + Math.cos(ped.yaw) * 0.5);
  const dist = origin.distanceTo(target);
  const pv = ctx.vehicles.playerVehicle;
  const targetSpeed = ctx.player.mode === 'vehicle' && pv ? pv.speed : Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z);
  const chance = accuracy * Math.max(0.15, 1 - dist / 70) * (targetSpeed > 8 ? 0.55 : targetSpeed > 3 ? 0.8 : 1);
  const aim = target.clone();
  if (Math.random() > chance) {
    aim.x += (Math.random() - 0.5) * 3;
    aim.y += Math.random() * 1.5;
    aim.z += (Math.random() - 0.5) * 3;
  }
  const dir = aim.sub(origin).normalize();
  const end = ctx.weapons.traceShot(origin, dir, 90, damage, false, ped);
  ctx.weapons.addTracer(origin, end);
  ctx.effects.muzzle(origin);
  ctx.events.emit('gunshot', { position: origin, byPlayer: false, weapon: ped.weapon ?? 'pistol' });
}

/**
 * Поведение вооружённого враждебного NPC (полиция, бандиты): держать дистанцию,
 * обходить по дуге, стрелять при прямой видимости.
 */
export function hostileStep(ctx: GameContext, ped: Ped, dt: number, o: HostileOptions): { dist: number; sees: boolean } {
  playerTarget(ctx, target);
  const dx = target.x - ped.x, dz = target.z - ped.z;
  const dist = Math.hypot(dx, dz);
  const sees = pedSeesPlayer(ctx, ped, dt, 120);
  const m = memory.get(ped)!;
  ped.state = 'script';
  ped.faceYaw = yawFromDir(dx, dz);
  if (!o.shoot) {
    ped.aiming = dist < 15;
    ped.moveTo(target.x, target.z, dist > 1.6 ? o.runSpeed : 0);
    return { dist, sees };
  }
  if (!sees || dist > o.maxRange) {
    ped.aiming = false;
    if (!sees && o.searchPoint) {
      const sp = o.searchPoint;
      const far = Math.hypot(sp.x - ped.x, sp.z - ped.z) > 3;
      ped.faceYaw = far ? yawFromDir(sp.x - ped.x, sp.z - ped.z) : ped.yaw;
      ped.moveTo(sp.x, sp.z, far ? o.runSpeed * 0.7 : 0);
    } else ped.moveTo(target.x, target.z, o.runSpeed);
  } else if (dist < o.minRange) {
    // Отступает, продолжая стрелять.
    ped.aiming = true;
    ped.moveTo(ped.x - dx, ped.z - dz, 2.5);
  } else {
    // Стрейф по дуге вокруг цели.
    ped.aiming = true;
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    if (Math.random() < dt * 0.3) m.strafe *= -1;
    ped.moveTo(ped.x + px * m.strafe * 3, ped.z + pz * m.strafe * 3, 1.6);
  }
  if (sees && dist < o.maxRange && ped.fireCooldown <= 0 && ctx.player.alive) {
    ped.fireCooldown = o.interval * (0.7 + Math.random() * 0.6);
    npcShoot(ctx, ped, o.accuracy, o.damage);
  }
  return { dist, sees };
}
