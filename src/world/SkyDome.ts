import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/** Procedural atmospheric sky + image-based lighting for the whole scene. */
export class SkyDome {
  readonly sunDirection = new THREE.Vector3();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = 5.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;

    this.sunDirection
      .setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(58),
        THREE.MathUtils.degToRad(155)
      )
      .normalize();
    u.sunPosition.value.copy(this.sunDirection);

    // Bake sky into a PMREM env map for PBR reflections.
    // The sky shader emits true HDR (sun disk is extremely bright), so the
    // irradiance needs heavy scaling to sit right alongside direct lighting.
    if (!location.search.includes('noenv')) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const tmpScene = new THREE.Scene();
      tmpScene.add(sky);
      const envRT = pmrem.fromScene(tmpScene);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.22;
      pmrem.dispose();
    }

    // Keep the visible sky dome in the main scene
    scene.add(sky);

    // Horizon-matched fog
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.setRGB(0.72, 0.82, 0.92);
    }
  }
}
