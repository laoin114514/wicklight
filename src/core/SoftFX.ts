const TAU = Math.PI * 2;
const GLOW_SIZE = 96;
const MAX_GLOW_SPRITES = 72;
const STREAK_W = 256;
const STREAK_H = 48;
const FLAME_W = 128;
const FLAME_H = 192;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const colorCache = new Map<string, Rgba | null>();
const glowCache = new Map<string, HTMLCanvasElement | null>();
const streakCache = new Map<string, HTMLCanvasElement | null>();
const flameCache = new Map<string, HTMLCanvasElement | null>();

function parseColor(color: string): Rgba | null {
  const cached = colorCache.get(color);
  if (cached !== undefined) return cached;
  let out: Rgba | null = null;
  const hex = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const s = hex[1];
    if (s.length === 3 || s.length === 4) {
      out = {
        r: parseInt(s[0] + s[0], 16),
        g: parseInt(s[1] + s[1], 16),
        b: parseInt(s[2] + s[2], 16),
        a: s.length === 4 ? parseInt(s[3] + s[3], 16) / 255 : 1,
      };
    } else if (s.length === 6 || s.length === 8) {
      out = {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
        a: s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1,
      };
    }
  } else {
    const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (rgb) {
      const alpha = rgb[4] ? (rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])) : 1;
      out = { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
    }
  }
  colorCache.set(color, out);
  return out;
}

