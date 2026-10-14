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
}

export class ProjectileSystem {
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
    return p;
  }

  update(dt: number, homingTarget: (p: Projectile) => { x: number; y: number } | null, owner?: { x: number; y: number }): void {
    for (const p of this.pool.all) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
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
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const r = p.radius;
      if (p.trail) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (p.boomerang > 0) {
        // 月刃：两片交叉的弧，回程时整体转成偏白，提示"还能再打一次"
        ctx.strokeStyle = p.returning ? '#ffffff' : p.color;
        ctx.lineWidth = 3;
        for (const side of [0, Math.PI]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 1.25, p.angle + side - 0.9, p.angle + side + 0.9);
          ctx.stroke();
        }
      }
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
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
