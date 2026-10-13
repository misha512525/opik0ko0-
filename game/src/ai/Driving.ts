import { clamp } from '../core/math';
import type { Vehicle } from '../vehicles/Vehicle';

/** Общие примитивы вождения для ИИ (трафик, полиция, миссии). */

/** Руль в сторону точки: +1 вправо, −1 влево. */
export function steerToward(v: Vehicle, tx: number, tz: number, gain = 1.5): number {
  const dx = tx - v.position.x;
  const dz = tz - v.position.z;
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
  const fwd = dx * s + dz * c;
  const left = dx * c - dz * s;
  const ang = Math.atan2(-left, Math.max(0.5, fwd));
  // Компенсируем уменьшение угла руля на скорости внутри модели машины.
  const comp = 1 + Math.abs(v.forwardSpeed) / 28;
  return clamp((ang / v.spec.steer) * gain * comp, -1, 1);
}

/** Газ/тормоз для поддержания целевой скорости. */
export function speedControl(v: Vehicle, target: number): void {
  const vF = v.forwardSpeed;
  const err = target - vF;
  const ctl = v.controls;
  if (target <= 0.05 && Math.abs(vF) < 0.6) {
    ctl.throttle = 0;
    ctl.brake = 1;
    return;
  }
  if (err > 0) {
    ctl.throttle = clamp(err * 0.35 + 0.15, 0, 1);
    ctl.brake = 0;
  } else {
    ctl.throttle = 0;
    ctl.brake = err < -0.4 ? clamp(-err * 0.22, 0.05, 1) : 0;
  }
}

/** Точка в локальных координатах машины: fwd — вперёд, left — влево. */
export function localOf(v: Vehicle, x: number, z: number): { fwd: number; left: number } {
  const dx = x - v.position.x;
  const dz = z - v.position.z;
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
  return { fwd: dx * s + dz * c, left: dx * c - dz * s };
}
