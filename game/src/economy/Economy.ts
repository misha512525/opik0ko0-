import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';

/** Деньги игрока. Все изменения проходят через add() и публикуют событие. */
export class Economy {
  money: number = CONFIG.economy.startMoney;

  constructor(private readonly ctx: GameContext) {}

  add(delta: number, reason = ''): void {
    if (delta === 0) return;
    this.money = Math.max(0, Math.round(this.money + delta));
    this.ctx.events.emit('moneyChanged', { amount: this.money, delta, reason });
  }

  /** Списать деньги, если хватает. */
  spend(amount: number, reason = ''): boolean {
    if (this.money < amount) {
      this.ctx.events.emit('notify', { text: `Не хватает денег: нужно $${amount}` });
      return false;
    }
    this.add(-amount, reason);
    return true;
  }
}
