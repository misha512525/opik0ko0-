import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG, GROUP, groups } from '../config';
import type { GameContext } from '../core/Context';
import { clamp, damp, dampAngle, yawFromDir } from '../core/math';
import { HumanBody, restPose, walkPose } from './HumanModel';

export type PlayerMode = 'foot' | 'vehicle' | 'down' | 'dead';

/**
 * Игрок на ногах: кинематическое тело + KinematicCharacterController Rapier.
 * Ввод читается относительно камеры; позиция интерполируется для рендера.
 */
export class Player {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  readonly model: HumanBody;

  /** Центр капсулы (физика). */
  readonly position = new THREE.Vector3();
  private prevPosition = new THREE.Vector3();
  /** Интерполированная позиция ног (рендер). */
  readonly renderPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  mode: PlayerMode = 'foot';
  running = false;
  aiming = false;
  health: number = CONFIG.player.maxHealth;
  armor = 0;
  private walkPhase = 0;
  private downTimer = 0;
  private fallSpeed = 0;
  /** Секунды неуязвимости после возрождения. */
  invulnerable = 0;
  /** Время с последнего полученного урона (для эффекта на экране). */
  hurtFlash = 0;

  private readonly capsuleOffset = CONFIG.player.halfHeight + CONFIG.player.radius;
  private readonly queryGroups = groups(0xffff, GROUP.STATIC | GROUP.VEHICLE);

