/** Deterministic value-noise utilities (no deps, stable across runs). */

function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [-1, 1]. */
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const ux = smooth(fx),
    uz = smooth(fz);
  return (
    (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1
  );
}

/** Fractal Brownian motion in roughly [-1, 1]. */
export function fbm(x: number, z: number, octaves = 4): number {
  let sum = 0,
    amp = 1,
    freq = 1,
    norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
