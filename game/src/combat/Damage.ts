import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';

/**
 * Здоровье и броня игрока, смерть и арест, урон от машин и взрывов.
 * После смерти — возрождение у больницы, после ареста — у участка.
 */
export class Damage {
  private respawnTimer = 0;
  private respawnReason: 'death' | 'arrest' | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.events.on('explosion', ({ position, radius }) => this.onExplosion(position, radius));
    ctx.player.onFallDamage = (amount) => this.damagePlayer(amount, null);
  }

  get respawning(): boolean {
    return this.respawnReason !== null;
  }

  damagePlayer(amount: number, from: THREE.Vector3 | null): void {
    const p = this.ctx.player;
    if (!p.alive || p.invulnerable > 0 || this.respawnReason) return;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, amount * 0.75);
      p.armor -= absorbed;
      amount -= absorbed;
    }
    p.health -= amount;
    p.hurtFlash = 0.35;
    this.ctx.events.emit('playerHurt', { amount, from });
    if (p.health <= 0) this.kill();
  }

  heal(amount: number): void {
    const p = this.ctx.player;
    p.health = Math.min(CONFIG.player.maxHealth, p.health + amount);
  }

  private kill(): void {
    const { player, vehicles, events } = this.ctx;
    player.health = 0;
    if (player.mode === 'vehicle') vehicles.exit(true);
    player.mode = 'dead';
    this.respawnReason = 'death';
    this.respawnTimer = 4;
    events.emit('playerDied', {});
  }

  /** Арест: вызывает полиция. */
  arrest(): void {
    const { player, events } = this.ctx;
    if (!player.alive || this.respawnReason) return;
    player.mode = 'down';
    this.respawnReason = 'arrest';
    this.respawnTimer = 4;
    events.emit('playerArrested', {});
  }

  private respawn(): void {
    const { player, city, economy, wanted, events, weapons } = this.ctx;
    const reason = this.respawnReason!;
    this.respawnReason = null;
    const poi = reason === 'death' ? city.nearestPoi('hospital', player.position.x, player.position.z) : city.nearestPoi('police', player.position.x, player.position.z);
    player.mode = 'foot';
    player.setPhysicsEnabled(true);
    player.health = CONFIG.player.maxHealth;
    if (reason === 'arrest') {
      player.armor = 0;
      // При аресте изымают патроны.
      for (const w of weapons.owned) {
        weapons.ammo[w].mag = 0;
        weapons.ammo[w].reserve = 0;
      }
    }
    player.invulnerable = 3;
    player.teleport(new THREE.Vector3(poi.x, 0.2, poi.z));
    const penalty = Math.floor(economy.money * (reason === 'death' ? CONFIG.economy.deathPenalty : CONFIG.economy.arrestPenalty));
    economy.add(-penalty, reason === 'death' ? 'Лечение' : 'Штраф');
    wanted.clear();
    events.emit('playerRespawned', { reason });
  }

  private onExplosion(p: THREE.Vector3, radius: number): void {
    const pl = this.ctx.player;
    const pv = this.ctx.vehicles.playerVehicle;
    if (pv && pv.destroyed && pl.mode === 'vehicle') {
      this.damagePlayer(1000, p);
      return;
    }
    const d = pl.position.distanceTo(p);
    if (d > radius * 1.3) return;
    const k = 1 - d / (radius * 1.3);
    this.damagePlayer(CONFIG.vehicles.explosionDamage * k, p);
    this.ctx.cameraRig.addShake(0.8 * k + 0.2);
    if (pl.mode === 'foot') {
      const dir = new THREE.Vector3().subVectors(pl.position, p).setY(0).normalize();
      pl.knockDown(new THREE.Vector3(dir.x * 9 * k, 5 * k, dir.z * 9 * k), 1.8);
    }
  }

  /** Машины сбивают игрока на ногах. */
  fixedUpdate(dt: number): void {
    const { player, vehicles } = this.ctx;
    if (this.respawnReason) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    if (player.mode !== 'foot' && player.mode !== 'down') return;
    for (const v of vehicles.list) {
      const sp = v.speed;
      if (sp < CONFIG.player.carHitMinSpeed) continue;
      if (Math.abs(v.position.x - player.position.x) > 8 || Math.abs(v.position.z - player.position.z) > 8) continue;
      if (!v.containsXZ(player.position.x, player.position.z, CONFIG.player.radius)) continue;
      const lv = v.body.linvel();
      this.damagePlayer((sp - CONFIG.player.carHitMinSpeed) * CONFIG.player.carHitDamagePerMs + 5, v.position);
      if (player.alive) player.knockDown(new THREE.Vector3(lv.x * 0.8, 4, lv.z * 0.8), 2);
      this.ctx.cameraRig.addShake(0.5);
      break;
    }
  }
}