  constructor(private readonly ctx: GameContext, spawn: THREE.Vector3) {
    const R = ctx.physics.R;
    const world = ctx.physics.world;
    this.position.set(spawn.x, spawn.y + this.capsuleOffset, spawn.z);
    this.prevPosition.copy(this.position);
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y, this.position.z),
    );
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(CONFIG.player.halfHeight, CONFIG.player.radius).setCollisionGroups(
        groups(GROUP.PLAYER, GROUP.STATIC),
      ),
      this.body,
    );
    ctx.physics.setOwner(this.collider, this);
    this.controller = world.createCharacterController(0.03);
    this.controller.enableAutostep(0.45, 0.2, false);
    this.controller.enableSnapToGround(0.4);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(80);

    this.model = new HumanBody({ pants: 0x2b2f3a, shirt: 0x8c2f39, skin: 0xc68e6b, hair: 0x1e1410 });
    ctx.scene.add(this.model.root);
    this.renderPosition.copy(spawn);
  }

  get feet(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y - this.capsuleOffset, this.position.z);
  }

  /** Точка «в голове» — откуда смотрит/стреляет игрок. */
  get head(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + 0.65, this.position.z);
  }

  get alive(): boolean {
    return this.mode !== 'dead';
  }

  teleport(p: THREE.Vector3, yaw = this.yaw): void {
    this.position.set(p.x, p.y + this.capsuleOffset + 0.05, p.z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.body.setTranslation({ x: this.position.x, y: this.position.y, z: this.position.z }, true);
    this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y, z: this.position.z });
    this.yaw = yaw;
  }

  /** Сбить с ног (удар машиной, взрыв). */
  knockDown(impulse: THREE.Vector3, seconds = 1.6): void {
    if (this.mode !== 'foot') return;
    this.mode = 'down';
    this.downTimer = seconds;
    this.velocity.copy(impulse);
  }

  fixedUpdate(dt: number): void {
    this.prevPosition.copy(this.position);
    if (this.mode === 'vehicle') return;
    const cfg = CONFIG.player;
    const input = this.ctx.input;
    let wishX = 0, wishZ = 0;
    if (this.mode === 'foot') {
      const f = input.axis('KeyS', 'KeyW');
      const s = input.axis('KeyA', 'KeyD');
      const yaw = this.ctx.cameraRig.yaw;
      // forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
      wishX = Math.sin(yaw) * f - Math.cos(yaw) * s;
      wishZ = Math.cos(yaw) * f + Math.sin(yaw) * s;
      const len = Math.hypot(wishX, wishZ);
      if (len > 1) {
        wishX /= len;
        wishZ /= len;
      }
    }
    this.aiming = this.mode === 'foot' && this.ctx.weapons.isAiming();
    this.running = this.mode === 'foot' && input.isDown('ShiftLeft') && !this.aiming && (wishX !== 0 || wishZ !== 0);
    const speed = this.aiming ? cfg.aimWalkSpeed : this.running ? cfg.runSpeed : cfg.walkSpeed * 1.6;
    const accel = this.grounded ? cfg.accelGround : cfg.accelAir;
    if (this.mode === 'foot') {
      this.velocity.x = damp(this.velocity.x, wishX * speed, accel * 0.6, dt);
      this.velocity.z = damp(this.velocity.z, wishZ * speed, accel * 0.6, dt);
    } else {
      // Лежит: скользит по инерции.
      this.velocity.x = damp(this.velocity.x, 0, 3, dt);
      this.velocity.z = damp(this.velocity.z, 0, 3, dt);
    }
    if (this.mode === 'foot' && this.grounded && input.pressed('Space')) {
      this.velocity.y = cfg.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y += CONFIG.physics.gravity * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    const mv = this.controller.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocity.y < 0) {
      if (!wasGrounded && -this.fallSpeed > cfg.fallDamageMinSpeed) {
        this.onFallDamage((-this.fallSpeed - cfg.fallDamageMinSpeed) * 6);
      }
      this.velocity.y = -1;
    }
    this.fallSpeed = this.velocity.y;
    this.position.x += mv.x;
    this.position.y += mv.y;
    this.position.z += mv.z;
    // Страховка от проваливания.
    if (this.position.y < -5) {
      this.position.y = 2;
      this.velocity.y = 0;
    }
    this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y, z: this.position.z });

    // Поворот модели.
    if (this.mode === 'foot') {
      if (this.aiming || this.ctx.weapons.firingRecently()) this.yaw = dampAngle(this.yaw, this.ctx.cameraRig.yaw, 25, dt);
      else if (Math.hypot(wishX, wishZ) > 0.1) this.yaw = dampAngle(this.yaw, yawFromDir(wishX, wishZ), 12, dt);
    }
    if (this.mode === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.mode = 'foot';
    }
    if (this.invulnerable > 0) this.invulnerable -= dt;
  }

  /** Урон от падения — переопределяется системой урона. */
  onFallDamage: (amount: number) => void = () => {};

  /** Отключить капсулу (игрок в машине) / включить обратно. */
  setPhysicsEnabled(enabled: boolean): void {
    this.collider.setEnabled(enabled);
  }

  update(dt: number, alpha: number): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.mode === 'vehicle') {
      this.model.setVisible(false);
      return;
    }
    this.model.setVisible(true);
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.renderPosition.y -= this.capsuleOffset;
    // Тротуары приподняты визуально — поднимаем модель, если стоим на них.
    const surf = this.ctx.city.surfaceHeight(this.renderPosition.x, this.renderPosition.z);
    if (this.grounded && this.renderPosition.y < surf) this.renderPosition.y = surf;

    const pose = this.model.pose;
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.mode === 'dead' || this.mode === 'down') {
      Object.assign(pose, restPose());
      pose.lying = 1;
      pose.armL = -0.4;
      pose.armR = 0.4;
    } else if (!this.grounded) {
      Object.assign(pose, restPose());
      pose.legL = -0.5;
      pose.legR = 0.3;
      pose.armL = -2.4;
      pose.armR = -2.4;
    } else {
      this.walkPhase += dt * hs * (this.running ? 1.45 : 2.4);
      walkPose(pose, this.walkPhase, clamp(hs / 2.5, 0, 1), this.running);
    }
    if (this.mode === 'foot') this.ctx.weapons.applyArmPose(pose);
    this.model.apply(this.renderPosition.x, this.renderPosition.y, this.renderPosition.z, this.yaw);
  }
}
