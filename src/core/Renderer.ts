import type { PerfProfile } from './Perf';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS 像素尺寸（逻辑分辨率）。 */
  width = 1280;
  height = 720;
  /** 实际后备存储倍率：world → device 的缩放。 */
  dpr = 1;
  /** 动态分辨率倍率：1 = 用满画质上限，0.5 = 最低。 */
  scale = 1;
  /** 关掉它就是固定分辨率（设置里可切换）。 */
  adaptive = true;
  /** 每帧渲染的像素总数上限，防止 4K + dpr2 直接把 GPU/CPU 打死。 */
  pixelBudget = 3e6;
  private maxDpr = 2;
  private cssW = 1280;
  private cssH = 720;
  /** 上一次看到的设备像素比：换显示器 / 改缩放时它才会变，用来重新贴一次后备缓冲。 */
  private deviceRatio = 0;
  private probeLast = 0;
  private probeAcc = 0;
  private probeFrames = 0;
  private calm = 0;
  private warmup = 2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D context unavailable');
    this.ctx = ctx;
    canvas.width = 1280;
    canvas.height = 720;
    this.apply();
  }

  /**
   * 套用性能档位：倍率上限与像素预算都由档位给（手机档更省）。
   * 只改这两项，尺寸/倍率的重算仍旧走 apply()，所以「缓冲 = CSS × 倍率」这条约定不被破坏。
   */
  setProfile(p: PerfProfile): void {
    if (p.maxDpr === this.maxDpr && p.pixelBudget === this.pixelBudget) return;
    this.maxDpr = p.maxDpr;
    this.pixelBudget = p.pixelBudget;
    this.apply();
  }

  resize(cssW: number, cssH: number): void {
    const w = Math.max(320, Math.floor(cssW));
    const h = Math.max(240, Math.floor(cssH));
    if (w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    this.width = w;
    this.height = h;
    this.apply();
  }

  /** 用一段帧时间样本自动升降内部渲染分辨率，把帧率钉在 60fps 附近。 */
  sampleFrame(): void {
    // 拖到另一块屏 / 改浏览器缩放会改 devicePixelRatio：这时后备缓冲必须重贴一次，
    // 否则浏览器会把旧缓冲整数倍拉伸，画面整体发虚。（窗口尺寸变化走 resize()）
    const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (device !== this.deviceRatio) this.apply();
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!this.probeLast) {
      this.probeLast = now;
      return;
    }
    const dt = now - this.probeLast;
    this.probeLast = now;
    // 钳制而不是丢弃：极慢的帧（<10fps）也要能被采到，否则降分辨率永远不会触发；
    // 钳到 100ms 同时又让"切后台几秒后回来"不会污染样本。
    this.probeAcc += Math.min(dt, 100);
    this.probeFrames += 1;
    if (this.probeAcc < 450 && this.probeFrames < 24) return;
    const avg = this.probeAcc / this.probeFrames;
    this.probeAcc = 0;
    this.probeFrames = 0;
    if (!this.adaptive) {
      if (this.scale !== 1) {
        this.scale = 1;
        this.apply();
      }
      return;
    }
    if (this.warmup > 0) {
      this.warmup -= 1;
      return;
    }
    if (avg > 18 && this.scale > 0.5) {
      // 像素成本与面积近似成正比 ⇒ 理想倍率是 sqrt(目标帧时间 / 实测帧时间)
      const want = this.scale * Math.sqrt(16.5 / avg);
      const step = Math.min(this.scale - 0.05, Math.max(want, this.scale - 0.35));
      this.scale = Math.max(0.5, Math.round(step * 20) / 20);
      this.calm = 0;
      this.apply();
    } else if (avg < 13.6 && this.scale < 1) {
      this.calm += 1;
      if (this.calm >= 2) {
        this.scale = Math.min(1, Math.round((this.scale + 0.05) * 20) / 20);
        this.calm = 0;
        this.apply();
      }
    } else {
      this.calm = 0;
    }
  }

  /** 内部渲染分辨率（设备像素），供 HUD / 测试读取。 */
  get renderPixels(): number {
    return this.canvas.width * this.canvas.height;
  }

  private apply(): void {
    const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.deviceRatio = device;
    const budget = Math.sqrt(this.pixelBudget / (this.cssW * this.cssH));
    const ceiling = Math.max(0.5, Math.min(this.maxDpr, device, budget));
    const dpr = Math.max(0.4, Math.round(ceiling * this.scale * 20) / 20);
    this.dpr = dpr;
    // 这里不能因为 dpr 没变就提前返回：窗口尺寸可能变了而倍率恰好不变，
    // 那样后备缓冲会停在旧尺寸上，被 CSS 拉伸成一团糊（镜头中心也会偏）。
    // 赋值 canvas.width 会清空并重置上下文状态，所以只在真的变了的时候写。
    const bw = Math.max(1, Math.floor(this.width * dpr));
    const bh = Math.max(1, Math.floor(this.height * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    const cssW = `${this.width}px`;
    const cssH = `${this.height}px`;
    if (this.canvas.style.width !== cssW) this.canvas.style.width = cssW;
    if (this.canvas.style.height !== cssH) this.canvas.style.height = cssH;
  }

  begin(): void {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}
