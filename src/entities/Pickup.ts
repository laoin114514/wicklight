import { Pool } from '../core/Pool';
import { collideWalls, wallBetween } from '../systems/CollisionSystem';
import type { Rect } from '../systems/LevelGen';

export type PickupKind = 'xp' | 'oil' | 'heart' | 'chest' | 'gold';
const TAU = Math.PI * 2;

export interface Pickup {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: PickupKind;
  value: number;
  radius: number;
  life: number;
  attracted: boolean;
  phase: number;
}

export class PickupSystem {
  private pool = new Pool<Pickup>(() => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    kind: 'xp',
    value: 1,
    radius: 7,
    life: 0,
    attracted: false,
    phase: 0,
  }), 256);

  spawn(x: number, y: number, kind: PickupKind, value: number): Pickup {
    const p = this.pool.acquire();
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 90;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.kind = kind;
    p.value = value;
    p.radius = kind === 'heart' ? 11 : kind === 'chest' ? 15 : kind === 'gold' ? 8 : 7;
    p.life = 0;
    p.attracted = false;
    p.phase = Math.random() * Math.PI * 2;
    return p;
  }

  /**
   * 拾取物的物理与磁吸。
   *
   * v108：掉落物也有体积，也要认墙。磁吸先问"中间有没有墙"——墙后的那口油不会隔墙飞过来，
   * 玩家得自己绕过去；位移最后再走一次 `collideWalls`，把掉进墙里的那一口推到最近的墙外。
   * 无墙时两条分支都不改变原来的那一帧（同一条速度积分、同一个收集距离）。
   */
  update(
    dt: number,
    px: number,
    py: number,
    range: number,
    onCollect: (p: Pickup) => void,
    walls: readonly Rect[] = [],
  ): void {
    const range2 = range * range;
    const hasWalls = walls.length > 0;
    for (const p of this.pool.all) {
      if (!p.active) continue;
      p.life += dt;
      p.phase += dt * 6;
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      const clear = !hasWalls || !wallBetween(px, py, p.x, p.y, walls);
      // 一旦被墙挡住就退出磁吸：否则玩家绕到墙这一侧时，它会在任意距离上重新起飞。
      if (!clear) p.attracted = false;
      if (clear && (d2 < range2 || p.attracted)) {
        p.attracted = true;
        const d = Math.max(1, Math.sqrt(d2));
        const pull = 320 + 2200 / d;
        p.vx += (dx / d) * pull * dt;
        p.vy += (dy / d) * pull * dt;
      }
      p.vx *= 1 - Math.min(1, 4 * dt);
      p.vy *= 1 - Math.min(1, 4 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (hasWalls) {
        const fixed = collideWalls(p.x, p.y, p.radius, walls);
        if (fixed.x !== p.x || fixed.y !== p.y) {
          p.x = fixed.x;
          p.y = fixed.y;
          p.vx = 0;
          p.vy = 0;
        }
      }
      if (clear && (d2 < 20 * 20 || (p.attracted && d2 < 26 * 26))) {
        onCollect(p);
        p.active = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const bob = Math.sin(time * 5 + p.phase) * 2;
      const y = p.y + bob;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#020509';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.radius * 0.88 + 2, p.radius * (p.kind === 'chest' ? 1.15 : 0.9), p.radius * 0.31, 0, 0, TAU);
      ctx.fill();

      if (p.kind === 'xp') {
        drawXp(ctx, p.x, y, p.radius, p.phase);
      } else if (p.kind === 'oil') {
        drawOil(ctx, p.x, y, p.radius);
      } else if (p.kind === 'gold') {
        drawGold(ctx, p.x, y, p.radius, p.phase);
      } else if (p.kind === 'heart') {
        drawHeart(ctx, p.x, y, p.radius, time, p.phase);
      } else if (p.kind === 'chest') {
        drawChest(ctx, p.x, y, p.radius, time, p.phase);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffe27a';
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 10);
        ctx.beginPath();
        ctx.arc(p.x, y, p.radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.clear();
  }

  get all(): readonly Pickup[] {
    return this.pool.all;
  }

  get count(): number {
    return this.pool.activeCount;
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
}

function drawXp(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number): void {
  const pulse = 0.9 + 0.1 * Math.sin(phase * 1.7);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.11 * pulse;
  ctx.fillStyle = '#8affc1';
  diamond(ctx, x, y, r * 2.05);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0b3026';
  diamond(ctx, x, y + 1.2, r * 1.04);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#9dffd1';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.92);
  ctx.lineTo(x, y + r * 0.9);
  ctx.lineTo(x - r * 0.62, y);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.74;
  ctx.fillStyle = '#35c887';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.92);
  ctx.lineTo(x + r * 0.62, y);
  ctx.lineTo(x, y + r * 0.9);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#eafff5';
  ctx.lineWidth = Math.max(0.65, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.82);
  ctx.lineTo(x, y + r * 0.8);
  ctx.stroke();

  ctx.globalAlpha = 0.62 * pulse;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.3, Math.max(0.65, r * 0.12), 0, TAU);
  ctx.fill();
}

function oilDropPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.62);
  ctx.bezierCurveTo(x + r * 0.42, y - r * 0.95, x + r * 0.94, y - r * 0.18, x + r * 0.8, y + r * 0.52);
  ctx.bezierCurveTo(x + r * 0.62, y + r * 1.02, x - r * 0.62, y + r * 1.02, x - r * 0.8, y + r * 0.52);
  ctx.bezierCurveTo(x - r * 0.94, y - r * 0.18, x - r * 0.42, y - r * 0.95, x, y - r * 1.62);
  ctx.closePath();
}

