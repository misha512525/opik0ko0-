import type { Vector3 } from 'three';
import type { Vehicle } from '../vehicles/Vehicle';
import type { Ped } from '../ai/Pedestrians';

/** Типизированная шина событий: системы общаются без прямых зависимостей. */
export interface GameEvents {
  notify: { text: string; seconds?: number };
  crime: { kind: CrimeKind; position: Vector3 };
  gunshot: { position: Vector3; byPlayer: boolean };
  explosion: { position: Vector3; radius: number; byPlayer: boolean; source?: unknown };
  vehicleImpact: { vehicle: Vehicle; strength: number };
  driverEjected: { vehicle: Vehicle; position: Vector3 };
  pedKilled: { position: Vector3; role: string; byPlayer: boolean; ped: Ped };
  pedHurt: { ped: Ped; byPlayer: boolean };
  pedHitByCar: { ped: Ped; vehicle: Vehicle; speed: number };
  horn: { position: Vector3 };
  vehicleDestroyed: { position: Vector3; police: boolean; byPlayer: boolean; vehicle: Vehicle };
  playerDied: Record<string, never>;
  playerArrested: Record<string, never>;
  playerRespawned: { reason: 'death' | 'arrest' | 'load' };
  moneyChanged: { amount: number; delta: number };
  wantedChanged: { stars: number };
  playerEnteredVehicle: { vehicleId: number };
  playerExitedVehicle: { vehicleId: number };
  missionStarted: { id: string };
  missionCompleted: { id: string; reward: number };
  missionFailed: { id: string; reason: string };
  dialog: { speaker: string; text: string; seconds?: number };
}

export type CrimeKind =
  | 'hitPed' | 'killPed' | 'shootNearPeople' | 'carjack' | 'attackCop'
  | 'killCop' | 'destroyCar' | 'destroyPoliceCar' | 'reckless';

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) (h as Handler<GameEvents[K]>)(payload);
  }
}
