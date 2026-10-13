import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Context';
import { rand } from '../core/Rng';
import { Path, Roads } from './Roads';
import { speedControl, steerToward } from './Driving';
import { hostileStep, pedSeesPlayer, playerTarget } from './Hostiles';
import type { Ped } from './Pedestrians';
import type { Vehicle } from '../vehicles/Vehicle';

interface PoliceUnit {
  kind: 'patrol' | 'roadblock';
  vehicle: Vehicle | null;
  crew: Ped[];
  crewInCar: number;
  cur: Path | null;
  next: Path | null;
  s: number;
  stuck: number;
  reverse: number;
  leaving: boolean;
  arrestTimer: number;
  age: number;
}

const tmp2 = new THREE.Vector2();
const tmpV = new THREE.Vector3();

/**
 * Полиция: патрульные машины преследуют игрока по графу улиц, вблизи — тараном;
 * когда игрок пешком, копы выходят и пытаются арестовать (1–2★) или стреляют (3★+).
 * На 4★+ впереди по курсу игрока выставляются блокпосты.
 */
export class Police {
  readonly units: PoliceUnit[] = [];
  private manageTimer = 0;
  private visionTimer = 0;
  private roadblockTimer = 10;

  constructor(private readonly ctx: GameContext, private readonly roads: Roads) {
    ctx.events.on('wantedChanged', ({ stars }) => {
      if (stars === 0) for (const u of this.units) u.leaving = true;
    });
    ctx.events.on('driverEjected', ({ vehicle, position }) => {
      if (vehicle.spec.id !== 'police') return;
      const unit = this.units.find((u) => u.vehicle === vehicle);
      if (unit) {
        unit.vehicle = null;
        for (let i = 0; i < unit.crewInCar; i++) unit.crew.push(this.spawnCop(position.x + i, position.z));
        unit.crewInCar = 0;
      }
    });
    ctx.events.on('playerRespawned', () => this.clearAll());
  }

  get stars(): number {
    return this.ctx.wanted.stars;
  }

  private spawnCop(x: number, z: number): Ped {
    const ped = this.ctx.peds.spawnAt('cop', x, z);
    ped.state = 'script';
    ped.armed = true;
    ped.weapon = this.stars >= 5 ? 'rifle' : 'pistol';
    ped.persistent = true;
    ped.controller = this;
    return ped;
  }

  // ------------------------------------------------------------ спавн

  private focus(): THREE.Vector3 {
    const { player, vehicles } = this.ctx;
    return player.mode === 'vehicle' && vehicles.playerVehicle ? vehicles.playerVehicle.position : player.position;
  }

  /**
   * Куда едет полиция: к игроку, если его видят, иначе — прочёсывает зону
   * вокруг последнего известного положения.
   */
  private searchTarget(): THREE.Vector3 {
    const w = this.ctx.wanted;
    return w.seen ? this.focus() : w.lastKnown;
  }

