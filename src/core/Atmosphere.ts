import type { Camera } from './Camera';
import type { StageTheme } from '../types';

interface AtmosphereProfile {
  cool: string;
  warm: string;
  fog: string;
  motes: number;
  drift: number;
  rise: number;
  fogCount: number;
  fogAlpha: number;
  glint: number;
}

interface Mote {
  x: number;
  y: number;
  depth: number;
  phase: number;
  size: number;
  speed: number;
  glint: boolean;
}

interface FogPuff {
  x: number;
  y: number;
  scale: number;
  phase: number;
  depth: number;
}

const PROFILES: Record<string, AtmosphereProfile> = {
  gloamwood: {
    cool: '#8bcf9c',
    warm: '#ffd58a',
    fog: '#527e60',
    motes: 78,
    drift: 7,
    rise: -3,
    fogCount: 5,
    fogAlpha: 0.026,
    glint: 0.22,
  },
  ashenkeep: {
    cool: '#a8bedf',
    warm: '#ffdca1',
    fog: '#7785a2',
    motes: 82,
    drift: 12,
    rise: 2,
    fogCount: 6,
    fogAlpha: 0.031,
    glint: 0.14,
  },
  emberhold: {
    cool: '#ff9a4d',
    warm: '#fff0b5',
    fog: '#8a4c36',
    motes: 94,
    drift: 16,
    rise: -13,
    fogCount: 4,
    fogAlpha: 0.022,
    glint: 0.3,
  },
  nightcity: {
    cool: '#b9a4ff',
    warm: '#ffdca8',
    fog: '#6d5a92',
    motes: 88,
    drift: 8,
    rise: -5,
    fogCount: 6,
    fogAlpha: 0.028,
    glint: 0.2,
  },
};

