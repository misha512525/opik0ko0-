import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';
import { hostileStep } from '../ai/Hostiles';
import type { Ped } from '../ai/Pedestrians';
import type { Vehicle } from '../vehicles/Vehicle';
import type { Blip } from '../ui/MapRenderer';
import type { MarkerSpec } from '../fx/Markers';
import { buildMissions } from './definitions';
import { FleeDriver } from './FleeDriver';
import type { Line, MissionDef, Point, Step } from './types';

interface Runtime {
  def: MissionDef;
  step: number;
  stepTime: number;
  vehicles: Map<string, Vehicle>;
  groups: Map<string, { peds: Ped[]; aggro: number; alerted: boolean }>;
  deadline: number | null;
  timeoutReason: string;
  checkpoint: number;
  dialog: { lines: Line[]; index: number; until: number } | null;
  flee: FleeDriver | null;
  escapeTimer: number;
  pickupAt: Point | null;
}

/**
 * Менеджер миссий: показывает маркер следующего задания, запускает миссию,
 * исполняет шаги (см. types.ts), следит за провалом/успехом, выдаёт награду.
 */
export class MissionManager {
  readonly defs: MissionDef[];
  readonly completed = new Set<string>();
  private rt: Runtime | null = null;
  private time = 0;
  private cooldown = 0;
  private outro: { lines: Line[]; index: number; until: number } | null = null;

  constructor(private readonly ctx: GameContext) {
    this.defs = buildMissions(ctx.city);
    ctx.events.on('playerDied', () => this.fail('Вы погибли'));
    ctx.events.on('playerArrested', () => this.fail('Вас арестовали'));
  }

  def(id: string): MissionDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  get active(): MissionDef | null {
    return this.rt?.def ?? null;
  }

  /** Следующая доступная миссия (маркер на карте). */
  next(): MissionDef | null {
    for (const d of this.defs) {
      if (this.completed.has(d.id)) continue;
      if (d.requires && !this.completed.has(d.requires)) continue;
      return d;
    }
    return null;
  }

  availableMarker(): { x: number; z: number; title: string } | null {
    if (this.rt) return null;
    const n = this.next();
    return n ? { x: n.start.x, z: n.start.z, title: n.title } : null;
  }

  /** Стоит ли маркер миссии в этой точке (чтобы не дублировать маркер убежища). */
  availableMarkerAt(x: number, z: number): boolean {
    const m = this.availableMarker();
    return !!m && Math.hypot(m.x - x, m.z - z) < 3;
  }

  // ------------------------------------------------------------ запуск/завершение

  start(def: MissionDef): void {
    this.rt = {
      def,
      step: -1,
      stepTime: 0,
      vehicles: new Map(),
      groups: new Map(),
      deadline: null,
      timeoutReason: '',
      checkpoint: 0,
      dialog: null,
      flee: null,
      escapeTimer: 0,
      pickupAt: null,
    };
    this.outro = null;
    this.ctx.events.emit('missionStarted', { id: def.id });
    this.advance();
  }

  private cleanup(keepVehicles: boolean): void {
    const rt = this.rt;
    if (!rt) return;
    for (const [, v] of rt.vehicles) {
      if (v.driver === 'mission') {
        v.driver = 'none';
        v.controls.throttle = 0;
        v.controls.brake = 1;
      }
      v.persistent = keepVehicles && !v.destroyed && v === this.ctx.vehicles.playerVehicle;
      if (!keepVehicles && v !== this.ctx.vehicles.playerVehicle) this.ctx.vehicles.remove(v);
    }
    for (const [, g] of rt.groups) {
      for (const p of g.peds) {
        p.persistent = false;
        if (!keepVehicles) this.ctx.peds.remove(p);
      }
    }
    this.rt = null;
  }

  fail(reason: string): void {
    if (!this.rt) return;
    const id = this.rt.def.id;
    this.cleanup(false);
    this.cooldown = 4;
    this.ctx.events.emit('missionFailed', { id, reason });
  }

