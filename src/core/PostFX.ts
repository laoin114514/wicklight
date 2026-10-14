import type { Settings } from './Settings';
import type { PerfProfile } from './Perf';

interface Band {
  y: number;
  h: number;
  dx: number;
  life: number;
  color: string;
}

export class PostFX {
  private vh = 0;
  private shade: HTMLCanvasElement | null = null;
  private sizeKey = '';
  private gradeCache: {
    ctx: CanvasRenderingContext2D;
    px: number;
    py: number;
    w: number;
    h: number;
    strength: number;
    grad: CanvasGradient;
  } | null = null;
  private bands: Band[] = [];
  private grainSeed = 0;
  private scanCanvas: HTMLCanvasElement | null = null;
  private dangerVignette: CanvasGradient | null = null;
  danger = 0;
  private bloomA: HTMLCanvasElement | null = null;
  private bloomB: HTMLCanvasElement | null = null;
  private bloomACtx: CanvasRenderingContext2D | null = null;
  private bloomBCtx: CanvasRenderingContext2D | null = null;
  private bloomW = 0;
  private bloomH = 0;
  private bloomHalf: HTMLCanvasElement | null = null;
  private bloomHalfCtx: CanvasRenderingContext2D | null = null;

  /** 泛光档位：降采样倍数与叠加层数由性能档位给（手机档更省）。 */
  private bloomDivisor = 4;
  private bloomPasses = 2;

  constructor(private settings: Settings) {}

  setProfile(p: PerfProfile): void {
    this.bloomDivisor = p.bloomDivisor;
    this.bloomPasses = p.bloomPasses;
  }

