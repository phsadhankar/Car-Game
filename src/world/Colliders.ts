/** Circle colliders with a coarse spatial hash for broad-phase. */
export interface Collider {
  x: number;
  z: number;
  r: number;
}

export class ColliderSet {
  private colliders: Collider[] = [];
  private cell = 24;
  private grid = new Map<string, number[]>();

  add(x: number, z: number, r: number): void {
    const idx = this.colliders.length;
    this.colliders.push({ x, z, r });
    const key = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let arr = this.grid.get(key);
    if (!arr) {
      arr = [];
      this.grid.set(key, arr);
    }
    arr.push(idx);
  }

  private key(cx: number, cz: number): string {
    return cx + ',' + cz;
  }

  /** Push `p` out of overlapping colliders and damp/reflect velocity `v`. */
  resolve(p: { x: number; z: number }, v: { x: number; z: number }, radius: number): boolean {
    let hit = false;
    const cx = Math.floor(p.x / this.cell);
    const cz = Math.floor(p.z / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.grid.get(this.key(cx + dx, cz + dz));
        if (!arr) continue;
        for (const i of arr) {
          const c = this.colliders[i];
          const ox = p.x - c.x;
          const oz = p.z - c.z;
          const minD = c.r + radius;
          const d2 = ox * ox + oz * oz;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = ox / d;
          const nz = oz / d;
          const pen = minD - d;
          p.x += nx * pen;
          p.z += nz * pen;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= vn * nx * 1.45;
            v.z -= vn * nz * 1.45;
            v.x *= 0.82;
            v.z *= 0.82;
          }
          hit = true;
        }
      }
    }
    return hit;
  }
}
