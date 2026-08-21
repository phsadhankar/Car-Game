import * as THREE from 'three';
import { ROAD_HALF_WIDTH, trackCurve, trackPointAt, trackTangentAt } from './trackSpline';
import { makeAsphaltTexture, makeCheckerTexture } from './textures';

export interface Checkpoint {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
}

const NUM_CHECKPOINTS = 12;

/** Road ribbon, guardrails on tight corners, start gantry and checkpoint data. */
export class Track {
  readonly group = new THREE.Group();
  readonly checkpoints: Checkpoint[] = [];

  constructor() {
    this.group.add(this.buildRoad());
    this.group.add(this.buildGuardrails());
    this.group.add(this.buildStartLine());

    for (let i = 0; i < NUM_CHECKPOINTS; i++) {
      const pos = new THREE.Vector3();
      const dir = new THREE.Vector3();
      trackPointAt(i / NUM_CHECKPOINTS, pos);
      trackTangentAt(i / NUM_CHECKPOINTS, dir);
      this.checkpoints.push({ pos, dir });
    }
  }

  private buildRoad(): THREE.Mesh {
    const SEG = 720;
    const pts = trackCurve.getSpacedPoints(SEG); // last == first
    const hw = ROAD_HALF_WIDTH;

    const positions = new Float32Array((SEG + 1) * 2 * 3);
    const uvs = new Float32Array((SEG + 1) * 2 * 2);
    const indices: number[] = [];

    const t = new THREE.Vector3();
    let dist = 0;
    for (let i = 0; i <= SEG; i++) {
      const p = pts[i];
      const prev = pts[Math.max(i - 1, 0)];
      const next = pts[Math.min(i + 1, SEG)];
      t.subVectors(next, prev).setY(0).normalize();
      const n = new THREE.Vector3(-t.z, 0, t.x); // left normal

      if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);

      // left edge
      positions.set([p.x - n.x * hw, 0.05, p.z - n.z * hw], i * 6);
      positions.set([p.x + n.x * hw, 0.05, p.z + n.z * hw], i * 6 + 3);
      uvs.set([0, dist / 6], i * 4);
      uvs.set([1, dist / 6], i * 4 + 2);

      if (i < SEG) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: makeAsphaltTexture(),
      roughness: 0.96,
      metalness: 0
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Guardrails on the outside of corners tighter than ~250m radius. */
  private buildGuardrails(): THREE.Group {
    const g = new THREE.Group();
    const pts = trackCurve.getSpacedPoints(1200);
    pts.pop();

    const railGeo = new THREE.BoxGeometry(0.06, 0.32, 3.1);
    const postGeo = new THREE.BoxGeometry(0.09, 0.75, 0.09);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.85, roughness: 0.35 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a5e64, metalness: 0.6, roughness: 0.5 });

    type Placement = { pos: THREE.Vector3; yaw: number };
    const rails: Placement[] = [];
    const posts: Placement[] = [];

    const tA = new THREE.Vector3();
    const tB = new THREE.Vector3();
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const pNext = pts[(i + 2) % pts.length];
      const pPrev = pts[(i - 2 + pts.length) % pts.length];
      tA.subVectors(pNext, pPrev).setY(0).normalize();

      // Curvature via heading change over ~6m
      const pn = pts[(i + 14) % pts.length];
      const pp = pts[(i - 14 + pts.length) % pts.length];
      tB.subVectors(pn, pp).setY(0).normalize();
      const angle = tA.angleTo(tB);
      const radius = 6 / Math.max(angle, 1e-4);
      if (radius > 260) continue;

      // Outside of the turn
      const crossY = tA.x * tB.z - tA.z * tB.x; // >0 turning right => outside is left
      const sideSign = crossY > 0 ? 1 : -1;
      const n = new THREE.Vector3(-tA.z, 0, tA.x).multiplyScalar(sideSign);

      const base = new THREE.Vector3(
        p.x + n.x * (ROAD_HALF_WIDTH + 1.1),
        0,
        p.z + n.z * (ROAD_HALF_WIDTH + 1.1)
      );
      const yaw = Math.atan2(tA.x, tA.z);
      rails.push({ pos: new THREE.Vector3(base.x, 0.62, base.z), yaw });
      posts.push({ pos: new THREE.Vector3(base.x, 0.38, base.z), yaw });
    }

    const railMesh = new THREE.InstancedMesh(railGeo, railMat, rails.length);
    const postMesh = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    rails.forEach((r, i) => {
      q.setFromAxisAngle(up, r.yaw);
      m.compose(r.pos, q, new THREE.Vector3(1, 1, 1));
      railMesh.setMatrixAt(i, m);
    });
    posts.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      m.compose(p.pos, q, new THREE.Vector3(1, 1, 1));
      postMesh.setMatrixAt(i, m);
    });
    railMesh.castShadow = true;
    postMesh.castShadow = true;
    g.add(railMesh, postMesh);
    return g;
  }

  private buildStartLine(): THREE.Group {
    const g = new THREE.Group();
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    trackPointAt(0, pos);
    trackTangentAt(0, tan);

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 3),
      new THREE.MeshStandardMaterial({ map: makeCheckerTexture(), roughness: 0.9 })
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(tan.x, tan.z);
    line.position.set(pos.x, 0.09, pos.z);
    line.receiveShadow = true;
    g.add(line);

    // Gantry
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.4 });
    const yaw = Math.atan2(tan.x, tan.z);
    const n = new THREE.Vector3(-tan.z, 0, tan.x);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.4, 0.35), metal);
      post.position.set(pos.x + n.x * s * (ROAD_HALF_WIDTH + 1.6), 3.2, pos.z + n.z * s * (ROAD_HALF_WIDTH + 1.6));
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 3.9, 0.8, 0.5), metal);
    beam.position.set(pos.x, 6.1, pos.z);
    beam.rotation.y = yaw;
    beam.castShadow = true;
    g.add(beam);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 3.9, 0.22, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: 0xff2222,
        emissiveIntensity: 1.6
      })
    );
    strip.position.set(pos.x, 5.62, pos.z);
    strip.rotation.y = yaw;
    g.add(strip);

    return g;
  }
}