  private buildOverlays(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.vh = h;
    if (!this.scanCanvas && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const cctx = c.getContext('2d');
      if (cctx) {
        cctx.fillStyle = 'rgba(0,0,0,0.22)';
        cctx.fillRect(0, 4, 8, 1);
      }
      this.scanCanvas = c;
    }
    // 濒死红晕：从画面边缘向内渗，而不是给屏幕套一个红框
    const dg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.66);
    dg.addColorStop(0, 'rgba(255,20,50,0)');
    dg.addColorStop(0.55, 'rgba(200,10,40,0.3)');
    dg.addColorStop(0.85, 'rgba(170,5,35,0.62)');
    dg.addColorStop(1, 'rgba(140,0,25,0.8)');
    this.dangerVignette = dg;
  }

  /** 低分辨率两级泛光：让火焰、闪电、提灯与爆炸真正“发光”。 */
  applyBloom(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.bloomPasses <= 0 || !this.settings.data.bloom) return;
    const src = this.bloomSource(ctx, w, h);
    if (!src) return;
    // 两次整屏叠加是这个效果里最贵的一步，所以低配只叠一次（视觉上只差外圈一点点）
    this.bloomComposite(ctx, w, h, src.bw, src.bh, this.bloomPasses);
  }

  /** 把主画布压到 1/4 分辨率、自乘一次，得到只剩余亮的泛光源。 */
  private bloomSource(ctx: CanvasRenderingContext2D, w: number, h: number): { bw: number; bh: number } | null {
    const bw = Math.max(1, Math.round(w / this.bloomDivisor));
    const bh = Math.max(1, Math.round(h / this.bloomDivisor));
    if (typeof document === 'undefined') return null;
    if (!this.bloomA || this.bloomW !== bw || this.bloomH !== bh) {
      try {
        this.bloomA = this.bloomA ?? document.createElement('canvas');
        this.bloomB = this.bloomB ?? document.createElement('canvas');
        this.bloomA.width = bw;
        this.bloomA.height = bh;
        this.bloomB.width = bw;
        this.bloomB.height = bh;
        this.bloomACtx = this.bloomA.getContext('2d');
        this.bloomBCtx = this.bloomB.getContext('2d');
        this.bloomW = bw;
        this.bloomH = bh;
      } catch {
        this.bloomA = null;
        return null;
      }
    }
    const a = this.bloomACtx;
    const b = this.bloomBCtx;
    if (!a || !b || !this.bloomA || !this.bloomB) return null;
    const source = ctx.canvas;
    if (!source) return null;
    const srcW = source.width;
    const srcH = source.height;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, bw, bh);
    a.drawImage(source, 0, 0, srcW, srcH, 0, 0, bw, bh);
    // 自乘一次，压掉暗部，只留下亮部泛光
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, bw, bh);
    b.drawImage(this.bloomA, 0, 0, bw, bh, 0, 0, bw, bh);
    b.globalCompositeOperation = 'multiply';
    b.drawImage(this.bloomA, 0, 0, bw, bh, 0, 0, bw, bh);
    return { bw, bh };
  }

  /**
   * 把泛光源叠回主画布。passes=2（高画质）叠两层得到更宽更柔的光晕，passes=1 只叠一层。
   * 两次加法叠加可以现在半分辨率小图上合起来、再整屏加一次 —— 加法可结合，
   * 于是整屏"读改写"少一次（这是整个后处理里最贵的一步）。
   */
  private bloomComposite(ctx: CanvasRenderingContext2D, w: number, h: number, bw: number, bh: number, passes: number): void {
    const b = this.bloomB;
    if (!b) return;
    const hw = Math.max(1, Math.round(w / 2));
    const hh = Math.max(1, Math.round(h / 2));
    if (typeof document !== 'undefined' && (!this.bloomHalf || this.bloomHalf.width !== hw || this.bloomHalf.height !== hh)) {
      try {
        const c = document.createElement('canvas');
        c.width = hw;
        c.height = hh;
        this.bloomHalf = c;
        this.bloomHalfCtx = c.getContext('2d');
      } catch {
        this.bloomHalf = null;
        this.bloomHalfCtx = null;
      }
    }
    const hc = this.bloomHalfCtx;
    if (hc && this.bloomHalf) {
      hc.setTransform(1, 0, 0, 1, 0, 0);
      hc.globalCompositeOperation = 'source-over';
      hc.globalAlpha = 1;
      hc.clearRect(0, 0, hw, hh);
      hc.globalCompositeOperation = 'lighter';
      if (passes >= 2) {
        hc.globalAlpha = 0.5;
        hc.drawImage(b, 0, 0, bw, bh, 0, 0, hw, hh);
        hc.globalAlpha = 0.28;
        hc.drawImage(b, 0, 0, bw, bh, -hw * 0.03, -hh * 0.03, hw * 1.06, hh * 1.06);
      } else {
        hc.globalAlpha = 0.78;
        hc.drawImage(b, 0, 0, bw, bh, -hw * 0.015, -hh * 0.015, hw * 1.03, hh * 1.03);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.bloomHalf, 0, 0, hw, hh, 0, 0, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (passes >= 2) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(b, 0, 0, bw, bh, 0, 0, w, h);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(b, 0, 0, bw, bh, -w * 0.03, -h * 0.03, w * 1.06, h * 1.06);
    } else {
      ctx.globalAlpha = 0.78;
      ctx.drawImage(b, 0, 0, bw, bh, -w * 0.015, -h * 0.015, w * 1.03, h * 1.03);
    }
    ctx.restore();
  }

  /** 暖色分级：在灯火最亮处叠加一层很轻的橙光，让画面"暖",暗部相对偏冷。 */
  applyGrade(ctx: CanvasRenderingContext2D, w: number, h: number, px: number, py: number, strength = 1): void {
    if (strength <= 0) return;
    const cached = this.gradeCache;
    let g: CanvasGradient;
    if (
      cached &&
      cached.ctx === ctx &&
      cached.px === px &&
      cached.py === py &&
      cached.w === w &&
      cached.h === h &&
      cached.strength === strength
    ) {
      g = cached.grad;
    } else {
      const r = Math.min(w, h) * 0.64;
      g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,174,96,${(0.05 * strength).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(255,138,62,${(0.018 * strength).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      this.gradeCache = { ctx, px, py, w, h, strength, grad: g };
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ensureSize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const m = ctx.getTransform();
    const key = `${w}x${h}@${m.a.toFixed(2)}x${m.d.toFixed(2)}#${this.settings.data.quality}#${this.bloomDivisor}`;
    if (this.sizeKey === key) return;
    this.sizeKey = key;
    this.buildOverlays(ctx, w, h);
    this.buildShade(ctx, w, h, m.a, m.d);
  }

  /**
   * 把"扫描线 + 冷色暗角"两次全屏混合合并成一张预乘好的遮盖层，之后每帧只做一次 multiply 贴图。
   * 两次乘算可以合并：先白底压出扫描线，再用原来那条暗角渐变以 multiply 叠上去，
   * 得到的像素值就是"最终乘数"，直接 multiply 回去与原实现数学等价（逐通道）。
   */
  private buildShade(ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number): void {
    this.shade = null;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const dw = Math.max(1, Math.round(w * Math.abs(sx) || w));
    const dh = Math.max(1, Math.round(h * Math.abs(sy) || h));
    try {
      const c = document.createElement('canvas');
      c.width = dw;
      c.height = dh;
      const cc = c.getContext('2d');
      if (!cc) return;
      cc.fillStyle = '#ffffff';
      cc.fillRect(0, 0, dw, dh);
      if (this.scanCanvas && this.settings.data.quality !== 'low') {
        const pat = cc.createPattern(this.scanCanvas, 'repeat');
        if (pat) {
          cc.save();
          cc.setTransform(Math.abs(sx) || 1, 0, 0, Math.abs(sy) || 1, 0, 0);
          cc.globalAlpha = 0.05;
          cc.fillStyle = pat;
          cc.fillRect(0, 0, w, h);
          cc.restore();
        }
      }
      cc.save();
      cc.globalCompositeOperation = 'multiply';
      const rg = cc.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.26, dw / 2, dh / 2, Math.max(dw, dh) * 0.74);
      rg.addColorStop(0, 'rgba(255,255,255,0)');
      rg.addColorStop(0.5, 'rgba(172,190,232,0.28)');
      rg.addColorStop(0.8, 'rgba(86,106,168,0.64)');
      rg.addColorStop(1, 'rgba(26,32,62,0.9)');
      cc.fillStyle = rg;
      cc.fillRect(0, 0, dw, dh);
      cc.restore();
      this.shade = c;
    } catch {
      this.shade = null;
    }
    void ctx;
  }

  triggerGlitch(intensity = 1): void {
    const count = Math.round(2 + intensity * 5);
    const palette = ['#ff5a3c', '#3cf0ff', '#ffd24e'];
    for (let i = 0; i < count; i += 1) {
      this.bands.push({
        y: Math.random() * this.vh,
        h: 4 + Math.random() * 40,
        dx: (Math.random() * 2 - 1) * 18 * intensity,
        life: 0.14 + Math.random() * 0.2,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  update(dt: number): void {
    this.grainSeed += dt * 60;
    for (let i = this.bands.length - 1; i >= 0; i -= 1) {
      this.bands[i].life -= dt;
      if (this.bands[i].life <= 0) this.bands.splice(i, 1);
    }
  }

  applyMain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ensureSize(ctx, w, h);
    const motion = this.settings.motionScale;
    if (motion > 0 && this.bands.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bands) {
        ctx.globalAlpha = 0.18 * motion;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.dx, b.y, w, b.h);
      }
      ctx.restore();
    }
    if (this.shade) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.shade, 0, 0, w, h);
      ctx.restore();
    }
    if (this.danger > 0.02 && this.dangerVignette) {
      const pulse = 0.55 + 0.45 * Math.sin(this.grainSeed * 0.35);
      ctx.save();
      ctx.globalAlpha = Math.min(0.8, this.danger * (0.3 + 0.32 * pulse) * (0.4 + 0.6 * motion));
      ctx.fillStyle = this.dangerVignette;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
