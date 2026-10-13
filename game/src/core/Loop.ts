/**
 * Игровой цикл с фиксированным шагом физики и интерполяцией рендера.
 * fixedUpdate вызывается ровно с шагом dt (60 Гц), update — раз за кадр
 * с alpha ∈ [0,1) для интерполяции между двумя последними шагами физики.
 */
export class Loop {
  private acc = 0;
  private last = 0;
  private running = false;
  private rafId = 0;
  /** Сглаженный FPS для HUD/отладки. */
  fps = 60;
  frameMs = 16.7;
  paused = false;

  constructor(
    private readonly fixedDt: number,
    private readonly maxSubSteps: number,
    private readonly fixedUpdate: (dt: number) => void,
    private readonly update: (dt: number, alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      const frameDt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.frameMs += (frameDt * 1000 - this.frameMs) * 0.05;
      this.fps = 1000 / Math.max(1, this.frameMs);
      if (!this.paused) {
        this.acc += frameDt;
        let steps = 0;
        while (this.acc >= this.fixedDt && steps < this.maxSubSteps) {
          this.fixedUpdate(this.fixedDt);
          this.acc -= this.fixedDt;
          steps++;
        }
        // Если не успеваем — отбрасываем хвост, чтобы не уйти в «спираль смерти».
        if (steps === this.maxSubSteps) this.acc = 0;
      }
      this.update(this.paused ? 0 : frameDt, this.acc / this.fixedDt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
