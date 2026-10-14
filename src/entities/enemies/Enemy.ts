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
  /** 首领专属招式的独立计时器（不和行为共用，免得贴脸时放不出招牌技） */
  bossCd: number;
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
  damagePlayer: (amount: number, x: number, y: number, drain?: number, source?: string) => void;
  shoot: (
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: string,
    enemy: boolean,
    owner?: string,
  ) => void;
  addLight: (x: number, y: number, r: number, intensity: number) => void;
  burst: (x: number, y: number, count: number, color: string, opts?: { speed?: number; size?: number; life?: number }) => void;
  onDeath: (e: Enemy) => void;
  snuffLight: (amount: number) => void;
  spawnAdd: (defId: string, x: number, y: number) => void;
  ignitGround: (x: number, y: number) => void;
  /** 在战场上留下一片「滞行雾」（织雾者） */
  fog: (x: number, y: number, r: number) => void;
  /**
   * 最近的、还亮着的灯台，或者玩家放下的那盏弃灯（吹灯客的目标）；没有就返回 null。
   * 弃灯也算在内：那盏小灯更脆，一口气就能吹灭。
   */
  pyreTarget: (x: number, y: number) => { x: number; y: number } | null;
  /**
   * 「分灯」放下的那盏弃灯（附近没有就返回 null）：黑暗会被它引走。
   * 只有本来就在追你的那些行为会跟过去——吹灯客（有自己的目标）与
   * 回响（追的是你一秒前站的地方）不在此列，这两种怪的性格才不会被抹平。
   */
  lureTarget?: (x: number, y: number) => { x: number; y: number } | null;
  /** 站在灯台边时把灯焰抽掉一点（吹灯客） */
  quench: (x: number, y: number, dt: number) => void;
  /** 夜咒「低语」：敌人每秒回复的最大生命比例 */
  regen: number;
  spikes: (x: number, y: number, r: number) => void;
  shake: (amount: number) => void;
}

export class EnemySystem {
  private nextId = 1;
  private ctxRef: EnemyContext | null = null;
  /** 玩家最近几秒的轨迹：给「回响」用的"你一秒前站的地方" */
  private trail: { x: number; y: number; t: number }[] = [];
  private clock = 0;
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
    bossCd: 0,
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
    // 认不出来的 id 一律按兜底那一种来：defId 也要跟着改成**解析后**的 id，
    // 否则这只怪活着的时候像 shade，死的时候 `ENEMY_MAP[e.defId].color` 会当场炸掉
    // （数据表里写错一个字，一局打到它死才崩，最难查）。
    e.defId = def.id;
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
    e.bossCd = 1.4;
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

  /** 取 delay 秒前的玩家位置（轨迹不足时返回 null）。 */
  private trailAt(delay: number): { x: number; y: number } | null {
    const target = this.clock - delay;
    let best: { x: number; y: number; t: number } | null = null;
    for (let i = this.trail.length - 1; i >= 0; i -= 1) {
      const s = this.trail[i];
      if (s.t <= target) {
        best = s;
        break;
      }
    }
    if (!best) return null;
    if (this.clock - best.t > delay * 2.2 + 0.6) return null;
    return { x: best.x, y: best.y };
  }

