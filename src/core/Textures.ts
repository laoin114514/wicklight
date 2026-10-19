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

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.max(0, Math.min(255, Math.round(r)))},${Math.max(0, Math.min(255, Math.round(g)))},${Math.max(0, Math.min(255, Math.round(b)))},${a})`;
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
  const [sr, sg, sb] = hexToRgb(speck);
  const rand = makeRng(0x7f4a7c15);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // 大块土色/湿痕：低频变化负责"地表不是一张噪声图"，高频颗粒只负责近看时的质感。
  for (let i = 0; i < 34; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = size * (0.055 + rand() * 0.16);
    const dark = rand() < 0.62;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -rad || x + ox > size + rad || y + oy < -rad || y + oy > size + rad) continue;
        const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, dark ? 'rgba(0,0,0,0.12)' : rgba(sr, sg, sb, 0.045));
        grad.addColorStop(0.66, dark ? 'rgba(0,0,0,0.055)' : rgba(sr, sg, sb, 0.03));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 碎石子：每一颗有底影、有受光面，不再用 1px 方点代替"地面"。
  const dots = Math.floor(size * size * density);
  for (let i = 0; i < dots; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const t = rand() < 0.24 ? rand() * 0.58 : rand() * 0.16;
    const radius = 0.28 + rand() * rand() * 1.55;
    const rot = rand() * Math.PI;
    const rr = r + (sr - r) * t + (rand() * 2 - 1) * contrast * 0.72;
    const gg = g + (sg - g) * t + (rand() * 2 - 1) * contrast * 0.72;
    const bb = b + (sb - b) * t + (rand() * 2 - 1) * contrast * 0.72;
    const drawStone = (px: number, py: number): void => {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(px + 0.8, py + 1, radius * 1.05, radius * 0.72, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(rr, gg, bb, 0.33 + rand() * 0.15);
      ctx.beginPath();
      ctx.ellipse(px, py, radius, radius * 0.68, rot, 0, Math.PI * 2);
      ctx.fill();
      if (radius > 1.15) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.ellipse(px - radius * 0.22, py - radius * 0.2, radius * 0.48, radius * 0.26, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawStone(x, y);
    if (x < radius * 2) drawStone(x + size, y);
    if (x > size - radius * 2) drawStone(x - size, y);
    if (y < radius * 2) drawStone(x, y + size);
    if (y > size - radius * 2) drawStone(x, y - size);
  }

  // 细密砂砾：形状更小，保留 mip 放大后那种细碎的触感。
  const grain = Math.floor(size * size * 0.034);
  for (let i = 0; i < grain; i += 1) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = rand() < 0.56 ? -1 : 1;
    ctx.fillStyle = v < 0 ? 'rgba(0,0,0,0.075)' : 'rgba(255,255,255,0.04)';
    const s = rand() < 0.12 ? 2 : 1;
    ctx.fillRect(x, y, s, s);
  }

  // 几道很浅的干裂纹，把重复纹理的"均匀感"打断。
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 9; i += 1) {
    let x = rand() * size;
    let y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 3; k += 1) {
      x += (rand() * 2 - 1) * size * 0.08;
      y += (rand() * 2 - 1) * size * 0.05;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return { canvas, size };
}

/** Tileable wall/brick texture with horizontal mortar lines. */
export function makeWallTexture(size: number, base: string, accent: string): Texture | null {
  const made = makeCanvas(size);
  if (!made) return null;
  const { canvas, ctx } = made;
  const [r, g, b] = hexToRgb(base);
  const [ar, ag, ab] = hexToRgb(accent);
  const rand = makeRng(0x2c1b3d4f);
  ctx.fillStyle = rgba(r * 0.48, g * 0.48, b * 0.48, 1);
  ctx.fillRect(0, 0, size, size);

  // 石砖：逐块微调明度，四边有倒角，砖缝保留深色砂浆。
  const rows = 4;
  const rh = size / rows;
  const cols = 3;
  const bw = size / cols;
  const gap = Math.max(1.5, size * 0.009);
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : bw * 0.5;
    for (let col = -1; col <= cols; col += 1) {
      const x = col * bw + offset + gap;
      const y = row * rh + gap;
      const w = bw - gap * 2;
      const h = rh - gap * 2;
      const tone = 0.84 + rand() * 0.22;
      ctx.fillStyle = rgba(r * tone, g * tone, b * tone, 1);
      ctx.beginPath();
      ctx.moveTo(x + 1.5, y);
      ctx.lineTo(x + w - 1.5, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + 1.5);
      ctx.lineTo(x + w, y + h - 1.5);
      ctx.quadraticCurveTo(x + w, y + h, x + w - 1.5, y + h);
      ctx.lineTo(x + 1.5, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - 1.5);
      ctx.lineTo(x, y + 1.5);
      ctx.quadraticCurveTo(x, y, x + 1.5, y);
      ctx.closePath();
      ctx.fill();
      // 左上受光、右下吃影
      ctx.strokeStyle = 'rgba(255,255,255,0.075)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 1);
      ctx.lineTo(x + w - 2, y + 1);
      ctx.moveTo(x + 1, y + 2);
      ctx.lineTo(x + 1, y + h - 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h - 1);
      ctx.lineTo(x + w - 1, y + h - 1);
      ctx.moveTo(x + w - 1, y + 2);
      ctx.lineTo(x + w - 1, y + h - 2);
      ctx.stroke();

      // 石面缺损与细裂纹
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = 0; k < 3; k += 1) {
        const cx = x + 4 + rand() * Math.max(1, w - 8);
        const cy = y + 4 + rand() * Math.max(1, h - 8);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 0.8 + rand() * 1.7, 0.55 + rand() * 1.1, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rand() < 0.45) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + w * (0.24 + rand() * 0.2), y + h * 0.15);
        ctx.lineTo(x + w * (0.42 + rand() * 0.2), y + h * 0.48);
        ctx.lineTo(x + w * (0.34 + rand() * 0.3), y + h * 0.78);
        ctx.stroke();
      }
    }
  }

  // 水渍与苔痕：低对比度的 accent 色，让同主题的墙不会像复制粘贴。
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 4 + rand() * 18;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, rgba(ar, ag, ab, 0.11 + rand() * 0.08));
    grad.addColorStop(0.5, rgba(ar, ag, ab, 0.035));
    grad.addColorStop(1, rgba(ar, ag, ab, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // 细颗粒，保持贴图重复时也不会像纯渐变。
  for (let i = 0; i < size * 16; i += 1) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(x, y, 1, 1);
  }
  return { canvas, size };
}

export class TextureBank {
  private ground = new Map<string, CanvasPattern | null>();
  private walls = new Map<string, CanvasPattern | null>();
  private groundSrc = new Map<string, HTMLCanvasElement>();

  build(ctx: CanvasRenderingContext2D, key: string, floor: string, wall: string, accent: string): void {
    if (this.ground.has(key)) return;
    const ground = makeGroundTexture(256, floor, accent, 0.017, 19);
    const wallTex = makeWallTexture(192, wall, accent);
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
