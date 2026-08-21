import * as THREE from 'three';
import type { Vehicle } from './Vehicle';

/**
 * Procedural supercar: extruded side-profile body with tumblehome taper,
 * glass canopy, detailed wheels, working head/brake lights.
 * Root origin = vehicle COM (rides ~0.45m above ground).
 */
export class CarModel {
  readonly root = new THREE.Group();
  private wheelPivots: THREE.Group[] = [];
  private spinners: THREE.Group[] = [];
  private brakeMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;

  constructor(paintColor = 0xb3121f) {
    const paint = new THREE.MeshPhysicalMaterial({
      color: paintColor,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.1
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x07090d,
      metalness: 0.9,
      roughness: 0.06,
      envMapIntensity: 1.4
    });
    const carbon = new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      metalness: 0.5,
      roughness: 0.45
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xc8ccd2,
      metalness: 1,
      roughness: 0.18
    });

    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0xff1a0e,
      emissiveIntensity: 0.7
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: 0xdadfe6,
      emissive: 0xfff6da,
      emissiveIntensity: 2.2
    });

    this.root.add(this.buildBody(paint));
    this.root.add(this.buildCanopy(glass));
    this.root.add(this.buildDetails(paint, carbon, chrome));

    // Headlights + taillight strip
    const hlGeo = new THREE.BoxGeometry(0.34, 0.055, 0.06);
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(hlGeo, this.headMat);
      hl.position.set(sx * 0.58, 0.24, 2.12);
      hl.rotation.y = sx * -0.18;
      this.root.add(hl);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.05, 0.05), this.brakeMat);
    tail.position.set(0, 0.36, -2.22);
    this.root.add(tail);

    // Wheels
    const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 28);
    tireGeo.rotateZ(Math.PI / 2);
    const rimDiscGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.26, 20);
    rimDiscGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.27, 0.36, 0.045);
    const discGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.05, 16);
    discGeo.rotateZ(Math.PI / 2);
    const caliperGeo = new THREE.BoxGeometry(0.06, 0.13, 0.09);

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x33363c, metalness: 0.95, roughness: 0.28 });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.9, roughness: 0.4 });
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xc41e28, metalness: 0.4, roughness: 0.5 });

    const wheelDefs = [
      { x: -0.86, z: 1.42 },
      { x: 0.86, z: 1.42 },
      { x: -0.86, z: -1.32 },
      { x: 0.86, z: -1.32 }
    ];
    for (const d of wheelDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, -0.1, d.z);

      // Fender arch masks the body/tire seam
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.075, 10, 20, Math.PI * 1.05),
        carbon
      );
      arch.rotation.y = Math.PI / 2;
      arch.rotation.z = Math.PI * -0.02;
      pivot.add(arch);

      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(tireGeo, tireMat));
      spin.add(new THREE.Mesh(rimDiscGeo, rimMat));
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (s / 5) * Math.PI * 2;
        spoke.translateY(0.09);
        spin.add(spoke);
      }
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.x = d.x > 0 ? 0.14 : -0.14;
      spin.add(disc);
      pivot.add(spin);

      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(d.x > 0 ? 0.17 : -0.17, 0.08, 0.12);
      pivot.add(caliper);

      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.spinners.push(spin);
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Extruded side profile with width taper. */
  private buildBody(paint: THREE.Material): THREE.Mesh {
    const s = new THREE.Shape();
    s.moveTo(-2.2, 0.03); // rear bottom
    s.lineTo(-2.28, 0.3); // rear face
    s.lineTo(-2.12, 0.44); // deck lip
    s.lineTo(-0.75, 0.47); // rear deck
    s.lineTo(0.55, 0.43); // beltline rise to cowl
    s.lineTo(1.15, 0.38); // hood
    s.lineTo(2.05, 0.26); // nose drop
    s.lineTo(2.3, 0.17); // nose tip
    s.lineTo(2.22, 0.07); // under nose
    s.lineTo(2.05, 0.02); // splitter edge
    s.lineTo(-2.2, 0.03);

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 1.62,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.11,
      bevelSegments: 4,
      steps: 1,
      curveSegments: 8
    });
    geo.rotateY(-Math.PI / 2);
    geo.translate(0.81, 0, 0); // center width (x)
    this.taper(geo, 0.16, 0.1);

    const mesh = new THREE.Mesh(geo, paint);
    return mesh;
  }

  private buildCanopy(glass: THREE.Material): THREE.Mesh {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.42);
    s.lineTo(-0.1, 0.76); // windshield
    s.lineTo(-0.85, 0.78); // roof
    s.lineTo(-1.85, 0.45); // fastback
    s.lineTo(0.5, 0.42);

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 1.04,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.09,
      bevelSegments: 4,
      steps: 1,
      curveSegments: 6
    });
    geo.rotateY(-Math.PI / 2);
    geo.translate(-0.61, 0, 0);
    this.taper(geo, 0.3, 0.22);

    return new THREE.Mesh(geo, glass);
  }

  /** Narrow toward the roof (tumblehome) and slightly toward the nose. */
  private taper(geo: THREE.BufferGeometry, roofPinch: number, noseTaper: number): void {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = THREE.MathUtils.clamp((y - 0.05) / 0.55, 0, 1);
      const widthScale = (1 - roofPinch * t * t) * (0.93 + noseTaper * THREE.MathUtils.clamp((z + 2.3) / 4.6, 0, 1));
      pos.setX(i, pos.getX(i) * widthScale);
    }
    geo.computeVertexNormals();
  }

  private buildDetails(
    paint: THREE.Material,
    carbon: THREE.Material,
    chrome: THREE.Material
  ): THREE.Group {
    const g = new THREE.Group();

    // Front splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.045, 0.5), carbon);
    splitter.position.set(0, 0.005, 2.05);
    g.add(splitter);

    // Side skirts
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 2.4), carbon);
      skirt.position.set(sx * 0.83, 0.01, 0.05);
      g.add(skirt);
    }

    // Rear diffuser
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.4), carbon);
    diffuser.position.set(0, 0.06, -2.12);
    diffuser.rotation.x = 0.32;
    g.add(diffuser);

    // Rear wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.045, 0.34), carbon);
    wing.position.set(0, 0.68, -2.05);
    wing.rotation.x = -0.14;
    g.add(wing);
    for (const sx of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.12), carbon);
      pylon.position.set(sx * 0.55, 0.56, -2.02);
      g.add(pylon);
    }

    // Mirrors
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), carbon);
      stalk.position.set(sx * 0.82, 0.5, 0.42);
      stalk.rotation.z = sx * 0.4;
      g.add(stalk);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.06), paint);
      head.position.set(sx * 0.94, 0.53, 0.4);
      g.add(head);
    }

    // Exhaust tips
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 12), chrome);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(sx * 0.22, 0.16, -2.26);
      g.add(tip);
    }

    // Intake scoop on rear deck
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), carbon);
    intake.position.set(0, 0.49, -1.35);
    g.add(intake);

    return g;
  }

  setBrakeLights(on: boolean): void {
    this.brakeMat.emissiveIntensity = on ? 6 : 0.7;
  }

  sync(v: Vehicle): void {
    this.root.position.copy(v.position);
    this.root.quaternion.copy(v.quaternion);

    const quat = new THREE.Quaternion();
    const inv = new THREE.Quaternion().copy(v.quaternion).invert();
    for (let i = 0; i < v.wheelCount; i++) {
      v.wheelWorldPosition(i, this.wheelPivots[i].position);
      this.wheelPivots[i].position.sub(v.position).applyQuaternion(inv);
      v.wheelYawQuaternion(i, quat);
      this.wheelPivots[i].quaternion.copy(quat);
      this.spinners[i].rotation.x = v.wheelSpin(i);
    }
  }
}
