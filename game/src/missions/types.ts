import type { VehicleTypeId, WeaponId } from '../config';
import type { PedRole } from '../ai/Pedestrians';

/** Реплика диалога: [говорящий, текст]. */
export type Line = [speaker: string, text: string];

export interface Point {
  x: number;
  z: number;
}

/**
 * Шаги миссии — декларативные. Новая миссия = массив шагов в definitions.ts,
 * логика каждого типа шага живёт в MissionManager.
 */
export type Step =
  | { type: 'dialog'; lines: Line[] }
  | { type: 'spawnVehicle'; key: string; vehicle: VehicleTypeId; at: Point; yaw: number; color?: number }
  | { type: 'enterVehicle'; key: string; text: string }
  | { type: 'enterAnyVehicle'; text: string }
  | { type: 'goto'; at: Point; radius: number; text: string; vehicle?: string; minHealth?: number; onFoot?: boolean }
  | { type: 'timeLimit'; seconds: number; reason: string }
  | { type: 'clearTimer' }
  | { type: 'chase'; key: string; vehicle: VehicleTypeId; at: Point; yaw: number; text: string; escapeDistance: number }
  | { type: 'pickup'; atVehicle?: string; at?: Point; text: string }
  | { type: 'checkpoints'; points: Point[]; radius: number; text: string; vehicle?: string }
  | { type: 'setWanted'; stars: number }
  | { type: 'loseWanted'; text: string }
  | { type: 'spawnEnemies'; group: string; list: { at: Point; role: PedRole; weapon: WeaponId }[]; aggroRange: number }
  | { type: 'killGroup'; group: string; text: string }
  | { type: 'give'; weapon?: WeaponId; ammo?: number; armor?: number; health?: number };

export interface MissionDef {
  id: string;
  title: string;
  giver: string;
  /** Где стоит маркер начала миссии. */
  start: Point;
  /** Какая миссия должна быть пройдена до этой. */
  requires?: string;
  reward: number;
  steps: Step[];
  /** Машины миссии, уничтожение которых — провал. */
  protect?: string[];
  outro?: Line[];
}
