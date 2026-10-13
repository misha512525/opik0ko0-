import * as THREE from 'three';
import { CONFIG, type WeaponId } from '../config';
import type { GameContext } from '../core/Context';
import type { AmmoState } from '../combat/Weapons';

interface SaveData {
  version: 1;
  savedAt: string;
  kind: 'manual' | 'autosave';
  money: number;
  missions: string[];
  position: { x: number; y: number; z: number };
  yaw: number;
  health: number;
  armor: number;
  hour: number;
  weapons: { current: WeaponId; owned: WeaponId[]; ammo: Record<WeaponId, AmmoState> };
}

/**
 * Сохранение в localStorage: деньги, прогресс миссий, позиция, здоровье,
 * оружие и время суток. Автосохранение — после каждой выполненной миссии.
 */
export class SaveSystem {
  constructor(private readonly ctx: GameContext) {}

  has(): boolean {
    try {
      return localStorage.getItem(CONFIG.save.key) !== null;
    } catch {
      return false;
    }
  }

  save(kind: 'manual' | 'autosave'): boolean {
    const { player, vehicles, economy, missions, weapons, dayNight } = this.ctx;
    if (missions.active && kind === 'manual') return false;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.localToWorld(pv.spec.half.x + 1, 0, 0) : player.feet;
    const data: SaveData = {
      version: 1,
      savedAt: new Date().toISOString(),
      kind,
      money: economy.money,
      missions: missions.serialize(),
      position: { x: pos.x, y: Math.max(0.2, pos.y), z: pos.z },
      yaw: player.yaw,
      health: Math.max(1, player.health),
      armor: player.armor,
      hour: dayNight.hour,
      weapons: weapons.serialize(),
    };
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load(): boolean {
    let data: SaveData;
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return false;
      data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return false;
    } catch {
      return false;
    }
    const { player, vehicles, economy, missions, weapons, dayNight, wanted, events } = this.ctx;
    if (player.mode === 'vehicle') vehicles.exit(true);
    missions.restore(data.missions);
    wanted.clear();
    economy.money = data.money;
    events.emit('moneyChanged', { amount: data.money, delta: 0 });
    weapons.restore(data.weapons);
    player.mode = 'foot';
    player.setPhysicsEnabled(true);
    player.health = data.health;
    player.armor = data.armor;
    player.teleport(new THREE.Vector3(data.position.x, data.position.y, data.position.z), data.yaw);
    this.ctx.cameraRig.yaw = data.yaw;
    dayNight.hour = data.hour;
    events.emit('playerRespawned', { reason: 'load' });
    return true;
  }

  /** Сбросить прогресс (новая игра). */
  reset(): void {
    const { player, vehicles, economy, missions, weapons, wanted, city, events } = this.ctx;
    if (player.mode === 'vehicle') vehicles.exit(true);
    missions.restore([]);
    wanted.clear();
    economy.money = CONFIG.economy.startMoney;
    events.emit('moneyChanged', { amount: economy.money, delta: 0 });
    weapons.restore({ current: 'fists', owned: ['fists'], ammo: { fists: { mag: 0, reserve: 0 }, pistol: { mag: 0, reserve: 0 }, rifle: { mag: 0, reserve: 0 } } });
    player.mode = 'foot';
    player.setPhysicsEnabled(true);
    player.health = CONFIG.player.maxHealth;
    player.armor = 0;
    const home = city.poi('safehouse');
    player.teleport(new THREE.Vector3(home.x + 2, 0.2, home.z + 3), Math.PI);
    this.ctx.cameraRig.yaw = Math.PI;
    this.ctx.dayNight.hour = CONFIG.dayNight.startHour;
    events.emit('playerRespawned', { reason: 'load' });
  }
}
