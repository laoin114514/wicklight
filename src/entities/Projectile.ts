import { Pool } from '../core/Pool';

export interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  radius: number;
  pierce: number;
  hitIds: number[];
  color: string;
  knockback: number;
  burn: number;
  homing: number;
  explode: number;
  speed: number;
  trail: boolean;
  slow: number;
  spin: number;
  angle: number;
  weaponId: string;
  /** > 0 表示回旋刃：飞出一段距离后掉头回到玩家手里（回程可以再命中一次） */
  boomerang: number;
  returning: boolean;
  /** 敌人子弹记下放它的敌人 id，结算时才知道玩家是被谁扑灭的。 */
  ownerId: string;
  /** 这颗子弹是不是已经被算过一次「掠影」了（同一颗只认一次：弹幕流里站着蹭不该刷热度） */
  grazed: boolean;
  /** > 0 表示落地之后要在地上留一片**自己的火**（倾灯）：多大一片、烧多久 */
  poolRadius: number;
  poolLife: number;
}

/** 一发子弹飞完射程还没碰到东西时的那一下收尾（由 Game 注入，见 ProjectileSystem.onExpire）。 */
export type ProjectileExpire = (p: Projectile) => void;

export class ProjectileSystem {
  /**
   * 飞完射程还没落地的那一发怎么收尾。默认什么都不做（大多数子弹就是消失）。
   *
   * ⚠ 倾灯那一瓢**必须**有这一句：它是唯一一件"往哪儿倒由你决定"的武器，
   * 而手动瞄准之后落点不再保证站着敌人——没有收尾的话，玩家花了 0.15 桶油，
   * 那一瓢飞到射程尽头就凭空消失，地上一片火都没有（自动瞄准也有这条路：
   * 锁着的那只怪先被打死了、或者周围根本没怪）。
   */
  onExpire: ProjectileExpire | null = null;
  private pool = new Pool<Projectile>(() => ({
    active: false,
    fromPlayer: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    damage: 0,
    radius: 6,
    pierce: 0,
    hitIds: [],
    color: '#fff',
    knockback: 0,
    burn: 0,
    homing: 0,
    explode: 0,
    speed: 300,
    trail: true,
    slow: 0,
    spin: 0,
    angle: 0,
    weaponId: '',
    boomerang: 0,
    returning: false,
    ownerId: '',
    grazed: false,
    poolRadius: 0,
    poolLife: 0,
  }), 512);

  spawn(cfg: Partial<Projectile> & { x: number; y: number; vx: number; vy: number; damage: number }): Projectile {
    const p = this.pool.acquire();
    p.active = true;
    p.fromPlayer = cfg.fromPlayer ?? true;
    p.x = cfg.x;
    p.y = cfg.y;
    p.vx = cfg.vx;
    p.vy = cfg.vy;
    p.maxLife = cfg.maxLife ?? 1.4;
    p.life = p.maxLife;
    p.damage = cfg.damage;
    p.radius = cfg.radius ?? 6;
    p.pierce = cfg.pierce ?? 0;
    p.hitIds = [];
    p.color = cfg.color ?? '#ffb14e';
    p.knockback = cfg.knockback ?? 0;
    p.burn = cfg.burn ?? 0;
    p.homing = cfg.homing ?? 0;
    p.explode = cfg.explode ?? 0;
    p.speed = Math.hypot(p.vx, p.vy) || 1;
    p.trail = cfg.trail ?? true;
    p.slow = cfg.slow ?? 0;
    p.spin = cfg.spin ?? 0;
    p.angle = Math.atan2(p.vy, p.vx);
    p.weaponId = cfg.weaponId ?? '';
    p.boomerang = cfg.boomerang ?? 0;
    p.returning = false;
    p.ownerId = cfg.ownerId ?? '';
    p.grazed = false;
    p.poolRadius = cfg.poolRadius ?? 0;
    p.poolLife = cfg.poolLife ?? 0;
    return p;
  }

