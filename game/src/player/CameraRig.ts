import * as THREE from 'three';
import { CONFIG, GROUP } from '../config';
import type { GameContext } from '../core/Context';
import { clamp, damp, dampAngle } from '../core/math';

/**
 * Камера от третьего лица: орбита мышью вокруг игрока или машины,
 * плечевой вид при прицеливании, столкновение со стенами через рейкаст.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = -0.15;
  private distance: number = CONFIG.camera.distance;
  private shoulder = 0;
  private sinceMouse = 10;
  private shake = 0;
  private recoilPitch = 0;
  readonly pivot = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private lookDir = new THREE.Vector3();

  constructor(private readonly ctx: GameContext, readonly camera: THREE.PerspectiveCamera) {}

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  addRecoil(amount: number): void {
    this.recoilPitch += amount;
  }

  /** Направление взгляда камеры (нормализованное). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldDirection(out);
  }

  update(dt: number): void {
    const { input, settings, player } = this.ctx;
    const sens = 0.0024 * settings.data.sensitivity * (player.aiming ? 0.6 : 1);
    if (input.mouseDX !== 0 || input.mouseDY !== 0) this.sinceMouse = 0;
    else this.sinceMouse += dt;
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens * (settings.data.invertY ? -1 : 1);
    // Отдача плавно поднимает прицел и возвращается.
    const rec = this.recoilPitch * Math.min(1, dt * 18);
    this.pitch += rec;
    this.recoilPitch -= rec;
    this.pitch = clamp(this.pitch, CONFIG.camera.minPitch, CONFIG.camera.maxPitch);

    const cfg = CONFIG.camera;
    const vehicle = player.mode === 'vehicle' ? this.ctx.vehicles.playerVehicle : null;
    let targetDist: number = cfg.distance;
    let targetShoulder = 0;
    let fov: number = cfg.fov;
    let excludeBody = undefined;
    if (vehicle) {
      const rp = vehicle.renderPosition;
      this.pivot.set(rp.x, rp.y + vehicle.spec.half.y + 1.0, rp.z);
      targetDist = cfg.vehicleDistance + vehicle.spec.half.z * 0.6;
      // Камера сама заходит за машину, если мышь не трогали.
      const speed = vehicle.forwardSpeed;
      if (this.sinceMouse > cfg.autoCenterDelay && Math.abs(speed) > 3) {
        const behind = speed >= 0 ? vehicle.renderYaw : vehicle.renderYaw + Math.PI;
        this.yaw = dampAngle(this.yaw, behind, 2.5, dt);
        this.pitch = damp(this.pitch, -0.18, 2, dt);
      }
      fov = cfg.fov + clamp(Math.abs(speed) / 40, 0, 1) * 12;
      excludeBody = vehicle.body;
    } else {
      const rp = player.renderPosition;
      this.pivot.set(rp.x, rp.y + cfg.height, rp.z);
      if (player.aiming) {
        targetDist = cfg.aimDistance;
        targetShoulder = cfg.shoulder;
        fov = cfg.aimFov;
      } else {
        targetShoulder = cfg.shoulder * 0.45;
      }
    }
    this.distance = damp(this.distance, targetDist, 8, dt);
    this.shoulder = damp(this.shoulder, targetShoulder, 10, dt);
    this.camera.fov = damp(this.camera.fov, fov, 8, dt);
    this.camera.updateProjectionMatrix();

    const cp = Math.cos(this.pitch);
    this.lookDir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // Плечо: сдвиг вправо от направления взгляда.
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const origin = this.pivot.clone();
    origin.x += rx * this.shoulder;
    origin.z += rz * this.shoulder;
    // Сначала проверяем, не упирается ли сдвиг плеча в стену.
    this.dir.set(rx, 0, rz);
    const sideHit = this.shoulder > 0.01 ? this.ctx.physics.raycast(this.pivot, this.dir, this.shoulder + 0.2, GROUP.STATIC, excludeBody) : null;
    if (sideHit) origin.copy(this.pivot).addScaledVector(this.dir, Math.max(0, sideHit.distance - 0.25));

    this.dir.copy(this.lookDir).multiplyScalar(-1);
    let dist = this.distance;
    const mask = GROUP.STATIC | (vehicle ? 0 : GROUP.VEHICLE);
    const hit = this.ctx.physics.raycast(origin, this.dir, dist + cfg.collisionPadding, mask, excludeBody);
    if (hit) dist = Math.max(0.4, hit.distance - cfg.collisionPadding);
    this.desired.copy(origin).addScaledVector(this.dir, dist);
    // Не уходим под землю.
    if (this.desired.y < 0.4) this.desired.y = 0.4;
    this.camera.position.copy(this.desired);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(origin.addScaledVector(this.lookDir, 10));
  }
}
