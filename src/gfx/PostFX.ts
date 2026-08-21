import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** HDR pipeline: render -> ACES output -> optional bloom. */
export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(scene, camera));

    // Tone-map before any bloom: the HDR sky would blow out the bloom threshold.
    // Bloom is opt-in via setQuality(true) — daytime sun glare makes full-screen
    // bloom wash out the whole frame.
    this.composer.addPass(new OutputPass());

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.3, 0.15, 0.99);
    this.bloom.enabled = false;
    this.composer.addPass(this.bloom);
  }

  setQuality(high: boolean): void {
    this.bloom.strength = high ? 0.45 : 0;
    this.bloom.enabled = high;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
