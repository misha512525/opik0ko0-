import * as THREE from 'three';
import { PARTS, bodyMatrix, partGeometry, partMatrix, type HumanColors, type HumanPose, type ColorSlot } from '../player/HumanModel';

export interface CrowdMember {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: HumanPose;
  colors: HumanColors;
  /** Есть ли оружие в руке (полиция/бандиты). */
  armed: boolean;
  /** Фуражка полицейского. */
  hat: boolean;
}

/**
 * Рендер толпы: по одному InstancedMesh на каждую часть тела, так что все
 * пешеходы и полицейские рисуются за ~9 draw calls независимо от количества.
 */
export class CrowdRenderer {
  private meshes: { mesh: THREE.InstancedMesh; part: (typeof PARTS)[number] }[] = [];
  private gun: THREE.InstancedMesh;
  private hat: THREE.InstancedMesh;
  private body = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private gunOffset = new THREE.Matrix4().makeTranslation(0, -0.62, 0.02).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  constructor(scene: THREE.Scene, readonly capacity: number) {
    const mat = new THREE.MeshLambertMaterial();
    for (const part of PARTS) {
      const mesh = new THREE.InstancedMesh(partGeometry(part), mat, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.c.setHex(0xffffff));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = `crowd-${part.name}`;
      scene.add(mesh);
      this.meshes.push({ mesh, part });
    }
    const gunGeo = new THREE.BoxGeometry(0.05, 0.12, 0.28).translate(0, 0, 0.08);
    this.gun = new THREE.InstancedMesh(gunGeo, new THREE.MeshLambertMaterial({ color: 0x151515 }), capacity);
    this.gun.count = 0;
    this.gun.frustumCulled = false;
    scene.add(this.gun);
    const hatGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).translate(0, 0.31, 0.0);
    this.hat = new THREE.InstancedMesh(hatGeo, new THREE.MeshLambertMaterial({ color: 0x14213d }), capacity);
    this.hat.count = 0;
    this.hat.frustumCulled = false;
    scene.add(this.hat);
  }

  render(members: CrowdMember[]): void {
    const n = Math.min(members.length, this.capacity);
    let guns = 0;
    let hats = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i];
      bodyMatrix(this.body, p.x, p.y, p.z, p.yaw, p.pose);
      for (const { mesh, part } of this.meshes) {
        partMatrix(this.m, this.body, part, p.pose);
        mesh.setMatrixAt(i, this.m);
        mesh.setColorAt(i, this.c.setHex(p.colors[part.slot as ColorSlot]));
        if (part.name === 'armR' && p.armed) this.gun.setMatrixAt(guns++, this.m.multiply(this.gunOffset));
        if (part.name === 'head' && p.hat) this.hat.setMatrixAt(hats++, this.m);
      }
    }
    for (const { mesh } of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.gun.count = guns;
    this.gun.instanceMatrix.needsUpdate = true;
    this.hat.count = hats;
    this.hat.instanceMatrix.needsUpdate = true;
  }
}
