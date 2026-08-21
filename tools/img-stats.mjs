// Minimal PNG analyzer: decodes scanlines and prints regional color stats.
// Usage: node tools/img-stats.mjs <file.png>
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);

let pos = 8;
let width = 0,
  height = 0,
  bitDepth = 0,
  colorType = 0;
const idat = [];

while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  pos += 12 + len;
}

if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
  console.log(`unsupported png: depth=${bitDepth} colorType=${colorType}`);
  process.exit(1);
}
const bpp = colorType === 6 ? 4 : 3;

const raw = inflateSync(Buffer.concat(idat));
const stride = width * bpp;
const img = Buffer.alloc(height * stride);

// Un-filter
let p = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[p++];
  const row = raw.subarray(p, p + stride);
  p += stride;
  const out = img.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[x - bpp] : 0;
    const b = y > 0 ? img[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
    let v = row[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const pa = Math.abs(b - c),
        pb = Math.abs(a - c),
        pc = Math.abs(a + b - 2 * c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    out[x] = v & 0xff;
  }
}

const px = (x, y) => {
  const i = y * stride + x * bpp;
  return [img[i], img[i + 1], img[i + 2]];
};

function regionAvg(x0, y0, x1, y1) {
  let r = 0,
    g = 0,
    bl = 0,
    n = 0;
  for (let y = y0; y < y1; y += 4)
    for (let x = x0; x < x1; x += 4) {
      const [pr, pg, pb] = px(x, y);
      r += pr;
      g += pg;
      bl += pb;
      n++;
    }
  return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
}

const colors = new Set();
let redish = 0,
  total = 0;
for (let y = 0; y < height; y += 3)
  for (let x = 0; x < width; x += 3) {
    const [r, g, b] = px(x, y);
    colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    total++;
    if (r > 90 && r > g * 1.6 && r > b * 1.6) redish++;
  }

console.log(`size=${width}x${height}`);
console.log(`top-third avg RGB:    ${regionAvg(0, 0, width, height / 3 | 0)}`);
console.log(`middle-third avg RGB: ${regionAvg(0, height / 3 | 0, width, (2 * height) / 3 | 0)}`);
console.log(`bottom-third avg RGB: ${regionAvg(0, (2 * height) / 3 | 0, width, height)}`);
console.log(`center avg RGB:       ${regionAvg(width / 4 | 0, height / 3 | 0, (3 * width) / 4 | 0, (2 * height) / 3 | 0)}`);
console.log(`unique colors(5bit): ${colors.size}, red-dominant px: ${((redish / total) * 100).toFixed(2)}%`);

// Coarse 24x13 grid visualization: K=black, W=white/gray, S=sky-blue, G=green, R=red, Y=yellow/bright
const COLS = 24, ROWS = 13;
let out = '';
for (let ry = 0; ry < ROWS; ry++) {
  let line = '';
  for (let cx = 0; cx < COLS; cx++) {
    const [r, g, b] = regionAvg(
      (cx * width) / COLS | 0, (ry * height) / ROWS | 0,
      ((cx + 1) * width) / COLS | 0, ((ry + 1) * height) / ROWS | 0
    );
    const lum = (r + g + b) / 3;
    let ch;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (lum < 30) ch = 'K';
    else if (mx - mn < 25) ch = lum > 200 ? 'W' : '.';
    else if (r > g && r > b) ch = 'R';
    else if (g >= b && g > r * 1.12) ch = 'G';
    else if (b > r && b >= g) ch = lum > 190 ? 'w' : 'S';
    else ch = 'Y';
    line += ch;
  }
  out += line + '\n';
}
console.log(out);
