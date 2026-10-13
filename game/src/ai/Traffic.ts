import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';
import { rand } from '../core/Rng';
import { Path, Roads } from './Roads';
import { localOf, speedControl, steerToward } from './Driving';
import type { Vehicle } from '../vehicles/Vehicle';

export interface TrafficAgent {
  vehicle: Vehicle;
  cur: Path;
  next: Path;
  s: number;
  cruise: number;
  blocked: number;
  honkCooldown: number;
  /** Паника (стрельба рядом): быстрее, игнорирует светофоры. */
  panic: number;
}

const tmp2 = new THREE.Vector2();

/**
 * Городской трафик: машины едут по полосам, выбирают повороты на перекрёстках,
 * стоят на красный, держат дистанцию, перестраиваются, если полоса заблокирована.
 * Машины появляются вне поля зрения вокруг игрока и исчезают вдали.
 */
export class Traffic {
  readonly agents: TrafficAgent[] = [];
  private spawnTimer = 0;
  densityScale = 1;

  constructor(private readonly ctx: GameContext, private readonly roads: Roads) {
    ctx.events.on('gunshot', ({ position }) => this.panicAround(position, 45));
    ctx.events.on('explosion', ({ position }) => this.panicAround(position, 60));
  }

  private panicAround(p: THREE.Vector3, r: number): void {
    for (const a of this.agents) if (a.vehicle.position.distanceTo(p) < r) a.panic = 10;
  }

  get targetCount(): number {
    return Math.round(CONFIG.traffic.maxCars * this.ctx.settings.quality.trafficScale * this.densityScale);
  }

  // ------------------------------------------------------------ спавн

  private trySpawn(): void {
    const { city, player, vehicles, camera } = this.ctx;
    const cfg = CONFIG.traffic;
    const focus = player.mode === 'vehicle' && vehicles.playerVehicle ? vehicles.playerVehicle.position : player.position;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    for (let attempt = 0; attempt < 8; attempt++) {
      const n = city.nodes[rand.int(0, city.nodes.length - 1)];
      if (Math.hypot(n.x - focus.x, n.z - focus.z) > cfg.spawnRadiusMax + 100) continue;
      const links = n.links.filter((l) => l >= 0);
      const to = rand.pick(links);
      const lane = rand.int(0, 1);
      const seg = this.roads.segment(n.id, to, lane);
      const s = rand.range(5, seg.length - 10);
      const p = seg.pointAt(s, tmp2);
      const d = Math.hypot(p.x - focus.x, p.y - focus.z);
      if (d < cfg.spawnRadiusMin || d > cfg.spawnRadiusMax) continue;
      // Не спавним на глазах у игрока (если близко).
      const toP = new THREE.Vector3(p.x - camera.position.x, 0, p.y - camera.position.z).normalize();
      if (d < 130 && toP.dot(new THREE.Vector3(camDir.x, 0, camDir.z).normalize()) > 0.35) continue;
      if (vehicles.nearest(new THREE.Vector3(p.x, 0, p.y), 10)) continue;
      const v = vehicles.spawn(vehicles.randomTrafficType(), p.x, p.y, Roads.yawOf(seg.dir));
      const startSpeed = 6;
      v.body.setLinvel({ x: Math.sin(v.yaw) * startSpeed, y: 0, z: Math.cos(v.yaw) * startSpeed }, true);
      this.adopt(v, seg, s);
      return;
    }
  }

  /** Передать машину под управление трафика. */
  adopt(v: Vehicle, seg: Path, s: number): TrafficAgent {
    v.driver = 'traffic';
    const agent: TrafficAgent = {
      vehicle: v,
      cur: seg,
      next: this.following(seg),
      s,
      cruise: CONFIG.traffic.cruiseSpeed * rand.range(0.8, 1.2),
      blocked: 0,
      honkCooldown: 0,
      panic: 0,
    };
    v.agent = agent;
    this.agents.push(agent);
    return agent;
  }

