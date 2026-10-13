import { CONFIG, type VehicleSpec } from '../config';
import type { GameContext } from '../core/Context';
import { MapRenderer, type Blip } from './MapRenderer';

interface Note {
  el: HTMLElement;
  until: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

/**
 * HUD: миникарта с поворотом, здоровье/броня, деньги, звёзды, оружие,
 * спидометр, задания, подсказки, субтитры диалогов, баннеры и карта (M).
 */
export class Hud {
  readonly root: HTMLElement;
  readonly map: MapRenderer;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private hp: HTMLElement;
  private armor: HTMLElement;
  private money: HTMLElement;
  private stars: HTMLElement;
  private clock: HTMLElement;
  private weapon: HTMLElement;
  private ammo: HTMLElement;
  private speedo: HTMLElement;
  private objective: HTMLElement;
  private timer: HTMLElement;
  private prompt: HTMLElement;
  private subtitle: HTMLElement;
  private notes: HTMLElement;
  private banner: HTMLElement;
  private crosshair: HTMLElement;
  private vignette: HTMLElement;
  private arrest: HTMLElement;
  private radio: HTMLElement;
  private bigMap: HTMLElement;
  private bigCanvas: HTMLCanvasElement;
  private noteList: Note[] = [];
  private time = 0;
  private bannerUntil = 0;
  private subtitleUntil = 0;
  private radioUntil = 0;
  private cache = new Map<HTMLElement, string>();
  mapOpen = false;

  constructor(private readonly ctx: GameContext) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = '';
    this.map = new MapRenderer(ctx.city);
    const hud = el('div', 'hud', this.root);

    const tr = el('div', 'hud-tr', hud);
    this.clock = el('div', 'hud-clock', tr);
    this.stars = el('div', 'hud-stars', tr);
    this.money = el('div', 'hud-money', tr);
    const wp = el('div', 'hud-weapon', tr);
    this.weapon = el('div', 'hud-weapon-name', wp);
    this.ammo = el('div', 'hud-ammo', wp);

    const bl = el('div', 'hud-bl', hud);
    this.mini = el('canvas', 'hud-minimap', bl);
    this.mini.width = this.mini.height = 220;
    this.miniCtx = this.mini.getContext('2d')!;
    const bars = el('div', 'hud-bars', bl);
    const hpBar = el('div', 'bar bar-hp', bars);
    this.hp = el('div', 'fill', hpBar);
    const arBar = el('div', 'bar bar-armor', bars);
    this.armor = el('div', 'fill', arBar);

    this.speedo = el('div', 'hud-speedo', hud);
    this.objective = el('div', 'hud-objective', hud);
    this.timer = el('div', 'hud-timer', hud);
    this.prompt = el('div', 'hud-prompt', hud);
    this.subtitle = el('div', 'hud-subtitle', hud);
    this.notes = el('div', 'hud-notes', hud);
    this.banner = el('div', 'hud-banner', hud);
    this.crosshair = el('div', 'hud-crosshair', hud);
    this.vignette = el('div', 'hud-vignette', this.root);
    this.arrest = el('div', 'hud-arrest', hud, '<div class="fill"></div><span>АРЕСТ</span>');
    this.radio = el('div', 'hud-radio', hud);

    this.bigMap = el('div', 'bigmap hidden', this.root);
    this.bigCanvas = el('canvas', 'bigmap-canvas', this.bigMap);
    el('div', 'bigmap-legend', this.bigMap, `
      <b>Карта: ${CONFIG.cityName}</b>
      <span style="color:#ffd23f">!</span> миссия &nbsp; <span style="color:#ffd23f">●</span> цель<br>
      <span style="color:#ff7b54">⌖</span> оружейная &nbsp; <span style="color:#b07bff">✎</span> покраска<br>
      <span style="color:#5cd65c">⌂</span> убежище &nbsp; <span style="color:#ff6b81">+</span> больница &nbsp; <span style="color:#6fa8ff">★</span> участок<br>
      <i>M — закрыть</i>`);

