import * as THREE from 'three';
import type { Input } from '../core/Input';

export interface GroundSample {
  height: number;
  normal: THREE.Vector3;
}

export type GroundSampler = (x: number, z: number, out: GroundSample) => void;

/** Optional surface grip lookup (1 = asphalt, <1 = grass etc). */
export type SurfaceSampler = (x: number, z: number) => number;

interface Wheel {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  steered: boolean;
  driven: boolean;

  steer: number;
  spin: number;
  suspLen: number;
  contact: boolean;
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  load: number;
  slip: number;
  gripMul: number;
}

const G = 9.81;
const IDLE_RPM = 900;
const REDLINE_RPM = 8200;
const GEAR_RATIOS = [3.4, 2.25, 1.65, 1.28, 1.03, 0.84];
const FINAL_DRIVE = 3.44;
const REVERSE_RATIO = 3.2;
const SHIFT_UP_RPM = 7900;
const SHIFT_DOWN_RPM = 2600;
const SHIFT_TIME = 0.22;

const TORQUE_CURVE: Array<[number, number]> = [
  [900, 200], [2500, 330], [4500, 420], [6000, 445], [7200, 420], [8200, 320]
];

function engineTorque(rpm: number): number {
  if (rpm <= TORQUE_CURVE[0][0]) return TORQUE_CURVE[0][1];
  for (let i = 1; i < TORQUE_CURVE.length; i++) {
    const [r1, t1] = TORQUE_CURVE[i];
    const [r0, t0] = TORQUE_CURVE[i - 1];
    if (rpm <= r1) return t0 + ((rpm - r0) / (r1 - r0)) * (t1 - t0);
  }
  return TORQUE_CURVE[TORQUE_CURVE.length - 1][1];
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class Vehicle {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  private angularVelocity = new THREE.Vector3();

  readonly mass = 1250;
  readonly wheelRadius = 0.35;
  private readonly invInertia = new THREE.Vector3();

  private wheels: Wheel[] = [];
  private ground: GroundSampler;
  private surface: SurfaceSampler | null = null;

  // Tuning
  private restLength = 0.42;
  private springK = 52000;
  private damperC = 4800;
  private arbStiffness = 16000;
  private muBase = 1.25;
  private tireSlope = 11;
  private dragCoef = 0.42;
  private downforceCoef = 3.2;
  private brakeForceMax = 8200;
  private handbrakeForce = 6200;

  // Drivetrain state
  gearIndex = 0; // 0..5 forward, -1 reverse
  rpm = IDLE_RPM;
  private shiftTimer = 0;

  // Steering state
  private steerAngle = 0;

  // Body axes (per step)
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();

  // Accumulators
  private force = new THREE.Vector3();
  private torque = new THREE.Vector3();

  // Dedicated scratch (no aliasing)
  private _attach = new THREE.Vector3();
  private _fDir = new THREE.Vector3();
  private _sDir = new THREE.Vector3();
  private _vAtP = new THREE.Vector3();
  private _tireF = new THREE.Vector3();
  private _suspF = new THREE.Vector3();
  private _lever = new THREE.Vector3();
  private _cross = new THREE.Vector3();
  private _tmpA = new THREE.Vector3();
  private _tmpB = new THREE.Vector3();
  private _tmpQ = new THREE.Quaternion();
  private sample: GroundSample = { height: 0, normal: new THREE.Vector3(0, 1, 0) };

  constructor(ground: GroundSampler) {
    this.ground = ground;
    // Attach points sit ABOVE the COM plane so the mass center rides low
    // (rollover threshold ~1.7g vs tire grip ~1.25g — stable like a real supercar).
    const attachY = 0.26;
    const hw = 0.86, hf = 1.42, hr = -1.32;
    const defs = [
      { offsetX: -hw, offsetY: attachY, offsetZ: hf, steered: true, driven: false },
      { offsetX: hw, offsetY: attachY, offsetZ: hf, steered: true, driven: false },
      { offsetX: -hw, offsetY: attachY, offsetZ: hr, steered: false, driven: true },
      { offsetX: hw, offsetY: attachY, offsetZ: hr, steered: false, driven: true }
    ];
    this.wheels = defs.map((d) => ({
      ...d,
      steer: 0,
      spin: 0,
      suspLen: this.restLength,
      contact: false,
      contactPoint: new THREE.Vector3(),
      contactNormal: new THREE.Vector3(0, 1, 0),
      load: 0,
      slip: 0,
      gripMul: 1
    }));

    // Box inertia (body frame)
    const hx = 0.95, hy = 0.55, hz = 2.25;
    const ix = (this.mass / 12) * (hy * hy + hz * hz);
    const iy = (this.mass / 12) * (hx * hx + hz * hz);
    const iz = (this.mass / 12) * (hx * hx + hy * hy);
    this.invInertia.set(1 / ix, 1 / iy, 1 / iz);
  }

  setSurfaceSampler(s: SurfaceSampler): void {
    this.surface = s;
  }

  get speed(): number {
    return this.velocity.length();
  }

  get speedKmh(): number {
    return this.velocity.length() * 3.6;
  }

  getForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  get gearLabel(): string {
    if (this.gearIndex === -1) return 'R';
    return String(this.gearIndex + 1);
  }

  resetTo(pos: THREE.Vector3, headingYaw: number): void {
    this.position.copy(pos);
    this.quaternion.setFromAxisAngle(UP_AXIS, headingYaw);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.gearIndex = 0;
    this.rpm = IDLE_RPM;
    this.steerAngle = 0;
    this.shiftTimer = 0;
    for (const w of this.wheels) {
      w.suspLen = this.restLength;
      w.contact = true;
      w.spin = 0;
      w.steer = 0;
      w.slip = 0;
    }
  }

  update(dt: number, input: Input): void {
    this.updateSteering(dt, input);
    this.updateDrivetrain(dt, input);

    const steps = Math.min(Math.max(Math.ceil(dt / (1 / 120)), 1), 6);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, input);
  }

  private updateSteering(dt: number, input: Input): void {
    const spd = this.speed;
    const maxSteer = THREE.MathUtils.lerp(0.58, 0.11, THREE.MathUtils.clamp(spd / 55, 0, 1));
    let target = input.steerAxis * maxSteer;
    if (input.handbrake) target *= 1.15;
    const rate = Math.abs(target) > 0.01 ? 3.6 : 5.2;
    const diff = target - this.steerAngle;
    const maxDelta = rate * dt;
    this.steerAngle += THREE.MathUtils.clamp(diff, -maxDelta, maxDelta);
  }

  private updateDrivetrain(dt: number, input: Input): void {
    this.getForward(this._tmpA);
    const vFwd = this.velocity.dot(this._tmpA);

    if (input.brakeInput > 0 && vFwd < 0.6 && this.gearIndex >= 0 && input.throttle === 0) {
      this.gearIndex = -1;
    } else if (input.throttle > 0 && vFwd > -0.6 && this.gearIndex === -1) {
      this.gearIndex = 0;
    }

    const ratio = this.currentRatio();
    const wheelRps = Math.abs(vFwd) / (2 * Math.PI * this.wheelRadius);
    let targetRpm = wheelRps * Math.abs(ratio) * FINAL_DRIVE * 60;
    const launchSlip = Math.abs(vFwd) < 6 && input.throttle > 0;
    if (launchSlip) targetRpm = Math.max(targetRpm, 2200 + input.throttle * 2800);
    targetRpm = THREE.MathUtils.clamp(targetRpm, IDLE_RPM, REDLINE_RPM);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 12);

    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    } else if (this.gearIndex >= 0) {
      if (this.rpm > SHIFT_UP_RPM && this.gearIndex < GEAR_RATIOS.length - 1 && input.throttle > 0) {
        this.gearIndex++;
        this.shiftTimer = SHIFT_TIME;
      } else if (this.rpm < SHIFT_DOWN_RPM && this.gearIndex > 0) {
        this.gearIndex--;
        this.shiftTimer = SHIFT_TIME;
      }
    }
  }

  private currentRatio(): number {
    if (this.gearIndex === -1) return -REVERSE_RATIO;
    return GEAR_RATIOS[this.gearIndex];
  }

  private step(h: number, input: Input): void {
    this.fwd.set(0, 0, 1).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);

    this.force.set(0, -this.mass * G, 0);
    this.torque.set(0, 0, 0);

    const ratio = this.currentRatio();
    const throttle = this.shiftTimer > 0 ? 0 : input.throttle;
    let driveForcePerWheel = 0;
    if (throttle > 0 || this.gearIndex === -1) {
      const t = engineTorque(this.rpm) * throttle;
      driveForcePerWheel = (t * Math.abs(ratio) * FINAL_DRIVE * 0.85) / this.wheelRadius / 2;
    }

    const brakeInput = input.brakeInput;
    const handbrake = input.handbrake;
    const spd = this.speed;

    for (const w of this.wheels) {
      w.contact = false;
      w.load = 0;
      w.slip = 0;

      const attach = this._attach
        .set(w.offsetX, w.offsetY, w.offsetZ)
        .applyQuaternion(this.quaternion)
        .add(this.position);

      // Ray along -up against heightfield (fixed-point iteration)
      let t = Math.max(
        (attach.y - this.sampleGroundHeight(attach.x, attach.z)) / Math.max(this.up.y, 0.4),
        0
      );
      for (let iter = 0; iter < 5; iter++) {
        const px = attach.x - this.up.x * t;
        const py = attach.y - this.up.y * t;
        const pz = attach.z - this.up.z * t;
        const groundY = this.sampleGroundHeight(px, pz);
        t += (py - groundY) / Math.max(this.up.y, 0.4);
        t = Math.max(t, 0);
      }

      const suspLen = t - this.wheelRadius;
      w.suspLen = Math.min(suspLen, this.restLength);

      if (suspLen >= this.restLength) {
        // Airborne: free spin toward ground speed
        w.spin += (this.velocity.dot(this.fwd) / this.wheelRadius) * h;
        continue;
      }

      w.contact = true;
      const cx = attach.x - this.up.x * t;
      const cy = attach.y - this.up.y * t;
      const cz = attach.z - this.up.z * t;
      w.contactPoint.set(cx, cy, cz);
      this.sampleGroundNormal(cx, cz, w.contactNormal);

      w.gripMul = this.surface ? this.surface(cx, cz) : 1;

      // Suspension spring + damper
      const compression = this.restLength - suspLen;
      const pointVel = this.pointVelocity(w.contactPoint, this._tmpB);
      const compressSpeed = -pointVel.dot(this.up);
      const suspForce = Math.max(this.springK * compression + this.damperC * compressSpeed, 0);
      w.load = suspForce;

      this.applyForce(this._suspF.copy(this.up).multiplyScalar(suspForce), w.contactPoint);

      // --- Tire model ---
      const steer = w.steered ? this.steerAngle : 0;
      const cosS = Math.cos(steer), sinS = Math.sin(steer);
      const fDir = this._fDir
        .copy(this.fwd)
        .multiplyScalar(cosS)
        .addScaledVector(this.right, -sinS);
      fDir.addScaledVector(w.contactNormal, -fDir.dot(w.contactNormal)).normalize();
      const sDir = this._sDir.crossVectors(fDir, w.contactNormal).normalize(); // points left

      const vAtP = this.pointVelocity(w.contactPoint, this._vAtP);
      const vF = vAtP.dot(fDir);
      const vS = vAtP.dot(sDir);

      let mu = this.muBase * w.gripMul;
      if (handbrake && !w.steered) mu *= 0.42;

      // Longitudinal forces
      let fLong = 0;
      if (w.driven) fLong += driveForcePerWheel;
      if (brakeInput > 0) {
        const bf = Math.min(this.brakeForceMax * brakeInput, (Math.abs(vF) * this.mass) / (4 * h));
        fLong -= Math.sign(vF) * bf;
      }
      if (handbrake && !w.steered) {
        const hf = Math.min(this.handbrakeForce, (Math.abs(vF) * this.mass) / (4 * h));
        fLong -= Math.sign(vF) * hf;
      }
      // Rolling resistance
      fLong -= vF * (w.gripMul < 0.9 ? 26 : 1.6);

      // Lateral force from slip angle (saturates via friction circle below)
      const slipAngle = Math.atan2(vS, Math.abs(vF) + 0.8);
      let fLat = -slipAngle * this.tireSlope * w.load;
      if (handbrake && !w.steered) fLat *= 0.55;

      // Friction circle
      const maxF = mu * w.load;
      const demand = Math.hypot(fLong, fLat);
      if (demand > maxF && demand > 0) {
        const scale = maxF / demand;
        fLong *= scale;
        fLat *= scale;
        w.slip = Math.min((demand - maxF) / (maxF + 1), 1.5);
      } else {
        w.slip = Math.max(0, demand / (maxF + 1) - 0.85) * 4;
      }

      const tireF = this._tireF.copy(fDir).multiplyScalar(fLong).addScaledVector(sDir, fLat);
      this.applyForce(tireF, w.contactPoint);

      w.spin += (vF / this.wheelRadius) * h;
    }

    // Anti-roll bars (front pair idx 0-1, rear pair 2-3)
    this.applyAntiRoll(this.wheels[0], this.wheels[1]);
    this.applyAntiRoll(this.wheels[2], this.wheels[3]);

    // Aero drag + downforce
    if (spd > 0.1) {
      const drag = this.dragCoef * spd * spd;
      this.force.addScaledVector(this.velocity, -drag / spd);
      this.force.addScaledVector(this.up, -this.downforceCoef * spd * spd * 0.02);
    }

    // Rollover assist: gently right the car when heavily tilted (arcade-friendly)
    if (this.up.y < 0.86 && this.up.y > -0.35) {
      const axis = this._tmpB.crossVectors(this.up, WORLD_UP);
      const len = axis.length();
      if (len > 1e-4) {
        axis.multiplyScalar(1 / len);
        this.torque.addScaledVector(axis, (0.86 - this.up.y) * 16000);
      }
    }

    // Integrate linear
    this.velocity.addScaledVector(this.force, h / this.mass);
    this.position.addScaledVector(this.velocity, h);

    // Integrate angular (world torque -> body frame -> alpha -> world)
    const tb = this._tmpA.copy(this.torque).applyQuaternion(this._tmpQ.copy(this.quaternion).invert());
    tb.set(tb.x * this.invInertia.x, tb.y * this.invInertia.y, tb.z * this.invInertia.z);
    tb.applyQuaternion(this.quaternion);
    this.angularVelocity.addScaledVector(tb, h);
    this.angularVelocity.multiplyScalar(1 - Math.min(0.9, 0.9 * h));
    if (this.angularVelocity.lengthSq() > 36) this.angularVelocity.setLength(6);

    const wq = this._tmpQ.set(
      this.angularVelocity.x * h * 0.5,
      this.angularVelocity.y * h * 0.5,
      this.angularVelocity.z * h * 0.5,
      0
    );
    wq.multiply(this.quaternion);
    this.quaternion.x += wq.x;
    this.quaternion.y += wq.y;
    this.quaternion.z += wq.z;
    this.quaternion.w += wq.w;
    this.quaternion.normalize();

    // Low-speed sleep to kill jitter
    if (spd < 0.4 && input.throttle === 0 && input.brakeInput === 0) {
      this.velocity.multiplyScalar(1 - Math.min(1, 6 * h));
      this.angularVelocity.multiplyScalar(1 - Math.min(1, 6 * h));
    }
  }

  private applyAntiRoll(a: Wheel, b: Wheel): void {
    if (!a.contact && !b.contact) return;
    const diff =
      (a.contact ? this.restLength - a.suspLen : 0) - (b.contact ? this.restLength - b.suspLen : 0);
    const f = this.arbStiffness * diff;
    if (a.contact) this.applyForce(this._tmpA.copy(this.up).multiplyScalar(-f), a.contactPoint);
    if (b.contact) this.applyForce(this._tmpA.copy(this.up).multiplyScalar(f), b.contactPoint);
  }

  private applyForce(f: THREE.Vector3, at: THREE.Vector3): void {
    this.force.add(f);
    const r = this._lever.copy(at).sub(this.position);
    this.torque.add(this._cross.crossVectors(r, f));
  }

  private pointVelocity(at: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r = this._lever.copy(at).sub(this.position);
    return out.copy(this.angularVelocity).cross(r).add(this.velocity);
  }

  private sampleGroundHeight(x: number, z: number): number {
    this.ground(x, z, this.sample);
    return this.sample.height;
  }

  private sampleGroundNormal(x: number, z: number, out: THREE.Vector3): void {
    const e = 0.35;
    const hL = this.sampleGroundHeight(x - e, z);
    const hR = this.sampleGroundHeight(x + e, z);
    const hD = this.sampleGroundHeight(x, z - e);
    const hU = this.sampleGroundHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  // --- Visual sync API ---

  get wheelCount(): number {
    return this.wheels.length;
  }

  wheelWorldPosition(i: number, out: THREE.Vector3): THREE.Vector3 {
    const w = this.wheels[i];
    const len = Math.max(w.suspLen, 0.08);
    return out
      .set(w.offsetX, w.offsetY - len, w.offsetZ)
      .applyQuaternion(this.quaternion)
      .add(this.position);
  }

  wheelYawQuaternion(i: number, out: THREE.Quaternion): THREE.Quaternion {
    const w = this.wheels[i];
    out.copy(this.quaternion);
    if (w.steered) {
      this._tmpQ.setFromAxisAngle(UP_AXIS, -w.steer);
      out.multiply(this._tmpQ);
    }
    return out;
  }

  wheelSpin(i: number): number {
    return this.wheels[i].spin;
  }

  wheelSlip(i: number): number {
    return this.wheels[i].slip;
  }

  wheelContact(i: number): boolean {
    return this.wheels[i].contact;
  }

  wheelGrip(i: number): number {
    return this.wheels[i].gripMul;
  }

  /** Suspension compression 0..1 per wheel (for visuals). */
  wheelSuspension(i: number): number {
    return 1 - this.wheels[i].suspLen / this.restLength;
  }
}