  private following(p: Path): Path {
    if (p.kind === 'segment') {
      const nxt = this.roads.nextNode(p.from, p.to, () => rand.next());
      const city = this.ctx.city;
      const outDir = city.dirBetween(city.nodes[p.to], city.nodes[nxt]);
      const t = this.roads.turn(p.to, p.dir, outDir, p.lane, p.lane);
      return new Path(t.pts, 'turn', p.to, nxt, outDir, p.lane);
    }
    return this.roads.segment(p.from, p.to, p.lane);
  }

  /** Перепланировать маршрут от текущей позиции (после ДТП и т. п.). */
  private replan(a: TrafficAgent): void {
    const v = a.vehicle;
    const lane = this.ctx.city.nearestLane(v.position.x, v.position.z);
    if (lane.from < 0 || lane.to < 0) return;
    a.cur = this.roads.segment(lane.from, lane.to, 1);
    a.s = a.cur.project(v.position.x, v.position.z);
    a.next = this.following(a.cur);
  }

  private release(a: TrafficAgent, bail: boolean): void {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    const v = a.vehicle;
    if (v.agent === a) v.agent = null;
    if (v.driver === 'traffic') {
      v.driver = 'none';
      v.controls.throttle = 0;
      v.controls.brake = 1;
      if (bail && !v.destroyed) {
        this.ctx.events.emit('driverEjected', { vehicle: v, position: v.localToWorld(v.spec.half.x + 0.9, 0, 0) });
      }
    }
  }

  // ------------------------------------------------------------ вождение

  private obstacleGap(a: TrafficAgent): { gap: number; isPlayer: boolean; moving: boolean; queue: boolean } {
    const v = a.vehicle;
    const { vehicles, player } = this.ctx;
    let gap = Infinity;
    let isPlayer = false;
    let moving = true;
    let queue = false;
    const range = 26;
    const halfW = 1.9;
    for (const u of vehicles.list) {
      if (u === v) continue;
      const dx = u.position.x - v.position.x, dz = u.position.z - v.position.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const l = localOf(v, u.position.x, u.position.z);
      if (l.fwd <= 0 || Math.abs(l.left) > halfW + u.spec.half.x * 0.3) continue;
      const g = l.fwd - v.spec.half.z - u.spec.half.z * 0.8;
      if (g < gap) {
        gap = g;
        isPlayer = u.driver === 'player';
        moving = u.speed > 1.5;
        // Стоим в пробке за другой машиной трафика — это не повод перестраиваться.
        queue = u.driver === 'traffic';
      }
    }
    // Люди перед машиной.
    const checkPerson = (x: number, z: number, isP: boolean) => {
      const l = localOf(v, x, z);
      if (l.fwd > 0 && l.fwd < 18 && Math.abs(l.left) < 1.7) {
        const g = l.fwd - v.spec.half.z - 0.4;
        if (g < gap) {
          gap = g;
          isPlayer = isP;
          moving = false;
          queue = false;
        }
      }
    };
    if (player.mode === 'foot' || player.mode === 'down') checkPerson(player.position.x, player.position.z, true);
    for (const p of this.ctx.peds.list) {
      if (Math.abs(p.x - v.position.x) > 20 || Math.abs(p.z - v.position.z) > 20) continue;
      checkPerson(p.x, p.z, false);
    }
    return { gap, isPlayer, moving, queue };
  }

