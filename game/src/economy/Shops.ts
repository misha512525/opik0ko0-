import { CONFIG, type WeaponId } from '../config';
import type { GameContext } from '../core/Context';
import type { MarkerSpec } from '../fx/Markers';
import type { Poi } from '../world/CityLayout';

interface ShopItem {
  id: string;
  name: string;
  price: number;
  desc: string;
  buy(): string | null;
}

const PAINTS = [0xd62828, 0x003049, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x6a4c93, 0xf1faee, 0x1b1b1b, 0x8ac926, 0x1982c4, 0xff595e];

/**
 * Магазины: оружейная (пешком, клавиша E) и покрасочная (на машине, E).
 * Перекраска чинит машину и сбрасывает розыск, если полиция не видит игрока.
 * В убежище по E — сохранение.
 */
export class Shops {
  private panel: HTMLElement;
  open = false;
  onClose: (() => void) | null = null;

  constructor(private readonly ctx: GameContext) {
    this.panel = document.createElement('div');
    this.panel.className = 'shop hidden';
    document.body.appendChild(this.panel);
  }

  private nearPoi(kind: Poi['kind'], radius: number): Poi | null {
    const { player, vehicles } = this.ctx;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.position : player.position;
    for (const p of this.ctx.city.pois) {
      if (p.kind === kind && Math.hypot(p.x - pos.x, p.z - pos.z) < radius) return p;
    }
    return null;
  }

  prompt(): string {
    const { player, vehicles } = this.ctx;
    if (player.mode === 'foot') {
      if (this.nearPoi('gunshop', 3)) return '<kbd>E</kbd> Оружейная «Калибр»';
      if (this.nearPoi('safehouse', 3)) return '<kbd>E</kbd> Сохранить игру';
      if (this.nearPoi('paintshop', 6)) return 'Заезжайте на машине, чтобы перекраситься';
    }
    if (player.mode === 'vehicle' && vehicles.playerVehicle && this.nearPoi('paintshop', 7)) {
      return `<kbd>E</kbd> Перекрасить машину — $${CONFIG.economy.respray} (сбрасывает розыск)`;
    }
    return '';
  }

  markers(): MarkerSpec[] {
    const out: MarkerSpec[] = [];
    for (const p of this.ctx.city.pois) {
      if (p.kind === 'gunshop') out.push({ x: p.x, z: p.z, radius: 1.2, color: 0xff7b54, kind: 'cylinder' });
      else if (p.kind === 'paintshop') out.push({ x: p.x, z: p.z, radius: 4, color: 0xb07bff, kind: 'cylinder' });
      else if (p.kind === 'safehouse' && !this.ctx.missions.availableMarkerAt(p.x, p.z)) out.push({ x: p.x, z: p.z, radius: 1.0, color: 0x5cd65c, kind: 'cylinder' });
    }
    return out;
  }

  /** Обработка клавиши E. */
  update(): void {
    const { input, player, missions } = this.ctx;
    if (this.open || !input.pressed('KeyE')) return;
    if (player.mode === 'foot') {
      if (this.nearPoi('gunshop', 3)) return this.openGunShop();
      if (this.nearPoi('safehouse', 3)) {
        if (missions.active) return void this.ctx.events.emit('notify', { text: 'Нельзя сохраняться во время миссии' });
        this.ctx.save.save('manual');
        this.ctx.events.emit('notify', { text: 'Игра сохранена' });
        return;
      }
    }
    if (player.mode === 'vehicle' && this.nearPoi('paintshop', 7)) this.respray();
  }

  private respray(): void {
    const { vehicles, wanted, economy, events } = this.ctx;
    const v = vehicles.playerVehicle;
    if (!v) return;
    if (wanted.stars > 0 && wanted.seen) {
      events.emit('notify', { text: 'Полиция видит тебя — сначала оторвись!' });
      return;
    }
    if (!economy.spend(CONFIG.economy.respray, 'Покраска')) return;
    let c = PAINTS[Math.floor(Math.random() * PAINTS.length)];
    if (c === v.paint) c = PAINTS[(PAINTS.indexOf(c) + 1) % PAINTS.length];
    v.repaint(c);
    v.repair();
    const had = wanted.stars > 0;
    wanted.clear();
    events.emit('respray', {});
    events.emit('notify', { text: had ? 'Новый цвет — полиция потеряла след!' : 'Машина перекрашена и отремонтирована' });
  }

