/**
 * Fully procedural audio: engine (oscillators + waveshaper), tire screech and
 * wind (filtered noise). Started on first user gesture per autoplay policy.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  // Engine chain
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;

  // Skid chain
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;

  // Wind chain
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private thumpCooldown = 0;

  /** Must be called from a user gesture handler. */
  ensureStarted(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // --- Engine ---
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 1.2;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(3.2);
    shaper.oversample = '2x';

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';

    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    const gs = ctx.createGain();
    gs.gain.value = 0.65;

    this.osc1.connect(g1).connect(shaper);
    this.osc2.connect(g2).connect(shaper);
    this.sub.connect(gs).connect(this.engFilter);
    shaper.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.osc1.start();
    this.osc2.start();
    this.sub.start();

    // --- Shared noise buffer ---
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // --- Tire screech ---
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = noiseBuf;
    skidSrc.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 950;
    this.skidFilter.Q.value = 6;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc.connect(this.skidFilter).connect(this.skidGain).connect(this.master);
    skidSrc.start();

    // --- Wind ---
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 350;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();
  }

  update(rpm: number, throttle: number, slip: number, speedKmh: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.osc1 || !this.engGain || !this.engFilter) return;
    const t = ctx.currentTime;
    const smooth = (param: AudioParam, value: number, tau = 0.05) =>
      param.setTargetAtTime(value, t, tau);

    // Firing frequency ~ 4 cylinders-per-rev feel
    const f = (rpm / 60) * 2;
    smooth(this.osc1.frequency, f, 0.03);
    if (this.osc2) smooth(this.osc2.frequency, f * 0.501, 0.03);
    if (this.sub) smooth(this.sub.frequency, f * 0.25, 0.03);

    const load = 0.16 + throttle * 0.3;
    if (this.engGain) smooth(this.engGain.gain, load);
    smooth(this.engFilter.frequency, 500 + throttle * 2600 + rpm * 0.28);

    // Skid
    if (this.skidGain && this.skidFilter) {
      const skid = Math.min(Math.max(slip - 0.12, 0) * 1.6, 1) * Math.min(speedKmh / 25, 1);
      smooth(this.skidGain.gain, skid * 0.34, 0.06);
      smooth(this.skidFilter.frequency, 750 + slip * 700 + Math.sin(t * 31) * 90, 0.08);
    }

    // Wind
    if (this.windGain && this.windFilter) {
      const w = Math.min(speedKmh / 240, 1);
      smooth(this.windGain.gain, w * w * 0.5, 0.15);
      smooth(this.windFilter.frequency, 250 + w * 900, 0.2);
    }

    this.thumpCooldown = Math.max(0, this.thumpCooldown - dt);
  }

  thump(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.thumpCooldown > 0) return;
    this.thumpCooldown = 0.18;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);

    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(intensity, 1) * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 20;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}