  private complete(): void {
    const rt = this.rt!;
    const def = rt.def;
    this.completed.add(def.id);
    this.cleanup(true);
    this.ctx.economy.add(def.reward, def.title);
    this.ctx.events.emit('missionCompleted', { id: def.id, reward: def.reward });
    if (def.outro) this.outro = { lines: def.outro, index: -1, until: 0 };
    this.cooldown = 3;
    this.ctx.save.save('autosave');
  }

  // ------------------------------------------------------------ шаги

  private get step(): Step | null {
    const rt = this.rt;
    if (!rt || rt.step < 0 || rt.step >= rt.def.steps.length) return null;
    return rt.def.steps[rt.step];
  }

  private advance(): void {
    const rt = this.rt;
    if (!rt) return;
    rt.step++;
    rt.stepTime = 0;
    if (rt.step >= rt.def.steps.length) {
      this.complete();
      return;
    }
    this.enter(rt.def.steps[rt.step]);
  }

  /** Мгновенные действия при входе в шаг. */
  private enter(s: Step): void {
    const rt = this.rt!;
    const { vehicles, peds, wanted, weapons, player, events } = this.ctx;
    switch (s.type) {
      case 'dialog':
        rt.dialog = { lines: s.lines, index: -1, until: 0 };
        return;
      case 'spawnVehicle': {
        const v = vehicles.spawn(s.vehicle, s.at.x, s.at.z, s.yaw, s.color);
        v.persistent = true;
        rt.vehicles.set(s.key, v);
        return this.advance();
      }
      case 'timeLimit':
        rt.deadline = s.seconds;
        rt.timeoutReason = s.reason;
        return this.advance();
      case 'clearTimer':
        rt.deadline = null;
        return this.advance();
      case 'setWanted':
        wanted.setStars(s.stars);
        return this.advance();
      case 'give':
        if (s.weapon) {
          weapons.give(s.weapon, s.ammo ?? 0);
          weapons.select(s.weapon);
        }
        if (s.armor) player.armor = Math.min(CONFIG.player.maxArmor, player.armor + s.armor);
        if (s.health) player.health = Math.min(CONFIG.player.maxHealth, player.health + s.health);
        events.emit('notify', { text: 'Получено снаряжение от Лу' });
        return this.advance();
      case 'spawnEnemies': {
        const list: Ped[] = [];
        for (const e of s.list) {
          const ped = peds.spawnAt(e.role, e.at.x, e.at.z, e.role === 'boss' ? { shirt: 0xf0f0f0, pants: 0x111111, hair: 0x888888 } : { shirt: 0x2b2b2b, pants: 0x1a1a1a });
          ped.state = 'script';
          ped.persistent = true;
          ped.armed = true;
          ped.weapon = e.weapon;
          ped.controller = this;
          ped.moveTo(ped.x, ped.z, 0);
          list.push(ped);
        }
        rt.groups.set(s.group, { peds: list, aggro: s.aggroRange, alerted: false });
        return this.advance();
      }
      case 'chase': {
        const v = vehicles.spawn(s.vehicle, s.at.x, s.at.z, s.yaw);
        rt.vehicles.set(s.key, v);
        rt.flee = new FleeDriver(this.ctx, this.ctx.roads, v);
        rt.escapeTimer = 0;
        events.emit('notify', { text: 'Курьер замечен на карте!' });
        return;
      }
      case 'pickup': {
        const v = s.atVehicle ? rt.vehicles.get(s.atVehicle) : null;
        const src = v ? v.localToWorld(v.spec.half.x + 1.2, 0, 0) : null;
        rt.pickupAt = src ? { x: src.x, z: src.z } : s.at ?? null;
        return;
      }
      case 'checkpoints':
        rt.checkpoint = 0;
        return;
      default:
        return;
    }
  }

