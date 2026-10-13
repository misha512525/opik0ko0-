import type * as THREE from 'three';
import type { Physics } from './Physics';
import type { Input } from './Input';
import type { EventBus } from './Events';
import type { Settings } from './Settings';
import type { CityLayout } from '../world/CityLayout';
import type { CityVisuals } from '../world/CityBuilder';
import type { DayNight } from '../world/DayNight';
import type { Player } from '../player/Player';
import type { CameraRig } from '../player/CameraRig';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { Weapons } from '../combat/Weapons';
import type { Effects } from '../fx/Particles';

/**
 * Реестр сервисов игры. Это не «god-объект»: логики здесь нет, только ссылки,
 * чтобы системы находили друг друга без глобальных синглтонов.
 */
export interface GameContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  physics: Physics;
  input: Input;
  events: EventBus;
  settings: Settings;
  city: CityLayout;
  visuals: CityVisuals;
  dayNight: DayNight;
  player: Player;
  cameraRig: CameraRig;
  vehicles: VehicleManager;
  weapons: Weapons;
  effects: Effects;
}
