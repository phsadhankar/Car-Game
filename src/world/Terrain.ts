import * as THREE from 'three';
import { fbm } from './noise';
import { distanceToTrack, ROAD_HALF_WIDTH } from './trackSpline';

/**
 * Rolling-hills heightfield that flattens to 0 around the circuit.
 * The same analytic function drives both the visual mesh and vehicle physics.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly size = 3400;
  private segments = 256;

  constructor() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      // Color by height + slope + noise variation
      const slope =
        Math.abs(this.heightAt(x + 3, z) - h) + Math.abs(this.heightAt(x, z + 3) - h);
      const variation = fbm(x * 0.02 + 100, z * 0.02 - 50, 2) * 0.5;
      if (slope > 1.1) {
        c.setRGB(0.42 + variation * 0.06, 0.38 + variation * 0.05, 0.32); // rocky
      } else if (h > 9) {
        c.setRGB(0.33 + variation * 0.08, 0.44 + variation * 0.07, 0.22); // dry highland
      } else {
        c.setRGB(0.24 + variation * 0.08, 0.46 + variation * 0.09, 0.19); // grass
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  /** Analytic terrain height — also used by the vehicle raycasts. */
  heightAt(x: number, z: number): number {
    // Rolling hills
    let h = fbm(x * 0.0028, z * 0.0028, 4) * 26;
    h += fbm(x * 0.011 + 40, z * 0.011 - 17, 3) * 4.5;

    // Flatten near the circuit (blend out over ~70m from centerline)
    const d = distanceToTrack(x, z);
    const w = smoothStep(ROAD_HALF_WIDTH + 6, ROAD_HALF_WIDTH + 76, d);
    return h * w;
  }
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
