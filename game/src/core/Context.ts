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
import type { TrafficLights } from '../world/TrafficLights';
import type { Roads } from '../ai/Roads';
import type { Traffic } from '../ai/Traffic';
import type { Pedestrians } from '../ai/Pedestrians';
import type { Police } from '../ai/Police';
import type { Damage } from '../combat/Damage';
import type { Wanted } from '../combat/Wanted';
import type { Economy } from '../economy/Economy';
import type { MissionManager } from '../missions/MissionManager';
import type { Shops } from '../economy/Shops';
import type { Pickups } from '../economy/Pickups';
import type { SaveSystem } from '../save/SaveSystem';
import type { Hud } from '../ui/Hud';
import type { Markers } from '../fx/Markers';
import type { AudioSystem } from '../audio/AudioSystem';

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
  lights: TrafficLights;
  roads: Roads;
  traffic: Traffic;
  peds: Pedestrians;
  police: Police;
  damage: Damage;
  wanted: Wanted;
  economy: Economy;
  missions: MissionManager;
  shops: Shops;
  pickups: Pickups;
  save: SaveSystem;
  hud: Hud;
  markers: Markers;
  audio: AudioSystem;
}