  /** Проверка выполнения текущего шага. */
  private check(s: Step, dt: number): void {
    const rt = this.rt!;
    const { player, vehicles, wanted, events } = this.ctx;
    const pv = vehicles.playerVehicle;
    const pos = player.mode === 'vehicle' && pv ? pv.position : player.position;
    const near = (p: Point, r: number) => Math.hypot(pos.x - p.x, pos.z - p.z) < r;
    switch (s.type) {
      case 'dialog': {
        const d = rt.dialog!;
        if (this.time >= d.until) {
          d.index++;
          if (d.index >= d.lines.length) {
            rt.dialog = null;
            this.advance();
            return;
          }
          const [who, text] = d.lines[d.index];
          const secs = Math.min(6, 1.6 + text.length * 0.045);
          d.until = this.time + secs;
          events.emit('dialog', { speaker: who, text, seconds: secs });
        }
        return;
      }
      case 'enterVehicle':
        if (pv && pv === rt.vehicles.get(s.key)) this.advance();
        return;
      case 'enterAnyVehicle':
        if (pv && player.mode === 'vehicle') this.advance();
        return;
      case 'goto': {
        if (s.vehicle) {
          const v = rt.vehicles.get(s.vehicle);
          if (!v || pv !== v) return;
          if (s.minHealth && v.health / v.maxHealth < s.minHealth) return this.fail('Машина слишком повреждена');
        }
        if (s.onFoot && player.mode !== 'foot') return;
        if (near(s.at, s.radius)) this.advance();
        return;
      }
      case 'chase': {
        const v = rt.vehicles.get(s.key)!;
        rt.flee?.fixedUpdate(dt);
        if (v.destroyed || v.health < v.maxHealth * 0.3) {
          // Курьер бросает машину и убегает.
          if (v.driver === 'mission') {
            v.driver = 'none';
            v.controls.brake = 1;
            const ped = this.ctx.peds.spawnAt('civilian', ...this.side(v));
            this.ctx.peds.flee(ped, player.position, 20);
            events.emit('dialog', { speaker: 'Курьер', text: 'Не стреляй! Забирай, всё забирай!', seconds: 3 });
          }
          rt.flee = null;
          this.advance();
          return;
        }
        const d = Math.hypot(v.position.x - pos.x, v.position.z - pos.z);
        if (d > s.escapeDistance) {
          rt.escapeTimer += dt;
          if (rt.escapeTimer > 6) this.fail('Курьер ушёл');
        } else rt.escapeTimer = 0;
        return;
      }
      case 'pickup':
        // Предмет лежит у двери машины — следим, если она ещё катится.
        if (s.atVehicle) {
          const v = rt.vehicles.get(s.atVehicle);
          if (v && rt.pickupAt) {
            const p = v.localToWorld(v.spec.half.x + 1.2, 0, 0);
            rt.pickupAt.x = p.x;
            rt.pickupAt.z = p.z;
          }
        }
        if (rt.pickupAt && player.mode === 'foot' && near(rt.pickupAt, 2.4)) {
          events.emit('notify', { text: 'Бухгалтерская книга у вас' });
          events.emit('pickup', { kind: 'item' });
          rt.pickupAt = null;
          this.advance();
        }
        return;
      case 'checkpoints': {
        if (s.vehicle && pv !== rt.vehicles.get(s.vehicle)) return;
        const cp = s.points[rt.checkpoint];
        if (cp && near(cp, s.radius)) {
          rt.checkpoint++;
          events.emit('checkpoint', { index: rt.checkpoint, total: s.points.length });
          if (rt.checkpoint >= s.points.length) this.advance();
        }
        return;
      }
      case 'loseWanted':
        if (wanted.stars === 0 && rt.stepTime > 1) this.advance();
        return;
      case 'killGroup': {
        const g = rt.groups.get(s.group);
        if (!g || g.peds.every((p) => !p.alive)) this.advance();
        return;
      }
      default:
        return;
    }
  }

  private side(v: Vehicle): [number, number] {
    const p = v.localToWorld(v.spec.half.x + 1, 0, 0);
    return [p.x, p.z];
  }

  /** Враги миссии: стоят на посту, при приближении — атакуют. */
  private updateEnemies(dt: number): void {
    const rt = this.rt;
    if (!rt) return;
    const pp = this.ctx.player.position;
    for (const [, g] of rt.groups) {
      if (!g.alerted) {
        for (const p of g.peds) {
          if (!p.alive) continue;
          if (Math.hypot(p.x - pp.x, p.z - pp.z) < g.aggro || p.health < p.maxHealth) g.alerted = true;
        }
        if (!g.alerted) continue;
        this.ctx.events.emit('dialog', { speaker: 'Охрана', text: 'Это Ветров! Огонь!', seconds: 2.5 });
      }
      for (const p of g.peds) {
        if (!p.alive || p.state === 'down') continue;
        hostileStep(this.ctx, p, dt, {
          shoot: true,
          minRange: p.role === 'boss' ? 12 : 6,
          maxRange: 45,
          accuracy: p.role === 'boss' ? 0.4 : 0.3,
          damage: p.weapon === 'rifle' ? 6 : 8,
          interval: p.weapon === 'rifle' ? 0.35 : 0.85,
          runSpeed: 4.5,
        });
      }
    }
  }

