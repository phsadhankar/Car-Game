import * as THREE from 'three';
import { samplePoints, nearestTrackU } from '../world/trackSpline';

const BEST_KEY = 'apex-best-lap';
const MIN_LAP_TIME = 20;

/**
 * 2D overlay HUD: analog speedometer + gear + RPM arc, minimap with car dot,
 * and lap timing driven by track-parameter wrap detection.
 */
export class Hud {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private mapPts: { x: number; y: number }[] = [];
  private mapMin = { x: Infinity, y: Infinity };
  private mapMax = { x: -Infinity, y: -Infinity };

  private lastU = 0;
  private lapTime = 0;
  private lastLap = 0;
  private bestLap = Number(localStorage.getItem(BEST_KEY)) || 0;
  private lapArmed = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '5',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Precompute minimap polyline in normalized space
    const pts = samplePoints();
    for (const p of pts) {
      this.mapMin.x = Math.min(this.mapMin.x, p.x);
      this.mapMax.x = Math.max(this.mapMax.x, p.x);
      this.mapMin.y = Math.min(this.mapMin.y, p.z);
      this.mapMax.y = Math.max(this.mapMax.y, p.z);
    }
    const spanX = this.mapMax.x - this.mapMin.x || 1;
    const spanY = this.mapMax.y - this.mapMin.y || 1;
    const span = Math.max(spanX, spanY);
    for (const p of pts) {
      this.mapPts.push({
        x: (p.x - (this.mapMin.x + this.mapMax.x) / 2) / span,
        y: (p.z - (this.mapMin.y + this.mapMax.y) / 2) / span,
      });
    }
  }

  resize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private trialMode = false;

  setTrialMode(on: boolean): void {
    this.trialMode = on;
  }

  update(dt: number, speedKmh: number, gearLabel: string, rpm: number, pos: THREE.Vector3): void {
    if (this.trialMode) this.updateLap(pos);
    this.lapTime += dt;

    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    this.drawSpeedo(w, h, speedKmh, gearLabel, rpm);
    this.drawMinimap(w, h, pos);
    if (this.trialMode) this.drawTimer(w);
  }

  private updateLap(pos: THREE.Vector3): void {
    const u = nearestTrackU(pos.x, pos.z);
    if (this.lastU > 0.85 && u < 0.15 && this.lapArmed) {
      const t = this.lapTime;
      if (t >= MIN_LAP_TIME) {
        this.lastLap = t;
        if (!this.bestLap || t < this.bestLap) {
          this.bestLap = t;
          localStorage.setItem(BEST_KEY, String(t));
        }
      }
      this.lapTime = 0;
      this.lapArmed = false;
    } else if (u > 0.3 && u < 0.7) {
      this.lapArmed = true;
    }
    this.lastU = u;
  }

  private drawSpeedo(w: number, h: number, kmh: number, gear: string, rpm: number): void {
    const ctx = this.ctx;
    const cx = w - 110;
    const cy = h - 100;
    const R = 78;

    ctx.save();
    // Dial
    ctx.beginPath();
    ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fill();

    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;

    // RPM arc (inner)
    const rpmFrac = Math.min(rpm / 8200, 1);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, R - 12, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = rpmFrac > 0.92 ? '#ff4040' : '#e8b23a';
    ctx.beginPath();
    ctx.arc(cx, cy, R - 12, a0, a0 + (a1 - a0) * rpmFrac);
    ctx.stroke();

    // Speed ticks
    for (let s = 0; s <= 320; s += 20) {
      const a = a0 + ((a1 - a0) * s) / 320;
      const inner = s % 40 === 0 ? R - 26 : R - 21;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s % 40 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
      ctx.stroke();
    }

    // Needle
    const frac = Math.min(kmh / 320, 1);
    const na = a0 + (a1 - a0) * frac;
    ctx.strokeStyle = '#ff5533';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(na) * 12, cy - Math.sin(na) * 12);
    ctx.lineTo(cx + Math.cos(na) * (R - 24), cy + Math.sin(na) * (R - 24));
    ctx.stroke();
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Digital readout
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(String(Math.round(kmh)), cx, cy + 44);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('KM/H', cx, cy + 58);

    // Gear
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(gear, cx, cy - 34);
    ctx.restore();
  }

  private drawMinimap(_w: number, _h: number, pos: THREE.Vector3): void {
    const ctx = this.ctx;
    const size = 170;
    const ox = 18;
    const oy = 18;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = 'rgba(10,14,20,0.6)';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 10);
    ctx.fill();

    const S = size - 28;
    ctx.translate(size / 2, size / 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.mapPts.forEach((p, i) => {
      const mx = p.x * S;
      const my = p.y * S;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.stroke();

    // Car dot
    const px =
      ((pos.x - (this.mapMin.x + this.mapMax.x) / 2) /
        Math.max(this.mapMax.x - this.mapMin.x, this.mapMax.y - this.mapMin.y)) *
      S;
    const py =
      ((pos.z - (this.mapMin.y + this.mapMax.y) / 2) /
        Math.max(this.mapMax.x - this.mapMin.x, this.mapMax.y - this.mapMin.y)) *
      S;
    ctx.fillStyle = '#ff5533';
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawTimer(w: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px ui-monospace, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmt(this.lapTime), w / 2, 42);

    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    const parts: string[] = [];
    if (this.lastLap) parts.push(`LAST ${fmt(this.lastLap)}`);
    if (this.bestLap) parts.push(`BEST ${fmt(this.bestLap)}`);
    if (parts.length) ctx.fillText(parts.join('   '), w / 2, 62);
    ctx.restore();
  }
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
