import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG, GROUP, groups } from '../config';
import type { Physics } from '../core/Physics';
import { DIRS, opposite, rightOf, type CityLayout, type Dir } from './CityLayout';
import { MeshBuilder } from './MeshBuilder';
import { Textures } from './Textures';
import { buildingUniforms, patchBuildingMaterial } from './BuildingMaterial';

const CHUNKS = 4;
const CHUNK_SIZE = 1100 / CHUNKS;

interface InstanceItem {
  m: THREE.Matrix4;
  color?: number;
}

/** Ссылки на объекты, которыми управляют другие системы (день/ночь, светофоры). */
export interface CityVisuals {
  root: THREE.Group;
  trafficBulbs: THREE.InstancedMesh;
  lampHeadMaterial: THREE.MeshStandardMaterial;
  lightPoolMaterial: THREE.MeshBasicMaterial;
  lightPools: THREE.Object3D[];
  waterMaterial: THREE.MeshStandardMaterial;
  fountainSprays: THREE.Vector3[];
  stats: { buildings: number; chunks: number; colliders: number };
}

function chunkKey(x: number, z: number): number {
  const cx = Math.max(0, Math.min(CHUNKS - 1, Math.floor((x + 550) / CHUNK_SIZE)));
  const cz = Math.max(0, Math.min(CHUNKS - 1, Math.floor((z + 550) / CHUNK_SIZE)));
  return cz * CHUNKS + cx;
}

function chunkCenter(key: number): THREE.Vector3 {
  const cx = key % CHUNKS;
  const cz = Math.floor(key / CHUNKS);
  return new THREE.Vector3(-550 + (cx + 0.5) * CHUNK_SIZE, 0, -550 + (cz + 0.5) * CHUNK_SIZE);
}

/**
 * Строит визуальную часть и статическую физику города по данным CityLayout.
 * Всё, что повторяется, — InstancedMesh, разбитые на чанки 4×4, чтобы работал
 * frustum culling; здания внутри чанка дополнительно имеют LOD.
 */
export class CityBuilder {
  private root = new THREE.Group();
  private colliders = 0;
  private trees: InstanceItem[] = [];
  private bushes: InstanceItem[] = [];

  constructor(
    private readonly layout: CityLayout,
    private readonly physics: Physics,
    private readonly shadows: boolean,
  ) {}

  build(): CityVisuals {
    this.root.name = 'city';
    this.buildGround();
    this.buildRoads();
    this.buildMarkings();
    this.buildPlinths();
    const bcount = this.buildBuildings();
    const lamp = this.buildLamps();
    const bulbs = this.buildTrafficLights();
    this.buildVegetationAndProps();
    const water = this.buildWater();
    const sprays = this.buildFountains();
    this.buildBounds();
    return {
      root: this.root,
      trafficBulbs: bulbs,
      lampHeadMaterial: lamp.head,
      lightPoolMaterial: lamp.pool,
      lightPools: lamp.pools,
      waterMaterial: water,
      fountainSprays: sprays,
      stats: { buildings: bcount, chunks: CHUNKS * CHUNKS, colliders: this.colliders },
    };
  }

  // ------------------------------------------------------------------ helpers