    ctx.events.on('notify', ({ text, seconds }) => this.notify(text, seconds));
    ctx.events.on('moneyChanged', ({ delta, reason }) => {
      if (Math.abs(delta) >= 1) this.notify(`${delta > 0 ? '+' : '−'}$${Math.abs(delta)}${reason ? ' · ' + reason : ''}`, 2.5, delta > 0 ? 'good' : 'bad');
    });
    ctx.events.on('dialog', ({ speaker, text, seconds }) => this.showSubtitle(speaker, text, seconds ?? 4));
    ctx.events.on('playerDied', () => this.showBanner('ВЫ ПОГИБЛИ', 'bad', 4));
    ctx.events.on('playerArrested', () => this.showBanner('АРЕСТОВАН', 'bad', 4));
    ctx.events.on('missionCompleted', ({ reward }) => this.showBanner(`МИССИЯ ВЫПОЛНЕНА<small>+$${reward}</small>`, 'good', 5));
    ctx.events.on('missionFailed', ({ reason }) => this.showBanner(`МИССИЯ ПРОВАЛЕНА<small>${reason}</small>`, 'bad', 4));
    ctx.events.on('missionStarted', ({ id }) => {
      const m = ctx.missions.def(id);
      if (m) this.showBanner(m.title, 'neutral', 3);
    });
  }

  private set(e: HTMLElement, html: string): void {
    if (this.cache.get(e) === html) return;
    this.cache.set(e, html);
    e.innerHTML = html;
  }

  notify(text: string, seconds = 3.5, kind = ''): void {
    const n = el('div', `note ${kind}`, this.notes, text);
    this.noteList.push({ el: n, until: this.time + seconds });
    while (this.noteList.length > 5) this.noteList.shift()!.el.remove();
  }

  showBanner(html: string, kind: 'good' | 'bad' | 'neutral', seconds: number): void {
    this.banner.className = `hud-banner show ${kind}`;
    this.banner.innerHTML = html;
    this.bannerUntil = this.time + seconds;
  }

  showSubtitle(speaker: string, text: string, seconds: number): void {
    this.subtitle.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
    this.subtitle.classList.add('show');
    this.subtitleUntil = this.time + seconds;
  }

  showRadio(name: string): void {
    this.radio.textContent = `📻 ${name}`;
    this.radio.classList.add('show');
    this.radioUntil = this.time + 2.5;
  }

