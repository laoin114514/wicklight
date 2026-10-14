import { baseStats, PASSIVE_MAP, type PlayerStats } from '../data/upgrades';
import { RELIC_MAP, TRIBES, type RelicMods, type RelicTribeId } from '../data/relics';
import { weaponAt, WEAPON_MAP } from '../data/weapons';
import type { Enemy, EnemySystem } from './enemies/Enemy';
import type { ParticleSystem } from './Particle';
import type { ProjectileSystem } from './Projectile';
import { clamp, TAU } from '../core/MathUtils';

export interface PlayerContext {
  enemies: EnemySystem;
  projectiles: ProjectileSystem;
  particles: ParticleSystem;
  addLight: (x: number, y: number, r: number, i: number, flicker?: number) => void;
  addGlow: (x: number, y: number, r: number, i: number) => void;
  audio: (name: string) => void;
  shake: (amount: number) => void;
  hurt: (amount: number) => void;
  hit: (e: Enemy, damage: number, crit: boolean, kx: number, ky: number, knockback: number, opts?: { burn?: number; slow?: number }) => boolean;
  findTarget: (x: number, y: number, maxDist: number, requireLight?: boolean) => Enemy | null;
  chainZap: (x: number, y: number, damage: number, jumps: number, range: number, color: string, opts: { burn?: number; slow?: number }) => void;
  /** 光矛：一条贯穿光束，沿途全部命中 */
  beam: (
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    damage: number,
    color: string,
    opts?: { burn?: number; slow?: number; knockback?: number },
  ) => void;
  /** 燃爆真正放出去的那一刻（用于悬赏计数等）。 */
  onNova: () => void;
}

export interface PlayerFlags {
  extraProjectiles: number;
  lifesteal: number;
  chill: number;
  contactMult: number;
  goldMult: number;
  novaHeal: number;
  /** 夜枭：灯油偏低时的额外伤害 */
  lowOilDamage: number;
  /** 守灯人：燃爆后的短时伤害加成（同时返还灯油） */
  novaBuff: number;
}

