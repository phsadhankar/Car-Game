import * as THREE from 'three';

/** Procedural canvas textures (no external assets). */

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;

  // Base asphalt
  ctx.fillStyle = '#33343a';
  ctx.fillRect(0, 0, s, s);

  // Grain noise
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n + 2;
  }
  ctx.putImageData(img, 0, 0);

  // Edge lines (u across road maps to x here)
  ctx.fillStyle = '#d8d8d0';
  ctx.fillRect(s * 0.055, 0, s * 0.02, s);
  ctx.fillRect(s * 0.925, 0, s * 0.02, s);

  // Dashed center line (v runs along road => dashes along y)
  ctx.fillStyle = '#e8c93e';
  const dashH = s / 8;
  for (let y = 0; y < s; y += dashH * 2) {
    ctx.fillRect(s * 0.492, y, s * 0.016, dashH);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeCheckerTexture(sq = 8): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s / sq;
  const ctx = c.getContext('2d')!;
  const cell = s / sq / 2;
  for (let y = 0; y < s / sq / cell; y++) {
    for (let x = 0; x < sq * 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#eeeeee';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeFacadeTexture(): THREE.CanvasTexture {
  const w = 128,
    h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a5058';
  ctx.fillRect(0, 0, w, h);

  const cols = 6,
    rows = 14;
  const cw = w / cols,
    ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = Math.random() < 0.28;
      ctx.fillStyle = lit
        ? `rgb(${230 + Math.random() * 25},${200 + Math.random() * 40},${140 + Math.random() * 60})`
        : '#232830';
      ctx.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.22, cw * 0.64, ch * 0.56);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