  // ------------------------------------------------------------ оружейная

  private items(): ShopItem[] {
    const { weapons, economy, player, events } = this.ctx;
    const w = CONFIG.weapons;
    const buyWeapon = (id: WeaponId): string | null => {
      const def = w[id];
      if (weapons.owned.has(id)) {
        if (!economy.spend(def.ammoPrice, `Патроны: ${def.name}`)) return null;
        weapons.give(id, def.ammoPack);
        return `+${def.ammoPack} патронов`;
      }
      if (!economy.spend(def.price, def.name)) return null;
      weapons.give(id, def.ammoPack);
      weapons.select(id);
      return `${def.name} куплен`;
    };
    const owned = (id: WeaponId) => weapons.owned.has(id);
    return [
      {
        id: 'pistol', name: owned('pistol') ? `Патроны: ${w.pistol.name}` : w.pistol.name,
        price: owned('pistol') ? w.pistol.ammoPrice : w.pistol.price,
        desc: owned('pistol') ? `+${w.pistol.ammoPack} шт.` : `Полуавтомат, урон ${w.pistol.damage}, магазин ${w.pistol.magazine}`,
        buy: () => buyWeapon('pistol'),
      },
      {
        id: 'rifle', name: owned('rifle') ? `Патроны: ${w.rifle.name}` : w.rifle.name,
        price: owned('rifle') ? w.rifle.ammoPrice : w.rifle.price,
        desc: owned('rifle') ? `+${w.rifle.ammoPack} шт.` : `Автоматический огонь, магазин ${w.rifle.magazine}`,
        buy: () => buyWeapon('rifle'),
      },
      {
        id: 'armor', name: 'Бронежилет', price: CONFIG.economy.armor, desc: 'Полная броня (поглощает 75% урона)',
        buy: () => {
          if (player.armor >= CONFIG.player.maxArmor) return 'Броня уже полная';
          if (!economy.spend(CONFIG.economy.armor, 'Бронежилет')) return null;
          player.armor = CONFIG.player.maxArmor;
          return 'Бронежилет надет';
        },
      },
      {
        id: 'health', name: 'Аптечка', price: CONFIG.economy.health, desc: 'Полное здоровье',
        buy: () => {
          if (player.health >= CONFIG.player.maxHealth) return 'Здоровье уже полное';
          if (!economy.spend(CONFIG.economy.health, 'Аптечка')) return null;
          this.ctx.damage.heal(CONFIG.player.maxHealth);
          events.emit('pickup', { kind: 'health' });
          return 'Здоровье восстановлено';
        },
      },
    ];
  }

  openGunShop(): void {
    this.open = true;
    this.ctx.input.unlockPointer();
    this.render('');
    this.panel.classList.remove('hidden');
  }

  private render(status: string): void {
    const items = this.items();
    this.panel.innerHTML = `
      <div class="shop-title">Оружейная «Калибр»</div>
      <div class="shop-money">Ваши деньги: $${this.ctx.economy.money}</div>
      <div class="shop-items">
        ${items.map((it) => `<button class="shop-item" data-id="${it.id}"><b>${it.name}</b><span>${it.desc}</span><i>$${it.price}</i></button>`).join('')}
      </div>
      <div class="shop-status">${status}</div>
      <button class="shop-close">Выйти (Esc)</button>`;
    this.panel.querySelectorAll<HTMLButtonElement>('.shop-item').forEach((b) => {
      b.onclick = () => {
        const it = items.find((i) => i.id === b.dataset.id)!;
        const res = it.buy();
        this.ctx.events.emit('uiClick', {});
        this.render(res ?? 'Недостаточно денег');
      };
    });
    (this.panel.querySelector('.shop-close') as HTMLButtonElement).onclick = () => this.close();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.panel.classList.add('hidden');
    this.ctx.input.lockPointer();
    this.onClose?.();
  }
}
