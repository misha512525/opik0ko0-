import * as THREE from 'three';

/**
 * Процедурная «кукла» человека из коробок. Одно описание скелета используется
 * и для игрока (обычные меши), и для толпы NPC (InstancedMesh на каждую часть).
 */

export type PartName = 'legL' | 'legR' | 'torso' | 'armL' | 'armR' | 'head' | 'hair';
export type ColorSlot = 'pants' | 'shirt' | 'skin' | 'hair';

interface PartDef {
  name: PartName;
  pivot: [number, number, number];
  size: [number, number, number];
  /** Смещение геометрии относительно шарнира. */
  offset: [number, number, number];
  slot: ColorSlot;
}

export const PARTS: PartDef[] = [
  { name: 'legL', pivot: [-0.12, 0.95, 0], size: [0.18, 0.95, 0.21], offset: [0, -0.475, 0], slot: 'pants' },
  { name: 'legR', pivot: [0.12, 0.95, 0], size: [0.18, 0.95, 0.21], offset: [0, -0.475, 0], slot: 'pants' },
  { name: 'torso', pivot: [0, 0.95, 0], size: [0.48, 0.64, 0.27], offset: [0, 0.32, 0], slot: 'shirt' },
  { name: 'armL', pivot: [-0.31, 1.54, 0], size: [0.13, 0.68, 0.14], offset: [0, -0.32, 0], slot: 'shirt' },
  { name: 'armR', pivot: [0.31, 1.54, 0], size: [0.13, 0.68, 0.14], offset: [0, -0.32, 0], slot: 'shirt' },
  { name: 'head', pivot: [0, 1.6, 0], size: [0.24, 0.27, 0.26], offset: [0, 0.135, 0], slot: 'skin' },
  { name: 'hair', pivot: [0, 1.6, 0], size: [0.26, 0.1, 0.28], offset: [0, 0.29, -0.01], slot: 'hair' },
];

export interface HumanPose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  /** Наклон корпуса вперёд. */
  lean: number;
  /** 0 — стоит, 1 — лежит. */
  lying: number;
}

export const restPose = (): HumanPose => ({ legL: 0, legR: 0, armL: 0, armR: 0, lean: 0, lying: 0 });

/** Поза ходьбы/бега по фазе шага. */
export function walkPose(out: HumanPose, phase: number, amount: number, running: boolean): HumanPose {
  const amp = (running ? 0.9 : 0.55) * amount;
  const s = Math.sin(phase);
  out.legL = s * amp;
  out.legR = -s * amp;
  out.armL = -s * amp * 0.9;
  out.armR = s * amp * 0.9;
  out.lean = running ? 0.18 * amount : 0.04 * amount;
  out.lying = 0;
  return out;
}

export function partGeometry(p: PartDef): THREE.BufferGeometry {
  return new THREE.BoxGeometry(...p.size).translate(...p.offset);
}

const tmpM = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpLie = new THREE.Matrix4();
const tmpLean = new THREE.Matrix4();

/** Матрица корпуса (без частей) в мировых координатах. */
export function bodyMatrix(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, pose: HumanPose): THREE.Matrix4 {
  out.makeRotationY(yaw).setPosition(x, y + pose.lying * 0.14, z);
  if (pose.lying > 0) out.multiply(tmpLie.makeRotationX(-Math.PI / 2 * pose.lying));
  return out;
}

/** Матрица отдельной части с учётом позы. */
export function partMatrix(out: THREE.Matrix4, body: THREE.Matrix4, part: PartDef, pose: HumanPose): THREE.Matrix4 {
  let angle = 0;
  switch (part.name) {
    case 'legL': angle = pose.legL; break;
    case 'legR': angle = pose.legR; break;
    case 'armL': angle = pose.armL; break;
    case 'armR': angle = pose.armR; break;
  }
  out.copy(body);
  if (part.name !== 'legL' && part.name !== 'legR' && pose.lean !== 0) {
    // Наклон корпуса вокруг таза.
    out.multiply(tmpM.makeTranslation(0, 0.95, 0));
    out.multiply(tmpLean.makeRotationX(pose.lean));
    out.multiply(tmpM.makeTranslation(0, -0.95, 0));
  }
  out.multiply(tmpM.makeTranslation(part.pivot[0], part.pivot[1], part.pivot[2]));
  if (angle !== 0) out.multiply(tmpR.makeRotationX(angle));
  return out;
}

export interface HumanColors {
  pants: number;
  shirt: number;
  skin: number;
  hair: number;
}

/** Модель игрока: отдельные меши и оружие в руке. */
export class HumanBody {
  readonly root = new THREE.Group();
  private meshes = new Map<PartName, THREE.Mesh>();
  private weaponHolder = new THREE.Group();
  private weapons: Record<string, THREE.Object3D> = {};
  pose: HumanPose = restPose();
  private body = new THREE.Matrix4();
  private pm = new THREE.Matrix4();

  constructor(colors: HumanColors) {
    for (const p of PARTS) {
      const mat = new THREE.MeshStandardMaterial({ color: colors[p.slot], roughness: 0.8 });
      const mesh = new THREE.Mesh(partGeometry(p), mat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      this.meshes.set(p.name, mesh);
      this.root.add(mesh);
    }
    // Куртка поверх торса для силуэта.
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4, metalness: 0.6 });
    const pistol = new THREE.Group();
    pistol.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.2).translate(0, 0, 0.06), gunMat));
    pistol.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.05).translate(0, -0.08, 0), gunMat));
    const rifle = new THREE.Group();
    rifle.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.7).translate(0, 0, 0.2), gunMat));
    rifle.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.06).translate(0, -0.12, 0.12), gunMat));
    rifle.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.25).translate(0, -0.02, -0.2), gunMat));
    this.weapons = { pistol, rifle };
    this.weaponHolder.add(pistol, rifle);
    this.weaponHolder.matrixAutoUpdate = false;
    this.root.add(this.weaponHolder);
    this.setWeapon('fists');
  }

  setWeapon(id: string): void {
    for (const [k, o] of Object.entries(this.weapons)) o.visible = k === id;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Обновить матрицы частей по позе. */
  apply(x: number, y: number, z: number, yaw: number): void {
    bodyMatrix(this.body, x, y, z, yaw, this.pose);
    for (const p of PARTS) {
      const mesh = this.meshes.get(p.name)!;
      partMatrix(this.pm, this.body, p, this.pose);
      mesh.matrix.copy(this.pm);
      mesh.matrixWorldNeedsUpdate = true;
      if (p.name === 'armR') {
        // Оружие в кисти правой руки, ствол — вдоль руки «вперёд».
        this.weaponHolder.matrix.copy(this.pm).multiply(tmpM.makeTranslation(0, -0.62, 0.02)).multiply(tmpR.makeRotationX(Math.PI / 2));
        this.weaponHolder.matrixWorldNeedsUpdate = true;
      }
    }
  }
}
