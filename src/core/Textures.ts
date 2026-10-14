/**
 * Runtime bitmap texture generator.
 *
 * The art direction calls for textured floors/ground rather than flat fills.
 * External AI-generated bitmaps are optional; when they are unavailable these
 * procedural, tileable bitmap textures are baked into offscreen canvases at
 * boot and reused as CanvasPattern fills, so the game stays fully offline.
 */

export interface Texture {
  canvas: HTMLCanvasElement;
  size: number;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

/** Tileable speckled ground texture. */
export function makeGroundTexture(size: number, base: string, speck: string, density = 0.05, contrast = 26): Texture | null {
  const made = makeCanvas(size);
  if (!made) return null;
  const { canvas, ctx } = made;
  const [r, g, b] = hexToRgb(base);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  const [sr, sg, sb] = hexToRgb(speck);
  const dots = Math.floor(size * size * density);
  for (let i = 0; i < dots; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const t = Math.random();
    const rr = Math.round(r + (sr - r) * t + (Math.random() * 2 - 1) * contrast);
    const gg = Math.round(g + (sg - g) * t + (Math.random() * 2 - 1) * contrast);
    const bb = Math.round(b + (sb - b) * t + (Math.random() * 2 - 1) * contrast);
    ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, rr))},${Math.max(0, Math.min(255, gg))},${Math.max(0, Math.min(255, bb))},0.5)`;
    const s = Math.random() < 0.85 ? 1 : 2;
    ctx.fillRect(x, y, s, s);
  }
  // 大块柔和斑驳，让地面更像泥土/石面而不是电视雪花
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 8 + Math.random() * 26;
    const dark = Math.random() < 0.6;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, dark ? 'rgba(0,0,0,0.16)' : `rgba(${sr},${sg},${sb},0.10)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // 细密颗粒，压得很淡，只在近处提供质感
  const grain = 900;
  for (let i = 0; i < grain; i += 1) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const v = Math.random() < 0.5 ? -1 : 1;
    ctx.fillStyle = v < 0 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.045)';
    ctx.fillRect(x, y, 1, 1);
  }
  return { canvas, size };
}

/** Tileable wall/brick texture with horizontal mortar lines. */
export function makeWallTexture(size: number, base: string, accent: string): Texture | null {
  const made = makeCanvas(size);
  if (!made) return null;
  const { canvas, ctx } = made;
  const [r, g, b] = hexToRgb(base);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  const rows = 4;
  const rh = size / rows;
  for (let i = 0; i <= rows; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, i * rh);
    ctx.lineTo(size, i * rh);
    ctx.stroke();
    const offset = i % 2 === 0 ? 0 : size / 8;
    for (let x = offset; x < size; x += size / 4) {
      ctx.beginPath();
      ctx.moveTo(x, i * rh);
      ctx.lineTo(x, (i + 1) * rh);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // 少量 accent 色斑，避免墙面太干净
  for (let i = 0; i < 10; i += 1) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = accent;
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 2 + Math.random() * 5, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
  return { canvas, size };
}

export class TextureBank {
  private ground = new Map<string, CanvasPattern | null>();
  private walls = new Map<string, CanvasPattern | null>();
  private groundSrc = new Map<string, HTMLCanvasElement>();

  build(ctx: CanvasRenderingContext2D, key: string, floor: string, wall: string, accent: string): void {
    if (this.ground.has(key)) return;
    const ground = makeGroundTexture(128, floor, accent, 0.028, 16);
    const wallTex = makeWallTexture(96, wall, accent);
    this.ground.set(key, ground ? safePattern(ctx, ground.canvas) : null);
    this.walls.set(key, wallTex ? safePattern(ctx, wallTex.canvas) : null);
    if (ground) this.groundSrc.set(key, ground.canvas);
  }

  groundFor(key: string): CanvasPattern | null {
    return this.ground.get(key) ?? null;
  }

  /** 原始地面贴图，供其它画布（例如烘焙好的地面层）自建 pattern。 */
  groundCanvas(key: string): HTMLCanvasElement | null {
    return this.groundSrc.get(key) ?? null;
  }

  wallFor(key: string): CanvasPattern | null {
    return this.walls.get(key) ?? null;
  }
}

function safePattern(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): CanvasPattern | null {
  try {
    return ctx.createPattern(canvas, 'repeat');
  } catch {
    return null;
  }
}
