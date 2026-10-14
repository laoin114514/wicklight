export interface LoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
  fixedUpdate?: (dt: number) => void;
}

export class Loop {
  private raf = 0;
  private running = false;
  private last = 0;
  private acc = 0;
  private readonly fixedDt = 1 / 60;
  private maxDt = 0.05;

  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > this.maxDt) dt = this.maxDt;
      this.fpsAcc += dt;
      this.fpsFrames += 1;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      this.callbacks.update(dt);
      if (this.callbacks.fixedUpdate) {
        this.acc += dt;
        let guard = 0;
        while (this.acc >= this.fixedDt && guard < 5) {
          this.callbacks.fixedUpdate(this.fixedDt);
          this.acc -= this.fixedDt;
          guard += 1;
        }
      }
      this.callbacks.render(1);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Advance simulation manually (used by headless tests). */
  step(dt: number): void {
    this.callbacks.update(dt);
    if (this.callbacks.fixedUpdate) this.callbacks.fixedUpdate(this.fixedDt);
    this.callbacks.render(1);
  }
}
