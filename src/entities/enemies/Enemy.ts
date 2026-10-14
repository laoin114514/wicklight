import { Pool } from '../../core/Pool';
import { ENEMY_MAP } from '../../data/enemies';
import type { EnemyDef } from '../../types';
import { drawEnemy } from './EnemyArt';

export interface Enemy {
  active: boolean;
  id: number;
  defId: string;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  xp: number;
  oil: number;
  color: string;
  elite: boolean;
  boss: boolean;
  phase: number;
  burn: number;
  burnTimer: number;
  slowTimer: number;
  hitFlash: number;
  attackCd: number;
  stateTimer: number;
  spawnTimer: number;
  wobble: number;
  angle: number;
  dashVx: number;
  dashVy: number;
  dashing: number;
  scale: number;
  dr: number;
  affix: string | null;
  /** 来自「引灯」/「疾风」光环的速度倍率，每帧重算 */
  buff: number;
}

export interface LightCtx {
  px: number;
  py: number;
  lightRadius: number;
}

export interface EnemyContext {
  px: number;
  py: number;
  lightRadius: number;
  time: number;
  burnDps: number;
  slowFactor: number;
  visionUpgrade: number;
  damagePlayer: (amount: number, x: number, y: number, drain?: number) => void;
  shoot: (x: number, y: number, angle: number, speed: number, damage: number, color: string, enemy: boolean) => void;
  addLight: (x: number, y: number, r: number, intensity: number) => void;
  burst: (x: number, y: number, count: number, color: string, opts?: { speed?: number; size?: number; life?: number }) => void;
  onDeath: (e: Enemy) => void;
  snuffLight: (amount: number) => void;
  spawnAdd: (defId: string, x: number, y: number) => void;
  ignitGround: (x: number, y: number) => void;
  spikes: (x: number, y: number, r: number) => void;
  shake: (amount: number) => void;
}

export class EnemySystem {
  private nextId = 1;
  private ctxRef: EnemyContext | null = null;
  private pool = new Pool<Enemy>(() => ({
    active: false,
    id: 0,
    defId: 'shade',
    def: ENEMY_MAP.shade,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    radius: 12,
    speed: 60,
    damage: 8,
    xp: 3,
    oil: 4,
    color: '#fff',
    elite: false,
    boss: false,
    phase: 1,
    burn: 0,
    burnTimer: 0,
    slowTimer: 0,
    hitFlash: 0,
    attackCd: 0,
    stateTimer: 0,
    spawnTimer: 0,
    wobble: 0,
    angle: 0,
    dashVx: 0,
    dashVy: 0,
    dashing: 0,
    scale: 1,
    dr: 0,
    affix: null,
    buff: 1,
  }), 256);

  spawn(defId: string, x: number, y: number, hpMult: number, damageMult: number): Enemy {
    const def = ENEMY_MAP[defId] ?? ENEMY_MAP.shade;
    const e = this.pool.acquire();
    e.id = this.nextId++;
    e.defId = defId;
    e.def = def;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = def.hp * hpMult;
    e.hp = e.maxHp;
    e.radius = def.radius;
    e.speed = def.speed;
    e.damage = def.damage * damageMult;
    e.xp = def.xp;
    e.oil = def.oil;
    e.color = def.color;
    e.elite = !!def.elite;
    e.boss = !!def.boss;
    e.phase = 1;
    e.burn = 0;
    e.burnTimer = 0;
    e.slowTimer = 0;
    e.hitFlash = 0;
    e.attackCd = 1;
    e.stateTimer = 0;
    e.spawnTimer = 0.4;
    e.wobble = Math.random() * Math.PI * 2;
    e.angle = 0;
    e.dashVx = 0;
    e.dashVy = 0;
    e.dashing = 0;
    e.scale = def.boss ? 1 : def.elite ? 1 : 1;
    e.dr = 0;
    e.affix = null;
    e.buff = 1;
    return e;
  }

  private isLit(e: Enemy, lc: LightCtx): boolean {
    const dx = e.x - lc.px;
    const dy = e.y - lc.py;
    return dx * dx + dy * dy <= lc.lightRadius * lc.lightRadius;
  }

  isVulnerable(e: Enemy, lc: LightCtx): boolean {
    if (!e.active) return false;
    return !(e.def.requiresLight && !this.isLit(e, lc));
  }

  damage(e: Enemy, amount: number, lc: LightCtx, knockX = 0, knockY = 0, knockback = 0): boolean {
    if (!e.active) return false;
    if (e.def.requiresLight && !this.isLit(e, lc)) {
      return false;
    }
    e.hp -= amount;
    e.hitFlash = 0.12;
    if (knockback > 0) {
      const d = Math.hypot(knockX, knockY) || 1;
      e.vx += (knockX / d) * knockback;
      e.vy += (knockY / d) * knockback;
    }
    if (e.hp <= 0) {
      this.ctxRef?.onDeath(e);
      e.active = false;
      return true;
    }
    return false;
  }