function rgba(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) {
    if (alpha >= 0.999) return color;
    return alpha <= 0 ? 'rgba(0,0,0,0)' : color;
  }
  return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, c.a * alpha))})`;
}

/** 把颜色往一个目标色推一点，用来做同一条火焰里由外焰到亮芯的渐变。 */
function mixColor(color: string, target: readonly [number, number, number], amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(c.r + (target[0] - c.r) * t);
  const g = Math.round(c.g + (target[1] - c.g) * t);
  const b = Math.round(c.b + (target[2] - c.b) * t);
  return `rgb(${r},${g},${b})`;
}

/** 预烘一张柔光斑。色相完全相同的粒子/火焰共用它，运行时只做一次缩放贴图。 */
function glowSprite(color: string): HTMLCanvasElement | null {
  if (glowCache.has(color)) return glowCache.get(color) ?? null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    glowCache.set(color, null);
    return null;
  }
  try {
    const c = document.createElement('canvas');
    c.width = GLOW_SIZE;
    c.height = GLOW_SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) {
      glowCache.set(color, null);
      return null;
    }
    const mid = GLOW_SIZE / 2;
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    // 没有平台期的衰减：中心也不再是纯色实心点。多层加法叠在一起时，
    // 这一点差别会把“贴纸亮团”变成有厚度、会向夜色里化开的光。
    g.addColorStop(0, rgba(color, 0.9));
    g.addColorStop(0.08, rgba(color, 0.82));
    g.addColorStop(0.24, rgba(color, 0.48));
    g.addColorStop(0.48, rgba(color, 0.18));
    g.addColorStop(0.72, rgba(color, 0.045));
    g.addColorStop(0.9, rgba(color, 0.008));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    if (glowCache.size >= MAX_GLOW_SPRITES) {
      const oldest = glowCache.keys().next().value;
      if (oldest) glowCache.delete(oldest);
    }
    glowCache.set(color, c);
    return c;
  } catch {
    glowCache.set(color, null);
    return null;
  }
}

/**
 * 预烘一条横向光带。中心亮、上下两侧透明，左右端各自淡出；再叠几十道细碎亮丝，
 * 让它放大成光束后不是一块纯色矩形，而是有颗粒、有呼吸的空气光。
 */
function streakSprite(color: string): HTMLCanvasElement | null {
  if (streakCache.has(color)) return streakCache.get(color) ?? null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    streakCache.set(color, null);
    return null;
  }
  try {
    const c = document.createElement('canvas');
    c.width = STREAK_W;
    c.height = STREAK_H;
    const ctx = c.getContext('2d');
    if (!ctx) {
      streakCache.set(color, null);
      return null;
    }
    let seed = 0x811c9dc5;
    for (let i = 0; i < color.length; i += 1) seed = Math.imul(seed ^ color.charCodeAt(i), 16777619) >>> 0;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 跨宽度方向一次铺出柔边：中央不是硬白线，而是从色芯向上下自然消失。
    const h = ctx.createLinearGradient(0, 0, STREAK_W, 0);
    h.addColorStop(0, rgba(color, 0));
    h.addColorStop(0.035, rgba(color, 0.16));
    h.addColorStop(0.12, rgba(color, 0.92));
    h.addColorStop(0.88, rgba(color, 0.86));
    h.addColorStop(0.965, rgba(color, 0.14));
    h.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = h;
    for (let y = 0; y < STREAK_H; y += 1) {
      const v = ((y + 0.5) / STREAK_H) * 2 - 1;
      const core = Math.exp(-v * v * 6.8);
      const haze = Math.exp(-v * v * 2.05) * 0.26;
      ctx.globalAlpha = Math.min(1, (core + haze) * (0.82 + rnd() * 0.18));
      ctx.fillRect(0, y, STREAK_W, 1);
    }

    // 细碎亮丝：只放在中段，左右各自按端部淡出，避免贴图在拉伸后出现裁切边。
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    for (let i = 0; i < 38; i += 1) {
      const x = STREAK_W * (0.08 + rnd() * 0.84);
      const y = STREAK_H * (0.5 + (rnd() - 0.5) * 0.34);
      const len = 10 + rnd() * 74;
      const thick = 0.6 + rnd() * 2.8;
      const edge = Math.min(1, x / (STREAK_W * 0.1), (STREAK_W - x) / (STREAK_W * 0.1));
      ctx.globalAlpha = (0.035 + rnd() * 0.1) * Math.max(0, edge);
      ctx.beginPath();
      ctx.ellipse(x, y, len * 0.5, thick * 0.5, 0, 0, TAU);
      ctx.fill();
    }

    if (streakCache.size >= MAX_GLOW_SPRITES) {
      const oldest = streakCache.keys().next().value;
      if (oldest) streakCache.delete(oldest);
    }
    streakCache.set(color, c);
    return c;
  } catch {
    streakCache.set(color, null);
    return null;
  }
}

/**
 * 预烘一朵向上收束的火焰。
 *
 * 火焰由许多**彼此重叠的径向软斑**组成，而不是一排横向实心切片：
 * 外焰负责轮廓和空气里的橙色余辉，内焰只负责中心那一小段暖白。
 * 每团软斑从中心向外连续衰减到全透明，所以放大后也没有可数的硬边；
 * 底边中心仍是火根，运行时只做一次缩放贴图。
 */
function flameSprite(color: string): HTMLCanvasElement | null {
  if (flameCache.has(color)) return flameCache.get(color) ?? null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    flameCache.set(color, null);
    return null;
  }
  try {
    const c = document.createElement('canvas');
    c.width = FLAME_W;
    c.height = FLAME_H;
    const ctx = c.getContext('2d');
    if (!ctx) {
      flameCache.set(color, null);
      return null;
    }
    let seed = 0x9e3779b9;
    for (let i = 0; i < color.length; i += 1) seed = Math.imul(seed ^ color.charCodeAt(i), 16777619) >>> 0;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.globalCompositeOperation = 'lighter';
    const outer = mixColor(color, [255, 92, 20], 0.18);
    const middle = mixColor(color, [255, 168, 64], 0.42);
    const hot = mixColor(color, [255, 244, 206], 0.72);
    const bottom = FLAME_H - 5;
    const driftAt = (u: number): number =>
      FLAME_W *
      (0.072 * Math.sin(u * 6.2 + seed * 0.00013) + 0.024 * Math.sin(u * 16.7 + seed * 0.00031)) *
      Math.pow(u, 1.28);

    /** 一团中心亮、四周完全化开的椭圆光。缩放后只画一个单位圆，边缘没有第二次硬裁切。 */
    const blob = (x: number, y: number, rx: number, ry: number, paint: string, alpha: number): void => {
      if (rx <= 0.2 || ry <= 0.2 || alpha <= 0.001) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba(paint, alpha));
      g.addColorStop(0.18, rgba(paint, alpha * 0.86));
      g.addColorStop(0.48, rgba(paint, alpha * 0.38));
      g.addColorStop(0.76, rgba(paint, alpha * 0.09));
      g.addColorStop(1, rgba(paint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    // 外焰：十八团软斑沿一条会摆动的中心线往上排，轮廓的最高点自己收尖。
    const steps = 18;
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const taper = Math.pow(1 - u, 0.7);
      const breathe = 0.86 + 0.14 * Math.sin(u * 23 + seed * 0.0007);
      const cx = FLAME_W * 0.5 + driftAt(u);
      const cy = bottom - u * (FLAME_H - 12);
      const width = (FLAME_W * 0.17 * taper + 1.2) * breathe;
      blob(cx, cy, width * 1.8, FLAME_H * (0.037 + 0.021 * taper), outer, 0.125 + 0.045 * taper);
      if (u > 0.06 && u < 0.84) {
        const side = Math.sin(u * 10.4 + seed * 0.00021);
        blob(cx + side * width * 0.9, cy + 1.4, width * 0.72, FLAME_H * 0.032, middle, 0.06);
      }
    }

    // 火根与侧舌：用更大的低透明光把地面接住，避免火像从空气里突然出现。
    blob(FLAME_W * 0.5, bottom - FLAME_H * 0.03, FLAME_W * 0.36, FLAME_H * 0.09, middle, 0.16);
    blob(FLAME_W * 0.46, bottom - FLAME_H * 0.11, FLAME_W * 0.24, FLAME_H * 0.075, outer, 0.13);
    for (let i = 0; i < 4; i += 1) {
      const u = 0.22 + i * 0.13;
      const cx = FLAME_W * 0.5 + driftAt(u);
      const side = i % 2 === 0 ? 1 : -1;
      blob(cx + side * FLAME_W * (0.075 + rnd() * 0.035), bottom - u * FLAME_H, FLAME_W * 0.055, FLAME_H * 0.055, middle, 0.065);
    }

    // 内焰：更细、更短、更暖白，只在中心附近叠出速度感。
    const innerSteps = 14;
    for (let i = 0; i <= innerSteps; i += 1) {
      const u = 0.04 + (i / innerSteps) * 0.72;
      const taper = Math.pow(1 - u, 0.82);
      const cx = FLAME_W * 0.5 + driftAt(u) * 0.72 + Math.sin(u * 17 + seed * 0.00017) * FLAME_W * 0.012;
      const cy = bottom - u * FLAME_H * 0.82;
      const width = FLAME_W * 0.055 * taper + 0.8;
      blob(cx, cy, width * 1.18, FLAME_H * 0.034, hot, 0.11 + 0.05 * taper);
    }
    blob(FLAME_W * 0.5, bottom - 6, FLAME_W * 0.105, FLAME_H * 0.045, hot, 0.24);

    // 零星飞起的火星：仍是软光点，不画成纸屑。
    for (let i = 0; i < 11; i += 1) {
      const u = 0.18 + rnd() * 0.7;
      const x = FLAME_W * 0.5 + (rnd() - 0.5) * FLAME_W * 0.22 * (1 - u);
      const y = bottom - u * FLAME_H * 0.86;
      blob(x, y, 0.8 + rnd() * 1.9, 0.8 + rnd() * 2.1, i % 3 === 0 ? hot : middle, 0.1 + rnd() * 0.13);
    }

    if (flameCache.size >= MAX_GLOW_SPRITES) {
      const oldest = flameCache.keys().next().value;
      if (oldest) flameCache.delete(oldest);
    }
    flameCache.set(color, c);
    return c;
  } catch {
    flameCache.set(color, null);
    return null;
  }
}

/**
 * 一团没有硬边的加法光。`rx/ry` 分开是为了让火星、尾迹和火舌也能用同一张纹理。
 * 调用方负责设置 `globalCompositeOperation`；这里只负责画一笔柔光。
 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
  rotation = 0,
): void {
  if (alpha <= 0 || rx <= 0 || ry <= 0) return;
  const sprite = glowSprite(color);
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.min(1, alpha);
  if (sprite) {
    if (rotation === 0) {
      // 绝大多数火星/火焰没有旋转。直接给目标坐标，省掉每团光一次 save/translate/restore。
      ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(sprite, -rx, -ry, rx * 2, ry * 2);
      ctx.restore();
    }
  } else {
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
    }
    let g: CanvasGradient | undefined;
    try {
      const cx = rotation === 0 ? x : 0;
      const cy = rotation === 0 ? y : 0;
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      if (g && typeof g.addColorStop === 'function') {
        g.addColorStop(0, rgba(color, 1));
        g.addColorStop(0.42, rgba(color, 0.42));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = rgba(color, 0.5);
      }
    } catch {
      ctx.fillStyle = rgba(color, 0.5);
    }
    ctx.beginPath();
    ctx.ellipse(rotation === 0 ? x : 0, rotation === 0 ? y : 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    if (rotation !== 0) ctx.restore();
  }
  ctx.globalAlpha = previousAlpha;
}

/**
 * 用径向色带画一圈"被推开的空气"。宽而透明的彩色外沿 + 窄一些的亮缘，
 * 圆心附近保持透明，不会像实心圆那样把地面糊住。
 */
export function drawSoftRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  thickness: number,
  color: string,
  alpha: number,
  arcStart = 0,
  arcEnd = TAU,
  hotColor?: string,
  hotAlpha = 0,
): void {
  if (alpha <= 0 || radius <= 0 || thickness <= 0) return;
  const inner = Math.max(0, radius - thickness * 1.6);
  const outer = radius + thickness * 2.2;
  const span = Math.max(0.001, outer - inner);
  const peak = Math.max(0.02, Math.min(0.96, (radius - inner) / span));
  const band = (tint: string, strength: number): CanvasGradient | null => {
    try {
      const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
      if (!g || typeof g.addColorStop !== 'function') return null;
      g.addColorStop(0, rgba(tint, 0));
      g.addColorStop(Math.max(0, peak - 0.46), rgba(tint, 0.004 * strength));
      g.addColorStop(Math.max(0, peak - 0.3), rgba(tint, 0.03 * strength));
      g.addColorStop(Math.max(0, peak - 0.16), rgba(tint, 0.1 * strength));
      g.addColorStop(Math.max(0, peak - 0.07), rgba(tint, 0.22 * strength));
      g.addColorStop(peak, rgba(tint, 0.38 * strength));
      g.addColorStop(Math.min(1, peak + 0.08), rgba(tint, 0.22 * strength));
      g.addColorStop(Math.min(1, peak + 0.2), rgba(tint, 0.085 * strength));
      g.addColorStop(Math.min(1, peak + 0.36), rgba(tint, 0.022 * strength));
      g.addColorStop(1, rgba(tint, 0));
      return g;
    } catch {
      return null;
    }
  };
  const g = band(color, 1);
  const hot = hotColor && hotAlpha > 0 ? band(hotColor, 1) : null;

  const arcSpan = arcEnd - arcStart;
  if (Math.abs(arcSpan) < TAU - 0.0001) {
    // 扇形不能用径向渐变直接裁一个楔形：两条半径会在画面里留下锋利的直边。
    // 先留一条极淡的连续弧做骨，再沿弧线铺一串切向软斑；端头自然淡出，
    // 弧身仍有连续被推开的空气感，放大后也看不出软斑之间的间隔。
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 0.07);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.6, thickness * 0.16);
    ctx.beginPath();
    ctx.arc(x, y, radius, arcStart, arcEnd);
    ctx.stroke();
    ctx.restore();
    const steps = Math.max(10, Math.ceil(Math.abs(arcSpan) / 0.14));
    for (let i = 0; i < steps; i += 1) {
      const u = (i + 0.5) / steps;
      const angle = arcStart + arcSpan * u;
      const taper = Math.pow(Math.sin(Math.PI * u), 0.38);
      const breathe = 0.82 + 0.18 * Math.sin(i * 2.31 + arcStart * 1.7);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      drawGlow(
        ctx,
        px,
        py,
        thickness * (0.82 + 0.18 * breathe),
        thickness * (0.26 + 0.08 * breathe),
        color,
        alpha * 0.2 * taper * breathe,
        angle + Math.PI / 2,
      );
      if (hotColor && hotAlpha > 0) {
        drawGlow(
          ctx,
          px,
          py,
          thickness * 0.42,
          thickness * 0.1,
          hotColor,
          hotAlpha * 0.16 * taper,
          angle + Math.PI / 2,
        );
      }
    }
    return;
  }

  ctx.save();
  if (arcStart !== 0 || arcEnd < TAU - 0.0001) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, outer, arcStart, arcEnd);
    ctx.closePath();
    ctx.clip();
  }
  ctx.globalAlpha = Math.min(1, alpha);
  if (g) {
    ctx.fillStyle = g;
    ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
  }
  if (hot) {
    ctx.globalAlpha = Math.min(1, hotAlpha);
    ctx.fillStyle = hot;
    ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
  }
  ctx.restore();
}

/** 沿两点之间铺一条纹理化的柔光带；调用方负责设置加法混合。 */
export function drawStreak(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0 || width <= 0) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const sprite = streakSprite(color);
  const prevAlpha = ctx.globalAlpha;
  if (!sprite) {
    const n = Math.max(2, Math.ceil(len / 26));
    for (let i = 0; i <= n; i += 1) {
      const u = i / n;
      drawGlow(ctx, x1 + dx * u, y1 + dy * u, width * 0.55, width * 0.22, color, alpha, Math.atan2(dy, dx));
    }
    return;
  }
  ctx.save();
  ctx.translate(x1 + dx * 0.5, y1 + dy * 0.5);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, -len * 0.5, -width * 0.5, len, width);
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
}

/**
 * 一朵从 (x, y) 火根向上生长的火焰。`width/height` 是贴图外框；
 * `lean` 是火尖相对火根的水平偏移，用来保持原有的风摆方向。
 */
export function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  alpha: number,
  lean = 0,
): void {
  if (alpha <= 0 || width <= 0 || height <= 0) return;
  const sprite = flameSprite(color);
  if (!sprite) {
    drawGlow(ctx, x + lean * 0.35, y - height * 0.35, width * 0.42, height * 0.34, color, alpha);
    drawGlow(ctx, x + lean * 0.65, y - height * 0.62, width * 0.22, height * 0.2, color, alpha * 0.8);
    return;
  }
  const previousAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.translate(x, y);
  if (lean !== 0) ctx.rotate(-Math.atan2(lean, height));
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, -width * 0.5, -height, width, height);
  ctx.restore();
  ctx.globalAlpha = previousAlpha;
}

/** 仅供测试/热重载：让颜色或 DPR 变化后重新烘纹理。 */
export function clearSoftFXCaches(): void {
  colorCache.clear();
  glowCache.clear();
  streakCache.clear();
  flameCache.clear();
}
