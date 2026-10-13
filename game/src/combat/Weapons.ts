import type { GameContext } from '../core/Context';
import type { HumanPose } from '../player/HumanModel';

/** Этап 1: только прицеливание (полная версия — этап 4). */
export class Weapons {
  constructor(private readonly ctx: GameContext) {}
  isAiming(): boolean {
    return this.ctx.input.rmb;
  }
  firingRecently(): boolean {
    return false;
  }
  applyArmPose(_pose: HumanPose): void {}
}
