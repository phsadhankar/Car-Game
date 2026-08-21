const PREVENT_DEFAULT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);

export class Input {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  private rmb = false;

  mouseDX = 0;
  mouseDY = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.justPressed.add(e.code);
      this.down.add(e.code);
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.rmb = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.rmb) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  get throttle(): number {
    return this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0;
  }

  get brakeInput(): number {
    return this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0;
  }

  /** +1 = left, -1 = right */
  get steerAxis(): number {
    const l = this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0;
    const r = this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0;
    return l - r;
  }

  get handbrake(): boolean {
    return this.isDown('Space');
  }

  get lookHeld(): boolean {
    return this.rmb;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
