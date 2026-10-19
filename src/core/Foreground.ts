import type { Camera } from './Camera';
import type { StageTheme } from '../types';

type ForegroundKind = 'frond' | 'ruin' | 'crag' | 'iron';

interface ForegroundProfile {
  kind: ForegroundKind;
  body: string;
  rim: string;
  bokeh: string;
}

interface ForegroundShape {
  x: number;
  y: number;
  scale: number;
  angle: number;
  phase: number;
  variant: number;
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  phase: number;
  drift: number;
  depth: number;
}

const PROFILES: Record<string, ForegroundProfile> = {
  gloamwood: { kind: 'frond', body: 'rgba(9, 28, 16, 0.94)', rim: '#72b987', bokeh: '#78d69a' },
  ashenkeep: { kind: 'ruin', body: 'rgba(17, 18, 31, 0.94)', rim: '#7996d9', bokeh: '#91b3ff' },
  emberhold: { kind: 'crag', body: 'rgba(29, 11, 7, 0.94)', rim: '#d56a32', bokeh: '#ff9d4c' },
  nightcity: { kind: 'iron', body: 'rgba(19, 13, 31, 0.94)', rim: '#9f7be0', bokeh: '#c9a3ff' },
};

const FALLBACK: ForegroundProfile = { kind: 'ruin', body: 'rgba(14, 17, 24, 0.94)', rim: '#7c93b2', bokeh: '#9fc2d9' };

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wrap(v: number, span: number): number {
  const m = v % span;
  return m < 0 ? m + span : m;
}

function frond(ctx: CanvasRenderingContext2D, shape: ForegroundShape, time: number, body: string, rim: string, fade = 1): void {
  ctx.globalAlpha = fade;
  const sway = Math.sin(time * 0.55 + shape.phase) * 0.035;
  ctx.rotate(shape.angle + sway);
  ctx.strokeStyle = body;
  ctx.fillStyle = body;
  ctx.lineCap = 'round';

  for (let branch = 0; branch < 2; branch += 1) {
    const lift = branch * 24 - 10;
    ctx.lineWidth = 9 - branch * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, lift);
    ctx.quadraticCurveTo(72, lift - 26, 168 + branch * 18, lift + 8 + branch * 12);
    ctx.stroke();

    for (let i = 1; i <= 7; i += 1) {
      const t = i / 8;
      const px = t * (168 + branch * 18);
      const py = lift - Math.sin(t * Math.PI) * 18 + t * (8 + branch * 12);
      const leaf = (18 + (i % 3) * 7) * (1 - t * 0.2);
      const side = i % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(side * 0.62 + Math.sin(time * 0.7 + i + shape.phase) * 0.025);
      ctx.beginPath();
      ctx.ellipse(0, side * leaf * 0.38, leaf, leaf * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.16 * fade;
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = body;
      ctx.restore();
    }
  }

  ctx.globalAlpha = 0.34 * fade;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(72, -35, 170, 1);
  ctx.stroke();
  ctx.globalAlpha = fade;
}

function ruin(ctx: CanvasRenderingContext2D, shape: ForegroundShape, body: string, rim: string, fade = 1): void {
  ctx.globalAlpha = fade;
  const n = 7 + (shape.variant % 3);
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = -0.55 + (i / n) * 2.2;
    const rr = 92 + ((i * 37 + shape.variant * 19) % 46);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * 0.82;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.34 * fade;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-42, -28);
  ctx.lineTo(-16, -5);
  ctx.lineTo(-28, 34);
  ctx.moveTo(18, -42);
  ctx.lineTo(10, -8);
  ctx.lineTo(36, 12);
  ctx.stroke();
  ctx.globalAlpha = fade;
}

function crag(ctx: CanvasRenderingContext2D, shape: ForegroundShape, time: number, body: string, rim: string, fade = 1): void {
  ctx.globalAlpha = fade;
  const n = 8;
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = -1.35 + (i / n) * 2.7;
    const jag = 58 + ((i * 41 + shape.variant * 17) % 54);
    const px = Math.cos(a) * jag;
    const py = Math.sin(a) * jag * 1.25;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.34 * fade;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-34, 42);
  ctx.lineTo(-12, -30);
  ctx.lineTo(0, 4);
  ctx.lineTo(22, -38);
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    const x = -38 + i * 34;
    const y = -54 - Math.sin(time * 0.6 + shape.phase + i) * 7;
    ctx.globalAlpha = (0.16 + 0.08 * Math.sin(time * 1.4 + i)) * fade;
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + (i % 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = fade;
  ctx.fillStyle = body;
}

function iron(ctx: CanvasRenderingContext2D, shape: ForegroundShape, time: number, body: string, rim: string, fade = 1): void {
  ctx.globalAlpha = fade;
  ctx.strokeStyle = body;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.quadraticCurveTo(76, 18, 188, -18);
  ctx.stroke();
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 1) / 6;
    const px = t * 176;
    const py = -12 + Math.sin(t * Math.PI) * 24 - t * 12;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(time * 0.32 + shape.phase + i) * 3, py + 34 + (i % 2) * 11);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.34 * fade;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(76, 10, 188, -26);
  ctx.stroke();
  ctx.globalAlpha = fade;
}