  update(dt: number, homingTarget: (p: Projectile) => { x: number; y: number } | null, owner?: { x: number; y: number }): void {
    for (const p of this.pool.all) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.onExpire?.(p);
        continue;
      }
      if (p.homing > 0) {
        const target = homingTarget(p);
        if (target) {
          const desired = Math.atan2(target.y - p.y, target.x - p.x);
          let d = desired - p.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          p.angle += Math.max(-p.homing * dt, Math.min(p.homing * dt, d));
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }
      }
      if (p.boomerang > 0 && owner) {
        // 0.615 = 1 - 1/2.6：飞满 range 的距离后掉头（寿命由发射方按此比例给出）
        if (p.life <= p.maxLife * 0.615) {
          // 掉头：先把命中记录清空，于是"回程"能再打一次同一只敌人
          if (!p.returning) {
            p.returning = true;
            p.hitIds = [];
          }
          const dx = owner.x - p.x;
          const dy = owner.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const desired = Math.atan2(dy, dx);
          let diff = desired - p.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.angle += Math.max(-p.boomerang * dt, Math.min(p.boomerang * dt, diff));
          p.speed = Math.max(p.speed, 280);
          p.vx = Math.cos(p.angle) * p.speed * 1.15;
          p.vy = Math.sin(p.angle) * p.speed * 1.15;
          if (d < 28) {
            p.active = false;
            continue;
          }
        }
      }
      if (p.spin !== 0) p.angle += p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const r = p.radius;
      if (p.trail) drawProjectileTrail(ctx, p);
      if (p.boomerang > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
        ctx.fill();
        drawBoomerang(ctx, p);
      } else {
        drawProjectileOrb(ctx, p);
      }
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.clear();
  }

  get all(): readonly Projectile[] {
    return this.pool.all;
  }

  get count(): number {
    return this.pool.activeCount;
  }
}

function drawProjectileTrail(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const speed = Math.hypot(p.vx, p.vy);
  if (speed < 1) return;
  const ux = p.vx / speed;
  const uy = p.vy / speed;
  const r = p.radius;
  const len = Math.min(60, 12 + speed * 0.068 + r * 3.1);
  ctx.globalCompositeOperation = 'lighter';

  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = r * 1.38;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - ux * len, p.y - uy * len);
  ctx.stroke();

  ctx.globalAlpha = 0.24;
  ctx.lineWidth = r * 0.64;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - ux * len * 0.74, p.y - uy * len * 0.74);
  ctx.stroke();

  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = p.returning ? '#ffffff' : '#fff8dc';
  ctx.lineWidth = Math.max(0.8, r * 0.17);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - ux * len * 0.43, p.y - uy * len * 0.43);
  ctx.stroke();

  const px = -uy;
  const py = ux;
  for (const [along, side, size] of [
    [0.38, 0.34, 0.22],
    [0.67, -0.24, 0.16],
    [0.86, 0.12, 0.12],
  ] as const) {
    ctx.globalAlpha = (1 - along) * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - ux * len * along + px * r * side, p.y - uy * len * along + py * r * side, Math.max(0.7, r * size), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProjectileOrb(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const r = p.radius;
  const pulse = 0.94 + 0.06 * Math.sin(p.life * 22 + p.x * 0.013);

  // 深色底托把弹芯从同样发亮的火苗和灯火里剥出来；敌方弹再压重一点。
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = p.fromPlayer ? 0.15 : 0.42;
  ctx.fillStyle = p.fromPlayer ? '#160b05' : '#050a18';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.34, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  const glowR = r * (p.fromPlayer ? 2.8 : 2.5) * pulse;
  const g = ctx.createRadialGradient(p.x, p.y, r * 0.05, p.x, p.y, glowR);
  g.addColorStop(0, '#fffef5');
  g.addColorStop(0.1, '#ffffff');
  g.addColorStop(0.29, p.color);
  g.addColorStop(0.62, p.color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.76;
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1, r * 0.3), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = Math.max(0.8, r * 0.13);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.16, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBoomerang(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const r = p.radius;
  const returning = p.returning;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  // 先压一层深色刀身，再叠亮刃口：在暗地上也有实体厚度。
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = '#071313';
  ctx.lineWidth = Math.max(4.2, r * 0.5);
  for (const side of [0, Math.PI]) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.3, side - 0.94, side + 0.94);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = Math.max(7, r * 0.82);
  for (const lag of [-0.16, 0.17]) {
    for (const side of [0, Math.PI]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.48, side + lag - 0.82, side + lag + 0.82);
      ctx.stroke();
    }
  }

  for (const side of [0, Math.PI]) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = returning ? '#effff9' : p.color;
    ctx.lineWidth = Math.max(1.8, r * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.3, side - 0.9, side + 0.9);
    ctx.stroke();
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.65, r * 0.07);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.43, side - 0.68, side + 0.2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#10201f';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.2, r * 0.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.color;
  ctx.lineWidth = Math.max(0.7, r * 0.08);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = returning ? '#ffffff' : '#c8ffe8';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.9, r * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
