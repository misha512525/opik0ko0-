import * as THREE from 'three';

/**
 * Сборщик статической геометрии: квады и коробки сливаются в один
 * BufferGeometry (один draw call). UV — планарные в мировых координатах,
 * поэтому соседние куски текстуры стыкуются без швов.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private color = new THREE.Color(1, 1, 1);

  constructor(private readonly uvScale = 1) {}

  setColor(hex: number): this {
    this.color.setHex(hex);
    return this;
  }

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u / this.uvScale, v / this.uvScale);
    this.col.push(this.color.r, this.color.g, this.color.b);
  }

  /** Горизонтальный прямоугольник (верхняя грань). */
  quadXZ(x0: number, z0: number, x1: number, z1: number, y: number): this {
    const b = this.pos.length / 3;
    this.vert(x0, y, z0, 0, 1, 0, x0, -z0);
    this.vert(x1, y, z0, 0, 1, 0, x1, -z0);
    this.vert(x1, y, z1, 0, 1, 0, x1, -z1);
    this.vert(x0, y, z1, 0, 1, 0, x0, -z1);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    return this;
  }

  /** Коробка по границам; bottom=false — без нижней грани. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bottom = false): this {
    this.quadXZ(x0, z0, x1, z1, y1);
    if (bottom) {
      const b = this.pos.length / 3;
      this.vert(x0, y0, z0, 0, -1, 0, x0, z0);
      this.vert(x1, y0, z0, 0, -1, 0, x1, z0);
      this.vert(x1, y0, z1, 0, -1, 0, x1, z1);
      this.vert(x0, y0, z1, 0, -1, 0, x0, z1);
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    // -Z
    let b = this.pos.length / 3;
    this.vert(x0, y0, z0, 0, 0, -1, -x0, y0);
    this.vert(x1, y0, z0, 0, 0, -1, -x1, y0);
    this.vert(x1, y1, z0, 0, 0, -1, -x1, y1);
    this.vert(x0, y1, z0, 0, 0, -1, -x0, y1);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    // +Z
    b = this.pos.length / 3;
    this.vert(x0, y0, z1, 0, 0, 1, x0, y0);
    this.vert(x1, y0, z1, 0, 0, 1, x1, y0);
    this.vert(x1, y1, z1, 0, 0, 1, x1, y1);
    this.vert(x0, y1, z1, 0, 0, 1, x0, y1);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    // -X
    b = this.pos.length / 3;
    this.vert(x0, y0, z0, -1, 0, 0, z0, y0);
    this.vert(x0, y0, z1, -1, 0, 0, z1, y0);
    this.vert(x0, y1, z1, -1, 0, 0, z1, y1);
    this.vert(x0, y1, z0, -1, 0, 0, z0, y1);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    // +X
    b = this.pos.length / 3;
    this.vert(x1, y0, z0, 1, 0, 0, -z0, y0);
    this.vert(x1, y0, z1, 1, 0, 0, -z1, y0);
    this.vert(x1, y1, z1, 1, 0, 0, -z1, y1);
    this.vert(x1, y1, z0, 1, 0, 0, -z0, y1);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    return this;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