  toggleMap(open = !this.mapOpen): void {
    this.mapOpen = open;
    this.bigMap.classList.toggle('hidden', !open);
    if (open) this.drawBigMap();
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  // ------------------------------------------------------------ сбор значков

  private blips(): Blip[] {
    const { city, missions, police, wanted, vehicles } = this.ctx;
    const out: Blip[] = [];
    for (const p of city.pois) {
      const kind = p.kind === 'police' ? 'policeStation' : p.kind;
      out.push({ kind, x: p.x, z: p.z, label: p.name });
    }
    out.push(...missions.blips());
    if (wanted.stars > 0) {
      for (const u of police.units) {
        const v = u.vehicle;
        if (v && !v.destroyed) out.push({ kind: 'police', x: v.position.x, z: v.position.z });
        for (const c of u.crew) if (c.alive) out.push({ kind: 'police', x: c.x, z: c.z });
      }
    }
    const pv = vehicles.playerVehicle;
    void pv;
    return out;
  }

  // ------------------------------------------------------------ миникарта

  private drawMinimap(): void {
    const c = this.miniCtx;
    const W = this.mini.width;
    const { player, vehicles, cameraRig, wanted } = this.ctx;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.renderPosition : player.renderPosition;
    const yaw = cameraRig.yaw;
    const speed = pv && player.mode === 'vehicle' ? pv.speed : 0;
    const scale = 1 / (1.5 + Math.min(1.5, speed / 25)); // px на метр
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#1f4e66';
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    c.rotate(Math.PI + yaw);
    c.scale(scale, scale);
    const [mx, my] = this.map.toMap(pos.x, pos.z);
    c.drawImage(this.map.canvas, -mx, -my);
    // Зона поиска полиции.
    if (wanted.stars > 0) {
      const [zx, zy] = this.map.toMap(wanted.lastKnown.x, wanted.lastKnown.z);
      c.strokeStyle = wanted.evading && Math.floor(this.time * 3) % 2 ? 'rgba(80,140,255,0.9)' : 'rgba(255,60,60,0.8)';
      c.fillStyle = 'rgba(255,60,60,0.12)';
      c.lineWidth = 3 / scale;
      c.beginPath();
      c.arc(zx - mx, zy - my, wanted.searchRadius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // Маршрут к цели — пунктир.
    const route = this.ctx.missions.routeTarget();
    if (route) {
      const [tx, ty] = this.map.toMap(route.x, route.z);
      c.setLineDash([8 / scale, 6 / scale]);
      c.strokeStyle = 'rgba(255,210,63,0.85)';
      c.lineWidth = 3 / scale;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(tx - mx, ty - my);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();

    // Значки — без поворота самих иконок.
    const R = W / 2 - 12;
    const cos = Math.cos(Math.PI + yaw), sin = Math.sin(Math.PI + yaw);
    for (const b of this.blips()) {
      const dx = (b.x - pos.x) * scale, dz = (b.z - pos.z) * scale;
      let x = dx * cos - dz * sin, y = dx * sin + dz * cos;
      const d = Math.hypot(x, y);
      if (d > R) {
        if (!b.pinned) continue;
        x *= R / d;
        y *= R / d;
      }
      MapRenderer.drawBlip(c, b, W / 2 + x, W / 2 + y, 0.9);
    }
    const pyaw = player.mode === 'vehicle' && pv ? pv.renderYaw : player.yaw;
    MapRenderer.drawBlip(c, { kind: 'player', x: 0, z: 0 }, W / 2, W / 2, 1, yaw - pyaw);
    // Север.
    // Север (мировое −Z) после поворота карты на θ = π + yaw.
    const nx = Math.sin(Math.PI + yaw), ny = -Math.cos(Math.PI + yaw);
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('С', W / 2 + nx * (R + 2), W / 2 + ny * (R + 2));
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    c.stroke();
  }

  private drawBigMap(): void {
    const cv = this.bigCanvas;
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.9;
    cv.width = cv.height = Math.round(size);
    const c = cv.getContext('2d')!;
    const k = size / this.map.size;
    c.drawImage(this.map.canvas, 0, 0, size, size);
    for (const b of this.blips()) {
      const [x, y] = this.map.toMap(b.x, b.z);
      MapRenderer.drawBlip(c, b, x * k, y * k, 1.1);
    }
    const { player, vehicles } = this.ctx;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.position : player.position;
    const pyaw = player.mode === 'vehicle' && pv ? pv.yaw : player.yaw;
    const [px, py] = this.map.toMap(pos.x, pos.z);
    MapRenderer.drawBlip(c, { kind: 'player', x: 0, z: 0 }, px * k, py * k, 1.3, Math.PI - pyaw);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = '12px system-ui';
    for (const p of this.ctx.city.pois) {
      const [x, y] = this.map.toMap(p.x, p.z);
      c.fillText(p.name, x * k + 12, y * k + 4);
    }
    const m = this.ctx.missions.availableMarker();
    if (m) {
      const [x, y] = this.map.toMap(m.x, m.z);
      c.fillStyle = '#ffd23f';
      c.font = 'bold 13px system-ui';
      c.fillText(`Миссия: ${m.title}`, x * k + 12, y * k + 20);
    }
  }

  // ------------------------------------------------------------ кадр

  update(dt: number): void {
    this.time += dt;
    const { player, economy, wanted, weapons, vehicles, dayNight, missions, police } = this.ctx;
    this.set(this.clock, dayNight.clock());
    this.set(this.money, `$${economy.money.toLocaleString('ru-RU')}`);
    const blink = wanted.evading && Math.floor(this.time * 2.5) % 2 === 0;
    let st = '';
    for (let i = 1; i <= 5; i++) st += `<span class="${i <= wanted.stars ? (blink ? 'on blink' : 'on') : 'off'}">★</span>`;
    this.set(this.stars, st);
    this.stars.classList.toggle('active', wanted.stars > 0);

    const def = weapons.def;
    this.set(this.weapon, def.name);
    const a = weapons.ammo[weapons.current];
    this.set(this.ammo, weapons.current === 'fists' ? '' : weapons.reloading ? 'перезарядка…' : `${a.mag} / ${a.reserve}`);

    this.hp.style.width = `${Math.max(0, (player.health / CONFIG.player.maxHealth) * 100)}%`;
    this.armor.style.width = `${(player.armor / CONFIG.player.maxArmor) * 100}%`;
    this.hp.parentElement!.classList.toggle('low', player.health < 30);

    const pv = vehicles.playerVehicle;
    if (player.mode === 'vehicle' && pv) {
      const kmh = Math.round(Math.abs(pv.forwardSpeed) * 3.6);
      const dmg = Math.round((pv.health / pv.maxHealth) * 100);
      this.set(this.speedo, `<div class="kmh">${kmh}<small> км/ч</small></div><div class="car">${(pv.spec as VehicleSpec).name} · ${dmg}%</div>`);
      this.speedo.classList.add('show');
    } else this.speedo.classList.remove('show');

    // Цель миссии и таймер.
    const obj = missions.objectiveText();
    this.set(this.objective, obj);
    this.objective.classList.toggle('show', !!obj);
    const t = missions.timerSeconds();
    if (t !== null) {
      const s = Math.max(0, Math.ceil(t));
      this.set(this.timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      this.timer.classList.add('show');
      this.timer.classList.toggle('urgent', s <= 10);
    } else this.timer.classList.remove('show');

    // Подсказка у машины/маркеров.
    this.set(this.prompt, this.contextPrompt());
    this.prompt.classList.toggle('show', this.prompt.innerHTML !== '');

    const armed = player.mode === 'foot' && (weapons.current !== 'fists' || weapons.isAiming());
    this.crosshair.classList.toggle('show', armed);
    this.crosshair.classList.toggle('aim', weapons.isAiming());

    this.vignette.style.opacity = String(Math.min(0.85, player.hurtFlash * 2 + (player.health < 30 ? 0.35 + Math.sin(this.time * 4) * 0.1 : 0)));
    const ap = police.arrestProgress;
    this.arrest.classList.toggle('show', ap > 0.05);
    (this.arrest.firstElementChild as HTMLElement).style.width = `${Math.min(100, ap * 100)}%`;

    if (this.time > this.bannerUntil) this.banner.classList.remove('show');
    if (this.time > this.subtitleUntil) this.subtitle.classList.remove('show');
    if (this.time > this.radioUntil) this.radio.classList.remove('show');
    while (this.noteList.length && this.noteList[0].until < this.time) this.noteList.shift()!.el.remove();

    this.drawMinimap();
    if (this.mapOpen && Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) this.drawBigMap();
  }

  private contextPrompt(): string {
    const { player, vehicles, shops, missions } = this.ctx;
    if (player.mode === 'vehicle') {
      const pv = vehicles.playerVehicle;
      if (pv && Math.abs(pv.forwardSpeed) < 9) return shops.prompt() || '<kbd>F</kbd> выйти · <kbd>R</kbd> радио';
      return shops.prompt();
    }
    if (player.mode !== 'foot') return '';
    const sp = shops.prompt();
    if (sp) return sp;
    const mp = missions.prompt();
    if (mp) return mp;
    const v = vehicles.nearest(player.position, CONFIG.player.enterVehicleRange, (c) => !c.destroyed);
    if (v) return `<kbd>F</kbd> сесть в «${v.spec.name}»`;
    return '';
  }
}