interface OrbitState {
  angle: number;
  hitCooldown: Map<number, number>;
}

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 14;
  angle = 0;
  hp = 100;
  stats: PlayerStats = baseStats();
  private base: PlayerStats = baseStats();
  weapons = new Map<string, number>();
  passives = new Map<string, number>();
  relics = new Set<string>();
  flags: PlayerFlags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0 };
  oil = 1;
  oilMax = 1;
  /** 本局内由祭坛带来的长期修正（recomputeStats 会重新套用）。 */
  shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
  /** 本局由「灯台」累积的余温：点亮的灯台越多，灯火越旺、伤害越高。 */
  pyreMods = { damageMult: 1, lightMult: 1 };
  brightness = 1;
  lightRadius = 300;
  invuln = 0;
  dashTimer = 0;
  dashCd = 0;
  dashDirX = 0;
  dashDirY = 0;
  novaCd = 0;
  /** 燃爆流派：由 lanternId 决定，赋予一次燃爆完全不同的解法 */
  novaStyle = 'warden';
  private novaBuffTimer = 0;
  moving = false;
  private cooldowns = new Map<string, number>();
  private orbit: OrbitState = { angle: 0, hitCooldown: new Map() };
  private hitFlash = 0;
  damageMult = 1;
  oilDecayPerSec = 0.018;
  /** 地形减速（织雾者的滞行雾 / 寒潮的霜冻）：每帧由 Game 重新写入，1 = 不受影响 */
  terrainSlow = 1;
  /** 霜冻带来的额外灯油耗率（1 = 不受影响） */
  terrainOil = 1;
  /** 霜冻带来的灯火衰减（1 = 不受影响） */
  terrainLight = 1;
  /** 夜咒「枯灯」带来的灯火衰减倍率 */
  curseOilMult = 1;
  revives = 0;
  lastDamageSource = { x: 0, y: 0 };

  constructor() {
    this.hp = this.stats.maxHp;
  }

  reset(stats: PlayerStats, model: { weapon: string; passive: string }): void {
    this.base = { ...stats };
    this.stats = { ...stats };
    this.hp = stats.maxHp;
    this.weapons.clear();
    this.passives.clear();
    this.relics.clear();
    this.flags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0 };
    this.shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
    this.pyreMods = { damageMult: 1, lightMult: 1 };
    this.weapons.set(model.weapon, 1);
    this.addPassive(model.passive, 1);
    this.oil = 1;
    this.brightness = 1;
    this.terrainSlow = 1;
    this.terrainOil = 1;
    this.terrainLight = 1;
    this.curseOilMult = 1;
    this.invuln = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.novaCd = 0;
    this.cooldowns.clear();
    this.orbit.hitCooldown.clear();
    this.recomputeStats();
    this.hp = this.stats.maxHp;
  }

  addWeapon(id: string): void {
    if (this.weapons.has(id)) return;
    this.weapons.set(id, 1);
  }

  levelWeapon(id: string): void {
    const cur = this.weapons.get(id) ?? 0;
    this.weapons.set(id, cur + 1);
  }

  addPassive(id: string, level = 1): void {
    this.passives.set(id, (this.passives.get(id) ?? 0) + level);
  }

  addRelic(id: string): boolean {
    if (this.relics.has(id)) return false;
    this.relics.add(id);
    const def = RELIC_MAP[id];
    if (def?.mods.revives) this.revives += def.mods.revives;
    this.recomputeStats();
    return true;
  }

  /** 熔铸用：把一件遗物取下来（遗物给的复活数要一并还回去，不然会凭空多命）。 */
  removeRelic(id: string): boolean {
    if (!this.relics.has(id)) return false;
    this.relics.delete(id);
    const def = RELIC_MAP[id];
    if (def?.mods.revives) this.revives = Math.max(0, this.revives - def.mods.revives);
    this.recomputeStats();
    return true;
  }

  private countOf(st: { count: number }): number {
    return Math.max(1, Math.round(st.count) + this.flags.extraProjectiles);
  }

  passiveLevel(id: string): number {
    return this.passives.get(id) ?? 0;
  }

  recomputeStats(): void {
    this.stats = { ...this.base };
    for (const [id, lvl] of this.passives) {
      PASSIVE_MAP[id]?.apply(this.stats, lvl);
    }
    this.flags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0 };
    for (const id of this.relics) {
      const m = RELIC_MAP[id]?.mods;
      if (m) this.applyRelicMods(m);
    }
    // 灯火共鸣：同族遗物凑够数量，额外叠一档修正
    for (const tribe of TRIBES) {
      const tier = this.tribeTier(tribe.id);
      for (let i = 0; i < tier; i += 1) this.applyRelicMods(tribe.tiers[i].mods);
    }
    const sm = this.shrineMods;
    this.stats.damageMult *= sm.damageMult;
    this.stats.maxHp *= sm.maxHpMult;
    this.stats.oilDecayMult *= sm.oilDecayMult;
    this.stats.moveSpeed *= sm.moveSpeedMult;
    this.stats.critChance += sm.critChance;
    this.flags.goldMult *= sm.goldMult;
    this.stats.damageMult *= this.pyreMods.damageMult;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  /** 把一份遗物修正套用到当前属性上（遗物与共鸣共用同一套规则）。 */
  private applyRelicMods(m: RelicMods): void {
    if (m.damageMult) this.stats.damageMult *= 1 + m.damageMult;
    if (m.maxHpMult) this.stats.maxHp *= 1 + m.maxHpMult;
    if (m.pickupMult) this.stats.pickupRange *= 1 + m.pickupMult;
    if (m.moveSpeedMult) this.stats.moveSpeed *= 1 + m.moveSpeedMult;
    if (m.critChance) this.stats.critChance += m.critChance;
    if (m.critMult) this.stats.critMult += m.critMult;
    if (m.dashMult) this.stats.dashCooldown *= Math.max(0.25, 1 - m.dashMult);
    if (m.regen) this.stats.regen += m.regen;
    if (m.oilDecayMult) this.stats.oilDecayMult *= Math.max(0.1, 1 + m.oilDecayMult);
    if (m.oilGainMult) this.stats.oilGainMult *= 1 + m.oilGainMult;
    if (m.areaMult) this.stats.areaMult *= 1 + m.areaMult;
    if (m.cooldownMult) this.stats.cooldownMult *= Math.max(0.3, 1 + m.cooldownMult);
    this.flags.extraProjectiles += m.extraProjectiles ?? 0;
    this.flags.lifesteal += m.lifesteal ?? 0;
    this.flags.chill = Math.max(this.flags.chill, m.chill ?? 0);
    this.flags.contactMult *= 1 + (m.contactMult ?? 0);
    this.flags.goldMult *= 1 + (m.goldMult ?? 0);
    this.flags.novaHeal += m.novaHeal ?? 0;
    if (m.lowOilDamage) this.flags.lowOilDamage = Math.max(this.flags.lowOilDamage, m.lowOilDamage);
    if (m.novaBuff) this.flags.novaBuff = Math.max(this.flags.novaBuff, m.novaBuff);
  }

  /** 当前持有某一族遗物的数量。 */
  tribeCount(id: RelicTribeId): number {
    let n = 0;
    for (const relicId of this.relics) if (RELIC_MAP[relicId]?.tribe === id) n += 1;
    return n;
  }

  /** 某一族已经解锁到第几档（0 = 还没共鸣，1 = 3 件，2 = 5 件）。 */
  tribeTier(id: RelicTribeId): number {
    const def = TRIBES.find((t) => t.id === id);
    if (!def) return 0;
    const n = this.tribeCount(id);
    let tier = 0;
    for (let i = 0; i < def.tiers.length; i += 1) if (n >= def.tiers[i].count) tier = i + 1;
    return tier;
  }

  /** 各族当前档位，用来判断「刚凑齐了哪一族」。 */
  tribeTiers(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of TRIBES) out[t.id] = this.tribeTier(t.id);
    return out;
  }

  get oilFrac(): number {
    return clamp(this.oil / this.oilMax, 0, 1);
  }

  get damageScale(): number {
    let s = 0.65 + this.oilFrac * 0.7;
    if (this.flags.lowOilDamage > 0 && this.oilFrac < 0.35) s *= 1 + this.flags.lowOilDamage;
    if (this.novaBuffTimer > 0) s *= 1 + this.flags.novaBuff;
    return s;
  }

  takeDamage(amount: number, x: number, y: number, drain = 0): boolean {
    if (this.invuln > 0 || this.dashTimer > 0) return false;
    this.hp -= amount;
    this.invuln = 0.65;
    this.hitFlash = 0.2;
    this.lastDamageSource = { x, y };
    if (drain > 0) this.oil = Math.max(0, this.oil - drain / 100);
    return true;
  }

  update(dt: number, input: { moveX: number; moveY: number; dash: boolean; nova: boolean }, ctx: PlayerContext): void {
    const s = this.stats;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.novaCd > 0) this.novaCd -= dt;
    if (this.novaBuffTimer > 0) this.novaBuffTimer -= dt;
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, Math.max(0, v - dt));
    for (const [k, v] of this.orbit.hitCooldown) {
      const nv = v - dt;
      if (nv <= 0) this.orbit.hitCooldown.delete(k);
      else this.orbit.hitCooldown.set(k, nv);
    }

    // Oil decay / burning
    this.oil = Math.max(0, this.oil - this.oilDecayPerSec * s.oilDecayMult * this.curseOilMult * this.terrainOil * dt);
    if (this.oil <= 0) {
      this.hp -= 3 * dt;
      if (Math.random() < dt * 8) ctx.particles.burst(this.x, this.y, 1, '#3a4a7a', { speed: 30, size: 3, life: 0.5 });
    }
    this.brightness = 0.35 + this.oilFrac * 0.65;
    this.lightRadius = (96 + this.oilFrac * 224) * this.pyreMods.lightMult * this.terrainLight;

    // Movement
    let mvx = input.moveX;
    let mvy = input.moveY;
    const ml = Math.hypot(mvx, mvy);
    if (ml > 1) {
      mvx /= ml;
      mvy /= ml;
    }
    this.moving = ml > 0.05;

    if (input.dash && this.dashCd <= 0) {
      const d = Math.hypot(mvx, mvy) > 0.1 ? { x: mvx, y: mvy } : { x: Math.cos(this.angle), y: Math.sin(this.angle) };
      this.dashDirX = d.x;
      this.dashDirY = d.y;
      this.dashTimer = 0.18;
      this.dashCd = s.dashCooldown;
      this.invuln = Math.max(this.invuln, 0.32);
      ctx.audio('dash');
      ctx.particles.burst(this.x, this.y, 10, '#7be0ff', { speed: 140, size: 3, life: 0.35 });
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const ds = s.moveSpeed * 3.4;
      this.vx = this.dashDirX * ds;
      this.vy = this.dashDirY * ds;
    } else {
      const accel = 2400 * dt;
      const walk = s.moveSpeed * this.terrainSlow;
      this.vx += (mvx * walk - this.vx) * Math.min(1, accel / Math.max(1, s.moveSpeed));
      this.vy += (mvy * walk - this.vy) * Math.min(1, accel / Math.max(1, s.moveSpeed));
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Aim toward nearest visible target
    const target = ctx.findTarget(this.x, this.y, 520, true);
    if (target) {
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    } else if (ml > 0.1) {
      this.angle = Math.atan2(mvy, mvx);
    }

    // Light
    ctx.addLight(this.x, this.y, this.lightRadius, this.brightness, 0.04);
    ctx.addLight(this.x, this.y, this.lightRadius * 0.46, Math.min(1, this.brightness * 0.85), 0);
    // 火光的暖调：让"被照亮"看起来像被火点着，而不是被灰雾罩住
    ctx.addGlow(this.x, this.y, this.lightRadius * 0.92, 0.55 * this.brightness);

    // Regen
    if (s.regen > 0) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
    if (s.healOnLight > 0 && this.oilFrac > 0.1) this.hp = Math.min(s.maxHp, this.hp + s.healOnLight * dt);

    // Nova (燃爆) consumes oil
    if (input.nova && this.novaCd <= 0) {
      this.novaCd = Math.max(2.4, 6 - this.passiveLevel('haste') * 0.4);
      this.oil = Math.max(0, this.oil - 0.16);
      this.doNova(ctx);
    }

    this.updateWeapons(dt, ctx, target);

    // Lantern contact burn: enemies pressing against the flame catch fire.
    ctx.enemies.forEach((e) => {
      const rr = this.radius + e.radius + 8;
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 <= rr * rr) {
        const cd = this.orbit.hitCooldown.get(e.id) ?? 0;
        if (cd <= 0) {
          this.orbit.hitCooldown.set(e.id, 0.25);
          const dmg = 9 * this.stats.damageMult * this.damageScale * this.flags.contactMult;
          ctx.hit(e, dmg, false, e.x - this.x, e.y - this.y, 40, { burn: 1, slow: this.flags.chill });
        }
      }
    });
  }

  private doNova(ctx: PlayerContext): void {
    const style = this.novaStyle;
    let radius = 180 * this.stats.areaMult;
    let power = 1;
    let knock = 420;
    if (style === 'emberkin') {
      radius *= 1.3;
      power = 1.45;
      knock = 540;
    } else if (style === 'shadewalker') {
      radius *= 0.85;
    } else if (style === 'warden') {
      knock = 760;
    }
    const color = style === 'lamplighter' ? '#7be0ff' : style === 'shadewalker' ? '#ff4d6d' : '#ffb14e';
    ctx.onNova();
    ctx.audio('nova');
    ctx.shake(0.5);
    ctx.particles.shockwave(this.x, this.y, color, radius, 0.5);
    ctx.particles.burst(this.x, this.y, 34, '#ffd24e', { speed: 320, size: 4, life: 0.7 });

    // 每个流派的燃爆有各自的"性格"
    if (style === 'warden') {
      // 守夜人：把威胁推开，并短促地brighten一下
      this.hp = Math.min(this.stats.maxHp, this.hp + 8);
      ctx.addLight(this.x, this.y, radius * 1.5, 0.95);
    } else if (style === 'lamplighter') {
      // 灯语者：照亮四野并把整片区域点燃，返还一点灯油
      ctx.addLight(this.x, this.y, radius * 2.0, 1);
      this.oil = Math.min(this.oilMax, this.oil + 0.06);
    } else if (style === 'shadewalker') {
      // 暗行者：以黑暗为刃，眩晕敌人并借机隐身
      this.invuln = Math.max(this.invuln, 0.9);
      ctx.addLight(this.x, this.y, radius * 0.7, 0.35);
    } else if (style === 'emberkin') {
      ctx.addLight(this.x, this.y, radius * 1.2, 1);
    }

    ctx.enemies.forEach((e) => {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= radius + e.radius) {
        const dmg = 34 * this.stats.damageMult * this.damageScale * power;
        const crit = Math.random() < this.stats.critChance;
        const applied = crit ? dmg * this.stats.critMult : dmg;
        const opts: { burn?: number; slow?: number } = {};
        if (style === 'emberkin') opts.burn = 3;
        else if (style === 'lamplighter') opts.burn = 1;
        else if (style === 'shadewalker') opts.slow = 2.5;
        ctx.hit(e, applied, crit, e.x - this.x, e.y - this.y, knock, opts);
      }
    });

    if (this.flags.novaHeal > 0) this.hp = Math.min(this.stats.maxHp, this.hp + this.flags.novaHeal);
    if (this.flags.novaBuff > 0) {
      this.novaBuffTimer = 3;
      this.oil = Math.min(this.oilMax, this.oil + 0.08);
    }
  }

  private updateWeapons(dt: number, ctx: PlayerContext, target: Enemy | null): void {
    for (const [id, level] of this.weapons) {
      const def = WEAPON_MAP[id];
      if (!def) continue;
      const st = weaponAt(id, level);
      const area = this.stats.areaMult;
      const dmg = st.damage * this.stats.damageMult * this.damageScale;

      if (def.kind === 'orbit') {
        this.orbit.angle += st.speed * dt;
        const count = this.countOf(st);
        const radius = st.range * area * 1.4;
        for (let i = 0; i < count; i += 1) {
          const a = this.orbit.angle + (i / count) * TAU;
          const ox = this.x + Math.cos(a) * radius;
          const oy = this.y + Math.sin(a) * radius;
          ctx.addLight(ox, oy, 40, 0.5);
          ctx.enemies.forEach((e) => {
            const rr = st.radius * (1 + 0.3 * area) + e.radius;
            if ((e.x - ox) ** 2 + (e.y - oy) ** 2 <= rr * rr) {
              const cd = this.orbit.hitCooldown.get(e.id) ?? 0;
              if (cd <= 0) {
                this.orbit.hitCooldown.set(e.id, 0.35);
                this.hitEnemy(e, dmg, ctx, st, e.x - ox, e.y - oy);
              }
            }
          });
        }
        continue;
      }

      const cd = this.cooldowns.get(id) ?? 0;
      if (cd > 0) continue;
      this.cooldowns.set(id, st.cooldown * this.stats.cooldownMult);
      this.fireWeapon(def.kind, id, st, dmg, area, ctx, target);
    }
  }

  private fireWeapon(
    kind: string,
    id: string,
    st: ReturnType<typeof weaponAt>,
    dmg: number,
    area: number,
    ctx: PlayerContext,
    target: Enemy | null,
  ): void {
    const def = WEAPON_MAP[id];
    const aim = target ? Math.atan2(target.y - this.y, target.x - this.x) : this.angle;
    switch (kind) {
      case 'wisp': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (i - (count - 1) / 2) * 0.35;
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed,
            vy: Math.sin(a) * st.speed,
            damage: dmg,
            radius: st.radius,
            color: def.color,
            pierce: st.pierce,
            homing: 6,
            slow: st.slow,
            maxLife: 1.6,
            weaponId: id,
          });
        }
        ctx.audio('wisp');
        break;
      }
      case 'shard': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (i - (count - 1) / 2) * 0.12;
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed,
            vy: Math.sin(a) * st.speed,
            damage: dmg,
            radius: st.radius,
            color: def.color,
            pierce: st.pierce,
            slow: st.slow,
            maxLife: (st.range / st.speed) * 1.2,
            weaponId: id,
          });
        }
        ctx.audio('shoot');
        break;
      }
      case 'arc': {
        ctx.chainZap(this.x, this.y, dmg, Math.max(1, st.pierce + this.countOf(st) - 1), st.range * area, def.color, { burn: st.burn, slow: st.slow });
        ctx.audio('wisp');
        break;
      }
      case 'beam': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (i - (count - 1) / 2) * 0.1;
          ctx.beam(this.x, this.y, a, st.range * area, st.radius, dmg, def.color, {
            burn: st.burn,
            slow: st.slow,
            knockback: st.knockback,
          });
        }
        ctx.audio('shoot');
        break;
      }
      case 'boomerang': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (i - (count - 1) / 2) * 0.55;
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed,
            vy: Math.sin(a) * st.speed,
            damage: dmg,
            radius: st.radius,
            color: def.color,
            pierce: 99,
            spin: 0,
            boomerang: 9,
            knockback: st.knockback,
            slow: st.slow,
            // 回旋刃的寿命按"去程 = range"来定，剩下 60% 用来掉头飞回来
            maxLife: (st.range / st.speed) * 2.6,
            weaponId: id,
          });
        }
        ctx.audio('wisp');
        break;
      }
      case 'fireball': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (i - (count - 1) / 2) * 0.28;
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed,
            vy: Math.sin(a) * st.speed,
            damage: dmg,
            radius: st.radius,
            color: def.color,
            explode: st.radius * 2.2 * area,
            knockback: 200,
            burn: 1,
            slow: st.slow,
            maxLife: st.range / st.speed,
            weaponId: id,
          });
        }
        ctx.audio('shoot');
        break;
      }
      case 'spray': {
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          const a = aim + (Math.random() - 0.5) * st.spread;
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed * 1.6,
            vy: Math.sin(a) * st.speed * 1.6,
            damage: dmg,
            radius: st.radius,
            color: def.color,
            burn: st.burn,
            maxLife: (st.range / (st.speed * 1.6)) * 1.1,
            trail: false,
            weaponId: id,
          });
        }
        break;
      }
      case 'whip': {
        const range = st.range * area;
        const half = st.spread / 2;
        ctx.particles.shockwave(this.x + Math.cos(aim) * range * 0.5, this.y + Math.sin(aim) * range * 0.5, def.color, range * 0.5, 0.28);
        ctx.enemies.forEach((e) => {
          const dx = e.x - this.x;
          const dy = e.y - this.y;
          const d = Math.hypot(dx, dy);
          if (d > range + e.radius) return;
          let diff = Math.atan2(dy, dx) - aim;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          if (Math.abs(diff) <= half) {
            this.hitEnemy(e, dmg, ctx, st, dx, dy);
            ctx.enemies.applyBurn(e, 1);
          }
        });
        ctx.audio('hit');
        break;
      }
      default:
        break;
    }
  }

  private hitEnemy(e: Enemy, dmg: number, ctx: PlayerContext, st: { knockback: number; burn?: number; slow?: number }, kx: number, ky: number): void {
    const crit = Math.random() < this.stats.critChance;
    const finalDmg = dmg * (crit ? this.stats.critMult : 1);
    ctx.hit(e, finalDmg, crit, kx, ky, st.knockback, { burn: st.burn ?? 0, slow: Math.max(st.slow ?? 0, this.flags.chill) });
  }

  draw(ctx: CanvasRenderingContext2D, time: number, opts?: { cone?: number; halo?: number }): void {
    const R = this.radius;
    const coneScale = opts?.cone ?? 1;
    const haloScale = opts?.halo ?? 1;
    const speed = Math.hypot(this.vx, this.vy);
    const bob = this.moving ? Math.sin(time * 14) * 1.5 : Math.sin(time * 3) * 0.8;
    const blink = this.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    const flick = 0.82 + Math.sin(time * 12) * 0.18;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    // ── 滞行雾：脚被拖住时给一个明确的"黏"提示，免得玩家以为手感出了问题 ──
    if (this.terrainSlow < 1) {
      ctx.save();
      const pulse = 0.5 + Math.sin(time * 6) * 0.16;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#dceaf5';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 8]);
      ctx.beginPath();
      ctx.ellipse(0, R * 0.55, R * 1.7, R * 0.85, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#9fb7c9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, R * 0.55, R * 1.25, R * 0.62, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // ── 冲刺残影（在身体之下） ──
    if (this.dashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#8fa7ff';
      for (let i = 1; i <= 3; i += 1) {
        const t = i / 3;
        ctx.globalAlpha = 0.26 * (1 - t);
        ctx.beginPath();
        ctx.ellipse(
          -this.dashDirX * R * 2.4 * i,
          -this.dashDirY * R * 2.4 * i,
          R * (1.05 - t * 0.3),
          R * (1.15 - t * 0.3),
          0,
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 拖尾披风（跟随移动方向向后飘） ──
    if (speed > 20) {
      const back = Math.atan2(-this.vy, -this.vx);
      const len = R * (1.0 + Math.min(1, speed / 240) * 1.5);
      const flutter = Math.sin(time * 10) * R * 0.16;
      ctx.save();
      ctx.rotate(back);
      const cape = ctx.createLinearGradient(0, 0, len, 0);
      cape.addColorStop(0, 'rgba(30,36,66,0.95)');
      cape.addColorStop(1, 'rgba(16,19,38,0.15)');
      ctx.fillStyle = cape;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72);
      ctx.quadraticCurveTo(len * 0.7, -R * 0.5 + flutter, len, -flutter * 0.6);
      ctx.quadraticCurveTo(len * 0.7, R * 0.5 + flutter, 0, R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── 环绕火球（在身体之下） ──
    for (const [id, level] of this.weapons) {
      const def = WEAPON_MAP[id];
      if (!def || def.kind !== 'orbit') continue;
      const st = weaponAt(id, level);
      const count = this.countOf(st);
      const radius = st.range * this.stats.areaMult * 1.4;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i += 1) {
        const a = this.orbit.angle + (i / count) * TAU;
        const ox = Math.cos(a) * radius;
        const oy = Math.sin(a) * radius * 0.86;
        const fl = 0.85 + Math.sin(time * 9 + i * 2.1) * 0.15;
        const rad = st.radius * 1.8 * fl;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.28, def.color);
        g.addColorStop(0.62, 'rgba(255,120,40,0.35)');
        g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, rad, 0, TAU);
        ctx.fill();
        // 拖尾的小火星
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'rgba(255,180,90,0.8)';
        ctx.beginPath();
        ctx.arc(ox - Math.cos(a) * 6, oy - Math.sin(a) * 6, st.radius * 0.32, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ── 灯焰光晕 ──
    ctx.globalCompositeOperation = 'lighter';
    const haloR = (40 * this.brightness + 18) * haloScale;
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
    halo.addColorStop(0, `rgba(255,216,150,${0.34 * flick})`);
    halo.addColorStop(0.5, `rgba(255,150,60,${0.13 * flick})`);
    halo.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // ── 提灯照向瞄准方向的锥形光（加法混合，像"光"而不是半透明色块） ──
    ctx.save();
    ctx.rotate(this.angle);
    ctx.globalCompositeOperation = 'lighter';
    const coneLen = (130 + 150 * this.brightness) * (0.6 + 0.4 * coneScale);
    const cone = ctx.createLinearGradient(0, 0, this.radius + coneLen, 0);
    cone.addColorStop(0, `rgba(255,206,140,${0.16 * flick * coneScale})`);
    cone.addColorStop(0.5, `rgba(255,172,86,${0.06 * flick * coneScale})`);
    cone.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.6, -3);
    ctx.quadraticCurveTo(this.radius + coneLen * 0.6, -34, this.radius + coneLen, -62);
    ctx.lineTo(this.radius + coneLen, 62);
    ctx.quadraticCurveTo(this.radius + coneLen * 0.6, 34, this.radius * 0.6, 3);
    ctx.closePath();
    ctx.fill();
    // 锥心的亮芯
    const core = ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + coneLen * 0.55);
    core.addColorStop(0, `rgba(255,224,168,${0.2 * flick * coneScale})`);
    core.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.6, -3);
    ctx.lineTo(this.radius + coneLen * 0.62, -14);
    ctx.lineTo(this.radius + coneLen * 0.62, 14);
    ctx.lineTo(this.radius * 0.6, 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 地面投影 ──
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#04060d';
    ctx.beginPath();
    ctx.ellipse(2, R * 1.02, R * 1.06, R * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ── 斗篷身形：上圆下摆 ──
    const cloak = this.hitFlash > 0 ? '#ff6b6b' : blink ? '#ffffff' : '#2b3357';
    const cloth = ctx.createRadialGradient(-R * 0.34, -R * 0.56, R * 0.12, 0, R * 0.1, R * 1.7);
    cloth.addColorStop(0, this.hitFlash > 0 || blink ? cloak : '#5d6b9d');
    cloth.addColorStop(0.55, this.hitFlash > 0 || blink ? cloak : '#3a4368');
    cloth.addColorStop(1, cloak);
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-R * 1.0, R * 0.05);
    ctx.quadraticCurveTo(-R * 1.06, R * 0.9, 0, R * 1.2);
    ctx.quadraticCurveTo(R * 1.06, R * 0.9, R * 1.0, R * 0.05);
    ctx.quadraticCurveTo(R * 0.9, -R * 1.06, 0, -R * 1.04);
    ctx.quadraticCurveTo(-R * 0.9, -R * 1.06, -R * 1.0, R * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(6,9,18,0.65)';
    ctx.stroke();
    // 披风褶皱
    ctx.save();
    ctx.strokeStyle = 'rgba(8,11,22,0.5)';
    ctx.lineWidth = 1.4;
    for (const k of [-0.45, 0.1, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(R * k * 0.9, R * 0.15);
      ctx.quadraticCurveTo(R * k, R * 0.65, R * k * 0.55, R * 1.05);
      ctx.stroke();
    }
    ctx.restore();

    if (this.hitFlash <= 0 && !blink) {
      // 朝向提灯一侧的暖色轮廓光
      ctx.save();
      ctx.rotate(this.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,190,120,0.62)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.98, -1.05, 1.05);
      ctx.stroke();
      ctx.restore();
      // 背光侧的冷色月边
      ctx.save();
      ctx.rotate(this.angle + Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(150,180,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.98, -1.15, 1.15);
      ctx.stroke();
      ctx.restore();
    }

    // ── 肩线：把"斗篷"与"兜帽"分开，读起来更像一个俯视的人 ──
    ctx.save();
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(10,13,26,0.55)';
    ctx.beginPath();
    ctx.ellipse(R * 0.1, -R * 0.62, R * 0.34, R * 0.2, -0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(R * 0.1, R * 0.62, R * 0.34, R * 0.2, 0.5, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ── 兜帽（前端）+ 帽檐下的暗面 ──
    ctx.rotate(this.angle);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffd8d8' : blink ? '#ffffff' : '#4d5990';
    ctx.beginPath();
    ctx.ellipse(R * 0.42, 0, R * 0.5, R * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,9,18,0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,11,22,0.92)';
    ctx.beginPath();
    ctx.ellipse(R * 0.54, 0, R * 0.24, R * 0.27, 0, 0, TAU);
    ctx.fill();
    // 帽檐下被灯照亮的一点脸颊 + 眼睛
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,206,146,0.45)';
    ctx.beginPath();
    ctx.ellipse(R * 0.62, 0, R * 0.12, R * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,214,0.8)';
    ctx.beginPath();
    ctx.ellipse(R * 0.66, -R * 0.085, R * 0.042, R * 0.038, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(R * 0.66, R * 0.085, R * 0.042, R * 0.038, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // ── 提灯：手臂 + 金属提梁 + 玻璃罩 + 火焰 ──
    const lx = R * 1.45;
    ctx.strokeStyle = 'rgba(10,13,24,0.9)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(R * 0.5, R * 0.22);
    ctx.lineTo(lx, R * 0.1);
    ctx.stroke();
    ctx.strokeStyle = '#6b5a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R * 0.5, R * 0.16);
    ctx.lineTo(lx - 4, -1);
    ctx.stroke();
    ctx.fillStyle = '#3a3122';
    ctx.beginPath();
    ctx.moveTo(lx - 7, -8);
    ctx.lineTo(lx + 7, -8);
    ctx.lineTo(lx + 5, -6);
    ctx.lineTo(lx - 5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b2418';
    ctx.fillRect(lx - 6, 6, 12, 3);
    ctx.fillStyle = `rgba(255,214,140,${0.5 + 0.3 * flick})`;
    ctx.beginPath();
    ctx.ellipse(lx, 0, 5.5, 7, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.ellipse(lx, -0.5, 2.6, 3.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();
  }

  get alive(): boolean {
    return this.hp > 0;
  }
}
