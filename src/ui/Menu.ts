export type GameMode = 'free' | 'trial';

interface MenuCallbacks {
  onStart: (mode: GameMode) => void;
  onResume: () => void;
  onSetBloom: (on: boolean) => void;
  onToggleMute: () => boolean;
}

const STYLE = `
#apex-menu { position:absolute; inset:0; z-index:20; display:flex; align-items:center;
  justify-content:center; background:rgba(6,10,16,0.55); backdrop-filter:blur(6px);
  font-family:system-ui,sans-serif; color:#eef2f7; }
#apex-menu.hidden { display:none; }
.apex-panel { text-align:center; user-select:none; }
.apex-title { font-size:64px; font-weight:800; letter-spacing:14px; margin:0 0 4px;
  color:#fff; text-shadow:0 0 24px rgba(255,90,50,0.55); }
.apex-sub { font-size:13px; letter-spacing:5px; color:#9fb0c3; margin-bottom:36px; }
.apex-btn { display:block; width:280px; margin:10px auto; padding:13px 0; font-size:15px;
  letter-spacing:3px; color:#eef2f7; background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.22); border-radius:8px; cursor:pointer; transition:all .15s; }
.apex-btn:hover { background:rgba(255,90,50,0.85); border-color:#ff5a32; transform:translateY(-1px); }
.apex-row { margin-top:26px; font-size:12px; letter-spacing:2px; color:#9fb0c3; }
.apex-toggle { display:inline-block; margin:0 14px; padding:6px 16px; cursor:pointer;
  border:1px solid rgba(255,255,255,0.25); border-radius:6px; color:#eef2f7; }
.apex-toggle.off { opacity:0.45; }
.apex-controls { display:none; margin-top:24px; font-size:13px; line-height:2;
  color:#c9d4e0; letter-spacing:1px; }
.apex-controls.show { display:block; }
.apex-controls b { color:#ffd75e; display:inline-block; width:110px; text-align:right; margin-right:12px; }
`;

/**
 * DOM overlay menu: start screen with mode select, controls reference,
 * bloom/mute toggles, and a pause variant of the same panel.
 */
export class Menu {
  private root: HTMLDivElement;
  private title: HTMLHeadingElement;
  private sub: HTMLParagraphElement;
  private startBox: HTMLDivElement;
  private resumeBtn: HTMLButtonElement;
  private controls: HTMLDivElement;
  private bloomTgl: HTMLSpanElement;
  private muteTgl: HTMLSpanElement;

  bloomOn = false;

  constructor(cb: MenuCallbacks) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'apex-menu';
    this.root.innerHTML = `
      <div class="apex-panel">
        <h1 class="apex-title">APEX DRIVE</h1>
        <p class="apex-sub">PROCEDURAL DRIVING SIMULATOR</p>
        <div class="apex-start">
          <button class="apex-btn" data-mode="trial">TIME TRIAL</button>
          <button class="apex-btn" data-mode="free">FREE ROAM</button>
        </div>
        <button class="apex-btn apex-resume" style="display:none">RESUME</button>
        <div class="apex-row">
          <span>SETTINGS</span><br/>
          <span class="apex-toggle apex-bloom">BLOOM: OFF</span>
          <span class="apex-toggle apex-mute">SOUND: ON</span>
        </div>
        <div class="apex-row"><span class="apex-controls-link" style="cursor:pointer;text-decoration:underline">CONTROLS</span></div>
        <div class="apex-controls">
          <div><b>W A S D</b> drive &amp; steer</div>
          <div><b>SPACE</b> handbrake</div>
          <div><b>R</b> reset car</div>
          <div><b>C</b> camera mode</div>
          <div><b>M</b> mute</div>
          <div><b>RMB drag</b> look around</div>
          <div><b>ESC</b> pause</div>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.title = this.root.querySelector('.apex-title')!;
    this.sub = this.root.querySelector('.apex-sub')!;
    this.startBox = this.root.querySelector('.apex-start')!;
    this.resumeBtn = this.root.querySelector('.apex-resume')!;
    this.controls = this.root.querySelector('.apex-controls')!;
    this.bloomTgl = this.root.querySelector('.apex-bloom')!;
    this.muteTgl = this.root.querySelector('.apex-mute')!;

    this.startBox.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => cb.onStart((b as HTMLButtonElement).dataset.mode as GameMode));
    });
    this.resumeBtn.addEventListener('click', () => cb.onResume());
    this.root.querySelector('.apex-controls-link')!.addEventListener('click', () => {
      this.controls.classList.toggle('show');
    });
    this.bloomTgl.addEventListener('click', () => {
      this.bloomOn = !this.bloomOn;
      this.bloomTgl.textContent = `BLOOM: ${this.bloomOn ? 'ON' : 'OFF'}`;
      this.bloomTgl.classList.toggle('off', !this.bloomOn);
      cb.onSetBloom(this.bloomOn);
    });
    this.muteTgl.addEventListener('click', () => {
      const muted = cb.onToggleMute();
      this.muteTgl.textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`;
      this.muteTgl.classList.toggle('off', muted);
    });
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Switch panel into pause layout (no mode buttons, resume instead). */
  showPause(): void {
    this.title.textContent = 'PAUSED';
    this.sub.textContent = 'TAKE A BREATH';
    this.startBox.style.display = 'none';
    this.resumeBtn.style.display = 'block';
    this.show();
  }

  /** Restore start-screen layout. */
  showStart(): void {
    this.title.textContent = 'APEX DRIVE';
    this.sub.textContent = 'PROCEDURAL DRIVING SIMULATOR';
    this.startBox.style.display = 'block';
    this.resumeBtn.style.display = 'none';
    this.show();
  }
}
