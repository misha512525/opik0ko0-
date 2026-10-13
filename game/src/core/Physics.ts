import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG, GROUP, groups } from '../config';

export type { RAPIER };

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  /** Игровой объект-владелец коллайдера (машина и т. п.), если зарегистрирован. */
  owner: unknown;
}

/**
 * Обёртка над миром Rapier: статическая геометрия города, рейкасты,
 * связь коллайдер → игровой объект. Шаг вызывается из фиксированного цикла.
 */
export class Physics {
  readonly world: RAPIER.World;
  readonly R = RAPIER;
  private owners = new Map<number, unknown>();
  private ray: RAPIER.Ray;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: CONFIG.physics.gravity, z: 0 });
    this.world.timestep = CONFIG.physics.fixedDt;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  step(): void {
    this.world.step();
  }

  addStaticBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setFriction(0.6)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    if (rotY) desc.setRotation(quatY(rotY));
    return this.world.createCollider(desc);
  }

  /**
   * Земля — сетка плит 200×200 м: один гигантский кубоид даёт потерю точности
   * в контроллере персонажа (капсула «тонет» и застревает).
   */
  addGround(size: number): number {
    const tile = 100;
    let n = 0;
    for (let x = -size + tile; x < size; x += tile * 2) {
      for (let z = -size + tile; z < size; z += tile * 2) {
        const desc = RAPIER.ColliderDesc.cuboid(tile, 2, tile)
          .setTranslation(x, -2, z)
          .setFriction(0.8)
          .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
        this.world.createCollider(desc);
        n++;
      }
    }
    return n;
  }

  setOwner(collider: RAPIER.Collider, owner: unknown): void {
    this.owners.set(collider.handle, owner);
  }

  removeOwner(collider: RAPIER.Collider): void {
    this.owners.delete(collider.handle);
  }

  ownerOf(collider: RAPIER.Collider): unknown {
    return this.owners.get(collider.handle);
  }

  /**
   * Луч: dir должен быть нормализован.
   * mask — с какими группами пересекаться; exclude — тело, которое игнорируем.
   */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    mask: number = 0xffff,
    exclude?: RAPIER.RigidBody,
  ): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDist,
      true,
      undefined,
      groups(0xffff, mask),
      undefined,
      exclude,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
    };
  }

  /** Есть ли прямая видимость между точками (только статика). */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    return this.raycast(a, d, len, GROUP.STATIC) === null;
  }
}

export function quatY(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Извлечь yaw из кватерниона, повёрнутого только вокруг Y. */
export function yawOfQuat(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}