const FALLBACK: AtmosphereProfile = {
  cool: '#9fb6c9',
  warm: '#ffd9a3',
  fog: '#5f7181',
  motes: 68,
  drift: 8,
  rise: -2,
  fogCount: 4,
  fogAlpha: 0.024,
  glint: 0.16,
};

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function colorAlpha(color: string, alpha: number): string {
  let h = color.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0xffffff;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function wrap(v: number, span: number): number {
  const m = v % span;
  return m < 0 ? m + span : m;
}

export class Atmosphere {
  private stageId = '';
  private profile: AtmosphereProfile = FALLBACK;
  private motes: Mote[] = [];
  private fog: FogPuff[] = [];
  private coolSprite: HTMLCanvasElement | null = null;
  private warmSprite: HTMLCanvasElement | null = null;
  private fogSprite: HTMLCanvasElement | null = null;

  ensure(theme: StageTheme): void {
    if (this.stageId === theme.id) return;
    this.stageId = theme.id;
    this.profile = PROFILES[theme.id] ?? FALLBACK;
    const rand = makeRng(0x51f15e ^ [...theme.id].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
    this.motes = Array.from({ length: this.profile.motes }, () => ({
      x: rand(),
      y: rand(),
      depth: 0.25 + rand() * 0.75,
      phase: rand() * Math.PI * 2,
      size: 0.65 + rand() * rand() * 2.8,
      speed: 0.55 + rand() * 0.9,
      glint: rand() < this.profile.glint,
    }));
    this.fog = Array.from({ length: this.profile.fogCount }, () => ({
      x: rand(),
      y: 0.2 + rand() * 0.8,
      scale: 0.65 + rand() * 0.85,
      phase: rand() * Math.PI * 2,
      depth: 0.2 + rand() * 0.8,
    }));
    this.coolSprite = this.makeGlow(this.profile.cool, 0.62);
    this.warmSprite = this.makeGlow(this.profile.warm, 0.82);
    this.fogSprite = this.makeFog(this.profile.fog);
  }

  private makeGlow(color: string, core: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.12, colorAlpha(color, core));
    g.addColorStop(0.42, colorAlpha(color, core * 0.25));
    g.addColorStop(1, colorAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  private makeFog(color: string): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, colorAlpha(color, 0.34));
    g.addColorStop(0.38, colorAlpha(color, 0.17));
    g.addColorStop(0.72, colorAlpha(color, 0.055));
    g.addColorStop(1, colorAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    cam: Camera,
    playerX: number,
    playerY: number,
    lightRadius: number,
    handheld: boolean,
  ): void {
    if (!this.motes.length) return;
    const profile = this.profile;
    const spanW = w + 180;
    const spanH = h + 180;
    const player = cam.worldToScreen(playerX, playerY);
    const litR = Math.max(120, lightRadius * cam.zoom * 1.12);
    const limit = handheld ? Math.min(this.motes.length, Math.ceil(profile.motes * 0.52)) : this.motes.length;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 低空雾：几团很大的低频光团缓慢横移，只负责把全黑背景垫出空气感。
    if (this.fogSprite) {
      for (const f of this.fog) {
        const x = wrap(f.x * spanW - cam.x * (0.02 + f.depth * 0.06) + Math.sin(time * 0.035 + f.phase) * 34 - 90, spanW) - 90;
        const y = wrap(f.y * spanH - cam.y * (0.015 + f.depth * 0.04) + Math.cos(time * 0.025 + f.phase) * 18 - 90, spanH) - 90;
        const size = (240 + f.scale * 340) * (handheld ? 0.8 : 1);
        ctx.globalAlpha = profile.fogAlpha * (0.6 + f.depth * 0.55);
        ctx.drawImage(this.fogSprite, x - size / 2, y - size / 2, size, size);
      }
    }

    for (let i = 0; i < limit; i += 1) {
      const m = this.motes[i];
      const speed = m.speed * (0.55 + m.depth * 0.8);
      const x = wrap(
        m.x * spanW - cam.x * (0.025 + m.depth * 0.115) + time * profile.drift * speed + Math.sin(time * 0.8 * speed + m.phase) * (5 + m.depth * 12) - 90,
        spanW,
      ) - 90;
      const y = wrap(
        m.y * spanH - cam.y * (0.018 + m.depth * 0.08) + time * profile.rise * speed + Math.cos(time * 0.55 * speed + m.phase) * (3 + m.depth * 7) - 90,
        spanH,
      ) - 90;
      const dx = x - player.x;
      const dy = y - player.y;
      const lit = Math.max(0, 1 - Math.hypot(dx, dy) / litR);
      const base = (0.07 + m.depth * 0.2) * (0.76 + Math.sin(time * 1.7 + m.phase) * 0.24);
      const size = (m.size + m.depth * 2.2) * (handheld ? 1.8 : 2.5);
      if (this.coolSprite && base * (1 - lit * 0.72) > 0.012) {
        ctx.globalAlpha = base * (1 - lit * 0.72);
        ctx.drawImage(this.coolSprite, x - size, y - size, size * 2, size * 2);
      }
      if (this.warmSprite && lit > 0.02) {
        ctx.globalAlpha = base * lit * (m.glint ? 1.35 : 0.95);
        const warmSize = size * (1.05 + lit * 0.3);
        ctx.drawImage(this.warmSprite, x - warmSize, y - warmSize, warmSize * 2, warmSize * 2);
      }
      if (m.glint) {
        ctx.globalAlpha = (0.08 + lit * 0.32) * (0.5 + Math.sin(time * 2.1 + m.phase) * 0.5);
        ctx.strokeStyle = colorAlpha(profile.warm, 0.8);
        ctx.lineWidth = handheld ? 0.7 : 1;
        ctx.beginPath();
        ctx.moveTo(x - m.depth * 4, y);
        ctx.lineTo(x + m.depth * 4, y);
        ctx.moveTo(x, y - m.depth * 4);
        ctx.lineTo(x, y + m.depth * 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
