import type { Camera } from './Camera';
import type { Rect } from '../systems/LevelGen';
import { distanceToRect, visibilityPolygon } from './Visibility';
import type { VisibilityPoint } from './Visibility';

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
  /** 世界坐标里的墙；每帧投到屏幕坐标，只给靠近光源的那几面算可见性。 */
  private occluders: readonly Rect[] = [];
  private screenWalls: Rect[] = [];
  /** 同一帧里同芯的多盏灯（玩家外圈 + 内芯、灯台的火 + 引怪圈）共用一份多边形。 */
  private visibilityCache = new Map<string, VisibilityPoint[]>();
  private sprite: HTMLCanvasElement | null = null;
  private glowSprite: HTMLCanvasElement | null = null;
  private spritesReady = false;
  darkness = 0.94;
  /** 光照贴图按设备像素绘制（与主画布同分辨率），避免画完再被缩放一次。 */
  private dpr = 1;
  /**
   * 贴图分辨率相对画布的倍率。手机档会降到 0.5：暗幕挖洞是一张低频的柔光，
   * 半分辨率再放大几乎看不出差别，但填充与叠加的像素只剩 1/4。
   */
  private resolutionScale = 1;
  /**
   * 暖光精灵放大时不做滤波。
   *
   * 判据是"这台设备正在走近路"：光照贴图被压到半分辨率，或者自适应已经把渲染倍率
   * 降到 1 以下——两种情况都说明帧预算紧。暖光是一张很柔的径向渐变，放大时用最近邻
   * 还是双线性，冻结同一帧逐像素比对只差 0.03/255（最大 2），
   * 但省掉一次"带滤波的整屏加法"在软件光栅化与低端 GPU 上是实打实的几毫秒。
   * 桌面满档（dpr≥1 且光照全分辨率）保持双线性——大屏上看得更仔细。
   */
  private crispGlow = false;
  /** 上一帧真正参与“照亮”的光源数量（供冒烟测试断言灯芯光源没被清空）。 */
  lastLightCount = 0;
  /** 上一帧真正落到屏幕上的光源数量（视野外的会被裁掉）。 */
  lastLitCount = 0;
  /** 上一帧因为墙而裁过可见多边形的光源数量（供复现 / 冒烟测试读）。 */
  lastShadowedCount = 0;
  /** 上一帧真正算了几次可见多边形（命中缓存的不算，供性能回归读）。 */
  lastVisibilityLookups = 0;

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

  /** 世界里的墙（`LevelGen.Rect`）。没有它时整条遮挡路径空转。 */
  setOccluders(walls: readonly Rect[]): void {
    this.occluders = walls;
  }

  /** 跟随主画布的倍率：贴图按设备像素画，主画布就不用再缩它一遍。 */
  setScale(dpr: number, resolutionScale = 1): void {
    if (dpr > 0) this.dpr = dpr;
    if (resolutionScale > 0) this.resolutionScale = resolutionScale;
    this.crispGlow = this.dpr * this.resolutionScale < 0.999;
  }

  /** 贴图实际分辨率倍率（供测试断言）。 */
  get textureScale(): number {
    return this.dpr * this.resolutionScale;
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

  /**
   * 把墙从世界坐标投到屏幕坐标。相机抖动也要算进来，否则墙画在抖、影子不抖，
   * 墙边会出现一条几像素宽的亮缝。
   *
   * 这里**不按视口裁墙**：光源本身也可能在屏外，它照进屏幕的那半圈仍会被屏幕外的墙挡住。
   * 墙本来只有十几面，逐盏灯再用半径筛一次比在这里猜"哪面墙有关"更便宜，也不会漏。
   */
  private buildScreenWalls(cam: Camera): void {
    this.screenWalls.length = 0;
    if (!this.occluders.length) return;
    for (const wall of this.occluders) {
      const p = cam.worldToScreen(wall.x, wall.y);
      const rw = wall.w * cam.zoom;
      const rh = wall.h * cam.zoom;
      this.screenWalls.push({ x: p.x, y: p.y, w: rw, h: rh });
    }
  }

  /**
   * 给一条绘制命令套上"从这盏灯看得见的地方"这块裁剪区。返回 true 时调用方要 restore。
   *
   * 只问光源半径以内碰得到的墙：影子的起点就是墙面，半径外的墙不可能吃掉这盏灯的任何像素。
   * 这也让远离墙的大多数光源（尤其是环绕火球与掉落物）完全不走射线。
   */
  private clipToVisibility(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    w: number,
    h: number,
    count: boolean,
  ): boolean {
    if (!this.screenWalls.length) return false;
    const near: Rect[] = [];
    for (const wall of this.screenWalls) {
      if (distanceToRect(x, y, wall) <= radius + 1) near.push(wall);
    }
    if (!near.length) return false;
    // 几何只跟"灯在哪儿、墙在哪儿、屏幕多大"有关，跟这盏灯多亮、多大无关。
    // 玩家每帧投内外两盏同芯灯，缓存把这份射线计算从两次压成一次。
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    let poly = this.visibilityCache.get(key);
    if (poly === undefined) {
      this.lastVisibilityLookups += 1;
      // 用全部墙而不是 `near`：同芯的另一盏灯可能半径不同，共用时不能少算一面墙。
      // 更远的墙本来就会被 `visibilityPolygon` 的边界剔除，多传十几面矩形不值得另开一套键。
      poly = visibilityPolygon(x, y, this.screenWalls, w, h);
      this.visibilityCache.set(key, poly);
    }
    if (!poly.length) return false;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.clip();
    if (count) this.lastShadowedCount += 1;
    return true;
  }

  render(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number, time: number): void {
    this.lastLightCount = this.lights.length;
    this.lastLitCount = 0;
    this.lastShadowedCount = 0;
    this.lastVisibilityLookups = 0;
    this.visibilityCache.clear();
    this.buildScreenWalls(cam);
    const sprites = this.ensureSprites();
    // Additive warm glow pass directly on the main canvas.
    // 视野外的光源白白占填充率：按屏幕坐标裁掉（留一点余量，免得边缘的灯突然消失）
    const cullPad = 8;
    const onScreen = (x: number, y: number, r: number): boolean =>
      x + r > -cullPad && y + r > -cullPad && x - r < w + cullPad && y - r < h + cullPad;
    let drawn = 0;
    if (this.glowLight.length && this.glowSprite && sprites) {
      const glow = this.glowSprite;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.crispGlow) ctx.imageSmoothingEnabled = false;
      for (const l of this.glowLight) {
        const s = cam.worldToScreen(l.x, l.y);
        const r = l.radius * cam.zoom;
        if (r <= 0 || !onScreen(s.x, s.y, r)) continue;
        const clipped = this.clipToVisibility(ctx, s.x, s.y, r, w, h, false);
        ctx.globalAlpha = l.intensity;
        ctx.drawImage(glow, s.x - r, s.y - r, r * 2, r * 2);
        if (clipped) ctx.restore();
      }
      ctx.restore();
    } else if (this.glowLight.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.glowLight) {
        const s = cam.worldToScreen(l.x, l.y);
        const r = l.radius * cam.zoom;
        if (r <= 0 || !onScreen(s.x, s.y, r)) continue;
        const clipped = this.clipToVisibility(ctx, s.x, s.y, r, w, h, false);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, `rgba(255,214,140,${0.32 * l.intensity})`);
        g.addColorStop(0.4, `rgba(255,150,60,${0.16 * l.intensity})`);
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (clipped) ctx.restore();
      }
      ctx.restore();
    }

    if (!this.ctx || !this.canvas) return;
    const c = this.canvas;
    const cctx = this.ctx;
    const tex = this.dpr * this.resolutionScale;
    const pw = Math.max(1, Math.floor(w * tex));
    const ph = Math.max(1, Math.floor(h * tex));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    // 下面所有绘制仍然写在 CSS 坐标里，倍率交给变换——和主画布的坐标约定一致。
    cctx.setTransform(tex, 0, 0, tex, 0, 0);
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
      if (r <= 0 || !onScreen(s.x, s.y, r)) continue;
      drawn += 1;
      const core = Math.min(1, l.intensity);
      const clipped = this.clipToVisibility(cctx, s.x, s.y, r, w, h, true);
      if (hole) {
        cctx.globalAlpha = core;
        cctx.drawImage(hole, s.x - r, s.y - r, r * 2, r * 2);
        if (clipped) cctx.restore();
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
      if (clipped) cctx.restore();
    }
    cctx.globalAlpha = 1;
    cctx.globalCompositeOperation = 'source-over';

    this.lastLitCount = drawn;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    try {
      // 光照贴图在手机档是半分辨率，贴回来要放大一倍。整张图全是低频柔光渐变，
      // 最近邻取样在这一层看不出来（冻结同一帧逐像素比对：均值 0.06/255、最大 2），
      // 但在软件光栅化/低端 GPU 上省掉一次整屏滤波就是 2ms 上下。
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, 0, 0, w, h);
      ctx.imageSmoothingEnabled = smooth;
    } catch {
      /* ignore */
    }
    ctx.restore();
  }
}
