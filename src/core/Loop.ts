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
  /**
   * 帧率上限（0 = 不限）。手机档给 60：屏幕 120Hz 时跑满只是把同一块画面多画一遍，
   * 白白多烧一倍的 GPU 与电，而且一半的帧在 8ms 内做完也换不来更稳的手感。
   */
  maxFps = 0;
  /** 显示器刷新率采样（前 45 个 rAF 间隔的中位数）。 */
  private samples: number[] = [];
  /** 真正生效的限帧间隔；只有刷新率是上限整数倍时才会开。 */
  private capMs = 0;
  private prevNow = 0;

  constructor(private callbacks: LoopCallbacks) {}

  /**
   * 90Hz / 144Hz 这类"不是 60 整数倍"的屏不要限帧：rAF 只能在刷新点触发，
   * 硬限 60 会让它落到 45fps，反而更卡。所以先量刷新率，只在整数倍时开限帧。
   */
  private measureCap(): void {
    if (this.maxFps <= 0) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 16.7;
    const ratio = 1000 / med / this.maxFps;
    const nearest = Math.round(ratio);
    this.capMs = nearest >= 2 && Math.abs(ratio - nearest) < 0.15 ? 1000 / this.maxFps : 0;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.prevNow = 0;
    this.samples.length = 0;
    this.capMs = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (this.prevNow) {
        const gap = now - this.prevNow;
        if (gap > 0.5 && this.samples.length < 45) {
          this.samples.push(gap);
          if (this.samples.length === 45) this.measureCap();
        }
      }
      this.prevNow = now;
      const raw = now - this.last;
      // 还没到下一帧的时间点：直接跳过这一帧（不更新、不渲染），dt 自然累到下一帧
      if (this.capMs > 0 && raw < this.capMs - 1) return;
      let dt = raw / 1000;
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
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.prevNow = 0;
  }

  /** Advance simulation manually (used by headless tests). */
  step(dt: number): void {
    this.callbacks.update(dt);
    if (this.callbacks.fixedUpdate) this.callbacks.fixedUpdate(this.fixedDt);
    this.callbacks.render(1);
  }
}
