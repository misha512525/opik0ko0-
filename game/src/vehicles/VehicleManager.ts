import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleSpec } from '../config';

/** Этап 1: заглушка менеджера машин (полная версия — этап 2). */
export interface VehicleLike {
  renderPosition: THREE.Vector3;
  renderYaw: number;
  forwardSpeed: number;
  spec: VehicleSpec;
  body: RAPIER.RigidBody;
}
export class VehicleManager {
  playerVehicle: VehicleLike | null = null;
}