  update(dt: number, ctx: EnemyContext): void {
    this.ctxRef = ctx;
    this.clock += dt;
    this.trail.push({ x: ctx.px, y: ctx.py, t: this.clock });
    if (this.trail.length > 360) this.trail.splice(0, this.trail.length - 360);
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
    // 「蚀油」：贴着你时持续抽走灯油，逼你拉开距离
    for (const e of this.pool.all) {
      if (!e.active || e.affix !== 'sappers') continue;
      const dx = ctx.px - e.x;
      const dy = ctx.py - e.y;
      if (dx * dx + dy * dy > 150 * 150) continue;
      ctx.snuffLight(dt * 0.02);
      if (Math.random() < dt * 5) ctx.burst(ctx.px, ctx.py, 1, '#c98fe8', { speed: 46, size: 2, life: 0.45 });
    }
    for (const e of this.pool.all) {
      if (!e.active) continue;
      e.wobble += dt * 4;
      if (e.spawnTimer > 0) e.spawnTimer -= dt;
      if (ctx.regen > 0 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ctx.regen * dt);
        if (Math.random() < dt * 1.5) ctx.burst(e.x, e.y, 1, '#8affc1', { speed: 24, size: 2, life: 0.4 });
      }
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
          ctx.damagePlayer(e.damage, e.x, e.y, 0, e.defId);
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
    // 地上有灯的话，"追谁"这件事整个换一个人：移动与射程都以那盏灯为准。
    // 两个例外：吹灯客有自己的目标（灯台 / 弃灯），回响追的是你过去的脚印。
    const behavior = e.def.behavior;
    const lure =
      behavior === 'quench' || behavior === 'echo' ? null : (ctx.lureTarget?.(e.x, e.y) ?? null);
    const tx = lure ? lure.x : ctx.px;
    const ty = lure ? lure.y : ctx.py;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    e.angle = Math.atan2(dy, dx);
    // 有几个行为是"朝你开火 / 抽你的油"：它们仍旧认你，只是被灯牵着走
    const pdx = ctx.px - e.x;
    const pdy = ctx.py - e.y;
    const playerDist = lure ? Math.hypot(pdx, pdy) || 1 : d;
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
        if (e.attackCd <= 0 && playerDist < 520) {
          e.attackCd = 2.1;
          ctx.shoot(e.x, e.y, Math.atan2(pdy, pdx), 250, e.damage, '#c9a3ff', true, e.defId);
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
      case 'echo': {
        // 追的是"你一秒前站的地方"，而不是你本人——所以直线逃会被抄近路
        const past = this.trailAt(e.def.trailDelay ?? 1);
        const tx = past ? past.x : ctx.px;
        const ty = past ? past.y : ctx.py;
        const ex = tx - e.x;
        const ey = ty - e.y;
        const ed = Math.hypot(ex, ey) || 1;
        const ux = ex / ed;
        const uy = ey / ed;
        const drift = Math.sin(e.wobble * 0.9) * 0.18;
        e.vx = (ux - uy * drift) * e.speed * speedMul;
        e.vy = (uy + ux * drift) * e.speed * speedMul;
        e.angle = Math.atan2(ey, ex);
        if (Math.random() < dt * 3) ctx.burst(e.x, e.y, 1, '#9fd8ff', { speed: 22, size: 2, life: 0.5 });
        break;
      }
      case 'weaver': {
        // 缓慢逼近，边走边在脚下织出滞行雾
        e.vx = nx * e.speed * speedMul * 0.7;
        e.vy = ny * e.speed * speedMul * 0.7;
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 640) {
          e.attackCd = 3.6;
          ctx.fog(e.x, e.y, 134);
          ctx.burst(e.x, e.y, 12, '#9fb7c9', { speed: 64, size: 4, life: 0.7 });
        }
        break;
      }
      case 'siphon': {
        // 吊在中距离持续抽灯油：站着不动只会越来越黑
        const keep = 300;
        const dir = d > keep + 30 ? 1 : d < keep - 30 ? -1 : 0;
        e.vx = nx * e.speed * speedMul * dir;
        e.vy = ny * e.speed * speedMul * dir;
        if (playerDist < 460) {
          ctx.snuffLight(dt * 0.025);
          if (Math.random() < dt * 8) ctx.burst(e.x, e.y, 1, '#c98fe8', { speed: 30, size: 2, life: 0.5 });
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
      case 'quench': {
        // 它不管你，只管你点亮的灯台：扑上去把灯焰一点点吹灭
        const pyre = ctx.pyreTarget(e.x, e.y);
        if (pyre) {
          const tx = pyre.x - e.x;
          const ty = pyre.y - e.y;
          const tr = Math.hypot(tx, ty) || 1;
          e.angle = Math.atan2(ty, tx);
          if (tr > 52) {
            e.vx = (tx / tr) * e.speed * speedMul;
            e.vy = (ty / tr) * e.speed * speedMul;
          } else {
            e.vx *= 0.2;
            e.vy *= 0.2;
            ctx.quench(e.x, e.y, dt);
            if (Math.random() < dt * 6) ctx.burst(e.x, e.y - 12, 1, '#b6a6ff', { speed: 40, size: 2, life: 0.5 });
          }
        } else {
          // 没有灯可吹，就退化成普通的追击
          const strafe = Math.sin(e.wobble * 0.6) * 0.22;
          e.vx = (nx - ny * strafe) * e.speed * speedMul;
          e.vy = (ny + nx * strafe) * e.speed * speedMul;
        }
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
            if (Math.hypot(e.x - ctx.px, e.y - ctx.py) <= blast) ctx.damagePlayer(e.damage, e.x, e.y, 0, e.defId);
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
      const drain = e.def.behavior === 'drain' ? 22 : e.affix === 'thorn' ? 9 : 0;
      ctx.damagePlayer(e.damage, e.x, e.y, drain, e.defId);
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

    e.bossCd -= dt;
    if (e.defId === 'extinguisher') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.4 - e.phase * 0.5;
        ctx.shoot(e.x, e.y, e.angle, 260, e.damage, '#8f7bff', true, e.defId);
        const spokes = 8 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble, 200, e.damage * 0.6, '#b7a5ff', true, e.defId);
        }
        ctx.snuffLight(0.18);
        ctx.shake(0.45);
      }
    } else if (e.defId === 'thornlord') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.1 - e.phase * 0.45;
        const spokes = 9 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 0.8, 210, e.damage * 0.55, '#9fd45a', true, e.defId);
        }
        for (let i = 0; i < e.phase + 1; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const dd = 90 + Math.random() * 190;
          ctx.spikes(ctx.px + Math.cos(a) * dd, ctx.py + Math.sin(a) * dd, 68);
        }
        if (e.phase >= 3) ctx.spawnAdd('moth', e.x + 60, e.y + 40);
        ctx.shake(0.5);
      }
    } else if (e.defId === 'nightfall') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.0 - e.phase * 0.45;
        // 环形弹幕
        const spokes = 13 + e.phase * 4;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 1.2, 220, e.damage * 0.6, '#b7a5ff', true, e.defId);
        }
        // 抽走灯火 —— 视野被夺走的那几秒，才是"终夜"真正的主场
        ctx.snuffLight(0.16);
        if (e.phase >= 2) {
          // 召唤回响：它们会沿着你刚才走过的路追过来
          for (let i = 0; i < e.phase - 1; i += 1) {
            const a = Math.random() * Math.PI * 2;
            ctx.spawnAdd('echo', e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120);
          }
        }
        if (e.phase >= 3) {
          // 在你脚下结出滞行雾：想靠跑位拖时间会越来越难
          ctx.fog(ctx.px, ctx.py, 150);
          ctx.fog(ctx.px + (Math.random() - 0.5) * 260, ctx.py + (Math.random() - 0.5) * 260, 120);
        }
        ctx.shake(0.5);
      }
    } else if (e.defId === 'emberwake') {
      if (e.bossCd <= 0) {
        e.bossCd = 2.6 - e.phase * 0.4;
        const spokes = 12 + e.phase * 4;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 1.6, 230, e.damage * 0.7, '#ff7a2f', true, e.defId);
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

  draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    px = 0,
    py = 0,
    view?: { x: number; y: number; halfW: number; halfH: number },
  ): void {
    ctx.save();
    // 屏幕外的敌人不必画：每个敌人都要起渐变、描边、画血雾，几十只一起就是几毫秒。
    // 留的余量足够装下首领光环与出生弹出，边缘不会突然少一只。
    const pad = 200;
    for (const e of this.pool.all) {
      if (!e.active) continue;
      if (
        view &&
        (Math.abs(e.x - view.x) > view.halfW + e.radius * 2 + pad ||
          Math.abs(e.y - view.y) > view.halfH + e.radius * 2 + pad)
      ) {
        continue;
      }
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
    this.trail.length = 0;
  }

  get count(): number {
    return this.pool.activeCount;
  }

  get bosses(): Enemy[] {
    return this.pool.all.filter((e) => e.active && e.boss);
  }
}
