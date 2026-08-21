/**
 * Headless physics sanity test.
 * Run: node tools/run-physics-test.mjs  (bundles via rolldown, then executes in Node)
 */
import * as THREE from 'three';
import { Vehicle, type GroundSample } from '../src/vehicle/Vehicle';

const flat = (_x: number, _z: number, out: GroundSample) => {
  out.height = 0;
  out.normal.set(0, 1, 0);
};

const makeInput = () => ({
  throttle: 0,
  brakeInput: 0,
  steerAxis: 0,
  handbrake: false
});

const v = new Vehicle(flat);
v.resetTo(new THREE.Vector3(0, 1.4, 0), 0);
const input = makeInput();

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};

const upY = () => new THREE.Vector3(0, 1, 0).applyQuaternion(v.quaternion).y;
const yawOf = () => {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quaternion);
  return Math.atan2(f.x, f.z);
};

// 1) Settle at rest, then full throttle for 8s
for (let i = 0; i < 2 * 60; i++) v.update(1 / 60, input as never);
const restY = v.position.y;
check('settles at ride height', Math.abs(restY - 0.5) < 0.08, `y=${restY.toFixed(3)}`);

let maxGear = 0;
for (let i = 0; i < 8 * 60; i++) {
  input.throttle = 1;
  v.update(1 / 60, input as never);
  maxGear = Math.max(maxGear, v.gearIndex);
}
check('accelerates past 130 km/h', v.speedKmh > 130, `speed=${v.speedKmh.toFixed(1)} km/h`);
check('upright after accel', upY() > 0.9, `up.y=${upY().toFixed(3)}`);

// 2) Brake to stop
for (let i = 0; i < 6 * 60; i++) {
  input.throttle = 0;
  input.brakeInput = 1;
  v.update(1 / 60, input as never);
}
input.brakeInput = 0;
check('brakes to stop', v.speedKmh < 2, `speed=${v.speedKmh.toFixed(2)} km/h`);

// 3) Accelerate to ~80 km/h, steer left
for (let i = 0; i < 30 * 60 && v.speedKmh < 80; i++) {
  input.throttle = 1;
  v.update(1 / 60, input as never);
}
input.throttle = 0.4;
const yawBefore = yawOf();
for (let i = 0; i < 2 * 60; i++) {
  input.steerAxis = 1;
  v.update(1 / 60, input as never);
}
input.steerAxis = 0;
const dYaw = ((yawOf() - yawBefore + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
check('steers left (negative yaw)', dYaw < -0.15, `dYaw=${dYaw.toFixed(3)} rad`);

// 4) Handbrake drift
for (let i = 0; i < 30 * 60 && v.speedKmh < 90; i++) {
  input.throttle = 1;
  v.update(1 / 60, input as never);
}
input.throttle = 0.5;
input.handbrake = true;
input.steerAxis = 1;
let maxSlip = 0;
for (let i = 0; i < 2 * 60; i++) {
  v.update(1 / 60, input as never);
  for (let w = 0; w < v.wheelCount; w++) maxSlip = Math.max(maxSlip, v.wheelSlip(w));
}
input.handbrake = false;
input.steerAxis = 0;
check('handbrake produces slip', maxSlip > 0.05, `maxSlip=${maxSlip.toFixed(3)}`);
check('still upright after maneuvers', upY() > 0.85, `up.y=${upY().toFixed(3)}`);

// 5) Gearbox sanity
check('rpm bounded', v.rpm >= 900 && v.rpm <= 8200, `rpm=${v.rpm.toFixed(0)}`);
check('gears advanced under throttle', maxGear >= 2, `maxGear=${maxGear}`);

console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
