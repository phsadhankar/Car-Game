import * as THREE from 'three';
import { Input } from './Input';
import { Vehicle } from '../vehicle/Vehicle';
import { CarModel } from '../vehicle/CarModel';
import { SkyDome } from '../world/SkyDome';
import { Terrain } from '../world/Terrain';
import { Track } from '../world/Track';
import { Props } from '../world/Props';
import { ColliderSet } from '../world/Colliders';
import { PostFX } from '../gfx/PostFX';
import {
  ROAD_HALF_WIDTH,
  distanceToTrack,
  trackPointAt,
  trackTangentAt
} from '../world/trackSpline';

const _spawnPos = new THREE.Vector3();
const _spawnTan = new THREE.Vector3();
trackPointAt(0.005, _spawnPos);
trackTangentAt(0.005, _spawnTan);
const SPAWN_YAW = Math.atan2(_spawnTan.x, _spawnTan.z);
const SPAWN = new THREE.Vector3(_spawnPos.x, 1.2, _spawnPos.z);

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new THREE.Clock();

  private container: HTMLElement;
  private input = new Input();
  private vehicle: Vehicle;
  private carModel: CarModel;
  private skyDome: SkyDome;
  private sun: THREE.DirectionalLight;
  private colliders!: ColliderSet;
  private postFX: PostFX;

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lookYawOffset = 0;
  private lookPitchOffset = 0;

  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / container.clientHeight,
      0.1,
      4000
    );

    this.scene.background = new THREE.Color(0x87b5e0);
    this.scene.fog = new THREE.Fog(0x87b5e0, 300, 1800);

    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a2a, 0.25);
    this.scene.add(hemi);

    this.skyDome = new SkyDome(this.scene, this.renderer);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 600;
    const s = 90;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // World
    const terrain = new Terrain();
    this.scene.add(terrain.mesh);
    this.scene.add(new Track().group);

    // Vehicle
    this.vehicle = new Vehicle((_x, _z, out) => {
      out.height = terrain.heightAt(_x, _z);
    });
    this.vehicle.setSurfaceSampler((x, z) =>
      distanceToTrack(x, z) < ROAD_HALF_WIDTH + 1.2 ? 1 : 0.58
    );
    this.vehicle.resetTo(SPAWN, SPAWN_YAW);
    this.carModel = new CarModel();
    this.scene.add(this.carModel.root);

    // Props + static collision
    const props = new Props();
    this.scene.add(props.group);
    this.colliders = props.colliders;

    // Post-processing
    this.postFX = new PostFX(
      this.renderer,
      this.scene,
      this.camera,
      container.clientWidth,
      container.clientHeight
    );

    // Camera init behind car
    this.snapCamera();

    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  protected update(dt: number): void {
    if (this.input.pressed('KeyR')) {
      this.vehicle.resetTo(SPAWN, SPAWN_YAW);
      this.snapCamera();
    }

    // Mouse look while RMB held
    if (this.input.lookHeld) {
      this.lookYawOffset -= this.input.mouseDX * 0.005;
      this.lookPitchOffset = THREE.MathUtils.clamp(
        this.lookPitchOffset - this.input.mouseDY * 0.004,
        -0.5,
        0.6
      );
    } else {
      this.lookYawOffset *= Math.max(0, 1 - dt * 6);
      this.lookPitchOffset *= Math.max(0, 1 - dt * 6);
    }

    this.vehicle.update(dt, this.input);
    this.colliders.resolve(this.vehicle.position, this.vehicle.velocity, 1.15);
    this.carModel.sync(this.vehicle);
    this.carModel.setBrakeLights(this.input.brakeInput > 0 || this.input.handbrake);
    this.updateCamera(dt);
    this.updateSun();
  }

  private updateCamera(dt: number): void {
    const v = this.vehicle;
    const back = new THREE.Vector3(0, 2.7, -7.2).applyQuaternion(v.quaternion).add(v.position);
    const k = 1 - Math.exp(-5.5 * dt);
    this.camPos.lerp(back, k);

    const ahead = new THREE.Vector3(0, 1.1, 4).applyQuaternion(v.quaternion).add(v.position);
    if (this.lookYawOffset !== 0 || this.lookPitchOffset !== 0) {
      const yawQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.lookYawOffset
      );
      ahead.sub(v.position).applyQuaternion(yawQ).add(v.position);
      ahead.y += this.lookPitchOffset * 6;
    }
    this.camLook.lerp(ahead, 1 - Math.exp(-9 * dt));

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private snapCamera(): void {
    this.camPos.copy(new THREE.Vector3(0, 2.7, -7.2).applyQuaternion(this.vehicle.quaternion).add(this.vehicle.position));
    this.camLook.copy(new THREE.Vector3(0, 1.1, 4).applyQuaternion(this.vehicle.quaternion).add(this.vehicle.position));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private updateSun(): void {
    const p = this.vehicle.position;
    this.sun.position.copy(p).addScaledVector(this.skyDome.sunDirection, 140);
    this.sun.target.position.copy(p);
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.update(dt);
    this.input.endFrame();
    this.postFX.render(dt);
  };

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postFX.setSize(w, h);
  };
}