function drawOil(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  halo.addColorStop(0, 'rgba(255,210,78,0.3)');
  halo.addColorStop(0.5, 'rgba(255,159,40,0.12)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#2b1805';
  oilDropPath(ctx, x, y + 1.1, r * 1.03);
  ctx.fill();

  const body = ctx.createLinearGradient(x - r * 0.5, y - r, x + r * 0.55, y + r);
  body.addColorStop(0, '#fff4ad');
  body.addColorStop(0.34, '#ffd24e');
  body.addColorStop(0.78, '#e18a18');
  body.addColorStop(1, '#8e4b09');
  ctx.fillStyle = body;
  oilDropPath(ctx, x, y, r * 0.98);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = Math.max(0.65, r * 0.11);
  oilDropPath(ctx, x, y, r * 0.98);
  ctx.stroke();

  ctx.globalAlpha = 0.78;
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.58, Math.max(0.8, r * 0.16), Math.max(1.3, r * 0.34), -0.38, 0, TAU);
  ctx.fill();
}

function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number): void {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  halo.addColorStop(0, '#ffd24e');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#5c3a07';
  ctx.beginPath();
  ctx.ellipse(x, y + 2.3, r * 0.98, r * 0.88, 0, 0, TAU);
  ctx.fill();

  const face = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y, r);
  face.addColorStop(0, '#fff3ae');
  face.addColorStop(0.4, '#ffd85c');
  face.addColorStop(0.8, '#d58b17');
  face.addColorStop(1, '#9f5c08');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.94, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#70460a';
  ctx.lineWidth = Math.max(0.7, r * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.76, 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#b87612';
  ctx.lineWidth = Math.max(0.55, r * 0.075);
  for (let i = 0; i < 8; i += 1) {
    const a = phase * 0.08 + (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
    ctx.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.64;
  ctx.fillStyle = '#80500c';
  diamond(ctx, x, y, r * 0.4);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#fff0a0';
  ctx.lineWidth = Math.max(0.55, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.3);
  ctx.lineTo(x, y + r * 0.3);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#fffce8';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.4, Math.max(0.6, r * 0.12), Math.max(1.1, r * 0.2), -0.55, 0, TAU);
  ctx.fill();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.78);
  ctx.bezierCurveTo(x - r * 1.38, y - r * 0.12, x - r * 0.8, y - r * 1.04, x, y - r * 0.28);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.04, x + r * 1.38, y - r * 0.12, x, y + r * 0.78);
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, phase: number): void {
  const pulse = 0.92 + 0.08 * Math.sin(time * 4.2 + phase);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18 * pulse;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.8 * pulse);
  halo.addColorStop(0, '#ff8a9c');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.8 * pulse, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#4a0818';
  heartPath(ctx, x, y + 1.2, r * 1.04);
  ctx.fill();

  const body = ctx.createLinearGradient(x - r * 0.7, y - r, x + r * 0.7, y + r * 0.8);
  body.addColorStop(0, '#ff9aaa');
  body.addColorStop(0.42, '#ff5571');
  body.addColorStop(1, '#a41234');
  ctx.fillStyle = body;
  heartPath(ctx, x, y, r);
  ctx.fill();

  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#ffc3ca';
  ctx.lineWidth = Math.max(0.65, r * 0.085);
  heartPath(ctx, x, y, r);
  ctx.stroke();

  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.38, Math.max(0.75, r * 0.15), Math.max(1.2, r * 0.24), -0.6, 0, TAU);
  ctx.fill();
}