  private staticBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0) {
    this.physics.addStaticBox(cx, cy, cz, hx, hy, hz, rotY);
    this.colliders++;
  }

  private staticCylinder(x: number, z: number, r: number, h: number) {
    const desc = RAPIER.ColliderDesc.cylinder(h / 2, r)
      .setTranslation(x, h / 2, z)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    this.physics.world.createCollider(desc);
    this.colliders++;
  }

  /** Раскладывает инстансы по чанкам и создаёт по InstancedMesh на чанк. */
  private chunkedInstances(
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    items: InstanceItem[],
    castShadow = false,
    receiveShadow = false,
  ): THREE.InstancedMesh[] {
    const byChunk = new Map<number, InstanceItem[]>();
    const p = new THREE.Vector3();
    for (const it of items) {
      p.setFromMatrixPosition(it.m);
      const k = chunkKey(p.x, p.z);
      let arr = byChunk.get(k);
      if (!arr) byChunk.set(k, (arr = []));
      arr.push(it);
    }
    const out: THREE.InstancedMesh[] = [];
    const c = new THREE.Color();
    for (const [, arr] of byChunk) {
      const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
      mesh.name = name;
      arr.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (it.color !== undefined) mesh.setColorAt(i, c.setHex(it.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = castShadow && this.shadows;
      mesh.receiveShadow = receiveShadow && this.shadows;
      this.root.add(mesh);
      out.push(mesh);
    }
    return out;
  }

  // ------------------------------------------------------------------ земля, дороги

  private buildGround(): void {
    const tex = Textures.ground().clone();
    tex.repeat.set(300, 300);
    tex.needsUpdate = true;
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    g.position.y = -0.04;
    g.receiveShadow = this.shadows;
    g.name = 'ground';
    this.root.add(g);
    this.colliders += this.physics.addGround(1200);
  }

  private buildRoads(): void {
    const L = this.layout;
    const h = L.halfRoad;
    const mb = new MeshBuilder(8);
    for (const z of L.zs) mb.quadXZ(L.minX - h, z - h, L.maxX + h, z + h, 0);
    for (const x of L.xs) mb.quadXZ(x - h, L.minZ - h, x + h, L.maxZ + h, 0);
    // Парковки — тот же асфальт, чуть выше тротуара.
    for (const r of L.parkingLots) mb.quadXZ(r.x0, r.z0, r.x1, r.z1, CONFIG.world.plinthHeight + 0.004);
    const mesh = new THREE.Mesh(mb.build(), new THREE.MeshLambertMaterial({ map: Textures.asphalt() }));
    mesh.receiveShadow = this.shadows;
    mesh.name = 'roads';
    this.root.add(mesh);
  }

  private buildMarkings(): void {
    const L = this.layout;
    const white: InstanceItem[] = [];
    const yellow: InstanceItem[] = [];
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const y = 0.02;
    const add = (arr: InstanceItem[], x: number, z: number, w: number, d: number, yy = y) => {
      arr.push({ m: new THREE.Matrix4().compose(p.set(x, yy, z), q, s.set(w, 1, d)) });
    };
    const lw = CONFIG.world.laneWidth;
    const stop = CONFIG.traffic.stopLineOffset;
    // Сегменты улиц.
    for (const n of L.nodes) {
      for (const d of [1, 2] as Dir[]) {
        const to = n.links[d];
        if (to < 0) continue;
        const m = L.nodes[to];
        const horiz = d === 1;
        const len = horiz ? m.x - n.x : m.z - n.z;
        const a = stop + 0.5;
        const segLen = len - 2 * a;
        const mid = a + segLen / 2;
        const at = (along: number, off: number): [number, number] =>
          horiz ? [n.x + along, n.z + off] : [n.x + off, n.z + along];
        const sz = (along: number, across: number): [number, number] => (horiz ? [along, across] : [across, along]);
        // Двойная сплошная.
        for (const off of [-0.15, 0.15]) {
          const [x, z] = at(mid, off);
          const [w, dd] = sz(segLen, 0.12);
          add(yellow, x, z, w, dd);
        }
        // Края проезжей части.
        for (const off of [-L.halfRoad + 0.35, L.halfRoad - 0.35]) {
          const [x, z] = at(mid, off);
          const [w, dd] = sz(segLen, 0.15);
          add(white, x, z, w, dd);
        }
        // Прерывистые между полосами.
        for (const off of [-lw, lw]) {
          for (let t = a + 2; t < len - a - 2; t += 9) {
            const [x, z] = at(t + 1.5, off);
            const [w, dd] = sz(3, 0.13);
            add(white, x, z, w, dd);
          }
        }
      }
      // Стоп-линии и зебры на каждом подходе к перекрёстку.
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (n.links[opposite(d)] < 0) continue;
        const dir = DIRS[d];
        const right = DIRS[rightOf(d)];
        const sx = n.x - dir.x * stop;
        const sz2 = n.z - dir.z * stop;
        const cx = sx + right.x * (L.halfRoad / 2);
        const cz = sz2 + right.z * (L.halfRoad / 2);
        const along = Math.abs(dir.x) > 0;
        add(white, cx, cz, along ? 0.5 : L.halfRoad, along ? L.halfRoad : 0.5);
        // зебра
        const zc = L.halfRoad + 1.8;
        const zx = n.x - dir.x * zc;
        const zz = n.z - dir.z * zc;
        for (let k = -6; k <= 6; k++) {
          const ox = right.x * k * 1.0;
          const oz = right.z * k * 1.0;
          add(white, zx + ox, zz + oz, along ? 2.6 : 0.5, along ? 0.5 : 2.6);
        }
      }
    }
    // Разметка парковочных мест.
    for (const sp of L.parking) {
      for (const o of [-1.45, 1.45]) add(white, sp.x + o, sp.z, 0.1, 5, CONFIG.world.plinthHeight + 0.02);
    }
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mk = (color: number) =>
      new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    for (const m of this.chunkedInstances('markings-white', geo, mk(0xe8e8e0), white, false, true)) m.renderOrder = 1;
    for (const m of this.chunkedInstances('markings-yellow', geo, mk(0xe0b030), yellow, false, true)) m.renderOrder = 1;
  }

  private buildPlinths(): void {
    const L = this.layout;
    const ph = CONFIG.world.plinthHeight;
    const side = new MeshBuilder(3);
    for (const b of L.blocks) side.box(b.x0, -0.05, b.z0, b.x1, ph, b.z1);
    const p = L.promenade;
    side.box(p.x0, -0.05, p.z0, p.x1, ph, p.z1);
    // Наружные тротуары за кольцевой дорогой.
    const h = L.halfRoad;
    side.box(L.minX - h - 4, -0.05, L.minZ - h - 4, L.maxX + h + 4, ph, L.minZ - h);
    side.box(L.minX - h - 4, -0.05, L.minZ - h, L.minX - h, ph, L.maxZ + h);
    side.box(L.maxX + h, -0.05, L.minZ - h, L.maxX + h + 4, ph, L.maxZ + h);
    const sidewalk = new THREE.Mesh(side.build(), new THREE.MeshLambertMaterial({ map: Textures.sidewalk() }));
    sidewalk.receiveShadow = this.shadows;
    sidewalk.name = 'sidewalks';
    this.root.add(sidewalk);

    const grass = new MeshBuilder(6);
    for (const g of L.greens) grass.quadXZ(g.x0, g.z0, g.x1, g.z1, ph + 0.003);
    const gm = new THREE.Mesh(grass.build(), new THREE.MeshLambertMaterial({ map: Textures.grass() }));
    gm.receiveShadow = this.shadows;
    gm.name = 'greens';
    this.root.add(gm);

    const paths = new MeshBuilder(4);
    for (const r of L.paths) paths.quadXZ(r.x0, r.z0, r.x1, r.z1, ph + 0.006);
    if (!paths.empty) {
      const pm = new THREE.Mesh(paths.build(), new THREE.MeshLambertMaterial({ map: Textures.gravel() }));
      pm.receiveShadow = this.shadows;
      this.root.add(pm);
    }
  }

  // ------------------------------------------------------------------ здания

  private buildBuildings(): number {
    const L = this.layout;
    const nearMat = patchBuildingMaterial(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }));
    const farMat = patchBuildingMaterial(new THREE.MeshLambertMaterial());
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a8d90 });
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roofGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    const byChunk = new Map<number, typeof L.buildings>();
    for (const b of L.buildings) {
      const k = chunkKey(b.x, b.z);
      let arr = byChunk.get(k);
      if (!arr) byChunk.set(k, (arr = []));
      arr.push(b);
      this.staticBox(b.x, b.y + b.h / 2, b.z, b.w / 2, b.h / 2, b.d / 2);
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let rs = 1;
    const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

    for (const [key, list] of byChunk) {
      const center = chunkCenter(key);
      const lod = new THREE.LOD();
      lod.position.copy(center);
      lod.name = `chunk-${key}`;
      const makeMesh = (mat: THREE.Material) => {
        const geo = unit.clone();
        const seeds = new Float32Array(list.length);
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((b, i) => {
          m.compose(pos.set(b.x - center.x, b.y, b.z - center.z), q, scl.set(b.w, b.h, b.d));
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, c.setHex(b.color));
          seeds[i] = b.seed;
        });
        geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        mesh.computeBoundingSphere();
        return mesh;
      };
      const near = new THREE.Group();
      const nearMesh = makeMesh(nearMat);
      nearMesh.castShadow = this.shadows;
      nearMesh.receiveShadow = this.shadows;
      near.add(nearMesh);
      // Детали на крышах — только в ближнем LOD.
      const roofItems: THREE.Matrix4[] = [];
      for (const b of list) {
        if (!b.roofProps) continue;
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const w = 1.5 + rnd() * 2.5, d = 1.5 + rnd() * 2.5, h = 1 + rnd() * 2;
          const x = b.x + (rnd() - 0.5) * (b.w - w - 1);
          const z = b.z + (rnd() - 0.5) * (b.d - d - 1);
          roofItems.push(new THREE.Matrix4().compose(pos.set(x - center.x, b.y + b.h, z - center.z), q, scl.set(w, h, d)));
        }
        // Бортик по периметру крыши.
        roofItems.push(new THREE.Matrix4().compose(pos.set(b.x - center.x, b.y + b.h, b.z - b.d / 2 + 0.15 - center.z), q, scl.set(b.w, 0.6, 0.3)));
        roofItems.push(new THREE.Matrix4().compose(pos.set(b.x - center.x, b.y + b.h, b.z + b.d / 2 - 0.15 - center.z), q, scl.set(b.w, 0.6, 0.3)));
      }
      if (roofItems.length) {
        const rm = new THREE.InstancedMesh(roofGeo, roofMat, roofItems.length);
        roofItems.forEach((mm, i) => rm.setMatrixAt(i, mm));
        rm.computeBoundingSphere();
        rm.castShadow = this.shadows;
        near.add(rm);
      }
      const far = new THREE.Group();
      far.add(makeMesh(farMat));
      lod.addLevel(near, 0);
      lod.addLevel(far, 330);
      this.root.add(lod);
    }
    return L.buildings.length;
  }

  // ------------------------------------------------------------------ фонари

  private buildLamps() {
    const lamps = this.layout.props.filter((p) => p.kind === 'lamp');
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 6).translate(0, 3.25, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 6.4, 0.8);
    const headGeo = new THREE.BoxGeometry(0.45, 0.16, 0.8).translate(0, 6.3, 1.5);
    const poolGeo = new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
    const head = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const pool = new THREE.MeshBasicMaterial({
      map: Textures.lightPool(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    const poles: InstanceItem[] = [];
    const arms: InstanceItem[] = [];
    const pools: InstanceItem[] = [];
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const l of lamps) {
      // Плафон смотрит на дорогу (наружу из квартала).
      const yaw = Math.atan2(l.dirX ?? 0, l.dirZ ?? 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(l.x, 0, l.z), q, one);
      poles.push({ m });
      arms.push({ m });
      const px = l.x + (l.dirX ?? 0) * 1.6;
      const pz = l.z + (l.dirZ ?? 0) * 1.6;
      pools.push({ m: new THREE.Matrix4().makeTranslation(px, 0.05, pz) });
      this.staticCylinder(l.x, l.z, 0.15, 6);
    }
    this.chunkedInstances('lamp-poles', poleGeo, poleMat, poles, true);
    this.chunkedInstances('lamp-arms', armGeo, poleMat, arms);
    this.chunkedInstances('lamp-heads', headGeo, head, arms);
    const poolMeshes = this.chunkedInstances('lamp-pools', poolGeo, pool, pools);
    for (const pm of poolMeshes) {
      pm.renderOrder = 2;
      pm.visible = false;
    }
    return { head, pool, pools: poolMeshes as THREE.Object3D[] };
  }

  // ------------------------------------------------------------------ светофоры

  private buildTrafficLights(): THREE.InstancedMesh {
    const L = this.layout;
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6).translate(0, 2.1, 0);
    const boxGeo = new THREE.BoxGeometry(0.42, 1.2, 0.3);
    const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const dark = new THREE.MeshLambertMaterial({ color: 0x1d1f22 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const poles: InstanceItem[] = [];
    const boxes: InstanceItem[] = [];
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, L.lights.length * 3);
    bulbs.name = 'traffic-bulbs';
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color(0x222222);
    L.lights.forEach((t, i) => {
      const d = DIRS[t.dir];
      const yaw = Math.atan2(-d.x, -d.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      poles.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), q, one) });
      boxes.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, 4.6, t.z), q, one) });
      for (let k = 0; k < 3; k++) {
        const y = 4.6 + 0.38 - k * 0.38;
        const m = new THREE.Matrix4().makeTranslation(t.x - d.x * 0.17, y, t.z - d.z * 0.17);
        bulbs.setMatrixAt(i * 3 + k, m);
        bulbs.setColorAt(i * 3 + k, c);
      }
      this.staticCylinder(t.x, t.z, 0.15, 4);
    });
    bulbs.computeBoundingSphere();
    this.chunkedInstances('tl-poles', poleGeo, dark, poles, true);
    this.chunkedInstances('tl-boxes', boxGeo, dark, boxes, true);
    this.root.add(bulbs);
    return bulbs;
  }

  // ------------------------------------------------------------------ деревья, лавки, контейнеры

  private buildVegetationAndProps(): void {
    const L = this.layout;
    const benches: InstanceItem[] = [];
    const containers: InstanceItem[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let hue = 0;
    for (const p of L.props) {
      q.setFromAxisAngle(up, p.rot);
      if (p.kind === 'tree') {
        hue = (hue + 0.37) % 1;
        const col = new THREE.Color().setHSL(0.24 + hue * 0.1, 0.45, 0.24 + hue * 0.1).getHex();
        this.trees.push({
          m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.1, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale)),
          color: col,
        });
        this.staticCylinder(p.x, p.z, 0.25 * p.scale, 3);
      } else if (p.kind === 'bush') {
        hue = (hue + 0.37) % 1;
        this.bushes.push({
          m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.1, p.z), q, new THREE.Vector3(p.scale, p.scale * 0.7, p.scale)),
          color: new THREE.Color().setHSL(0.27, 0.4, 0.22 + hue * 0.08).getHex(),
        });
      } else if (p.kind === 'bench') {
        benches.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.15, p.z), q, new THREE.Vector3(1, 1, 1)) });
      } else if (p.kind === 'container') {
        const len = 6 * p.scale;
        containers.push({
          m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.15, p.z - len / 2), q, new THREE.Vector3(1, 1, p.scale)),
          color: p.color,
        });
        this.staticBox(p.x, 1.45, p.z - len / 2, 1.2, 1.3, len / 2, p.rot);
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3, 6).translate(0, 1.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2, 1).translate(0, 4.2, 0);
    const bushGeo = new THREE.IcosahedronGeometry(1, 1).translate(0, 0.7, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b4636 });
    const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
    this.chunkedInstances('tree-trunks', trunkGeo, trunkMat, this.trees.map((t) => ({ m: t.m })), true);
    this.chunkedInstances('tree-crowns', crownGeo, leafMat, this.trees, true);
    this.chunkedInstances('bushes', bushGeo, leafMat, this.bushes, true);

    const benchGeo = mergeGeometries([
      new THREE.BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0),
      new THREE.BoxGeometry(1.8, 0.45, 0.06).translate(0, 0.75, -0.22),
      new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(-0.8, 0.22, 0),
      new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(0.8, 0.22, 0),
    ])!;
    this.chunkedInstances('benches', benchGeo, new THREE.MeshLambertMaterial({ color: 0x7a5534 }), benches, true);

    const contGeo = mergeGeometries([
      new THREE.BoxGeometry(2.4, 2.6, 6).translate(0, 1.3, 0),
      ...[-2, -1, 0, 1, 2].map((k) => new THREE.BoxGeometry(2.46, 2.4, 0.12).translate(0, 1.3, k * 1.2)),
    ])!;
    this.chunkedInstances('containers', contGeo, new THREE.MeshLambertMaterial(), containers, true, true);
  }

  // ------------------------------------------------------------------ вода, набережная

  private buildWater(): THREE.MeshStandardMaterial {
    const L = this.layout;
    const wz = CONFIG.world.waterZ;
    const tex = Textures.waterNormal();
    tex.repeat.set(60, 30);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d4d63,
      roughness: 0.18,
      metalness: 0.2,
      normalMap: tex,
      normalScale: new THREE.Vector2(0.6, 0.6),
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1400).rotateX(-Math.PI / 2), mat);
    water.position.set(0, -0.8, wz + 700);
    water.name = 'water';
    water.receiveShadow = this.shadows;
    this.root.add(water);
    // Стенка набережной.
    const wall = new MeshBuilder(3);
    wall.box(-1500, -3, wz, 1500, CONFIG.world.plinthHeight, wz + 0.8);
    const wm = new THREE.Mesh(wall.build(), new THREE.MeshLambertMaterial({ map: Textures.sidewalk(), color: 0xbbb4a8 }));
    this.root.add(wm);
    // Перила: столбики + поручень; коллайдер выше перил, чтобы не перепрыгнуть.
    const posts: InstanceItem[] = [];
    for (let x = L.promenade.x0; x <= L.promenade.x1; x += 2.5) {
      posts.push({ m: new THREE.Matrix4().makeTranslation(x, 0.15, wz - 0.3) });
    }
    this.chunkedInstances('rail-posts', new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(0, 0.55, 0), new THREE.MeshLambertMaterial({ color: 0x2f3a40 }), posts);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L.promenade.x1 - L.promenade.x0, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0x2f3a40 }));
    rail.position.set((L.promenade.x0 + L.promenade.x1) / 2, 1.2, wz - 0.3);
    this.root.add(rail);
    this.staticBox(0, 2, wz - 0.1, 1500, 2, 0.3);
    return mat;
  }

  private buildFountains(): THREE.Vector3[] {
    const sprays: THREE.Vector3[] = [];
    const stone = new THREE.MeshLambertMaterial({ color: 0xc8c0b0 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3f8fb0, roughness: 0.1, normalMap: Textures.waterNormal() });
    for (const f of this.layout.fountains) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r + 0.3, 0.8, 32, 1, true), stone);
      ring.position.set(f.x, 0.4, f.z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(f.r, 0.25, 6, 32).rotateX(Math.PI / 2), stone);
      rim.position.set(f.x, 0.8, f.z);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.1, 32).rotateX(-Math.PI / 2), waterMat);
      pool.position.set(f.x, 0.55, f.z);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.4, 12), stone);
      column.position.set(f.x, 1.2, f.z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2, 0.6, 0.5, 16), stone);
      bowl.position.set(f.x, 2.4, f.z);
      for (const m of [ring, rim, pool, column, bowl]) {
        m.castShadow = this.shadows;
        m.receiveShadow = this.shadows;
        this.root.add(m);
      }
      this.staticCylinder(f.x, f.z, f.r + 0.3, 0.9);
      sprays.push(new THREE.Vector3(f.x, 2.7, f.z));
    }
    return sprays;
  }

  private buildBounds(): void {
    const b = CONFIG.world.boundary;
    this.staticBox(b, 10, 0, 1, 10, b + 20);
    this.staticBox(-b, 10, 0, 1, 10, b + 20);
    this.staticBox(0, 10, -b, b + 20, 10, 1);
  }
}

export { buildingUniforms };