  applyBurn(e: Enemy, stacks: number): void {
    e.burn = Math.min(12, e.burn + stacks);
    e.burnTimer = 3;
  }

  update(dt: number, ctx: EnemyContext): void {
    this.ctxRef = ctx;
    // 引灯 / 疾风光环：每帧重算，让"优先击杀辅助怪"成为有意义的决策
    for (const e of this.pool.all) if (e.active) e.buff = 1;
    for (const e of this.pool.all) {
      if (!e.active) continue;
      const aura = e.defId === 'beacon' ? 210 : e.affix === 'haste' ? 165 : 0;
      if (aura <= 0) continue;
      const rr2 = aura * aura;
      for (const o of this.pool.all) {
        if (!o.active || o === e) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= rr2) o.buff = Math.max(o.buff, 1.35);
      }
    }
    for (const e of this.pool.all) {
      if (!e.active) continue;
      e.wobble += dt * 4;
      if (e.spawnTimer > 0) e.spawnTimer -= dt;
      if (e.affix === 'regen' && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
        if (Math.random() < dt * 2) ctx.burst(e.x, e.y, 1, '#8affc1', { speed: 30, size: 2, life: 0.4 });
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.hp -= ctx.burnDps * e.burn * dt;
        if (Math.random() < dt * 6) ctx.burst(e.x, e.y, 1, '#ff7a2f', { speed: 40, size: 2, life: 0.3 });
        if (e.burnTimer <= 0) e.burn = 0;
        if (e.hp <= 0) {
          ctx.onDeath(e);
          e.active = false;
          continue;
        }
      }
      if (e.dashing > 0) {
        e.dashing -= dt;
        e.x += e.dashVx * dt;
        e.y += e.dashVy * dt;
        e.dashVx *= 1 - Math.min(1, 3 * dt);
        e.dashVy *= 1 - Math.min(1, 3 * dt);
        const dx = ctx.px - e.x;
        const dy = ctx.py - e.y;
        if (dx * dx + dy * dy < (e.radius + 16) ** 2) {
          ctx.damagePlayer(e.damage, e.x, e.y);
          e.dashing = 0;
        }
        continue;
      }

      const slow = e.slowTimer > 0 ? 0.5 : 1;
      this.behave(e, dt, ctx, slow);
      if (e.boss) this.bossAura(e, dt, ctx);
    }
  }

  private behave(e: Enemy, dt: number, ctx: EnemyContext, slow: number): void {
    const dx = ctx.px - e.x;
    const dy = ctx.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    e.angle = Math.atan2(dy, dx);
    const lit = this.isLit(e, ctx);
    let speedMul = slow * e.buff;
    if (e.def.lightShy && lit) speedMul *= 0.55;
    if (e.def.requiresLight && !lit && ctx.visionUpgrade <= 0) speedMul *= 1.6;

    switch (e.def.behavior) {
      case 'chase': {
        const strafe = Math.sin(e.wobble * 0.6) * 0.25;
        e.vx = (nx - ny * strafe) * e.speed * speedMul;
        e.vy = (ny + nx * strafe) * e.speed * speedMul;
        break;
      }
      case 'dash': {
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 340) {
          e.dashing = 0.28;
          e.dashVx = nx * e.speed * 6.5;
          e.dashVy = ny * e.speed * 6.5;
          e.attackCd = 2.4;
          ctx.burst(e.x, e.y, 4, e.color, { speed: 80 });
        } else {
          e.vx = nx * e.speed * 0.5 * speedMul;
          e.vy = ny * e.speed * 0.5 * speedMul;
        }
        break;
      }
      case 'ranged': {
        const keep = 220;
        const dir = d > keep + 40 ? 1 : d < keep - 40 ? -1 : 0;
        e.vx = nx * e.speed * speedMul * dir;
        e.vy = ny * e.speed * speedMul * dir;
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 520) {
          e.attackCd = 2.1;
          ctx.shoot(e.x, e.y, e.angle, 250, e.damage, '#c9a3ff', true);
        }
        break;
      }
      case 'dive': {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'charge': {
        e.attackCd -= dt;
        if (e.stateTimer > 0) {
          // 蓄力：几乎停住并锁定方向，给玩家闪避的窗口
          e.stateTimer -= dt;
          e.vx *= 1 - Math.min(1, 7 * dt);
          e.vy *= 1 - Math.min(1, 7 * dt);
          if (e.stateTimer <= 0) {
            e.dashing = 0.24;
            e.dashVx = nx * e.speed * 8;
            e.dashVy = ny * e.speed * 8;
            ctx.burst(e.x, e.y, 6, e.color, { speed: 120 });
          }
        } else {
          e.vx = nx * e.speed * 0.5 * speedMul;
          e.vy = ny * e.speed * 0.5 * speedMul;
          if (e.attackCd <= 0 && d < 340) {
            e.stateTimer = 0.6;
            e.attackCd = 2.3;
            ctx.burst(e.x, e.y, 4, '#ffd24e', { speed: 60, size: 2, life: 0.4 });
          }
        }
        break;
      }
      case 'beacon': {
        e.vx = nx * e.speed * speedMul * 0.8;
        e.vy = ny * e.speed * speedMul * 0.8;
        ctx.addLight(e.x, e.y, 150 + Math.sin(e.wobble) * 14, 0.6);
        if (Math.random() < dt * 3) ctx.burst(e.x, e.y, 1, '#ffe9a8', { speed: 40, size: 2, life: 0.5 });
        break;
      }
      case 'tank': {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'drain': {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'bomber': {
        if (e.stateTimer > 0) {
          e.stateTimer -= dt;
          e.vx = 0;
          e.vy = 0;
          if (e.stateTimer <= 0) {
            const blast = 118;
            ctx.burst(e.x, e.y, 26, '#ff9d2e', { speed: 280, size: 4, life: 0.6 });
            ctx.addLight(e.x, e.y, 240, 1);
            ctx.shake(0.45);
            if (Math.hypot(e.x - ctx.px, e.y - ctx.py) <= blast) ctx.damagePlayer(e.damage, e.x, e.y);
            e.active = false;
            return;
          }
        } else if (d < 92 + e.radius) {
          e.stateTimer = 1.1;
          e.vx = 0;
          e.vy = 0;
        } else {
          e.vx = nx * e.speed * speedMul;
          e.vy = ny * e.speed * speedMul;
        }
        break;
      }
      default:
        break;
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.def.behavior !== 'bomber' && d < e.radius + 16) {
      ctx.damagePlayer(e.damage, e.x, e.y, e.def.behavior === 'drain' ? 22 : 0);
    }
  }

  private bossAura(e: Enemy, dt: number, ctx: EnemyContext): void {
    const hpFrac = e.hp / e.maxHp;
    const newPhase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (newPhase > e.phase) {
      e.phase = newPhase;
      e.speed *= 1.12;
      ctx.shake(0.6);
      ctx.burst(e.x, e.y, 40, e.color, { speed: 260, size: 5, life: 0.8 });
      ctx.addLight(e.x, e.y, 220, 0.9);
    }

    e.attackCd -= dt;
    if (e.defId === 'extinguisher') {
      if (e.attackCd <= 0) {
        e.attackCd = 3.4 - e.phase * 0.5;
        ctx.shoot(e.x, e.y, e.angle, 260, e.damage, '#8f7bff', true);
        const spokes = 8 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble, 200, e.damage * 0.6, '#b7a5ff', true);
        }
        ctx.snuffLight(0.18);
        ctx.shake(0.45);
      }
    } else if (e.defId === 'thornlord') {
      if (e.attackCd <= 0) {
        e.attackCd = 3.1 - e.phase * 0.45;
        const spokes = 9 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 0.8, 210, e.damage * 0.55, '#9fd45a', true);
        }
        for (let i = 0; i < e.phase + 1; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const dd = 90 + Math.random() * 190;
          ctx.spikes(ctx.px + Math.cos(a) * dd, ctx.py + Math.sin(a) * dd, 68);
        }
        if (e.phase >= 3) ctx.spawnAdd('moth', e.x + 60, e.y + 40);
        ctx.shake(0.5);
      }
    } else if (e.defId === 'emberwake') {
      if (e.attackCd <= 0) {
        e.attackCd = 2.6 - e.phase * 0.4;
        const spokes = 12 + e.phase * 4;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 1.6, 230, e.damage * 0.7, '#ff7a2f', true);
        }
        if (Math.random() < 0.5) {
          for (let i = 0; i < e.phase + 1; i += 1) {
            const a = Math.random() * Math.PI * 2;
            ctx.ignitGround(e.x + Math.cos(a) * 140, e.y + Math.sin(a) * 140);
          }
        }
        ctx.shake(0.5);
      }
    }
    ctx.addLight(e.x, e.y, 130 + e.phase * 20, 0.7);
  }

  draw(ctx: CanvasRenderingContext2D, time: number, px = 0, py = 0): void {
    ctx.save();
    for (const e of this.pool.all) {
      if (!e.active) continue;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      drawEnemy(ctx, e, time, px, py);
    }
    ctx.restore();
  }

  forEach(fn: (e: Enemy) => void): void {
    for (const e of this.pool.all) if (e.active) fn(e);
  }

  clear(): void {
    this.pool.clear();
  }

  get count(): number {
    return this.pool.activeCount;
  }

  get bosses(): Enemy[] {
    return this.pool.all.filter((e) => e.active && e.boss);
  }
}
