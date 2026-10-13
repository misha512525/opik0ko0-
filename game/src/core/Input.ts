/**
 * Клавиатура и мышь. Непрерывные действия читаются через isDown(),
 * разовые — через pressed() (сбрасываются в endFrame()).
 */
export class Input {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  lmb = false;
  rmb = false;
  lmbPressed = false;
  pointerLocked = false;
  /** Разрешить обзор мышью без pointer lock (отладка/автотесты). */
  freeLook = false;
  enabled = true;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.lmb = this.rmb = false;
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      }
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.freeLook) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
    });
  }

  lockPointer(): void {
    if (document.pointerLockElement !== this.element) {
      const p = this.element.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.enabled && this.justPressed.has(code);
  }

  /** Ось из двух клавиш: -1..1. */
  axis(neg: string, pos: string): number {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
  }

  /** Эмуляция нажатия для автотестов. */
  simulate(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(code)) this.justPressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  endFrame(): void {
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmbPressed = false;
  }
}
