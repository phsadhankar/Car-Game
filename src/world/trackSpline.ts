import * as THREE from 'three';

/**
 * The circuit: a closed loop through hand-placed control points.
 * Shared by terrain flattening, road mesh, grip map, checkpoints and minimap.
 */

export const ROAD_HALF_WIDTH = 5.5;

// ~4.7 km circuit: long start straight, hairpin, esses, sweeper
const CONTROL_POINTS: Array<[number, number]> = [
  [0, -320],      // start/finish straight (heading +X)
  [180, -330],
  [360, -300],    // gentle kink
  [470, -190],    // turn in
  [480, -40],     // sweeper exit
  [400, 80],      // 
  [430, 230],     // esses begin
  [310, 310],
  [170, 260],     // ess 1 apex
  [90, 340],
  [-60, 380],     // ess 2
  [-210, 330],
  [-280, 200],    // hairpin entry
  [-390, 140],
  [-420, -10],    // hairpin apex
  [-350, -140],
  [-220, -210],   // back straight
  [-100, -290]
];

export const trackCurve = new THREE.CatmullRomCurve3(
  CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  'catmullrom',
  0.5
);

export const TRACK_LENGTH = trackCurve.getLength();

// Precomputed samples for fast nearest-point queries
const SAMPLE_COUNT = 2048;
const samples = trackCurve.getSpacedPoints(SAMPLE_COUNT); // returns SAMPLE_COUNT+1 (last == first)
samples.pop();

const CELL = 48;
const grid = new Map<string, number[]>();
function cellKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}
samples.forEach((p, i) => {
  const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
  let arr = grid.get(key);
  if (!arr) {
    arr = [];
    grid.set(key, arr);
  }
  arr.push(i);
});

const _v = new THREE.Vector3();

/** Approximate distance from (x,z) to the track centerline. */
export function distanceToTrack(x: number, z: number): number {
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(cellKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (const i of arr) {
        const s = samples[i];
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < best) best = d;
      }
    }
  }
  if (best === Infinity) {
    // Far from track: coarse scan is fine
    for (let i = 0; i < samples.length; i += 16) {
      const s = samples[i];
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** Point on centerline nearest to (x,z), written into `out`. Returns squared distance. */
export function nearestTrackPoint(x: number, z: number, out: THREE.Vector3): number {
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(cellKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (const i of arr) {
        const s = samples[i];
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < best) {
          best = d;
          out.copy(s);
        }
      }
    }
  }
  return best;
}

/** Fraction u in [0,1) along the loop nearest to (x,z). */
export function nearestTrackU(x: number, z: number): number {
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  let best = Infinity;
  let bestI = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(cellKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (const i of arr) {
        const s = samples[i];
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < best) {
          best = d;
          bestI = i;
        }
      }
    }
  }
  return bestI / samples.length;
}

/** World position at fraction t along the loop. */
export function trackPointAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  return trackCurve.getPointAt(t % 1, out);
}

/** Unit tangent at fraction t. */
export function trackTangentAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  return trackCurve.getTangentAt(t % 1, out).setY(0).normalize();
}

export function samplePoints(): THREE.Vector3[] {
  return samples;
}

export { _v as scratchVec };
