import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Path, type Roads } from '../ai/Roads';
import { speedControl, steerToward } from '../ai/Driving';
import type { Vehicle } from '../vehicles/Vehicle';

const tmp2 = new THREE.Vector2();

/**
 * Водитель-беглец для погонь: едет по улицам на высокой скорости, на
 * перекрёстках выбирает направление подальше от игрока, игнорирует светофоры.
 */
export class FleeDriver {
  private cur: Path;
  private next: Path;
  private s = 0;
  private stuck = 0;
  private reverse = 0;

  constructor(private readonly ctx: GameContext, private readonly roads: Roads, readonly vehicle: Vehicle) {
    const lane = ctx.city.nearestLane(vehicle.position.x, vehicle.position.z);
    this.cur = roads.segment(lane.from, lane.to, 0);
    this.next = this.following(this.cur);
    vehicle.driver = 'mission';
    vehicle.persistent = true;
  }

  private following(p: Path): Path {
    const city = this.ctx.city;
    if (p.kind === 'segment') {
      const pl = this.ctx.player.position;
      const at = city.nodes[p.to];
      const opts = at.links.filter((l) => l >= 0 && l !== p.from);
      let best = opts[0] ?? p.from;
      let bd = -Infinity;
      for (const l of opts) {
        const n = city.nodes[l];
        // Подальше от игрока, с долей случайности, чтобы маршрут не был предсказуем.
        const d = Math.hypot(n.x - pl.x, n.z - pl.z) + Math.random() * 80;
        if (d > bd) {
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

  fixedUpdate(dt: number): void {
    const v = this.vehicle;
    if (v.destroyed || v.driver !== 'mission') return;
    if (this.reverse > 0) {
      this.reverse -= dt;
      v.controls.throttle = -1;
      v.controls.brake = 0;
      v.controls.steer = 1;
      return;
    }
    if (Math.abs(v.forwardSpeed) < 1.2 && v.controls.throttle > 0.3) {
      this.stuck += dt;
      if (this.stuck > 1.2) {
        this.stuck = 0;
        this.reverse = 1.1;
      }
    } else this.stuck = Math.max(0, this.stuck - dt);

    this.s = this.cur.project(v.position.x, v.position.z);
    const on = this.cur.pointAt(this.s, tmp2);
    if (Math.hypot(on.x - v.position.x, on.y - v.position.z) > 9) {
      const lane = this.ctx.city.nearestLane(v.position.x, v.position.z);
      this.cur = this.roads.segment(lane.from, lane.to, 0);
      this.next = this.following(this.cur);
      this.s = this.cur.project(v.position.x, v.position.z);
    }
    while (this.s >= this.cur.length - 0.3) {
      this.s -= this.cur.length;
      this.cur = this.next;
      this.next = this.following(this.cur);
      this.s = Math.max(0, this.cur.project(v.position.x, v.position.z));
      if (this.cur.length < 0.5) break;
    }
    // Чем сильнее повреждена машина, тем медленнее едет.
    const hp = v.health / v.maxHealth;
    let target = v.spec.maxSpeed * (0.55 + 0.25 * hp);
    if (this.cur.kind === 'turn' && this.cur.pts.length > 3) target = 11;
    const remaining = this.cur.length - this.s;
    if (this.cur.kind === 'segment' && this.next.pts.length > 3) target = Math.min(target, 11 + remaining * 0.55);
    const look = 4 + Math.abs(v.forwardSpeed) * 0.45;
    let ls = this.s + look;
    let path = this.cur;
    if (ls > path.length) {
      ls -= path.length;
      path = this.next;
    }
    const tp = path.pointAt(ls, tmp2);
    v.controls.steer = steerToward(v, tp.x, tp.y);
    v.controls.handbrake = false;
    speedControl(v, target);
  }
}
