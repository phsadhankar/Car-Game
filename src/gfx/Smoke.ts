import * as THREE from 'three';

const MAX_PUFFS = 220;

interface Puff {
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  size0: number;
}

/**
 * Tire-smoke puffs as camera-facing point sprites with per-particle
 * size/alpha driven by age. spawn() recycles the oldest puff.
 */
export class Smoke {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private puffs: Puff[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX_PUFFS * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX_PUFFS), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(MAX_PUFFS), 1);
    for (const a of [this.posAttr, this.sizeAttr, this.alphaAttr]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aSize', this.sizeAttr);
    this.geo.setAttribute('aAlpha', this.alphaAttr);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

    const tex = makeSoftCircle();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: tex } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vA;
        void main() {
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying float vA;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vec3(0.82, 0.83, 0.85), t.a * vA);
        }`,
    });

    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size0: 1 });
      this.alphaAttr.array[i] = 0;
    }
  }

  spawn(x: number, y: number, z: number, intensity: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PUFFS;
    const p = this.puffs[i];
    p.maxLife = 0.9 + Math.random() * 0.7;
    p.life = p.maxLife;
    p.vx = (Math.random() - 0.5) * 1.6;
    p.vy = 1.2 + Math.random() * 1.4;
    p.vz = (Math.random() - 0.5) * 1.6;
    p.size0 = 14 + intensity * 26 + Math.random() * 8;

    this.posAttr.setXYZ(i, x, y, z);
    this.sizeAttr.array[i] = p.size0;
    this.alphaAttr.array[i] = Math.min(0.42, 0.16 + intensity * 0.3);
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = 1 - p.life / p.maxLife;
      if (p.life <= 0) {
        this.alphaAttr.array[i] = 0;
        dirty = true;
        continue;
      }
      this.posAttr.setXYZ(
        i,
        this.posAttr.getX(i) + p.vx * dt,
        this.posAttr.getY(i) + p.vy * dt,
        this.posAttr.getZ(i) + p.vz * dt
      );
      this.sizeAttr.array[i] = p.size0 * (1 + t * 2.2);
      this.alphaAttr.array[i] *= Math.max(0, 1 - dt * 1.4);
      dirty = true;
    }
    if (dirty) {
      this.posAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }
  }
}

function makeSoftCircle(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
