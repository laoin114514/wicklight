import { baseStats, PASSIVE_MAP, type PlayerStats } from '../data/upgrades';
import { RELIC_MAP, TRIBES, type RelicMods, type RelicTribeId } from '../data/relics';
import { weaponAt, WEAPON_MAP } from '../data/weapons';
import type { Enemy, EnemySystem } from './enemies/Enemy';
import type { ParticleSystem } from './Particle';
import type { ProjectileSystem } from './Projectile';
import { clamp, TAU } from '../core/MathUtils';
import { GRAZE } from '../data/graze';
import { POUR } from '../data/pour';
import { NOVA } from '../data/nova';

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
  /** 「倾灯」倒了一瓢：把"这一瓢花了多少油"记回这一局的账上（结算面板要看） */
  pour: (cost: number) => void;
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
  /**
   * 伏灯：在地上布一颗雷。
   * 位置由玩家给（Player 只知道"我朝哪儿走"），落点判定与爆炸都在 Game 里。
   */
  mine: (x: number, y: number, damage: number, radius: number, trigger: number, fire: number) => void;
  /**
   * 旋灯：在某处转起一盏往里吸的灯，转完缩成一下炸。
   * `drag` > 0 的那把连弹幕一起卷（卷到中心就吞掉）。
   */
  vortex: (x: number, y: number, damage: number, radius: number, burn: number, drag: number) => void;
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
  /** 灯台的余温倍率（守夜灯：点一座顶两座） */
  pyreBonus: number;
  /** 灯焰被吹灭的速度倍率（守夜灯：灯更耐吹） */
  pyreGuard: number;
  /** 「掠影」热度积攒加成（焰心：0.45 = 快 45%） */
  grazeHeat: number;
  /** 「掠影」回油加成（撩芯：1 = 那口油翻倍） */
  grazeOil: number;
  /** 「灯焰高涨」时长加成（长风：0.5 = 六秒变九秒） */
  blazeTime: number;
  /** 「灯焰高涨」期间的减伤（影缝：0.3 = 少挨三成） */
  blazeGuard: number;
  /** 「爆灯」之后的短时伤害加成（猛火：0.35 = 那四秒里 +35%） */
  overburnDamage: number;
  /** 「爆灯」烧掉的油有多少会烧回来（引线：0.5 = 一半） */
  overburnRefund: number;
  /** 「爆灯」的灯火门槛降低（火盆：0.25 = 从 55% 降到 30%） */
  overburnEase: number;
  /** 「爆灯」之后的短时减伤（炭衣：0.45 = 少挨四成五） */
  overburnGuard: number;
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
  flags: PlayerFlags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0 };
  oil = 1;
  oilMax = 1;
  /** 本局内由祭坛带来的长期修正（recomputeStats 会重新套用）。 */
  shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
  /** 局外解锁带来的修正：也要走 recomputeStats，不然中途重算（拿到遗物）就会把它冲掉。 */
  metaMods = { moveSpeedMult: 1 };
  /** 本局由「灯台」累积的余温：点亮的灯台越多，灯火越旺、伤害越高。 */
  pyreMods = { damageMult: 1, lightMult: 1 };
  brightness = 1;
  lightRadius = 300;
  /** 局外解锁带来的灯火半径倍率（与灯台余温、地形各自独立） */
  baseLightMult = 1;
  invuln = 0;
  dashTimer = 0;
  dashCd = 0;
  /** 冲刺 / 燃爆这一次冷却的总时长：触屏按钮上那个"冷却圈"要按比例画，
   *  只有剩余时间画不出角度——冲刺的时长随遗物/词缀变化，燃爆随急速变化。 */
  dashCdMax = 0;
  dashDirX = 0;
  dashDirY = 0;
  novaCd = 0;
  novaCdMax = 0;
  /** 燃爆流派：由 lanternId 决定，赋予一次燃爆完全不同的解法 */
  novaStyle = 'warden';
  private novaBuffTimer = 0;
  /** 「爆灯」之后那四秒（猛火）：这是一段伤害加成，不是一层火 */
  private overburnGlow = 0;
  /** 「爆灯」之后那三秒（炭衣）：烧出去的火挡在身前 */
  private ashTimer = 0;
  /** 还有多少油要从敌人身上烧回来（引线），以及每秒烧回来多少 */
  private refundLeft = 0;
  private refundRate = 0;
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
  /**
   * 「掠影」攒下来的热度（0 ~ GRAZE.heatMax）：攒满就是一阵「灯焰高涨」。
   * 它属于**玩家自己**（跟燃爆的 novaBuff 一样是"身体状态"），
   * 所以加成直接在 damageScale / lightRadius / 移动速度上生效，
   * 不用让 Game 每帧往身上写一遍。
   */
  heat = 0;
  /** 这次冲刺还认不认"从弹幕正中穿过"那一笔（每次冲刺只认一次） */
  dashGraze = 0;
  /** 「灯焰高涨」剩余时间（秒，0 = 没在烧） */
  blazeTimer = 0;
  /** 本局点着过几次（HUD 与结算用） */
  blazeCount = 0;
  /** 热度停顿计时：最后一次掠影之后先挂这么久的"余温"，再开始回落 */
  private heatDelay = 0;
  /** 刚擦过一下的那个脉冲（0~1，画在脚下那圈符文上用） */
  private grazePulse = 0;

  /** 擦了一下：脚下那圈符文跳一下（冲刺穿弹幕跳得更狠）。 */
  pulseGraze(dashing = false): void {
    this.grazePulse = dashing ? 1 : 0.7;
  }

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
    this.flags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0 };
    this.shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
    this.pyreMods = { damageMult: 1, lightMult: 1 };
    this.weapons.set(model.weapon, 1);
    this.addPassive(model.passive, 1);
    this.oil = 1;
    this.brightness = 1;
    this.terrainSlow = 1;
    this.terrainOil = 1;
    this.terrainLight = 1;
    this.baseLightMult = 1;
    this.heat = 0;
    this.blazeTimer = 0;
    this.blazeCount = 0;
    this.heatDelay = 0;
    this.grazePulse = 0;
    this.dashGraze = 0;
    this.metaMods = { moveSpeedMult: 1 };
    this.curseOilMult = 1;
    this.invuln = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.dashCdMax = 0;
    this.novaCd = 0;
    this.novaCdMax = 0;
    this.overburnGlow = 0;
    this.ashTimer = 0;
    this.refundLeft = 0;
    this.refundRate = 0;
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

  /**
   * 整套重算，但**只算不写**：把当前被动 / 遗物 / 共鸣 / 祭坛 / 灯台 / 局外加成
   * 全部套一遍，返回新的属性与标志位。
   *
   * 之所以要拆出这个纯函数：升级面板得回答"点了这张卡我会变成什么样"，
   * 而那需要把"某件被动再多一级"的属性算出来——算完不能留在玩家身上
   * （还没点），也不能让预览本身把血条顶掉。
   */
  private computeStats(passiveOverride?: { id: string; level: number }): { stats: PlayerStats; flags: PlayerFlags } {
    const stats: PlayerStats = { ...this.base };
    for (const [id, lvl] of this.passives) {
      const level = passiveOverride?.id === id ? passiveOverride.level : lvl;
      PASSIVE_MAP[id]?.apply(stats, level);
    }
    if (passiveOverride && !this.passives.has(passiveOverride.id)) {
      PASSIVE_MAP[passiveOverride.id]?.apply(stats, passiveOverride.level);
    }
    const flags: PlayerFlags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0 };
    for (const id of this.relics) {
      const m = RELIC_MAP[id]?.mods;
      if (m) this.applyRelicMods(m, stats, flags);
    }
    // 灯火共鸣：同族遗物凑够数量，额外叠一档修正
    for (const tribe of TRIBES) {
      const tier = this.tribeTier(tribe.id);
      for (let i = 0; i < tier; i += 1) this.applyRelicMods(tribe.tiers[i].mods, stats, flags);
    }
    const sm = this.shrineMods;
    stats.damageMult *= sm.damageMult;
    stats.maxHp *= sm.maxHpMult;
    stats.oilDecayMult *= sm.oilDecayMult;
    stats.moveSpeed *= sm.moveSpeedMult;
    stats.critChance += sm.critChance;
    flags.goldMult *= sm.goldMult;
    stats.damageMult *= this.pyreMods.damageMult;
    stats.moveSpeed *= this.metaMods.moveSpeedMult;
    return { stats, flags };
  }

  recomputeStats(): void {
    const { stats, flags } = this.computeStats();
    this.stats = stats;
    this.flags = flags;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  /**
   * 预览：`previewStats({ id, level })` 算出"那件被动到了这一级"时的属性；
   * 不传参数就是"此刻重算一遍"，等于 `this.stats` 的一份副本。全程不改真身。
   */
  previewStats(passiveOverride?: { id: string; level: number }): PlayerStats {
    return this.computeStats(passiveOverride).stats;
  }

  /** 把一份遗物修正套用到给过来的属性上（遗物与共鸣共用同一套规则）。 */
  private applyRelicMods(m: RelicMods, stats: PlayerStats = this.stats, flags: PlayerFlags = this.flags): void {
    if (m.damageMult) stats.damageMult *= 1 + m.damageMult;
    if (m.maxHpMult) stats.maxHp *= 1 + m.maxHpMult;
    if (m.pickupMult) stats.pickupRange *= 1 + m.pickupMult;
    if (m.moveSpeedMult) stats.moveSpeed *= 1 + m.moveSpeedMult;
    if (m.critChance) stats.critChance += m.critChance;
    if (m.critMult) stats.critMult += m.critMult;
    if (m.dashMult) stats.dashCooldown *= Math.max(0.25, 1 - m.dashMult);
    if (m.regen) stats.regen += m.regen;
    if (m.oilDecayMult) stats.oilDecayMult *= Math.max(0.1, 1 + m.oilDecayMult);
    if (m.oilGainMult) stats.oilGainMult *= 1 + m.oilGainMult;
    if (m.areaMult) stats.areaMult *= 1 + m.areaMult;
    if (m.cooldownMult) stats.cooldownMult *= Math.max(0.3, 1 + m.cooldownMult);
    flags.extraProjectiles += m.extraProjectiles ?? 0;
    flags.lifesteal += m.lifesteal ?? 0;
    flags.chill = Math.max(flags.chill, m.chill ?? 0);
    flags.contactMult *= 1 + (m.contactMult ?? 0);
    flags.goldMult *= 1 + (m.goldMult ?? 0);
    flags.novaHeal += m.novaHeal ?? 0;
    if (m.lowOilDamage) flags.lowOilDamage = Math.max(flags.lowOilDamage, m.lowOilDamage);
    if (m.novaBuff) flags.novaBuff = Math.max(flags.novaBuff, m.novaBuff);
    if (m.pyreBonus) flags.pyreBonus *= 1 + m.pyreBonus;
    if (m.pyreGuard) flags.pyreGuard *= Math.max(0.25, 1 - m.pyreGuard);
    // 「掠影」这条线：四件遗物各自只动一个数，但它们乘的是同一条算式——
    // 热度来得快 → 焰点得勤 → 焰里杀得更多 → 焰烧得更久（见 GRAZE.blazeExtend）
    flags.grazeHeat += m.grazeHeat ?? 0;
    flags.grazeOil += m.grazeOil ?? 0;
    flags.blazeTime += m.blazeTime ?? 0;
    if (m.blazeGuard) flags.blazeGuard = Math.max(flags.blazeGuard, m.blazeGuard);
    // 「爆灯」这条线：门槛是往下减、回油与减伤取大、余温是往上加（见 data/nova.ts）
    flags.overburnDamage += m.overburnDamage ?? 0;
    flags.overburnRefund += m.overburnRefund ?? 0;
    flags.overburnEase += m.overburnEase ?? 0;
    if (m.overburnGuard) flags.overburnGuard = Math.max(flags.overburnGuard, m.overburnGuard);
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

  /** 冲刺 / 燃爆还剩多少冷却（1 = 刚放完，0 = 可用）。触屏按钮上的冷却圈按它画。 */
  get dashCdFrac(): number {
    return this.dashCdMax > 0 ? clamp(this.dashCd / this.dashCdMax, 0, 1) : 0;
  }

  get novaCdFrac(): number {
    return this.novaCdMax > 0 ? clamp(this.novaCd / this.novaCdMax, 0, 1) : 0;
  }

  get damageScale(): number {
    let s = 0.65 + this.oilFrac * 0.7;
    if (this.flags.lowOilDamage > 0 && this.oilFrac < 0.35) s *= 1 + this.flags.lowOilDamage;
    if (this.novaBuffTimer > 0) s *= 1 + this.flags.novaBuff;
    if (this.overburnGlow > 0) s *= 1 + this.flags.overburnDamage;
    if (this.blazeTimer > 0) s *= 1 + GRAZE.blazeDamage;
    return s;
  }

  /**
   * 「灯焰高涨」这一次该烧多久：基础六秒，带「长风」是九秒。
   * 所有地方（点着、符文刻度、续焰的上限）都走这一个数，免得三处各算一份对不上。
   */
  get blazeDuration(): number {
    return GRAZE.blazeTime * (1 + this.flags.blazeTime);
  }

  /** 焰烧着的时候还能续多久（击杀续焰的上限，见 GRAZE.blazeExtendCap）。 */
  get blazeMax(): number {
    return this.blazeDuration * GRAZE.blazeExtendCap;
  }

  /**
   * 焰里杀了一只怪：给这段焰续一点时间（`Game.onEnemyDeath` 调用）。
   *
   * 续焰是这一版把掠影接进"打"里的那一下：焰是自己擦出来的，让它烧下去的是击杀。
   * 上限卡在 blazeMax（基础时长的 1.5 倍）——最密的那几波不该变成"焰从此不灭"。
   * 返回 true 表示这一下真的把上限又顶高了一格（结算与测试要看这个）。
   */
  extendBlaze(sec: number): boolean {
    if (this.blazeTimer <= 0) return false;
    const before = this.blazeTimer;
    this.blazeTimer = Math.min(this.blazeMax, this.blazeTimer + sec);
    return this.blazeTimer > before;
  }

  /** 脚下那圈符文的进度：灯焰高涨时画的是"还剩多久"，平时画的是"攒了多少"。 */
  get gaugeFrac(): number {
    return this.blazeTimer > 0 ? clamp(this.blazeTimer / this.blazeDuration, 0, 1) : clamp(this.heat / GRAZE.heatMax, 0, 1);
  }

  /** 现在在烧吗（结算、HUD 与测试都看这一个）。 */
  get blazing(): boolean {
    return this.blazeTimer > 0;
  }

  /**
   * 掠影换来的一点热度。攒满就当场点着「灯焰高涨」，返回 true（调用方负责那一下的动静）。
   * 从判定到加成只有"下帧生效"这一个交互，避免 Game 与 Player 互相写字。
   */
  addHeat(amount: number): boolean {
    if (amount <= 0) return false;
    this.heatDelay = GRAZE.decayDelay;
    // 「焰心」：擦同样的距离，热度涨得更快（只在"攒"这一侧放大，不碰上限与回落）
    amount *= 1 + this.flags.grazeHeat;
    // 注意这里**不**打那个脉冲：热度是每帧一点点加上来的，
    // "新擦了一下"的那一跳由 grazeEvent 单独给（不然符文会一直在抖）。
    const gain = this.blazeTimer > 0 ? amount * GRAZE.blazeHeatMult : amount;
    this.heat = Math.min(GRAZE.heatMax, this.heat + gain);
    if (this.blazeTimer <= 0 && this.heat >= GRAZE.heatMax) {
      this.heat = 0;
      this.blazeTimer = this.blazeDuration;
      this.blazeCount += 1;
      return true;
    }
    return false;
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
    if (this.overburnGlow > 0) this.overburnGlow -= dt;
    if (this.ashTimer > 0) this.ashTimer -= dt;
    // 「引线」：那一口烧出去的油，按秒从火里烧回来（速率在放招时就算好，和帧率无关）
    if (this.refundLeft > 0) {
      const give = Math.min(this.refundLeft, this.refundRate * dt);
      this.refundLeft -= give;
      this.oil = Math.min(this.oilMax, this.oil + give);
      if (this.refundLeft <= 0) this.refundRate = 0;
    }
    if (this.novaBuffTimer > 0) this.novaBuffTimer -= dt;
    if (this.grazePulse > 0) this.grazePulse = Math.max(0, this.grazePulse - dt * 3.2);
    if (this.blazeTimer > 0) {
      this.blazeTimer -= dt;
      if (this.blazeTimer <= 0) {
        this.blazeTimer = 0;
        // 烧完只留一半热度（见 GRAZE.blazeCarry）：不留上限的话，在怪堆里会一发接一发
        this.heat = Math.min(this.heat, GRAZE.heatMax * GRAZE.blazeCarry);
      }
    }
    if (this.heatDelay > 0) this.heatDelay -= dt;
    else if (this.heat > 0) this.heat = Math.max(0, this.heat - GRAZE.decay * dt);
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, Math.max(0, v - dt));
    for (const [k, v] of this.orbit.hitCooldown) {
      const nv = v - dt;
      if (nv <= 0) this.orbit.hitCooldown.delete(k);
      else this.orbit.hitCooldown.set(k, nv);
    }

    // Oil decay / burning：灯焰高涨时火大，油也烧得快（见 data/graze.ts）
    this.oil = Math.max(
      0,
      this.oil -
        this.oilDecayPerSec *
          s.oilDecayMult *
          this.curseOilMult *
          this.terrainOil *
          (this.blazeTimer > 0 ? GRAZE.blazeOil : 1) *
          dt,
    );
    if (this.oil <= 0) {
      this.hp -= 3 * dt;
      if (Math.random() < dt * 8) ctx.particles.burst(this.x, this.y, 1, '#3a4a7a', { speed: 30, size: 3, life: 0.5 });
    }
    this.brightness = Math.min(1.25, (0.35 + this.oilFrac * 0.65) * (this.blazeTimer > 0 ? 1.12 : 1));
    // 灯焰高涨会把火撩大：照得更远、也更亮——但"亮 = 引怪"是同一条规则，
    // 所以这一阵子的代价是实打实的：你会被更多东西看见。
    this.lightRadius =
      (96 + this.oilFrac * 224) *
      this.pyreMods.lightMult *
      this.terrainLight *
      this.baseLightMult *
      (this.blazeTimer > 0 ? GRAZE.blazeLight : 1);

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
      // 一次冲刺只认一次"穿弹幕"（见 Game.grazeDash）：不然往一片弹幕里冲一下，
      // 三颗子弹就是三次，攒了半天的表会被一次冲刺直接填满。
      this.dashGraze = 1;
      this.dashCd = s.dashCooldown;
      this.dashCdMax = s.dashCooldown;
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
      const walk = s.moveSpeed * this.terrainSlow * (this.blazeTimer > 0 ? GRAZE.blazeSpeed : 1);
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

    // Nova (燃爆) consumes oil —— 灯火旺过那条线就是「爆灯」：烧掉两倍的油，换一发更大的。
    // ⚠ 这一发的伤害按**烧之前**的亮度算（damageScale 在这里先记下来）：
    //   油同时是"火力"和"弹药"，不先记下来的话，越舍得烧的那一发反而打得越轻——
    //   代价写在油上就够了，不该在同一发里扣两遍（这个反直觉的账是 v62 顺手修掉的）。
    if (input.nova && this.novaCd <= 0) {
      this.novaCd = Math.max(2.4, 6 - this.passiveLevel('haste') * 0.4);
      this.novaCdMax = this.novaCd;
      const castScale = this.damageScale;
      const overburn = this.oilFrac >= this.overburnAt;
      this.oil = Math.max(0, this.oil - (overburn ? NOVA.overburnCost : NOVA.cost));
      this.doNova(ctx, overburn, castScale);
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

  /**
   * 燃爆真正放出去的那一下。
   *
   * `overburn` 是「爆灯」（灯火过线，这一发烧了两倍的油），`castScale` 是**按下按钮时**
   * 那盏灯的亮度——见 update 里为什么不能现算（烧完的油会把这一发自己打轻）。
   */
  private doNova(ctx: PlayerContext, overburn: boolean, castScale: number): void {
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
    if (overburn) {
      // 爆灯：一圈更大、更狠、还带灼烧的火。半径与威力写在 data/nova.ts 里。
      radius *= 1 + NOVA.overburnArea;
      power *= 1 + NOVA.overburnDamage;
    }
    const color = style === 'lamplighter' ? '#7be0ff' : style === 'shadewalker' ? '#ff4d6d' : '#ffb14e';
    ctx.onNova();
    ctx.audio('nova');
    ctx.shake(overburn ? NOVA.overburnShake : 0.5);
    ctx.particles.shockwave(this.x, this.y, color, radius, 0.5);
    ctx.particles.burst(this.x, this.y, overburn ? 52 : 34, '#ffd24e', { speed: overburn ? 400 : 320, size: 4, life: 0.7 });
    if (overburn) {
      // 第二圈是"这一发比平时大"的读数：一眼就能看出刚才那一下不是普通燃爆
      ctx.particles.shockwave(this.x, this.y, '#fff2d8', radius * 0.55, 0.32);
      ctx.addLight(this.x, this.y, radius * 1.6, 1);
    }

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
        const dmg = 34 * this.stats.damageMult * castScale * power;
        const crit = Math.random() < this.stats.critChance;
        const applied = crit ? dmg * this.stats.critMult : dmg;
        const opts: { burn?: number; slow?: number } = {};
        if (style === 'emberkin') opts.burn = 3;
        else if (style === 'lamplighter') opts.burn = 1;
        else if (style === 'shadewalker') opts.slow = 2.5;
        // 爆灯的火是"烧出去的一口油"：不管哪个流派都带灼烧，层数再叠一层
        if (overburn) opts.burn = (opts.burn ?? 0) + NOVA.overburnBurn;
        ctx.hit(e, applied, crit, e.x - this.x, e.y - this.y, knock, opts);
      }
    });

    if (this.flags.novaHeal > 0) this.hp = Math.min(this.stats.maxHp, this.hp + this.flags.novaHeal);
    if (this.flags.novaBuff > 0) {
      this.novaBuffTimer = 3;
      this.oil = Math.min(this.oilMax, this.oil + 0.08);
    }
    // ── 「爆灯」这条线的三件事，都从"这一发烧掉多少"长出来 ──
    if (overburn) {
      const burned = NOVA.overburnCost;
      if (this.flags.overburnDamage > 0) this.overburnGlow = NOVA.afterglowSpan;
      if (this.flags.overburnGuard > 0) this.ashTimer = NOVA.ashSpan;
      if (this.flags.overburnRefund > 0) {
        this.refundLeft += burned * this.flags.overburnRefund;
        this.refundRate = (burned * this.flags.overburnRefund) / NOVA.refundSpan;
      }
    }
  }

  /** 灯火旺过这条线，燃爆才会「爆灯」（火盆把这把尺子往下挪）。 */
  get overburnAt(): number {
    return Math.max(0.15, NOVA.overburnAt - this.flags.overburnEase);
  }

  /** 爆灯的那四秒（猛火在加成）。HUD 的按钮上那个"亮着"的状态也看它。 */
  get overburning(): boolean {
    return this.overburnGlow > 0;
  }

  /** 这一发能不能爆灯（灯火够、冷却也转完了）。 */
  get overburnReady(): boolean {
    return this.oilFrac >= this.overburnAt && this.novaCd <= 0;
  }

  /** 炭衣：爆灯之后那几秒的减伤倍率（1 = 没减）。 */
  get ashGuard(): number {
    return this.ashTimer > 0 ? 1 - this.flags.overburnGuard : 1;
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
      // 「倾灯」只在灯火够满时才倒：不满就整发不出手，**连冷却都不走**——
      // 于是它的射速不是"冷却多短"，而是"你补油有多快"（冷却对它就只是个上限）。
      // 而且它倒的永远是油桶最上面那一层（见 data/pour.ts），不会把玩家倒到油尽。
      if (def.kind === 'pour' && this.oilFrac < POUR.minOil) continue;
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
      case 'mine': {
        // 撒在**身后**：伏灯是"跑着撒"的雷，追兵踩着它，你已经跑到别处去了。
        // 站着不动时没有"身后"，就绕着自己撒一圈（仍然能用，只是少了那点意思）。
        const count = this.countOf(st);
        const moving = Math.hypot(this.vx, this.vy) > 20;
        const back = (moving ? Math.atan2(this.vy, this.vx) : this.angle) + Math.PI;
        for (let i = 0; i < count; i += 1) {
          const a = back + (i - (count - 1) / 2) * 0.75;
          ctx.mine(this.x + Math.cos(a) * 22, this.y + Math.sin(a) * 22, dmg, st.radius * area, st.range, st.burn);
        }
        ctx.audio('lamp');
        break;
      }
      case 'pour': {
        // 一瓢：先从灯里挖走那一块（这就是它全部的"代价"——接下来你的灯会暗一阵，
        // 视野、亮度、还有所有武器的伤害都跟着掉），然后把那团油泼出去。
        // 注意 `dmg` 是在这一句之前算好的：**这一瓢用的是倒之前的灯火**——
        // 灯还亮着的时候倒出去的那一瓢，本来就该是亮的。
        const cost = (st.pour ?? POUR.costHint) * this.oilMax;
        this.oil = Math.max(0, this.oil - cost);
        ctx.pour(st.pour ?? POUR.costHint);
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          // 一瓢是准的（自动瞄准锁着最近那只怪），三瓢（进化）才散开成一个扇面
          const a = aim + (count > 1 ? (i - (count - 1) / 2) * st.spread : (Math.random() - 0.5) * 0.14);
          ctx.projectiles.spawn({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * st.speed,
            vy: Math.sin(a) * st.speed,
            damage: dmg,
            radius: st.radius * 0.2,
            color: def.color,
            explode: st.radius,
            knockback: st.knockback,
            burn: st.burn,
            maxLife: st.range / st.speed,
            weaponId: id,
            poolRadius: st.radius * POUR.fireSpread,
            poolLife: POUR.fireLife,
          });
        }
        ctx.audio('pour');
        break;
      }
      case 'vortex': {
        // 落点：优先砸在最近的那只怪身上（自动瞄准本来就锁着它），附近没人才落在你朝着的方向前面。
        // 它是"往人群里扔的一盏灯"，不是"放在自己脚边的灯"——所以和伏灯相反，它落在前面。
        const target = ctx.findTarget(this.x, this.y, st.range);
        const base = target ? Math.atan2(target.y - this.y, target.x - this.x) : this.angle;
        const dist = target
          ? Math.min(st.range, Math.hypot(target.x - this.x, target.y - this.y) * 0.86)
          : st.range * 0.7;
        const count = this.countOf(st);
        for (let i = 0; i < count; i += 1) {
          // 两盏（进化）时左右各偏一点：两团旋涡挨着，中间那一块也被拢住了
          const a = base + (count > 1 ? (i - (count - 1) / 2) * 0.85 : 0);
          ctx.vortex(this.x + Math.cos(a) * dist, this.y + Math.sin(a) * dist, dmg, st.radius * area, st.burn, st.drag ?? 0);
        }
        ctx.audio('vortex');
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

    // ── 掠影的符文 ──
    // 它画在**脚边地上**（一圈压扁的椭圆，跟滞行雾 / 险境预警是同一套语言：
    // 画在地上的东西 = 规则，画在身上的东西 = 角色），所以不会被误读成"判定圈"。
    // 平时它显示热度攒了多少，灯焰高涨时反过来显示还剩多久烧完。
    const frac = this.gaugeFrac;
    if (frac > 0.002 || this.grazePulse > 0.002) {
      const blaze = this.blazeTimer > 0;
      const cy = R * 0.5;
      const rx = R * 1.95;
      const ry = R * 0.95;
      const a0 = -Math.PI / 2;
      const a1 = a0 + TAU * Math.max(0.004, frac);
      // 快满了就自己开始"呼吸"：还差两下的时候玩家不用盯着数刻度
      const eager = !blaze && frac > 0.8 ? (Math.sin(time * 9) * 0.5 + 0.5) * 0.35 : 0;
      ctx.save();
      ctx.lineCap = 'round';
      // 底圈 + 四个刻度：底圈是"容器"，刻度让这一圈读起来像仪表，不像护盾
      ctx.globalAlpha = blaze ? 0.4 : 0.26;
      ctx.strokeStyle = blaze ? '#ffd9a0' : '#8a6a4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = blaze ? 0.42 : 0.3;
      for (let i = 0; i < 4; i += 1) {
        const a = a0 + (TAU * i) / 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(c * rx * 0.92, cy + s * ry * 0.92);
        ctx.lineTo(c * rx * 1.14, cy + s * ry * 1.14);
        ctx.stroke();
      }
      // 进度：从正上方顺时针长出来，最前面缀一颗亮珠——"涨到哪儿了"一眼可见
      ctx.globalAlpha = Math.min(1, (blaze ? 0.85 : 0.5 + 0.4 * frac) + this.grazePulse * 0.3 + eager);
      ctx.strokeStyle = blaze ? '#fff0c0' : frac > 0.72 ? '#ffd97a' : '#ffb14e';
      ctx.lineWidth = blaze ? 3.2 : 2.4 + this.grazePulse * 1.4;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, a0, a1);
      ctx.stroke();
      if (!blaze) {
        ctx.fillStyle = '#ffe9b8';
        ctx.beginPath();
        ctx.arc(Math.cos(a1) * rx, cy + Math.sin(a1) * ry, 1.7 + this.grazePulse, 0, TAU);
        ctx.fill();
      } else {
        // 烧着的时候外面再套一圈火舌，随呼吸一样一张一缩（不用虚线，省一次路径分配）
        const flick = 0.5 + Math.sin(time * 11) * 0.5;
        ctx.globalAlpha = 0.16 + flick * 0.18;
        ctx.strokeStyle = '#ff8a2a';
        ctx.lineWidth = 5 + flick * 2;
        ctx.beginPath();
        ctx.ellipse(0, cy, rx * 1.12, ry * 1.12, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

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
