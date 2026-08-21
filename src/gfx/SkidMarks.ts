import * as THREE from 'three';

const MAX_QUADS = 1024;

/**
 * Ring-buffer of dark quad segments laid on the ground under slipping tires.
 * addSegment(from, to, width) appends one quad; oldest are recycled.
 */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private posAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private head = 0;
  private count = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_QUADS * 4 * 3);
    const alphas = new Float32Array(MAX_QUADS * 4);
    const indices = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    // Frustum culling off: bounds change every frame
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader: `
        attribute float aAlpha;
        varying float vA;
        void main() {
          vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          gl_FragColor = vec4(0.05, 0.05, 0.06, vA);
        }`,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Adds a skid quad between two ground points. */
  addSegment(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    width: number,
    y: number,
    alpha: number
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 6) return;
    const nx = (-dz / len) * width * 0.5;
    const nz = (dx / len) * width * 0.5;

    const v = this.head * 4;
    this.posAttr.array.set(
      [ax + nx, y, az + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz],
      v * 3
    );
    for (let i = 0; i < 4; i++) this.alphaAttr.array[v + i] = alpha;

    this.head = (this.head + 1) % MAX_QUADS;
    this.count = Math.min(this.count + 1, MAX_QUADS);
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