export class Foreground {
  private stageId = '';
  private profile: ForegroundProfile = FALLBACK;
  private shapes: ForegroundShape[] = [];
  private farShapes: ForegroundShape[] = [];
  private bokeh: Bokeh[] = [];

  ensure(theme: StageTheme): void {
    if (this.stageId === theme.id) return;
    this.stageId = theme.id;
    this.profile = PROFILES[theme.id] ?? FALLBACK;
    const rand = makeRng(0x7a51c3 ^ [...theme.id].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
    this.shapes = [
      { x: -0.055, y: 0.05, scale: 1, angle: 0.16, phase: rand() * 6.28, variant: 1 },
      { x: 1.055, y: 0.13, scale: 0.92, angle: Math.PI - 0.2, phase: rand() * 6.28, variant: 2 },
      { x: -0.06, y: 0.96, scale: 1.08, angle: -0.58, phase: rand() * 6.28, variant: 3 },
      { x: 1.05, y: 0.91, scale: 0.9, angle: Math.PI + 0.5, phase: rand() * 6.28, variant: 4 },
    ];
    // 远景只补左右中段，固定在边缘外沿；不消耗新的视觉随机数。
    this.farShapes = [
      { x: -0.015, y: 0.34, scale: 0.82, angle: 0.12, phase: 1.3, variant: 5 },
      { x: 1.015, y: 0.67, scale: 0.78, angle: Math.PI - 0.16, phase: 3.9, variant: 6 },
    ];
    this.bokeh = Array.from({ length: 8 }, (_, i) => ({
      x: rand(),
      y: rand(),
      r: 34 + rand() * 92,
      phase: rand() * 6.28,
      drift: (i % 2 ? 1 : -1) * (2.5 + rand() * 5),
      depth: 0.35 + rand() * 0.65,
    }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, cam: Camera, handheld: boolean): void {
    if (!this.shapes.length) return;
    const spanW = w + 140;
    const spanH = h + 140;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.farShapes.length; i += 1) {
      if (handheld) continue;
      const shape = this.farShapes[i];
      const x = shape.x * w - cam.x * 0.014 + Math.sin(time * 0.19 + shape.phase) * 2.5 + cam.shakeX * 0.7;
      const y = shape.y * h - cam.y * 0.01 + Math.cos(time * 0.17 + shape.phase) * 2 + cam.shakeY * 0.7;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(shape.scale, shape.scale);
      if (this.profile.kind === 'frond') frond(ctx, shape, time, this.profile.body, this.profile.rim, 0.5);
      else if (this.profile.kind === 'ruin') ruin(ctx, shape, this.profile.body, this.profile.rim, 0.5);
      else if (this.profile.kind === 'crag') crag(ctx, shape, time, this.profile.body, this.profile.rim, 0.5);
      else iron(ctx, shape, time, this.profile.body, this.profile.rim, 0.5);
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.bokeh.length; i += 1) {
      if (handheld && i % 2 === 1) continue;
      const b = this.bokeh[i];
      const x = wrap(b.x * spanW - cam.x * 0.055 * b.depth + time * b.drift + Math.sin(time * 0.23 + b.phase) * 22, spanW) - 70;
      const y = wrap(b.y * spanH - cam.y * 0.045 * b.depth + Math.sin(time * 0.17 + b.phase) * 16, spanH) - 70;
      const edge = Math.min(x, w - x, y, h - y);
      if (edge > 150) continue;
      const r = b.r * (handheld ? 0.72 : 1);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, this.profile.kind === 'crag' ? 'rgba(255,139,62,0.075)' : this.profile.kind === 'frond' ? 'rgba(128,207,148,0.055)' : this.profile.kind === 'iron' ? 'rgba(180,139,255,0.06)' : 'rgba(151,176,255,0.055)');
      grad.addColorStop(0.4, this.profile.kind === 'crag' ? 'rgba(255,110,40,0.028)' : this.profile.kind === 'iron' ? 'rgba(150,105,230,0.024)' : 'rgba(126,150,220,0.02)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const shape of this.shapes) {
      const x = shape.x * w + Math.sin(time * 0.37 + shape.phase) * 4 + cam.shakeX * 1.9;
      const y = shape.y * h + Math.cos(time * 0.31 + shape.phase) * 3 + cam.shakeY * 1.9;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(shape.scale, shape.scale);
      if (this.profile.kind === 'frond') frond(ctx, shape, time, this.profile.body, this.profile.rim);
      else if (this.profile.kind === 'ruin') ruin(ctx, shape, this.profile.body, this.profile.rim);
      else if (this.profile.kind === 'crag') crag(ctx, shape, time, this.profile.body, this.profile.rim);
      else iron(ctx, shape, time, this.profile.body, this.profile.rim);
      ctx.restore();
    }
    ctx.restore();
  }
}
