import { Pool } from '../core/Pool';
import { collideWalls, wallBetween } from '../systems/CollisionSystem';
import type { Rect } from '../systems/LevelGen';

export type PickupKind = 'xp' | 'oil' | 'heart' | 'chest' | 'gold';

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
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const bob = Math.sin(time * 5 + p.phase) * 2;
      if (p.kind === 'xp') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#8affc1';
        ctx.globalAlpha = 0.9;
        diamond(ctx, p.x, p.y + bob, p.radius);
        ctx.fill();
      } else if (p.kind === 'oil') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffd24e';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'gold') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#7a5a12';
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd24e';
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob - 1, p.radius - 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ff6b81';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, p.radius - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(p.x - 1, p.y + bob - 6, 2, 12);
        ctx.fillRect(p.x - 6, p.y + bob - 1, 12, 2);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffe27a';
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 10);
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, p.radius, 0, Math.PI * 2);
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