  private spawnPatrol(): void {
    const { city, vehicles, camera, wanted } = this.ctx;
    const f = this.searchTarget();
    // Игрок далеко от зоны поиска — новых патрулей не шлём.
    if (!wanted.seen && wanted.lastKnown.distanceTo(this.focus()) > CONFIG.police.despawnDistance - 40) return;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = rand.range(0, Math.PI * 2);
      const r = rand.range(CONFIG.police.spawnDistanceMin, CONFIG.police.spawnDistanceMax);
      const x = f.x + Math.cos(ang) * r, z = f.z + Math.sin(ang) * r;
      if (x < city.minX || x > city.maxX || z < city.minZ || z > city.maxZ) continue;
      const lane = city.nearestLane(x, z);
      if (lane.from < 0 || lane.to < 0) continue;
      const p = new THREE.Vector3(lane.x, 0, lane.z);
      // Не на глазах у игрока.
      tmpV.subVectors(p, camera.position).setY(0).normalize();
      if (tmpV.dot(camDir.clone().setY(0).normalize()) > 0.6 && p.distanceTo(f) < 120) continue;
      if (vehicles.nearest(p, 8)) continue;
      const v = vehicles.spawn('police', lane.x, lane.z, Roads.yawOf(lane.dir));
      v.driver = 'police';
      v.sirenOn = true;
      const seg = this.roads.segment(lane.from, lane.to, 0);
      const unit: PoliceUnit = {
        kind: 'patrol', vehicle: v, crew: [], crewInCar: CONFIG.police.footCopsPerCar, cur: seg, next: null,
        s: seg.project(lane.x, lane.z), stuck: 0, reverse: 0, leaving: false, arrestTimer: 0, age: 0,
      };
      unit.next = this.following(seg);
      v.agent = unit;
      this.units.push(unit);
      return;
    }
  }

  /** Блокпост впереди по курсу игрока. */
  private spawnRoadblock(): void {
    const { city, vehicles } = this.ctx;
    const pv = vehicles.playerVehicle;
    if (!pv || pv.speed < 8) return;
    const lane = city.nearestLane(pv.position.x, pv.position.z);
    if (lane.to < 0) return;
    const fwd = pv.forward;
    const d = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }][lane.dir];
    if (fwd.x * d.x + fwd.z * d.z < 0.7) return;
    let node = city.nodes[lane.to];
    if (Math.hypot(node.x - pv.position.x, node.z - pv.position.z) < 70) {
      const nxt = node.links[lane.dir];
      if (nxt < 0) return;
      node = city.nodes[nxt];
    }
    // Ставим поперёк дороги за 25 м до перекрёстка.
    const cx = node.x - d.x * 25, cz = node.z - d.z * 25;
    const yaw = Math.atan2(d.x, d.z) + Math.PI / 2;
    const rx = -d.z, rz = d.x;
    const unit: PoliceUnit = {
      kind: 'roadblock', vehicle: null, crew: [], crewInCar: 0, cur: null, next: null, s: 0,
      stuck: 0, reverse: 0, leaving: false, arrestTimer: 0, age: 0,
    };
    for (const off of [-3.4, 3.4]) {
      const v = vehicles.spawn('police', cx + rx * off, cz + rz * off, yaw);
      v.sirenOn = true;
      v.agent = unit;
      if (!unit.vehicle) unit.vehicle = v;
      else unit.crew.push(this.spawnCop(cx + rx * off - d.x * 4, cz + rz * off - d.z * 4));
    }
    unit.crew.push(this.spawnCop(cx - d.x * 4, cz - d.z * 4));
    this.units.push(unit);
    this.ctx.events.emit('notify', { text: 'Впереди полицейский блокпост!' });
  }

  private following(p: Path): Path {
    const city = this.ctx.city;
    if (p.kind === 'segment') {
      // Жадный выбор: следующий узел ближе всего к цели поиска (+ случайность в зоне).
      const f = this.searchTarget();
      const roam = this.ctx.wanted.seen ? 0 : 40;
      const at = city.nodes[p.to];
      let best = -1, bd = Infinity;
      for (const l of at.links) {
        if (l < 0) continue;
        const n = city.nodes[l];
        const d = Math.hypot(n.x - f.x, n.z - f.z) + (l === p.from ? 60 : 0) + Math.random() * roam;
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      const outDir = city.dirBetween(at, city.nodes[best]);
      const t = this.roads.turn(p.to, p.dir, outDir, p.lane, p.lane);
      return new Path(t.pts, 'turn', p.to, best, outDir, p.lane);
    }
    return this.roads.segment(p.from, p.to, p.lane);
  }

  private clearAll(): void {
    for (const u of this.units) this.disband(u, true);
    this.units.length = 0;
  }

  private disband(u: PoliceUnit, hard: boolean): void {
    for (const c of u.crew) {
      c.persistent = false;
      if (hard) this.ctx.peds.remove(c);
      else {
        c.state = 'walk';
        c.aiming = false;
        c.faceYaw = null;
      }
    }
    u.crew = [];
    const v = u.vehicle;
    if (v && v.driver !== 'player') {
      v.sirenOn = false;
      if (hard) this.ctx.vehicles.remove(v);
      else if (!v.destroyed && u.kind === 'patrol') {
        // Уезжает как обычный трафик.
        const lane = this.ctx.city.nearestLane(v.position.x, v.position.z);
        if (lane.from >= 0 && lane.to >= 0) {
          const seg = this.roads.segment(lane.from, lane.to, 1);
          this.ctx.traffic.adopt(v, seg, seg.project(v.position.x, v.position.z));
        }
      } else v.driver = 'none';
    }
  }

  // ------------------------------------------------------------ вождение

  private driveUnit(u: PoliceUnit, dt: number): void {
    const v = u.vehicle!;
    const { player } = this.ctx;
    const tgt = playerTarget(this.ctx, tmpV);
    const dist = Math.hypot(tgt.x - v.position.x, tgt.z - v.position.z);
    const stars = this.stars;
    v.controls.handbrake = false;

    // Выбрались из машины — стоим.
    if (u.crewInCar === 0) {
      speedControl(v, 0);
      v.controls.steer = 0;
      return;
    }
    // Застряли — сдать назад.
    if (u.reverse > 0) {
      u.reverse -= dt;
      v.controls.throttle = -1;
      v.controls.brake = 0;
      v.controls.steer = -Math.sign(v.controls.steer || 1);
      return;
    }
    if (Math.abs(v.forwardSpeed) < 1 && v.controls.throttle > 0.3) {
      u.stuck += dt;
      if (u.stuck > 1.6) {
        u.stuck = 0;
        u.reverse = 1.3;
      }
    } else u.stuck = Math.max(0, u.stuck - dt);

    const close = dist < 45 && pedSeesPlayer(this.ctx, this.dummyFor(v), dt, 60);
    if (close || (dist < 18 && this.ctx.wanted.seen)) {
      // Прямое преследование.
      const pv = this.ctx.vehicles.playerVehicle;
      let ax = tgt.x, az = tgt.z;
      if (player.mode === 'vehicle' && pv) {
        const lv = pv.body.linvel();
        const lead = stars >= 3 ? 0.6 : 0.3;
        ax += lv.x * lead;
        az += lv.z * lead;
      }
      v.controls.steer = steerToward(v, ax, az, 2);
      let speed = v.spec.maxSpeed * 0.85;
      if (player.mode !== 'vehicle') speed = Math.min(speed, Math.max(0, (dist - 7) * 0.9));
      else if (stars < 3) speed = Math.min(speed, (pv?.speed ?? 10) + dist * 0.3);
      speedControl(v, speed);
      if (Math.abs(v.controls.steer) > 0.9 && v.speed > 14) v.controls.handbrake = true;
      // Высадка, когда игрок пешком рядом.
      if (player.mode !== 'vehicle' && dist < 24 && v.speed < 4) this.dismount(u);
      return;
    }
    // По графу улиц.
    if (!u.cur || !u.next) return;
    u.s = u.cur.project(v.position.x, v.position.z);
    const on = u.cur.pointAt(u.s, tmp2);
    if (Math.hypot(on.x - v.position.x, on.y - v.position.z) > 8) {
      const lane = this.ctx.city.nearestLane(v.position.x, v.position.z);
      if (lane.from >= 0 && lane.to >= 0) {
        u.cur = this.roads.segment(lane.from, lane.to, 0);
        u.next = this.following(u.cur);
      }
      v.controls.steer = steerToward(v, lane.x, lane.z);
      speedControl(v, 10);
      return;
    }
    while (u.s >= u.cur.length - 0.3) {
      u.s -= u.cur.length;
      u.cur = u.next;
      u.next = this.following(u.cur);
      u.s = Math.max(0, u.cur.project(v.position.x, v.position.z));
      if (u.cur.length < 0.5) break;
    }
    let target = v.spec.maxSpeed * 0.75;
    const turning = u.cur.kind === 'turn' && u.cur.pts.length > 3;
    if (turning) target = 12;
    const remaining = u.cur.length - u.s;
    if (u.cur.kind === 'segment' && u.next.pts.length > 3) target = Math.min(target, 12 + remaining * 0.6);
    const look = 4 + Math.abs(v.forwardSpeed) * 0.45;
    let ls = u.s + look;
    let path = u.cur;
    if (ls > path.length) {
      ls -= path.length;
      path = u.next;
    }
    const tp = path.pointAt(ls, tmp2);
    v.controls.steer = steerToward(v, tp.x, tp.y);
    speedControl(v, target);
  }

  /** Фиктивный «пешеход» для проверки видимости из машины. */
  private dummies = new WeakMap<Vehicle, Ped>();
  private dummyFor(v: Vehicle): Ped {
    let d = this.dummies.get(v);
    if (!d) {
      d = { x: 0, y: 0, z: 0 } as Ped;
      this.dummies.set(v, d);
    }
    d.x = v.position.x;
    d.y = v.position.y;
    d.z = v.position.z;
    return d;
  }

  private dismount(u: PoliceUnit): void {
    const v = u.vehicle!;
    for (let i = 0; i < u.crewInCar; i++) {
      const side = i === 0 ? 1 : -1;
      const p = v.localToWorld(side * (v.spec.half.x + 0.8), 0, 0.5);
      u.crew.push(this.spawnCop(p.x, p.z));
    }
    u.crewInCar = 0;
    v.driver = 'none';
    v.controls.brake = 1;
  }

  /** Копы возвращаются в машину, если игрок уехал. */
  private mount(u: PoliceUnit): boolean {
    const v = u.vehicle;
    if (!v || v.destroyed || v.driver === 'player') return false;
    const alive = u.crew.filter((c) => c.alive);
    if (alive.length === 0) return false;
    let allIn = true;
    for (const c of alive) {
      const d = Math.hypot(c.x - v.position.x, c.z - v.position.z);
      if (d > 3) {
        allIn = false;
        c.state = 'script';
        c.aiming = false;
        c.faceYaw = null;
        c.moveTo(v.position.x, v.position.z, 5);
      }
    }
    if (!allIn) return true;
    for (const c of alive) this.ctx.peds.remove(c);
    u.crew = [];
    u.crewInCar = alive.length;
    v.driver = 'police';
    v.sirenOn = true;
    const lane = this.ctx.city.nearestLane(v.position.x, v.position.z);
    if (lane.from >= 0 && lane.to >= 0) {
      u.cur = this.roads.segment(lane.from, lane.to, 0);
      u.next = this.following(u.cur);
    }
    return true;
  }

  // ------------------------------------------------------------ пешие копы

  private copsStep(u: PoliceUnit, dt: number): void {
    const { player, damage } = this.ctx;
    const stars = this.stars;
    const shoot = stars >= CONFIG.police.shootFromStars;
    const tgt = playerTarget(this.ctx, tmpV);
    const playerAway = player.mode === 'vehicle' && u.vehicle && !u.vehicle.destroyed && u.kind === 'patrol' &&
      Math.hypot(tgt.x - u.vehicle.position.x, tgt.z - u.vehicle.position.z) > 30;
    if (playerAway && !shoot && this.mount(u)) return;
    if (playerAway && shoot && Math.hypot(tgt.x - (u.vehicle?.position.x ?? 0), tgt.z - (u.vehicle?.position.z ?? 0)) > 50 && this.mount(u)) return;
    let nearestArrest = Infinity;
    for (const c of u.crew) {
      if (!c.alive || c.state === 'down') continue;
      const r = hostileStep(this.ctx, c, dt, {
        shoot: shoot || player.mode === 'vehicle' && stars >= 2,
        minRange: 7,
        maxRange: u.kind === 'roadblock' ? 60 : 38,
        accuracy: CONFIG.police.copAccuracy * (1 + stars * 0.08),
        damage: CONFIG.police.copDamage * (c.weapon === 'rifle' ? 0.8 : 1),
        interval: CONFIG.police.copFireInterval * (c.weapon === 'rifle' ? 0.45 : 1),
        runSpeed: 5.2,
        searchPoint: this.ctx.wanted.seen ? undefined : this.ctx.wanted.lastKnown,
      });
      if (u.kind === 'roadblock' && !shoot) c.moveTo(c.x, c.z, 0);
      if (!shoot && player.mode !== 'vehicle') nearestArrest = Math.min(nearestArrest, r.dist);
    }
    // Арест: коп рядом с игроком достаточно долго.
    if (nearestArrest < CONFIG.police.arrestRange) {
      u.arrestTimer += dt;
      if (u.arrestTimer > CONFIG.police.arrestSeconds) {
        u.arrestTimer = 0;
        damage.arrest();
      }
    } else u.arrestTimer = Math.max(0, u.arrestTimer - dt);
  }

  get arrestProgress(): number {
    let m = 0;
    for (const u of this.units) m = Math.max(m, u.arrestTimer / CONFIG.police.arrestSeconds);
    return m;
  }

  // ------------------------------------------------------------ циклы

  fixedUpdate(dt: number): void {
    for (const u of this.units) {
      u.age += dt;
      u.crew = u.crew.filter((c) => this.ctx.peds.list.includes(c));
      if (u.leaving) {
        if (u.crew.some((c) => c.alive)) this.mount(u);
        continue;
      }
      const v = u.vehicle;
      if (v && (v.destroyed || v.driver === 'player')) {
        if (v.driver === 'player') u.vehicle = null;
        if (u.crewInCar > 0 && v.destroyed) u.crewInCar = 0;
      }
      if (u.kind === 'patrol' && u.vehicle && u.vehicle.driver === 'police' && !u.vehicle.destroyed) this.driveUnit(u, dt);
      if (u.crew.length) this.copsStep(u, dt);
    }
  }

  update(dt: number): void {
    const stars = this.stars;
    // Видимость.
    this.visionTimer -= dt;
    if (this.visionTimer <= 0) {
      this.visionTimer = 0.2;
      let seen = false;
      if (stars > 0) {
        const range = CONFIG.wanted.sightRange;
        for (const u of this.units) {
          for (const c of u.crew) if (c.alive && pedSeesPlayer(this.ctx, c, 0.2, range)) seen = true;
          const v = u.vehicle;
          if (!seen && v && !v.destroyed && (u.crewInCar > 0 || u.kind === 'roadblock')) {
            if (pedSeesPlayer(this.ctx, this.dummyFor(v), 0.2, range)) seen = true;
          }
          if (seen) break;
        }
      }
      this.ctx.wanted.seen = seen;
    }

    this.manageTimer -= dt;
    if (this.manageTimer > 0) return;
    this.manageTimer = 0.5;
    const f = this.focus();
    // Убираем далёкие/опустевшие/ушедшие юниты.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const anchor = u.vehicle?.position ?? (u.crew[0] ? u.crew[0].position : null);
      const far = !anchor || anchor.distanceTo(f) > CONFIG.police.despawnDistance;
      const empty = !u.vehicle && u.crew.every((c) => !c.alive);
      const done = u.leaving && u.crew.length === 0;
      if (far || empty || done) {
        this.units.splice(i, 1);
        this.disband(u, far);
      }
    }
    if (stars === 0) return;
    const patrols = this.units.filter((u) => u.kind === 'patrol' && !u.leaving).length;
    if (patrols < CONFIG.police.unitsPerStar[stars]) this.spawnPatrol();
    if (stars >= CONFIG.police.roadblockFromStars) {
      this.roadblockTimer -= 0.5;
      if (this.roadblockTimer <= 0 && this.units.filter((u) => u.kind === 'roadblock').length < 2) {
        this.roadblockTimer = 25;
        this.spawnRoadblock();
      }
    }
  }
}
