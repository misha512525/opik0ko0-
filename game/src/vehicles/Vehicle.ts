import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG, GROUP, groups, type VehicleSpec } from '../config';
import type { GameContext } from '../core/Context';
import { quatY, yawOfQuat } from '../core/Physics';
import { clamp, damp, wrapAngle } from '../core/math';
import { CLEARANCE, VehicleModel } from './VehicleModel';

export interface VehicleControls {
  /** -1..1: газ (+) / задний ход (−). */
  throttle: number;
  /** 0..1: тормоз. */
  brake: number;
  /** -1..1: влево (−) / вправо (+). */
  steer: number;
  handbrake: boolean;
}

export type DriverKind = 'none' | 'player' | 'traffic' | 'police' | 'mission';

let nextId = 1;

/**
 * Машина: динамическое тело Rapier с аркадной моделью управления.
 * Вращение разрешено только вокруг Y, а продольная/боковая скорость
 * задаются явно — так проще настроить занос и «киношное» поведение.
 */
export class Vehicle {
  readonly id = nextId++;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly model: VehicleModel;
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  driver: DriverKind = 'none';
  /** Произвольные данные ИИ, который управляет машиной. */
  agent: unknown = null;
  paint: number;
  health: number;
  readonly maxHealth: number;
  destroyed = false;
  burning = 0;
  sirenOn = false;
  /** Кто последним повредил машину (для розыска). */
  lastDamagedByPlayer = false;
  /** Машина миссии — не удаляется системами трафика. */
  persistent = false;

  forwardSpeed = 0;
  lateralSpeed = 0;
  yaw = 0;
  private steerAngle = 0;
  private wheelSpin = 0;
  private setVel = new THREE.Vector3();
  /** Последний сильный удар (для звука). */
  lastImpact = 0;

  readonly position = new THREE.Vector3();
  private prevPosition = new THREE.Vector3();
  private prevYaw = 0;
  readonly renderPosition = new THREE.Vector3();
  renderYaw = 0;
  private smokeTimer = 0;

