import * as THREE from 'three';
import type { Vehicle } from './Vehicle';

/** Temporary placeholder visual — replaced by the supercar model. */
export class CarVisual {
  readonly root = new THREE.Group();
  private wheelPivots: THREE.Group[] = [];
  private spinners: THREE.Group[] = [];

  constructor() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd23c2a, roughness: 0.4, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 4.2), bodyMat);
    body.position.y = 0.15;
    body.castShadow = true;
    this.root.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.42, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.15, metalness: 0.9 })
    );
    cabin.position.set(0, 0.58, -0.25);
    cabin.castShadow = true;
    this.root.add(cabin);

    const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.9 });

    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire);
      spin.add(new THREE.Mesh(rimGeo, rimMat));
      pivot.add(spin);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.spinners.push(spin);
    }
  }

  sync(v: Vehicle): void {
    this.root.position.copy(v.position);
    this.root.quaternion.copy(v.quaternion);

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let i = 0; i < v.wheelCount; i++) {
      v.wheelWorldPosition(i, pos);
      v.wheelYawQuaternion(i, quat);
      this.wheelPivots[i].position.copy(pos);
      this.wheelPivots[i].quaternion.copy(quat);
      this.spinners[i].rotation.x = v.wheelSpin(i);
    }
  }
}