  fixedUpdate(dt: number): void {
    const rt = this.rt;
    if (!rt) return;
    rt.stepTime += dt;
    if (rt.deadline !== null) {
      rt.deadline -= dt;
      if (rt.deadline <= 0) return this.fail(rt.timeoutReason);
    }
    for (const key of rt.def.protect ?? []) {
      const v = rt.vehicles.get(key);
      if (v && v.destroyed) return this.fail('Машина уничтожена');
    }
    this.updateEnemies(dt);
    const s = this.step;
    if (s) this.check(s, dt);
  }

  update(dt: number): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Enter — пропустить реплику.
    if (this.ctx.input.pressed('Enter')) {
      if (this.rt?.dialog) this.rt.dialog.until = 0;
      if (this.outro) this.outro.until = 0;
    }
    // Финальные реплики после миссии.
    if (this.outro && this.time >= this.outro.until) {
      this.outro.index++;
      if (this.outro.index >= this.outro.lines.length) this.outro = null;
      else {
        const [who, text] = this.outro.lines[this.outro.index];
        const secs = Math.min(6, 1.6 + text.length * 0.045);
        this.outro.until = this.time + secs;
        this.ctx.events.emit('dialog', { speaker: who, text, seconds: secs });
      }
    }
    // Старт следующей миссии: игрок пешком в маркере.
    if (!this.rt && this.cooldown <= 0 && this.ctx.player.mode === 'foot' && this.ctx.wanted.stars === 0) {
      const n = this.next();
      if (n && Math.hypot(this.ctx.player.position.x - n.start.x, this.ctx.player.position.z - n.start.z) < 2.2) this.start(n);
    }
  }

  // ------------------------------------------------------------ для HUD/маркеров

  objectiveText(): string {
    const rt = this.rt;
    const s = this.step;
    if (!rt || !s) return '';
    switch (s.type) {
      case 'enterVehicle':
      case 'enterAnyVehicle':
      case 'goto':
      case 'chase':
      case 'pickup':
      case 'loseWanted':
      case 'killGroup':
        if (s.type === 'goto' && s.vehicle && this.ctx.vehicles.playerVehicle !== rt.vehicles.get(s.vehicle)) return 'Вернись в машину';
        if (s.type === 'killGroup') {
          const g = rt.groups.get(s.group);
          const left = g ? g.peds.filter((p) => p.alive).length : 0;
          return `${s.text} — осталось: ${left}`;
        }
        return s.text;
      case 'checkpoints':
        return `${s.text}: ${rt.checkpoint}/${s.points.length}`;
      default:
        return '';
    }
  }

  timerSeconds(): number | null {
    return this.rt?.deadline ?? null;
  }

  /** Точка, к которой тянется пунктир на миникарте. */
  routeTarget(): Point | null {
    const rt = this.rt;
    const s = this.step;
    if (!rt || !s) {
      const m = this.availableMarker();
      return m && Math.hypot(m.x - this.ctx.player.position.x, m.z - this.ctx.player.position.z) < 400 ? m : null;
    }
    switch (s.type) {
      case 'goto':
        if (s.vehicle && this.ctx.vehicles.playerVehicle !== rt.vehicles.get(s.vehicle)) {
          const v = rt.vehicles.get(s.vehicle);
          return v ? { x: v.position.x, z: v.position.z } : null;
        }
        return s.at;
      case 'enterVehicle': {
        const v = rt.vehicles.get(s.key);
        return v ? { x: v.position.x, z: v.position.z } : null;
      }
      case 'chase': {
        const v = rt.vehicles.get(s.key);
        return v ? { x: v.position.x, z: v.position.z } : null;
      }
      case 'pickup':
        return rt.pickupAt;
      case 'checkpoints':
        return s.points[rt.checkpoint] ?? null;
      case 'killGroup': {
        const g = rt.groups.get(s.group);
        const p = g?.peds.find((q) => q.alive);
        return p ? { x: p.x, z: p.z } : null;
      }
      default:
        return null;
    }
  }

  blips(): Blip[] {
    const out: Blip[] = [];
    const m = this.availableMarker();
    if (m) out.push({ kind: 'mission', x: m.x, z: m.z, label: m.title, pinned: true });
    const rt = this.rt;
    const s = this.step;
    if (!rt || !s) return out;
    const t = this.routeTarget();
    if (s.type === 'chase' && t) out.push({ kind: 'enemy', x: t.x, z: t.z, pinned: true });
    else if (s.type === 'killGroup') {
      const g = rt.groups.get(s.group);
      for (const p of g?.peds ?? []) if (p.alive) out.push({ kind: 'enemy', x: p.x, z: p.z, pinned: false });
      if (t) out.push({ kind: 'enemy', x: t.x, z: t.z, pinned: true });
    } else if (s.type === 'checkpoints') {
      const nx = s.points[rt.checkpoint + 1];
      if (nx) out.push({ kind: 'checkpoint', x: nx.x, z: nx.z });
      if (t) out.push({ kind: 'objective', x: t.x, z: t.z, pinned: true });
    } else if (t && s.type !== 'loseWanted') out.push({ kind: s.type === 'enterVehicle' ? 'vehicle' : 'objective', x: t.x, z: t.z, pinned: true });
    return out;
  }

  markers(): MarkerSpec[] {
    const out: MarkerSpec[] = [];
    const m = this.availableMarker();
    if (m) out.push({ x: m.x, z: m.z, radius: 1.6, color: 0xffd23f, kind: 'cylinder' });
    const rt = this.rt;
    const s = this.step;
    if (!rt || !s) return out;
    const t = this.routeTarget();
    if (!t) return out;
    if (s.type === 'checkpoints') {
      out.push({ x: t.x, z: t.z, radius: s.radius, color: 0xffd23f, kind: 'ring' });
      const nx = s.points[rt.checkpoint + 1];
      if (nx) out.push({ x: nx.x, z: nx.z, radius: s.radius * 0.6, color: 0x8a6d1f, kind: 'ring' });
    } else if (s.type === 'goto') {
      out.push({ x: t.x, z: t.z, radius: Math.min(s.radius, 8), color: 0xffd23f, kind: 'cylinder' });
    } else if (s.type === 'pickup') {
      out.push({ x: t.x, z: t.z, radius: 0.8, color: 0x7dff7d, kind: 'cylinder' });
    } else if (s.type === 'enterVehicle' || s.type === 'chase' || s.type === 'killGroup') {
      out.push({ x: t.x, z: t.z, radius: 0, color: s.type === 'enterVehicle' ? 0x5ad1ff : 0xff3b3b, kind: 'arrow', y: s.type === 'killGroup' ? 2.6 : 3.2 });
    }
    return out;
  }

  prompt(): string {
    const n = this.availableMarker();
    if (!n || this.ctx.player.mode !== 'foot') return '';
    const d = Math.hypot(this.ctx.player.position.x - n.x, this.ctx.player.position.z - n.z);
    if (d > 6) return '';
    if (this.ctx.wanted.stars > 0) return 'Сначала оторвись от полиции';
    return `Миссия: <b>${n.title}</b> — встань в жёлтый маркер`;
  }

  serialize(): string[] {
    return [...this.completed];
  }

  restore(ids: string[]): void {
    this.cleanup(false);
    this.completed.clear();
    for (const id of ids) this.completed.add(id);
  }

  /** Позиция объекта для отладки/тестов. */
  debugState() {
    const rt = this.rt;
    return rt ? { id: rt.def.id, step: rt.step, type: this.step?.type, checkpoint: rt.checkpoint, deadline: rt.deadline } : null;
  }

  vehicle(key: string): Vehicle | undefined {
    return this.rt?.vehicles.get(key);
  }

  group(key: string): Ped[] {
    return this.rt?.groups.get(key)?.peds ?? [];
  }
}

export const missionVec = new THREE.Vector3();
