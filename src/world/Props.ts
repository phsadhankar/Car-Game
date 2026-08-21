import * as THREE from 'three';
import { fbm } from './noise';
import { distanceToTrack, ROAD_HALF_WIDTH, trackCurve } from './trackSpline';
import { makeFacadeTexture } from './textures';
import { ColliderSet } from './Colliders';

let seed = 1337;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

/** Scattered trees, a small district of buildings, street lights along the road. */
export class Props {
  readonly group = new THREE.Group();
  readonly colliders = new ColliderSet();

  constructor() {
    this.buildTrees();
    this.buildBuildings();
    this.buildStreetLights();
  }

  private buildTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 7);
    trunkGeo.translate(0, 1.3, 0);
    const foliageGeo = new THREE.IcosahedronGeometry(1.9, 1);
    foliageGeo.translate(0, 3.6, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4327, roughness: 0.95 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a24, roughness: 0.95 });

    const COUNT = 520;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    const crowns = new THREE.InstancedMesh(foliageGeo, foliageMat, COUNT);
    trunks.castShadow = true;
    crowns.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let placed = 0,
      attempts = 0;
    while (placed < COUNT && attempts < COUNT * 12) {
      attempts++;
      const x = (rand() - 0.5) * 2600;
      const z = (rand() - 0.5) * 2600;
      if (distanceToTrack(x, z) < ROAD_HALF_WIDTH + 14) continue;
      const h = fbm(x * 0.0028, z * 0.0028, 4) * 26 + fbm(x * 0.011 + 40, z * 0.011 - 17, 3) * 4.5;
      if (h > 16) continue; // treeline
      const s = 0.75 + rand() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      pos.set(x, h - 0.15, z);
      scl.set(s, s * (0.85 + rand() * 0.5), s);
      m.compose(pos, q, scl);
      trunks.setMatrixAt(placed, m);
      crowns.setMatrixAt(placed, m);
      this.colliders.add(x, z, 0.55 * s);
      placed++;
    }
    trunks.count = placed;
    crowns.count = placed;
    this.group.add(trunks, crowns);
  }

  private buildBuildings(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: makeFacadeTexture(),
      roughness: 0.85,
      metalness: 0.1
    });

    const COUNT = 64;
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    // Districts: a few clusters away from the circuit
    const districts: Array<[number, number, number]> = [
      [760, 120, 190],
      [-720, -420, 170],
      [180, 700, 150],
      [-350, -750, 130]
    ];
    let placed = 0,
      attempts = 0;
    while (placed < COUNT && attempts < COUNT * 20) {
      attempts++;
      const d = districts[Math.floor(rand() * districts.length)];
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * d[2];
      const x = d[0] + Math.cos(ang) * rad;
      const z = d[1] + Math.sin(ang) * rad;
      if (distanceToTrack(x, z) < ROAD_HALF_WIDTH + 26) continue;
      const w = 10 + rand() * 18;
      const dep = 10 + rand() * 18;
      const hgt = 12 + rand() * 42;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      pos.set(x, -0.4, z);
      scl.set(w, hgt, dep);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);
      this.colliders.add(x, z, Math.max(w, dep) * 0.62);
      placed++;
    }
    mesh.count = placed;
    this.group.add(mesh);
  }

  private buildStreetLights(): void {
    const pts = trackCurve.getSpacedPoints(600);
    const step = 26; // meters between lights
    type P = { x: number; z: number; yaw: number };
    const poles: P[] = [];
    const heads: P[] = [];

    const t = new THREE.Vector3();
    for (let i = 0, d = 0; i < pts.length - 1; i++) {
      d += pts[i].distanceTo(pts[i + 1]);
      if (d < step) continue;
      d = 0;
      const p = pts[i];
      const prev = pts[Math.max(i - 4, 0)];
      const next = pts[Math.min(i + 4, pts.length - 1)];
      t.subVectors(next, prev).setY(0).normalize();
      const side = poles.length % 2 === 0 ? 1 : -1;
      const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(side);
      const bx = p.x + n.x * (ROAD_HALF_WIDTH + 0.6);
      const bz = p.z + n.z * (ROAD_HALF_WIDTH + 0.6);
      const yaw = Math.atan2(t.x, t.z);
      poles.push({ x: bx, z: bz, yaw });
      heads.push({
        x: bx - n.x * 1.6,
        z: bz - n.z * 1.6,
        yaw
      });
      this.colliders.add(bx, bz, 0.35);
    }

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8);
    poleGeo.translate(0, 3.1, 0);
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.8);
    armGeo.translate(0, 6.05, -0.9);
    const headGeo = new THREE.BoxGeometry(0.34, 0.12, 0.8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x777c83, metalness: 0.7, roughness: 0.45 });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cf,
      emissive: 0xffe9b0,
      emissiveIntensity: 2.4
    });

    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const mm = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const pv = new THREE.Vector3();

    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    const armMesh = new THREE.InstancedMesh(armGeo, poleMat, poles.length);
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, heads.length);
    poles.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      pv.set(p.x, 0, p.z);
      mm.compose(pv, q, one);
      poleMesh.setMatrixAt(i, mm);
      armMesh.setMatrixAt(i, mm);
    });
    heads.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      pv.set(p.x, 5.98, p.z);
      mm.compose(pv, q, one);
      headMesh.setMatrixAt(i, mm);
    });
    poleMesh.castShadow = true;
    this.group.add(poleMesh, armMesh, headMesh);
  }
}