  private drive(a: TrafficAgent, dt: number): void {
    const v = a.vehicle;
    const cfg = CONFIG.traffic;
    a.s = a.cur.project(v.position.x, v.position.z);
    // Сильно отбросило с полосы — перепланировать.
    const onPath = a.cur.pointAt(a.s, tmp2);
    if (Math.hypot(onPath.x - v.position.x, onPath.y - v.position.z) > 7) {
      this.replan(a);
      return;
    }
    while (a.s >= a.cur.length - 0.3) {
      a.s -= a.cur.length;
      a.cur = a.next;
      a.next = this.following(a.cur);
      a.s = Math.max(0, a.cur.project(v.position.x, v.position.z));
      if (a.cur.length < 0.5) break;
    }

    a.panic = Math.max(0, a.panic - dt);
    let target = a.cruise * (a.panic > 0 ? 1.7 : 1);
    // Повороты медленнее.
    const turning = a.cur.kind === 'turn' && a.cur.pts.length > 3;
    if (turning) target = Math.min(target, 7);
    const remaining = a.cur.length - a.s;
    if (a.cur.kind === 'segment' && a.next.pts.length > 3) target = Math.min(target, 7 + remaining * 0.35);

    // Светофор.
    if (a.cur.kind === 'segment' && a.panic <= 0) {
      const st = this.ctx.lights.state(a.cur.to, a.cur.dir);
      if (st === 'red' || (st === 'yellow' && remaining > 10)) {
        target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, remaining - 0.8)));
      }
    }

    // Препятствия впереди.
    const ob = this.obstacleGap(a);
    if (ob.gap < 30) {
      const safe = cfg.safeGap * 0.35;
      target = Math.min(target, ob.gap < safe ? 0 : Math.sqrt(2 * 7 * (ob.gap - safe)));
    }
    if (target < 0.5 && ob.gap < 6) {
      a.blocked += dt;
      a.honkCooldown -= dt;
      if (ob.isPlayer && a.blocked > 1.5 && a.honkCooldown <= 0) {
        this.ctx.events.emit('horn', { position: v.position.clone() });
        a.honkCooldown = 3;
      }
      // Объезд: перестроиться в соседнюю полосу.
      const wait = ob.queue ? cfg.laneChangeAfterBlocked * 5 : cfg.laneChangeAfterBlocked;
      if (!ob.moving && a.blocked > wait && a.cur.kind === 'segment' && remaining > 15) {
        this.changeLane(a);
      }
    } else a.blocked = Math.max(0, a.blocked - dt * 0.5);

    // Руль на точку впереди по маршруту.
    const look = 3.5 + Math.abs(v.forwardSpeed) * 0.4;
    let ls = a.s + look;
    let path = a.cur;
    if (ls > path.length) {
      ls -= path.length;
      path = a.next;
    }
    const tp = path.pointAt(ls, tmp2);
    v.controls.steer = steerToward(v, tp.x, tp.y);
    v.controls.handbrake = false;
    speedControl(v, target);
  }

  private changeLane(a: TrafficAgent): void {
    const lane = 1 - a.cur.lane;
    const seg = this.roads.segment(a.cur.from, a.cur.to, lane);
    const v = a.vehicle;
    const s = seg.project(v.position.x, v.position.z);
    // Свободна ли соседняя полоса рядом с нами?
    for (const u of this.ctx.vehicles.list) {
      if (u === v) continue;
      const p = seg.pointAt(s, tmp2);
      const d = Math.hypot(u.position.x - p.x, u.position.z - p.y);
      if (d < 9) return;
    }
    a.cur = seg;
    a.s = s;
    a.next = this.following(seg);
    a.blocked = 0;
  }

  // ------------------------------------------------------------ циклы

  fixedUpdate(dt: number): void {
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      const v = a.vehicle;
      if (v.driver !== 'traffic' || v.agent !== a) {
        this.release(a, false);
        continue;
      }
      if (v.destroyed || v.health < v.maxHealth * 0.3) {
        this.release(a, true);
        continue;
      }
      this.drive(a, dt);
    }
  }

  update(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.4;
    const { player, vehicles } = this.ctx;
    const focus = player.mode === 'vehicle' && vehicles.playerVehicle ? vehicles.playerVehicle.position : player.position;
    // Удаляем далёкие.
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      const d = a.vehicle.position.distanceTo(focus);
      if (d > CONFIG.traffic.despawnRadius) {
        this.agents.splice(i, 1);
        vehicles.remove(a.vehicle);
      }
    }
    // Брошенные непостоянные машины вдали тоже убираем.
    for (const v of [...vehicles.list]) {
      if (v.persistent || v.driver !== 'none') continue;
      if (v.position.distanceTo(focus) > CONFIG.traffic.despawnRadius * 1.2) vehicles.remove(v);
    }
    if (this.agents.length < this.targetCount) this.trySpawn();
  }
}