  constructor(
    private readonly ctx: GameContext,
    readonly spec: VehicleSpec,
    x: number,
    z: number,
    yaw: number,
    paint?: number,
  ) {
    const R = ctx.physics.R;
    this.paint = paint ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];
    this.maxHealth = spec.health;
    this.health = spec.health;
    const y = spec.half.y + 0.02;
    this.body = ctx.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(quatY(yaw))
        .enabledRotations(false, true, false)
        .setLinearDamping(0.05)
        .setAngularDamping(1.5)
        .setCcdEnabled(true)
        .setCanSleep(true),
    );
    this.collider = ctx.physics.world.createCollider(
      R.ColliderDesc.cuboid(spec.half.x, spec.half.y, spec.half.z)
        .setMass(spec.mass)
        // Трение кузова о землю ноль: сцепление шин моделируем сами.
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0.15)
        .setCollisionGroups(groups(GROUP.VEHICLE, GROUP.STATIC | GROUP.VEHICLE)),
      this.body,
    );
    ctx.physics.setOwner(this.collider, this);
    this.model = new VehicleModel(spec, this.paint);
    ctx.scene.add(this.model.root);
    this.yaw = yaw;
    this.syncFromBody();
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.renderPosition.copy(this.position);
    this.renderYaw = yaw;
    this.update(0, 1);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right(): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  get speed(): number {
    return Math.hypot(this.forwardSpeed, this.lateralSpeed);
  }

  /** Точка в мировых координатах по локальному смещению. */
  localToWorld(lx: number, ly: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return out.set(this.position.x + lx * c + lz * s, this.position.y + ly, this.position.z - lx * s + lz * c);
  }

  /** Лежит ли точка (x,z) внутри габаритов машины с запасом. */
  containsXZ(x: number, z: number, margin = 0): boolean {
    const dx = x - this.position.x, dz = z - this.position.z;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) <= this.spec.half.x + margin && Math.abs(lz) <= this.spec.half.z + margin;
  }

  private syncFromBody(): void {
    const t = this.body.translation();
    this.position.set(t.x, t.y, t.z);
    this.yaw = yawOfQuat(this.body.rotation());
    const v = this.body.linvel();
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.forwardSpeed = v.x * s + v.z * c;
    this.lateralSpeed = -v.x * c + v.z * s;
  }

  teleport(x: number, z: number, yaw: number): void {
    this.body.setTranslation({ x, y: this.spec.half.y + 0.05, z }, true);
    this.body.setRotation(quatY(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncFromBody();
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
  }

  fixedUpdate(dt: number): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.syncFromBody();
    const v = this.body.linvel();
    const spec = this.spec;
    const ctl = this.controls;
    const hasDriver = this.driver !== 'none' && !this.destroyed;
    const grounded = this.position.y < spec.half.y + 0.35;

    // Пустая стоящая машина — не будим физику.
    if (!hasDriver && this.body.isSleeping()) {
      this.setVel.set(v.x, v.y, v.z);
      return;
    }

    let vF = this.forwardSpeed;
    let vR = this.lateralSpeed;
    let yawRate = this.body.angvel().y;
    const health = this.health / this.maxHealth;
    const enginePower = this.destroyed ? 0 : health < CONFIG.vehicles.fireAt ? 0.45 : 1;

    if (grounded) {
      let a = 0;
      const throttle = hasDriver ? ctl.throttle : 0;
      if (throttle > 0) {
        if (vF < -0.5) a = spec.brake * throttle;
        else a = spec.accel * enginePower * throttle * (1 - Math.pow(clamp(vF / spec.maxSpeed, 0, 1), 2));
      } else if (throttle < 0) {
        if (vF > 0.5) a = -spec.brake * -throttle;
        else a = -spec.accel * 0.6 * enginePower * -throttle * (1 - clamp(-vF / spec.maxReverse, 0, 1));
      }
      // Сопротивление качению и торможение двигателем.
      const resist = (throttle === 0 ? 1.6 : 0.4) + 0.0016 * vF * vF;
      const brake = (hasDriver ? ctl.brake : 1) * spec.brake + (ctl.handbrake && hasDriver ? 7 : 0) + resist;
      const dv = a * dt;
      const stopDv = brake * dt;
      vF += dv;
      if (Math.abs(vF) <= stopDv) vF = 0;
      else vF -= Math.sign(vF) * stopDv;

      // Боковое сцепление: ручник почти обнуляет его — машина уходит в занос.
      const grip = this.destroyed ? 4 : ctl.handbrake && hasDriver ? spec.handbrakeGrip : spec.grip;
      vR *= Math.exp(-grip * dt);

      // Руль: угол уменьшается на скорости (иначе машина неуправляема).
      const steerTarget = (hasDriver ? ctl.steer : 0) * spec.steer / (1 + Math.abs(vF) / 28);
      this.steerAngle = damp(this.steerAngle, steerTarget, 10, dt);
      let targetRate = (-vF / spec.wheelBase) * Math.tan(this.steerAngle);
      if (ctl.handbrake && hasDriver && Math.abs(vF) > 4) targetRate *= 1.45;
      yawRate = damp(yawRate, targetRate, Math.abs(vF) > 0.5 ? 9 : 4, dt);
      if (Math.abs(vF) < 0.3 && Math.abs(vR) < 0.3 && !hasDriver) yawRate *= 0.5;
    }

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.setVel.set(s * vF - c * vR, v.y, c * vF + s * vR);
    this.body.setLinvel(this.setVel, true);
    this.body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
    this.model.setBraking(hasDriver && (ctl.brake > 0.1 || (ctl.throttle < 0 && vF > 0.5) || ctl.handbrake));
  }

  /** После шага физики: урон от столкновений по изменению скорости. */
  postStep(dt: number): void {
    const v = this.body.linvel();
    const dvx = v.x - this.setVel.x;
    const dvz = v.z - this.setVel.z;
    const dv = Math.hypot(dvx, dvz);
    this.lastImpact = Math.max(0, this.lastImpact - dt);
    if (dv > CONFIG.vehicles.crashThreshold && !this.body.isSleeping()) {
      const dmg = (dv - CONFIG.vehicles.crashThreshold) * CONFIG.vehicles.crashDamagePerMs;
      this.damage(dmg, this.driver === 'player');
      this.lastImpact = Math.max(this.lastImpact, dv);
      this.ctx.events.emit('vehicleImpact', { vehicle: this, strength: dv });
    }
    if (this.health <= 0 && !this.destroyed) {
      this.burning += dt;
      if (this.burning >= CONFIG.vehicles.burnSecondsBeforeExplosion) this.explode();
    }
  }

  damage(amount: number, byPlayer: boolean): void {
    if (this.destroyed || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (byPlayer) this.lastDamagedByPlayer = true;
  }

  repair(): void {
    if (this.destroyed) return;
    this.health = this.maxHealth;
    this.burning = 0;
  }

  explode(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.sirenOn = false;
    this.model.setWrecked();
    this.body.applyImpulse({ x: 0, y: this.spec.mass * 6, z: 0 }, true);
    this.ctx.events.emit('explosion', {
      position: this.position.clone(),
      radius: CONFIG.vehicles.explosionRadius,
      byPlayer: this.lastDamagedByPlayer,
      source: this,
    });
    this.ctx.events.emit('vehicleDestroyed', {
      position: this.position.clone(),
      police: this.spec.id === 'police',
      byPlayer: this.lastDamagedByPlayer,
      vehicle: this,
    });
  }

  update(dt: number, alpha: number): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.renderYaw = this.prevYaw + wrapAngle(this.yaw - this.prevYaw) * alpha;
    const root = this.model.root;
    root.position.set(this.renderPosition.x, this.renderPosition.y - this.spec.half.y - 0.02, this.renderPosition.z);
    root.rotation.y = this.renderYaw;
    this.wheelSpin += (this.forwardSpeed * dt) / this.spec.wheelRadius;
    this.model.animate(this.steerAngle, this.wheelSpin);

    // Дым и огонь по состоянию.
    const h = this.health / this.maxHealth;
    if (dt > 0 && (h < CONFIG.vehicles.smokeAt || this.destroyed)) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        const heavy = h < CONFIG.vehicles.fireAt || this.destroyed;
        this.smokeTimer = heavy ? 0.05 : 0.12;
        const hood = this.localToWorld(0, this.spec.half.y + 0.1, this.spec.half.z * 0.6);
        this.ctx.effects.carSmoke(hood, heavy);
        if (heavy && (this.health <= 0 || this.destroyed)) {
          this.ctx.effects.fire(hood, this.destroyed ? 1.6 : 1);
          if (this.destroyed) this.ctx.effects.fire(this.localToWorld(0, 0.2, -this.spec.half.z * 0.4), 1.3);
        }
      }
    }
  }

  setLod(cameraDist: number): void {
    const cfg = CONFIG.vehicles;
    this.model.root.visible = cameraDist < cfg.hideDistance;
    this.model.setDetail(cameraDist < cfg.lodDistance);
  }

  /** Перекраска (сбрасывает розыск в мастерской). */
  repaint(color: number): void {
    this.paint = color;
    this.model.setPaint(color);
  }

  dispose(): void {
    this.ctx.physics.removeOwner(this.collider);
    this.ctx.physics.world.removeRigidBody(this.body);
    this.ctx.scene.remove(this.model.root);
  }

  /** Высота пола кузова над землёй (для посадки и т. п.). */
  static readonly clearance = CLEARANCE;
}
