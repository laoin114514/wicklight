import type { Camera } from './Camera';

interface Light {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  flicker: number;
}

export class LightSystem {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lights: Light[] = [];
  private glowLight: Light[] = [];
  private sprite: HTMLCanvasElement | null = null;
  private glowSprite: HTMLCanvasElement | null = null;
  private spritesReady = false;
  darkness = 0.94;
  /** 光照贴图按设备像素绘制（与主画布同分辨率），避免画完再被缩放一次。 */
  private dpr = 1;
  /** 上一帧真正参与“照亮”的光源数量（供冒烟测试断言灯芯光源没被清空）。 */
  lastLightCount = 0;

  constructor() {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const c = document.createElement('canvas');
        this.canvas = c;
        this.ctx = c.getContext('2d');
      } catch {
        this.canvas = null;
        this.ctx = null;
      }
    }
  }

  setDarkness(v: number): void {
    this.darkness = v;
  }

  /** 跟随主画布的倍率：贴图按设备像素画，主画布就不用再缩它一遍。 */
  setScale(dpr: number): void {
    if (dpr > 0) this.dpr = dpr;
  }

  begin(): void {
    this.lights.length = 0;
    this.glowLight.length = 0;
  }

  addLight(x: number, y: number, radius: number, intensity = 1, flicker = 0): void {
    this.lights.push({ x, y, radius, intensity, flicker });
  }

  addGlow(x: number, y: number, radius: number, intensity = 1): void {
    this.glowLight.push({ x, y, radius, intensity, flicker: 0 });
  }

  get available(): boolean {
    return !!this.ctx;
  }

  /**
   * 预烘焙两张径向光斑（暗幕挖洞用 / 暖光叠加用）。
   * 光衰减曲线是固定形状，强度只影响整体 alpha，所以可以整张缩放贴图，
   * 省掉每盏灯每帧的 createRadialGradient + 圆弧路径填充。
   */
  private ensureSprites(): boolean {
    if (this.spritesReady) return !!this.sprite && !!this.glowSprite;
    this.spritesReady = true;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
    const R = 256;
    try {
      const hole = document.createElement('canvas');
      hole.width = R;
      hole.height = R;
      const hc = hole.getContext('2d');
      if (!hc) return false;
      const hg = hc.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R / 2);
      hg.addColorStop(0, 'rgba(0,0,0,1)');
      hg.addColorStop(0.5, 'rgba(0,0,0,0.94)');
      hg.addColorStop(0.76, 'rgba(0,0,0,0.66)');
      hg.addColorStop(0.9, 'rgba(0,0,0,0.26)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      hc.fillStyle = hg;
      hc.fillRect(0, 0, R, R);
      this.sprite = hole;

      const glow = document.createElement('canvas');
      glow.width = R;
      glow.height = R;
      const gc = glow.getContext('2d');
      if (!gc) return false;
      const gg = gc.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R / 2);
      gg.addColorStop(0, 'rgba(255,214,140,0.32)');
      gg.addColorStop(0.4, 'rgba(255,150,60,0.16)');
      gg.addColorStop(1, 'rgba(255,120,30,0)');
      gc.fillStyle = gg;
      gc.fillRect(0, 0, R, R);
      this.glowSprite = glow;
      return true;
    } catch {
      this.sprite = null;
      this.glowSprite = null;
      return false;
    }
  }

  render(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number, time: number): void {
    this.lastLightCount = this.lights.length;
    const sprites = this.ensureSprites();
    // Additive warm glow pass directly on the main canvas.
    if (this.glowLight.length && this.glowSprite && sprites) {
      const glow = this.glowSprite;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.glowLight) {
        const s = cam.worldToScreen(l.x, l.y);
        const r = l.radius * cam.zoom;
        if (r <= 0) continue;
        ctx.globalAlpha = l.intensity;
        ctx.drawImage(glow, s.x - r, s.y - r, r * 2, r * 2);
      }
      ctx.restore();
    } else if (this.glowLight.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.glowLight) {
        const s = cam.worldToScreen(l.x, l.y);
        const r = l.radius * cam.zoom;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, `rgba(255,214,140,${0.32 * l.intensity})`);
        g.addColorStop(0.4, `rgba(255,150,60,${0.16 * l.intensity})`);
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (!this.ctx || !this.canvas) return;
    const c = this.canvas;
    const cctx = this.ctx;
    const pw = Math.max(1, Math.floor(w * this.dpr));
    const ph = Math.max(1, Math.floor(h * this.dpr));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    // 下面所有绘制仍然写在 CSS 坐标里，倍率交给变换——和主画布的坐标约定一致。
    cctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    cctx.clearRect(0, 0, w, h);
    cctx.fillStyle = `rgba(3,4,11,${this.darkness})`;
    cctx.fillRect(0, 0, w, h);

    cctx.globalCompositeOperation = 'destination-out';
    const hole = sprites ? this.sprite : null;
    for (const l of this.lights) {
      const s = cam.worldToScreen(l.x, l.y);
      const flicker = l.flicker > 0 ? 1 + Math.sin(time * 9 + l.x * 0.05) * l.flicker : 1;
      const r = l.radius * cam.zoom * flicker;
      if (r <= 0) continue;
      const core = Math.min(1, l.intensity);
      if (hole) {
        cctx.globalAlpha = core;
        cctx.drawImage(hole, s.x - r, s.y - r, r * 2, r * 2);
        continue;
      }
      const g = cctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      // 更"实"的边界：亮的地方足够亮，暗的地方迅速吃掉，形成明确的威胁圈
      g.addColorStop(0, `rgba(0,0,0,${core})`);
      g.addColorStop(0.5, `rgba(0,0,0,${core * 0.94})`);
      g.addColorStop(0.76, `rgba(0,0,0,${core * 0.66})`);
      g.addColorStop(0.9, `rgba(0,0,0,${core * 0.26})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cctx.fillStyle = g;
      cctx.beginPath();
      cctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.globalAlpha = 1;
    cctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    try {
      ctx.drawImage(c, 0, 0, w, h);
    } catch {
      /* ignore */
    }
    ctx.restore();
  }
}