function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, phase: number): void {
  const w = r * 1.18;
  const h = r * 0.72;
  const pulse = 0.86 + 0.14 * Math.sin(time * 3 + phase);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.2 * pulse;
  const halo = ctx.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, r * 2.1);
  halo.addColorStop(0, '#ffd88a');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y - h * 0.4, r * 2.1, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#311707';
  ctx.beginPath();
  ctx.moveTo(x - w, y - h * 0.12);
  ctx.lineTo(x + w, y - h * 0.12);
  ctx.lineTo(x + w * 0.88, y + h);
  ctx.lineTo(x - w * 0.88, y + h);
  ctx.closePath();
  ctx.fill();

  const body = ctx.createLinearGradient(x - w, y, x + w, y + h);
  body.addColorStop(0, '#765028');
  body.addColorStop(0.5, '#4d3017');
  body.addColorStop(1, '#271207');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.94, y - h * 0.05);
  ctx.lineTo(x + w * 0.94, y - h * 0.05);
  ctx.lineTo(x + w * 0.82, y + h * 0.88);
  ctx.lineTo(x - w * 0.82, y + h * 0.88);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5c3617';
  ctx.beginPath();
  ctx.moveTo(x - w, y - h * 0.08);
  ctx.bezierCurveTo(x - w * 0.82, y - h * 1.05, x + w * 0.82, y - h * 1.05, x + w, y - h * 0.08);
  ctx.lineTo(x + w * 0.9, y + h * 0.1);
  ctx.lineTo(x - w * 0.9, y + h * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.66;
  ctx.strokeStyle = '#a97a39';
  ctx.lineWidth = Math.max(0.7, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.76, y - h * 0.52);
  ctx.bezierCurveTo(x - w * 0.3, y - h * 0.86, x + w * 0.28, y - h * 0.86, x + w * 0.72, y - h * 0.5);
  ctx.stroke();

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#b98a42';
  ctx.fillRect(x - w * 0.46, y - h * 0.79, w * 0.17, h * 1.61);
  ctx.fillRect(x + w * 0.29, y - h * 0.79, w * 0.17, h * 1.61);
  ctx.fillStyle = '#2a1709';
  ctx.fillRect(x - w * 0.47, y - h * 0.73, w * 0.19, h * 1.5);
  ctx.fillRect(x + w * 0.28, y - h * 0.73, w * 0.19, h * 1.5);
  ctx.fillStyle = '#d5a954';
  ctx.fillRect(x - w * 0.45, y - h * 0.68, w * 0.08, h * 1.38);
  ctx.fillRect(x + w * 0.3, y - h * 0.68, w * 0.08, h * 1.38);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#ffd88a';
  ctx.lineWidth = Math.max(0.8, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.8, y - h * 0.02);
  ctx.lineTo(x + w * 0.8, y - h * 0.02);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e0b75b';
  ctx.fillRect(x - w * 0.16, y - h * 0.12, w * 0.32, h * 0.5);
  ctx.fillStyle = '#3a2109';
  ctx.beginPath();
  ctx.arc(x, y + h * 0.1, Math.max(0.8, r * 0.13), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff1b7';
  ctx.beginPath();
  ctx.arc(x - w * 0.03, y + h * 0.07, Math.max(0.5, r * 0.055), 0, TAU);
  ctx.fill();
}
