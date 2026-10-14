import { Camera } from './Camera';
import { PostFX } from './PostFX';
import { LightSystem } from './LightSystem';
import { Renderer } from './Renderer';
import { Random } from './Random';
import { TextureBank } from './Textures';
import { Settings } from './Settings';
import { Storage, type Storage as StorageType } from './Storage';
import { EventBus, type GameEvents } from './Events';
import { clamp } from './MathUtils';
import { AudioEngine } from '../audio/AudioEngine';
import { Player, type PlayerContext } from '../entities/Player';
import { EnemySystem, type Enemy, type EnemyContext, type LightCtx } from '../entities/enemies/Enemy';
import { ParticleSystem } from '../entities/Particle';
import { FloatingTextSystem } from '../entities/FloatingText';
import { PickupSystem, type Pickup } from '../entities/Pickup';
import { ProjectileSystem, type Projectile } from '../entities/Projectile';
import { Director } from '../systems/Director';
import { generateLevel, type Level } from '../systems/LevelGen';
import { drawDecor } from './Decor';
import type { Pyre, Shrine } from '../systems/LevelGen';
import { CURSES, type CurseDef } from '../data/curses';
import { collideWalls, clampToArena, pointInWalls } from '../systems/CollisionSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { LootSystem } from '../systems/LootSystem';
import { MetaSystem } from '../systems/MetaSystem';
import { AchievementSystem } from '../systems/AchievementSystem';
import { CodexSystem, type CodexEntry } from '../systems/CodexSystem';
import { RecordsSystem, type RecordHighlight } from '../systems/RecordsSystem';
import { BountySystem } from '../systems/BountySystem';
import type { BountyDef } from '../data/bounties';
import { BOUNTY_MAP } from '../data/bounties';
import { CURSE_MAP } from '../data/curses';
import { HAZARD_LABEL, HAZARD_TIP } from '../systems/CodexSystem';
import { buildDailyPlan, dailyKey, dailyLabel, dailyScore, defaultDaily, type DailyPlan } from '../systems/DailySystem';
import type { DailySave } from '../types';
import { ACHIEVEMENT_MAP } from '../data/achievements';
import { DIFFICULTIES } from '../systems/DifficultySystem';
import { STAGES, STAGE_MAP } from '../data/stages';
import { ENEMY_MAP } from '../data/enemies';
import { LANTERN_MAP, LANTERNS } from '../data/lanterns';
import { RELICS, RELIC_MAP } from '../data/relics';
import { AFFIXES, AFFIX_MAP } from '../data/affixes';
import { PASSIVES, baseStats, type PlayerStats } from '../data/upgrades';
import type { Difficulty, RunStats, SaveData, ShopItem, UpgradeOffer } from '../types';

export type GameState =
  | 'boot'
  | 'menu'
  | 'select'
  | 'playing'
  | 'levelup'
  | 'paused'
  | 'loadout'
  | 'shop'
  | 'shrine'
  | 'victory'
  | 'dead'
  | 'meta'
  | 'codex'
  | 'records'
  | 'daily'
  | 'achievements'
  | 'settings';

export interface ShrineOffer {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
}

const SHRINE_OFFERS: ShrineOffer[] = [
  { id: 'blood_pact', name: '血契', blurb: '生命上限 -20%，换取一件随机遗物。', icon: '🩸', color: '#ff4d6d' },
  { id: 'kindle', name: '燃薪', blurb: '伤害 +12%，但灯油消耗 +18%。', icon: '🔥', color: '#ff9d2e' },
  { id: 'tithe', name: '献金', blurb: '立刻获得 60 金币，但之后的金币收益 -10%。', icon: '🪙', color: '#ffd24e' },
  { id: 'vigil', name: '守夜', blurb: '回复 60% 生命并回满灯油，但会惊动附近的黑暗。', icon: '🕯️', color: '#8affc1' },
  { id: 'fasting', name: '节食', blurb: '灯油消耗 -25%，生命上限 -10%。', icon: '🫗', color: '#8fa7ff' },
];

interface Hazard {
  kind: string;
  timer: number;
  x: number;
  y: number;
  r: number;
}

interface BeamFx {
  x: number;
  y: number;
  ex: number;
  ey: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
  seed: number;
}

/** 环境伤害的玩家向说法（敌人用 ENEMY_MAP 查）。 */
const SOURCE_LABEL: Record<string, { name: string; color: string }> = {
  meteor: { name: '陨石雨', color: '#ff8a4e' },
  collapse: { name: '塌方', color: '#b48a5a' },
  thorn: { name: '荆棘地刺', color: '#9fd45a' },
  fire: { name: '火海', color: '#ff7a2f' },
  poison: { name: '毒地', color: '#7ddc6a' },
};

interface Ground {
  x: number;
  y: number;
  r: number;
  life: number;
  dps: number;
  kind?: 'fire' | 'poison' | 'mud';
}

interface Decal {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface UIHost {
  mountMenus(): void;
  showScreen(state: GameState): void;
  setOffers(offers: UpgradeOffer[], rerolls: number): void;
  setMeta(meta: MetaSystem): void;
  refresh(): void;
}

export interface HUDHost {
  setBoss(name: string | null, frac: number): void;
  toast(text: string): void;
  /** 首次遭遇的提示卡（标题 + 一行说明）。 */
  tip(title: string, text: string): void;
  announce(text: string, big?: boolean): void;
}

export class Game {
  state: GameState = 'boot';
  readonly renderer: Renderer;
  readonly camera = new Camera();
  readonly settings = new Settings();
  readonly storage: StorageType = new Storage();
  readonly audio: AudioEngine;
  readonly light = new LightSystem();
  readonly postfx: PostFX;
  readonly events = new EventBus<GameEvents>();
  readonly rng = new Random();
  readonly textures = new TextureBank();

  readonly player = new Player();
  readonly enemies = new EnemySystem();
  readonly particles = new ParticleSystem();
  readonly floaters = new FloatingTextSystem();
  readonly pickups = new PickupSystem();
  readonly projectiles = new ProjectileSystem();
  readonly upgrades = new UpgradeSystem();
  readonly loot: LootSystem;

  save: SaveData;
  meta: MetaSystem;
  achievements: AchievementSystem;
  codex: CodexSystem;
  records: RecordsSystem;
  bounties: BountySystem;
  /** 今日灯芯的剧本（不是今日灯芯则为 null）。 */
  dailyPlan: DailyPlan | null = null;
  /** 这一局的结局，结算界面据此换文案。 */
  runOutcome: 'clear' | 'defeat' | null = null;
  /** 这一局刷新掉的纪录，结算界面拿去做"新纪录"徽章。 */
  recordHighlights: RecordHighlight[] = [];
  /** 本局由成就奖励额外发放的余烬（与局内收益分开显示）。 */
  achievementEmbers = 0;
  /** 今日灯芯：本局得分 / 是否刷新个人最好 */
  dailyScore = 0;
  dailyBest = false;
  /** 图鉴扫描的节流计时（秒） */
  private codexTimer = 0;
  private codexBatching = false;
  private codexBatchCount = 0;

  ui: UIHost | null = null;
  hud: HUDHost | null = null;

  level: Level = generateLevel(STAGES[0], 1);
  director: Director;
  time = 0;
  runTime = 0;
  wave = 0;
  kills = 0;
  totalKills = 0;
  xp = 0;
  xpToNext = 8;
  playerLevel = 1;
  currentOffers: UpgradeOffer[] = [];
  rerollsLeft = 0;
  lanternId = 'warden';
  difficulty: Difficulty = 'normal';
  stageIndex = 0;
  endless = false;
  paused = false;
  pendingLevels = 0;
  private sheetReturn: 'playing' | 'paused' = 'playing';
  oilPickups = 0;
  hazards: Hazard[] = [];
  grounds: Ground[] = [];
  /** 光矛这类瞬时直线特效 */
  beams: BeamFx[] = [];
  fogTimer = 0;
  darknessBoost = 0;
  /** 夜咒「深潜」带来的持续黑暗（不会被浓雾衰减吃掉） */
  private curseDarkness = 0;
  bossName: string | null = null;
  bossFrac = 0;
  damageDealt = 0;
  damageTaken = 0;
  bestCombo = 0;
  combo = 0;
  splinterKills = 0;
  echoKills = 0;
  siphonKills = 0;
  /** 单局在滞行雾里待过的时间（秒） */
  mudTime = 0;
  /** 单局回旋灯刃"回程"命中的次数 */
  bladeReturnHits = 0;
  comboTimer = 0;
  bossKills = 0;
  upgradedCount = 0;
  embersEarned = 0;
  gold = 0;
  shopItems: ShopItem[] = [];
  /** 熔铸台这次商店用过没有（每家店只让熔一件，免得刷成自选）。 */
  forgeUsed = false;
  shopHeader = '';
  decals: Decal[] = [];
  arcs: { pts: number[]; life: number; maxLife: number; color: string; seed: number }[] = [];
  shrineOffers: ShrineOffer[] = [];
  private shrineOpen: Shrine | null = null;
  /** 本关已点燃的灯台数（HUD 与成就都用它）。 */
  pyresLit = 0;
  /** 本局累计点燃的灯台数（结算用）。 */
  pyresLitTotal = 0;
  /** 本局路上总共遇到过多少座灯台（结算里的分母）。 */
  runPyres = 0;
  /** 单次最高伤害（结算用）。 */
  maxHit = 0;
  /** 本局燃爆次数（结算用）。 */
  novaCount = 0;
  /** 最后一下是谁打的：死亡结算要交代清楚（"被谁扑灭"）。 */
  lastKiller: { name: string; color: string } | null = null;
  /** 首局的开局引导队列（剩下的条目），跑完就不再出现。 */
  private hintQueue: { at: number; text: string }[] = [];
  /** 本关灯台总数（HUD 显示 n/m）。 */
  pyreTotal = 0;
  private pyreChannel: Pyre | null = null;
  hitStop = 0;
  slowmo = 0;
  comboTier = 0;
  /** 转场用：黑幕不透明度（1 = 全黑） */
  screenFade = 0;
  /** 闪光不透明度 */
  flash = 0;
  /** 本关夜咒（风险 / 回报修正） */
  curse: CurseDef | null = null;
  private curseGoldMult = 1;
  private slowmoScale = 0.35;
  private frameCooldowns = { hurt: 0 };
  private emberTimer = 0;
  private moteTimer = 0;
  private inputSnapshot = { moveX: 0, moveY: 0, dash: false, nova: false };
  private startSeed = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.postfx = new PostFX(this.settings);
    this.audio = new AudioEngine(this.settings);
    this.loot = new LootSystem(this.pickups);
    this.save = this.storage.load();
    this.meta = new MetaSystem(this.save);
    this.achievements = new AchievementSystem(this.save, (id) => this.onAchievement(id));
    this.codex = new CodexSystem(this.save, (entry, seen, total) => this.onCodexDiscover(entry, seen, total));
    this.records = new RecordsSystem(this.save);
    this.bounties = new BountySystem();
    const startStage = STAGES[0];
    this.level = generateLevel(startStage, 1);
    this.director = new Director(startStage, this.difficulty, this.rng);
    this.camera.resize(this.renderer.width, this.renderer.height);
  }

  setUI(ui: UIHost, hud: HUDHost): void {
    this.ui = ui;
    this.hud = hud;
  }

  // ─────────────────────────── lifecycle ───────────────────────────

  bootDone(): void {
    this.state = 'menu';
    this.ui?.showScreen('menu');
  }

  goMenu(): void {
    this.state = 'menu';
    this.paused = false;
    this.enemies.clear();
    this.projectiles.clear();
    this.particles.clear();
    this.pickups.clear();
    this.hazards.length = 0;
    this.grounds.length = 0;
    this.light.begin();
    this.audio.setMood('calm');
    this.ui?.showScreen('menu');
  }

  openMenu(state: GameState, meta?: MetaSystem): void {
    if (meta) this.meta = meta;
    this.state = state;
    this.ui?.setMeta(this.meta);
    this.ui?.showScreen(state);
  }

  newRun(lanternId: string, difficulty: Difficulty, endless: boolean, daily: DailyPlan | null = null): void {
    const lantern = LANTERN_MAP[lanternId] ?? LANTERNS[0];
    this.lanternId = lantern.id;
    this.difficulty = difficulty;
    this.endless = endless;
    this.dailyPlan = daily;
    this.stageIndex = 0;
    // 今日灯芯用日期派生的固定种子：条件一样，过程仍旧看本事
    this.startSeed = daily ? daily.seed : (Math.random() * 1e9) | 0;
    this.rng.reseed(this.startSeed);
    this.resetRunState();

    const stats = this.buildStats();
    this.player.reset(stats, { weapon: lantern.weapon, passive: lantern.passive });
    this.player.novaStyle = lantern.id;
    this.applyMetaToPlayer();

    const stage = endless ? STAGES[STAGES.length - 1] : STAGES[0];
    this.loadStage(stage, endless ? STAGES.length - 1 : 0, true);
    this.screenFade = 1;
    this.achievements.reset();
    this.syncCodex();
    this.state = 'playing';
    this.audio.ensure();
    this.audio.setMood('battle');
    this.ui?.showScreen('playing');
    this.hud?.announce(endless ? '无尽之夜 · 开始' : `${stage.theme.name} · ${difficultyLabel(difficulty)}`, true);
    // 首局的开局引导：一次性的三条提示，之后 HUD 底部那行常驻说明就够了
    this.hintQueue = this.save.hintsSeen
      ? []
      : [
          { at: 3, text: '自动开火 · 空格冲刺（有无敌帧）· Q 燃爆清场' },
          { at: 11, text: '🏮 停在没有点亮的灯台旁，可以把它点亮' },
          { at: 22, text: '祭坛、商店与首领都在等你：别在黑暗里站太久' },
        ];
  }

  private resetRunState(): void {
    this.arcs.length = 0;
    this.splinterKills = 0;
    this.echoKills = 0;
    this.siphonKills = 0;
    this.mudTime = 0;
    this.bladeReturnHits = 0;
    this.comboTier = 0;
    this.screenFade = 0;
    this.flash = 0;
    this.enemies.clear();
    this.projectiles.clear();
    this.particles.clear();
    this.pickups.clear();
    this.floaters.clear();
    this.hazards.length = 0;
    this.grounds.length = 0;
    this.beams.length = 0;
    this.time = 0;
    this.runTime = 0;
    this.wave = 0;
    this.kills = 0;
    this.xp = 0;
    this.xpToNext = 8;
    this.playerLevel = 1;
    this.pendingLevels = 0;
    this.rerollsLeft = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.bossKills = 0;
    this.upgradedCount = 0;
    this.embersEarned = 0;
    this.gold = 0;
    this.decals.length = 0;
    this.hitStop = 0;
    this.slowmo = 0;
    this.oilPickups = 0;
    this.bossName = null;
    this.bossFrac = 0;
    this.fogTimer = 0;
    this.darknessBoost = 0;
    this.curseDarkness = 0;
    this.currentOffers = [];
    this.runOutcome = null;
    this.recordHighlights = [];
    this.achievementEmbers = 0;
    this.dailyScore = 0;
    this.dailyBest = false;
    this.pyresLitTotal = 0;
    this.runPyres = 0;
    this.maxHit = 0;
    this.novaCount = 0;
    this.lastKiller = null;
    this.bounties.reset();
    this.codex.reset();
    this.codexTimer = 0;
    this.syncCodex();
  }

  private buildStats(): PlayerStats {
    const s = baseStats();
    const b = this.meta.bonuses();
    s.maxHp *= 1 + b.hpMult;
    s.dashCooldown *= Math.max(0.4, 1 - b.dashMult);
    return s;
  }

  private applyMetaToPlayer(): void {
    const b = this.meta.bonuses();
    this.player.oilMax = 1 + b.oilMult;
    this.rerollsLeft = b.rerolls;
    for (let i = 0; i < b.weaponLevel; i += 1) {
      const w = this.lanternId ? LANTERN_MAP[this.lanternId].weapon : 'ring';
      this.player.levelWeapon(w);
    }
    for (let i = 0; i < b.startPassives; i += 1) {
      const p = this.rng.pick(PASSIVES);
      this.player.addPassive(p.id, 1);
    }
    this.player.revives = b.revives;
    this.player.recomputeStats();
    this.player.hp = this.player.stats.maxHp;
  }

  private loadStage(stage: import('../types').StageDef, index: number, fresh: boolean): void {
    this.screenFade = 1;
    this.stageIndex = index;
    this.level = generateLevel(stage, this.startSeed + index * 7919);
    this.director.setStage(stage, index);
    if (this.endless) this.director.enableEndless();
    const center = { x: 0, y: 0 };
    this.player.x = center.x;
    this.player.y = center.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.camera.x = center.x;
    this.camera.y = center.y;
    this.hazards.length = 0;
    this.grounds.length = 0;
    this.beams.length = 0;
    this.pyresLit = 0;
    this.pyreTotal = this.level.pyres.length;
    this.runPyres += this.pyreTotal;
    this.pyreChannel = null;
    if (fresh) {
      this.player.oil = this.player.oilMax;
    } else {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + this.player.stats.maxHp * 0.4);
      this.player.oil = Math.min(this.player.oilMax, this.player.oil + this.player.oilMax * 0.5);
    }
    this.rollCurse(stage, index, fresh);
    this.rollBounty();
    this.titleFor(stage);
  }

  /**
   * 每关贴一张悬赏。第一关也有——它不是难度修正，而是一个方向感：
   * 让"这一关我要干嘛"除了"活下去"之外还有一个具体答案。
   */
  private rollBounty(): void {
    const depth = this.endless ? STAGES.length - 1 + Math.floor(this.wave / 5) : this.stageIndex;
    const plan = this.dailyPlan;
    // 今日灯芯的悬赏也从剧本里来（无尽模式退回按深度抽）
    const forced = plan && !this.endless ? plan.bounties[Math.min(this.stageIndex, plan.bounties.length - 1)] : null;
    const forcedDef = forced ? BOUNTY_MAP[forced] : null;
    const def = forcedDef && this.bountyAvailable(forcedDef, depth) ? this.bounties.force(forcedDef) : this.bounties.roll(this.rng, depth);
    const where = this.endless ? `第 ${this.wave} 波` : '本关';
    this.hud?.toast(`${def.icon} 悬赏 · ${def.name}（${where}）`);
  }

  /** 该悬赏在当前深度是否可行（要打的敌人得真刷得出来）。 */
  private bountyAvailable(def: BountyDef, depth: number): boolean {
    if (def.kind !== 'hunt') return true;
    const enemy = def.enemy ? ENEMY_MAP[def.enemy] : null;
    return !!enemy && (enemy.minWave ?? 1) <= 1 + depth;
  }

  /** 悬赏完成：发金币与补给。奖励给金币而非余烬，等于把出价换成"下一关更强"。 */
  private checkBounty(): void {
    const def: BountyDef | null = this.bounties.takeCompleted();
    if (!def) return;
    const gold = Math.round(def.reward.gold * this.player.flags.goldMult * this.curseGoldMult);
    this.gold += gold;
    const lines = [`+${gold} 🪙`];
    if (def.reward.heal) {
      const heal = this.player.stats.maxHp * def.reward.heal;
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + heal);
      lines.push(`生命 +${Math.round(heal)}`);
    }
    if (def.reward.oil) {
      this.player.oil = Math.min(this.player.oilMax, this.player.oil + this.player.oilMax * def.reward.oil);
      lines.push('灯油 +');
    }
    this.save.records.bounties += 1;
    this.storage.save(this.save);
    this.achievements.unlock('bounty_first');
    if (this.save.records.bounties >= 40) this.achievements.unlock('bounty40');
    this.audio.play('evolve');
    this.floaters.label(this.player.x, this.player.y - 34, `悬赏完成 ${def.icon} ${lines.join(' · ')}`, '#ffd24e', 16);
    this.particles.shockwave(this.player.x, this.player.y, def.color, 120, 0.5);
    this.hud?.toast(`✅ 悬赏完成 · ${def.name} — ${lines.join(' · ')}`);
  }

  /**
   * 每关抽取一层夜咒：敌人更强、金币更多。
   * 第一关（教学关）不施加夜咒，让开局保持干净。
   */
  private rollCurse(stage: import('../types').StageDef, index: number, fresh: boolean): void {
    this.darknessBoost = 0;
    this.curseDarkness = 0;
    if (fresh || (index === 0 && !this.endless)) {
      this.curse = null;
      this.curseGoldMult = 1;
      this.player.curseOilMult = 1;
      this.director.setCurse(null);
      return;
    }
    const pool = CURSES.filter((c) => !this.endless || c.id !== 'longnight');
    // 今日灯芯：夜咒由日期决定，而不是当场抽——这样大家的夜晚才是同一个
    const forced = this.dailyPlan && !this.endless ? this.dailyPlan.curses[index] : null;
    const curse = (forced ? CURSE_MAP[forced] : null) ?? this.rng.pick(pool);
    this.curse = curse;
    this.curseGoldMult = curse.goldMult;
    this.director.setCurse(curse.mods);
    this.curseDarkness = curse.mods.darkness ?? 0;
    this.darknessBoost = this.curseDarkness;
    this.player.curseOilMult = curse.mods.oilDecay ?? 1;
    if (curse.mods.oilBonus) {
      this.player.oil = Math.min(this.player.oilMax, this.player.oil + this.player.oilMax * curse.mods.oilBonus);
    }
    this.hud?.toast(`夜咒 · ${curse.name} — ${curse.blurb}`);
    void stage;
  }

  private titleFor(stage: import('../types').StageDef): void {
    this.hud?.announce(`${stage.theme.name} · ${stage.theme.subtitle}`, true);
  }

  continueStage(): void {
    if (this.endless) return;
    const next = this.stageIndex + 1;
    if (next >= STAGES.length) {
      this.finishCampaign();
      return;
    }
    this.loadStage(STAGES[next], next, false);
    this.state = 'playing';
    this.syncCodex();
    this.ui?.showScreen('playing');
  }

  private finishCampaign(): void {
    this.save.best = Math.max(this.save.best, STAGES.length);
    this.achievements.unlock('conqueror');
    this.finalizeRun('clear');
    this.state = 'victory';
    this.audio.setMood('calm');
    this.ui?.showScreen('victory');
  }

  // ─────────────────────────── gameplay ───────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.postfx.update(dt);
    this.floaters.update(dt);
    if (this.screenFade > 0) this.screenFade = Math.max(0, this.screenFade - dt / 0.9);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.22);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.particles.update(dt * 0.2);
      return;
    }
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      dt *= this.slowmoScale;
    }
    if (this.state !== 'playing') {
      this.particles.update(dt * 0.5);
      this.updateDecals(dt);
      return;
    }
    this.runTime += dt;
    this.bounties.tick(dt);
    this.checkBounty();
    this.codexTimer -= dt;
    if (this.codexTimer <= 0) {
      this.codexTimer = 0.75;
      this.syncCodex();
      this.scanEncounters();
    }
    this.light.begin();
    this.particles.update(dt);
    this.updateDecals(dt);
    this.updateArcs(dt);
    if (this.frameCooldowns.hurt > 0) this.frameCooldowns.hurt -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTier = 0;
      }
    }
    if (this.fogTimer > 0) {
      this.fogTimer -= dt;
      this.darknessBoost = Math.max(this.curseDarkness, this.darknessBoost - dt * 0.15);
    }
    if (this.hintQueue.length && this.runTime >= this.hintQueue[0].at) {
      const hint = this.hintQueue.shift();
      if (hint) this.hud?.toast(hint.text);
      if (!this.hintQueue.length && !this.save.hintsSeen) {
        this.save.hintsSeen = true;
        this.storage.save(this.save);
      }
    }
    this.emberTimer -= dt;
    if (this.emberTimer <= 0) {
      const themeId = this.currentStage().theme.id;
      this.emberTimer = themeId === 'gloamwood' ? 0.16 : themeId === 'nightcity' ? 0.14 : 0.1;
      const a = this.rng.angle();
      const d = this.rng.range(30, 320);
      const tint =
        themeId === 'gloamwood'
          ? '#8affc1'
          : themeId === 'ashenkeep'
            ? '#8fa7ff'
            : themeId === 'nightcity'
              ? '#c9a3ff'
              : '#ffb14e';
      this.particles.ember(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, tint);
    }
    // 灯火里漂浮的微尘：把"光"画成有体积的东西
    this.moteTimer -= dt;
    if (this.moteTimer <= 0 && this.player.oilFrac > 0.06) {
      this.moteTimer = 0.065;
      const themeId = this.currentStage().theme.id;
      const lr = this.player.lightRadius * 0.94;
      const a = this.rng.angle();
      const d = Math.sqrt(this.rng.next()) * lr;
      const tint =
        themeId === 'emberhold'
          ? '#ffd9a0'
          : themeId === 'gloamwood'
            ? '#d8ffe8'
            : themeId === 'nightcity'
              ? '#e6dcff'
              : '#e2ecff';
      this.particles.mote(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, tint);
    }

    const stage = this.currentStage();
    this.director.update(dt, this.directorCtx(stage));
    this.wave = this.director.wave;
    this.updateHazards(dt);
    this.updateShrines();

    this.updateTerrain(dt);
    this.player.update(dt, this.inputSnapshot, this.playerCtx());
    const pcol = collideWalls(this.player.x, this.player.y, this.player.radius, this.level.walls);
    const clamped = clampToArena(pcol.x, pcol.y, this.player.radius, this.level.halfW, this.level.halfH);
    this.player.x = clamped.x;
    this.player.y = clamped.y;

    this.enemies.update(dt, this.enemyCtx());
    for (const e of this.enemies.bosses) {
      this.bossName = ENEMY_MAP[e.defId].name;
      this.bossFrac = clamp(e.hp / e.maxHp, 0, 1);
    }
    if (!this.enemies.bosses.length) this.bossName = null;

    this.projectiles.update(dt, (p) => this.nearestEnemy(p.x, p.y, 460), { x: this.player.x, y: this.player.y });
    this.updateBeams(dt);
    this.resolveProjectiles(dt);
    this.resolveGrounds(dt);

    this.updatePyres(dt);
    this.pickups.update(dt, this.player.x, this.player.y, this.player.stats.pickupRange, (p) => this.collect(p));

    this.camera.resize(this.renderer.width, this.renderer.height);
    this.camera.follow(this.player.x, this.player.y, dt);
    this.camera.addTrauma(this.darknessBoost * 0.001);
    this.camera.updateShake(dt, this.settings.data.shake * this.settings.motionScale);
    const hpFrac = this.player.hp / this.player.stats.maxHp;
    this.postfx.danger = hpFrac < 0.4 ? clamp(1 - hpFrac / 0.4, 0, 1) : 0;
    this.updateMood();

    if (this.player.hp <= 0) this.handleDeath();

    // Endless: keep counting sustained survival every few waves
    if (this.endless && this.wave >= 20) this.achievements.unlock('endless20');
    if (this.endless && this.wave >= 40) this.achievements.unlock('endless40');
  }

  /**
   * 灯台：散落在远处的熄灭石灯。
   *
   * 站在旁边会慢慢点亮，走开会回落——于是"要不要在一片黑暗里停下来"变成一次取舍：
   * 点燃要花时间、还会惊动黑暗，换来的是一处长明（视野）与整局的余温（伤害 / 灯火）。
   * 大竞技场也因此不再只是背景板，而是值得走一趟的地方。
   */
  private updatePyres(dt: number): void {
    const pyres = this.level.pyres;
    if (!pyres.length) return;
    let channel: Pyre | null = null;
    for (const py of pyres) {
      if (py.lit) continue;
      const dx = this.player.x - py.x;
      const dy = this.player.y - py.y;
      if (dx * dx + dy * dy < 84 * 84) channel = py;
    }
    this.pyreChannel = channel;
    for (const py of pyres) {
      if (py.lit) {
        // 长明的灯台一直照亮这一片——它既是奖励，也是你之后可以退守的据点
        const flicker = 1 + Math.sin(this.time * 7.5 + py.x * 0.02) * 0.05;
        this.light.addLight(py.x, py.y, 250 * flicker, 0.82);
        this.light.addGlow(py.x, py.y, 215, 0.5);
        if (this.rng.next() < dt * 3) this.particles.ember(py.x + this.rng.range(-14, 14), py.y - 30, '#ffc46b');
      } else if (py === channel) {
        py.progress = Math.min(1, py.progress + dt / 1.15);
        this.particles.ember(py.x + this.rng.range(-10, 10), py.y - 20, '#ffb15e');
        if (py.progress >= 1) this.ignitePyre(py);
      } else {
        py.progress = Math.max(0, py.progress - dt * 0.7);
      }
    }
  }

  /** 点燃一座灯台：长明 + 余温 + 黑暗的回应。 */
  private ignitePyre(py: Pyre): void {
    py.lit = true;
    py.progress = 1;
    this.pyresLit += 1;
    this.pyresLitTotal += 1;
    const p = this.player;
    p.pyreMods.damageMult *= 1.05;
    p.pyreMods.lightMult *= 1.06;
    p.recomputeStats();
    p.oil = Math.min(p.oilMax, p.oil + p.oilMax * 0.14);
    this.gold += Math.round(10 * p.flags.goldMult * this.curseGoldMult);
    this.floaters.label(py.x, py.y - 36, '长明', '#ffd9a0', 15);
    this.particles.burst(py.x, py.y - 20, 26, '#ffb15e', { speed: 190, size: 3, life: 0.9 });
    this.camera.addTrauma(0.35);
    this.flash = 0.22;
    this.audio.play('evolve');
    if (this.pyresLit === 1) this.achievements.unlock('pyre_first');
    if (this.pyreTotal > 0 && this.pyresLit >= this.pyreTotal) this.achievements.unlock('pyre_all');
    this.bounties.onPyre();
    this.hud?.toast(`🏮 灯台 ${this.pyresLit}/${this.pyreTotal} · 灯火更旺了`);
    // 点燃的动静会把附近的东西叫过来：不然"探索"就没有代价了
    const count = 3 + Math.min(2, this.stageIndex);
    for (let i = 0; i < count; i += 1) {
      const a = this.rng.angle();
      const d = 240 + this.rng.next() * 160;
      this.spawnWithScaling(
        this.rng.pick(['shade', 'crawler', 'spitter', 'moth', 'skitter', 'splinter']),
        py.x + Math.cos(a) * d,
        py.y + Math.sin(a) * d,
        this.director.bossHpMult * 0.7,
        this.director.bossDmgMult * 0.9,
      );
    }
  }

  private updateShrines(): void {
    for (const s of this.level.shrines) {
      if (s.used || s.prompted) continue;
      const dx = this.player.x - s.x;
      const dy = this.player.y - s.y;
      if (dx * dx + dy * dy < 46 * 46) {
        this.openShrine(s);
        return;
      }
    }
  }

  private openShrine(s: Shrine): void {
    this.shrineOpen = s;
    this.state = 'shrine';
    this.audio.play('levelup');
    const pool = [...SHRINE_OFFERS];
    this.rng.shuffle(pool);
    this.shrineOffers = pool.slice(0, 3);
    this.ui?.showScreen('shrine');
  }

  chooseShrine(id: string): void {
    const offer = this.shrineOffers.find((o) => o.id === id);
    const shrine = this.shrineOpen;
    if (!offer || !shrine) return;
    const p = this.player;
    switch (id) {
      case 'blood_pact': {
        p.shrineMods.maxHpMult *= 0.8;
        const pool = RELICS.filter((r) => !p.relics.has(r.id));
        if (pool.length) p.addRelic(this.rng.pick(pool).id);
        this.achievements.unlock('relic_first');
        break;
      }
      case 'kindle':
        p.shrineMods.damageMult *= 1.12;
        p.shrineMods.oilDecayMult *= 1.18;
        break;
      case 'tithe':
        this.gold += 60;
        p.shrineMods.goldMult *= 0.9;
        break;
      case 'vigil': {
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.6);
        p.oil = p.oilMax;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          this.spawnWithScaling('shade', p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, this.director.bossHpMult * 0.5, this.director.bossDmgMult);
        }
        this.hud?.toast('⚠ 黑暗被惊动了');
        break;
      }
      case 'fasting':
        p.shrineMods.oilDecayMult *= 0.75;
        p.shrineMods.maxHpMult *= 0.9;
        break;
      default:
        break;
    }
    p.recomputeStats();
    shrine.used = true;
    shrine.prompted = true;
    this.shrineOpen = null;
    this.achievements.unlock('shrine_first');
    this.audio.play('evolve');
    this.flash = 0.35;
    this.hud?.toast(`祭坛：${offer.name}`);
    this.state = 'playing';
    this.ui?.showScreen('playing');
  }

  leaveShrine(): void {
    if (this.shrineOpen) this.shrineOpen.prompted = true;
    this.shrineOpen = null;
    this.audio.play('ui');
    this.state = 'playing';
    this.ui?.showScreen('playing');
  }

  private drawShrines(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const s of this.level.shrines) {
      const pulse = 0.6 + Math.sin(this.time * 2.2 + s.x * 0.01) * 0.4;
      const dim = s.used ? 0.25 : 1;
      ctx.fillStyle = '#2a2f42';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 6, 26, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b4260';
      ctx.fillRect(s.x - 14, s.y - 10, 28, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(s.x - 14, s.y + 2, 28, 4);
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(s.x, s.y - 16, 0, s.x, s.y - 16, 34 * pulse);
      g2.addColorStop(0, `rgba(190,230,255,${0.85 * dim * pulse})`);
      g2.addColorStop(0.45, `rgba(120,170,255,${0.35 * dim})`);
      g2.addColorStop(1, 'rgba(40,60,180,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 16, 34 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(235,245,255,${0.9 * dim})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - 18, 5, 9 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // 靠近时的可交互提示：扩散光环
      if (!s.used) {
        const dist = Math.hypot(this.player.x - s.x, this.player.y - s.y);
        const near = clamp(1 - (dist - 46) / 130, 0, 1);
        if (near > 0.01) {
          const t = (this.time * 0.9) % 1;
          ctx.save();
          ctx.globalAlpha = near * (1 - t) * 0.7;
          ctx.strokeStyle = 'rgba(190,225,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y - 4, 20 + t * 46, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = near;
          ctx.globalCompositeOperation = 'lighter';
          const ring = ctx.createRadialGradient(s.x, s.y - 4, 8, s.x, s.y - 4, 56);
          ring.addColorStop(0, 'rgba(120,180,255,0)');
          ring.addColorStop(1, `rgba(120,180,255,${0.22 * near})`);
          ctx.fillStyle = ring;
          ctx.beginPath();
          ctx.arc(s.x, s.y - 4, 56, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  private updateMood(): void {
    if (this.enemies.bosses.length) this.audio.setMood('boss');
    else if (this.enemies.count > 6) this.audio.setMood('battle');
    else this.audio.setMood('calm');
  }

  private currentStage() {
    return this.endless ? STAGES[STAGES.length - 1] : STAGES[this.stageIndex];
  }

  // ─── contexts ───

  private lightCtx(): LightCtx {
    return { px: this.player.x, py: this.player.y, lightRadius: this.player.lightRadius };
  }

  private playerCtx(): PlayerContext {
    return {
      enemies: this.enemies,
      projectiles: this.projectiles,
      particles: this.particles,
      addLight: (x, y, r, i, flicker) => this.light.addLight(x, y, r, i, flicker),
      addGlow: (x, y, r, i) => this.light.addGlow(x, y, r, i),
      audio: (n) => this.audio.play(n),
      shake: (a) => this.camera.addTrauma(a, this.settings.data.shake * this.settings.motionScale),
      hurt: (a) => this.damagePlayer(a),
      hit: (e, damage, crit, kx, ky, kb, opts) => this.applyHit(e, damage, crit, kx, ky, kb, opts),
      findTarget: (x, y, maxDist, requireLight) => this.nearestEnemy(x, y, Math.min(maxDist, requireLight ? this.player.lightRadius + 40 : maxDist)),
      chainZap: (x, y, damage, jumps, range, color, opts) => this.chainZap(x, y, damage, jumps, range, color, opts),
      beam: (x, y, angle, length, width, damage, color, opts) => this.fireBeam(x, y, angle, length, width, damage, color, opts),
      onNova: () => {
        this.novaCount += 1;
        this.bounties.onNova();
      },
    };
  }

  private enemyCtx(): EnemyContext {
    return {
      px: this.player.x,
      py: this.player.y,
      lightRadius: this.player.lightRadius,
      time: this.time,
      burnDps: 6 * this.player.stats.burnMult,
      slowFactor: 1,
      visionUpgrade: this.player.stats.luck,
      damagePlayer: (amount, x, y, drain, source) => this.damagePlayer(amount, x, y, drain, source),
      shoot: (x, y, angle, speed, damage, color, enemy, owner) => {
        if (enemy) {
          this.projectiles.spawn({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage,
            radius: 7,
            color,
            fromPlayer: false,
            maxLife: 3,
            trail: true,
            ownerId: owner ?? '',
          });
        }
      },
      addLight: (x, y, r, i) => this.light.addLight(x, y, r, i),
      burst: (x, y, c, col, opts) => this.particles.burst(x, y, c, col, opts),
      onDeath: (e) => this.onEnemyDeath(e),
      snuffLight: (amount) => {
        this.player.oil = Math.max(0, this.player.oil - amount);
        this.darknessBoost = Math.min(0.5, this.darknessBoost + amount * 1.5);
      },
      spawnAdd: (defId, x, y) => this.enemies.spawn(defId, x, y, this.director.bossHpMult * 0.6, this.director.bossDmgMult),
      ignitGround: (x, y) => this.addGround(x, y, 60, 4, 10),
      fog: (x, y, r) => this.addGround(x, y, r, 8, 0, 'mud'),
      regen: this.curse?.mods.enemyRegen ?? 0,
      spikes: (x, y, r) => {
        this.hazards.push({ kind: 'thorn', timer: 1.15, x, y, r });
      },
      shake: (a) => this.camera.addTrauma(a, this.settings.data.shake * this.settings.motionScale),
    };
  }

  private directorCtx(stage: import('../types').StageDef) {
    void stage;
    return {
      spawnEnemy: (defId: string, x: number, y: number, hpMult: number, dmgMult: number) => {
        this.spawnWithScaling(defId, x, y, hpMult, dmgMult);
      },
      aliveCount: () => this.enemies.count,
      spawnPoint: () => this.randomSpawnPoint(),
      announce: (text: string, big?: boolean) => this.hud?.announce(text, big),
      hazard: (kind: string) => this.handleHazard(kind),
      onBossSpawn: (defId: string) => {
        this.audio.play('boss');
        this.camera.addTrauma(0.8);
        this.camera.punchZoom(0.12);
        this.postfx.triggerGlitch(1.2);
        this.slowmo = Math.max(this.slowmo, 1.15);
        this.flash = 0.55;
        this.hud?.toast(`⚠ ${ENEMY_MAP[defId].name}`);
      },
      onStageComplete: () => this.onStageComplete(),
      isBossAlive: () => this.enemies.bosses.length > 0,
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
    };
  }

  private spawnWithScaling(defId: string, x: number, y: number, hpMult: number, dmgMult: number): string | void {
    const def = ENEMY_MAP[defId];
    const e = this.enemies.spawn(defId, x, y, hpMult, dmgMult);
    if (def.elite) {
      const affix = this.rng.pick(AFFIXES);
      this.applyAffix(e, affix.id);
      return affix.name;
    }
    return undefined;
  }

  private applyAffix(e: Enemy, id: string): void {
    this.codex.discover('affix', id);
    e.affix = id;
    if (id === 'swift') e.speed *= 1.5;
    else if (id === 'giant') {
      e.radius *= 1.35;
      e.maxHp *= 1.35;
      e.hp = e.maxHp;
      e.speed *= 0.85;
    } else if (id === 'thorn') {
      e.damage *= 1.5;
    } else if (id === 'iron') {
      e.maxHp *= 1.7;
      e.hp = e.maxHp;
      e.dr = Math.max(e.dr, 0.3);
    }
    const def = AFFIX_MAP[id];
    if (def) this.particles.burst(e.x, e.y, 8, def.color, { speed: 120, size: 3, life: 0.5 });
  }

  private randomSpawnPoint(): { x: number; y: number } {
    for (let i = 0; i < 30; i += 1) {
      const a = this.rng.angle();
      const dist = 620 + this.rng.next() * 320;
      const x = clamp(this.player.x + Math.cos(a) * dist, -this.level.halfW + 40, this.level.halfW - 40);
      const y = clamp(this.player.y + Math.sin(a) * dist, -this.level.halfH + 40, this.level.halfH - 40);
      if (!pointInWalls(x, y, this.level.walls, 26)) return { x, y };
    }
    return { x: this.player.x + 560, y: this.player.y };
  }

  /** 连锁闪电：从起点逐个跳向最近的敌人，并记录一道电弧特效。 */
  private chainZap(x: number, y: number, damage: number, jumps: number, range: number, color: string, opts: { burn?: number; slow?: number }): void {
    const pts: number[] = [x, y];
    const hitIds = new Set<number>();
    let cx = x;
    let cy = y;
    let target = this.nearestEnemy(cx, cy, range);
    for (let j = 0; j < jumps && target; j += 1) {
      hitIds.add(target.id);
      const crit = Math.random() < this.player.stats.critChance;
      const falloff = Math.pow(0.88, j);
      this.applyHit(target, damage * falloff * (crit ? this.player.stats.critMult : 1), crit, target.x - cx, target.y - cy, opts?.burn ? 90 : 40, opts);
      this.particles.burst(target.x, target.y, 4, color, { speed: 120, size: 2, life: 0.25 });
      pts.push(target.x, target.y);
      cx = target.x;
      cy = target.y;
      target = this.nearestEnemy(cx, cy, 240, hitIds);
    }
    if (pts.length >= 4) {
      this.arcs.push({ pts, life: 0.17, maxLife: 0.17, color, seed: this.rng.next() * 1000 });
      this.audio.play('hit');
    }
  }

  /**
   * 光矛：一条瞬时贯穿的直线。命中判定用"敌心到线段的距离"，
   * 所以一条光矛能把排成一列的敌人全部串起来——这正是它存在的意义。
   */
  private fireBeam(
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    damage: number,
    color: string,
    opts: { burn?: number; slow?: number; knockback?: number } = {},
  ): void {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const ex = x + dx * length;
    const ey = y + dy * length;
    this.beams.push({ x, y, ex, ey, width, life: 0.18, maxLife: 0.18, color, seed: this.rng.next() * 1000 });

    const hits: Enemy[] = [];
    this.enemies.forEach((e) => {
      if (!e.active || !this.enemies.isVulnerable(e, this.lightCtx())) return;
      const px = e.x - x;
      const py = e.y - y;
      const t = clamp(px * dx + py * dy, 0, length);
      const cx = x + dx * t;
      const cy = y + dy * t;
      if (Math.hypot(e.x - cx, e.y - cy) <= width + e.radius) hits.push(e);
    });
    if (hits.length >= 5) this.achievements.unlock('pierce_line');
    for (const e of hits) {
      const crit = Math.random() < this.player.stats.critChance;
      this.applyHit(e, damage * (crit ? this.player.stats.critMult : 1), crit, dx, dy, opts.knockback ?? 60, {
        burn: opts.burn,
        slow: opts.slow,
      });
      this.particles.burst(e.x, e.y, 3, color, { speed: 120, size: 2, life: 0.25 });
    }
    this.particles.burst(ex, ey, 6, color, { speed: 90, size: 2.5, life: 0.3 });
    this.particles.burst(x, y, 4, color, { speed: 70, size: 2, life: 0.25 });
    this.camera.addTrauma(hits.length ? 0.16 : 0.06, this.settings.data.shake * this.settings.motionScale);
  }

  private updateBeams(dt: number): void {
    for (let i = this.beams.length - 1; i >= 0; i -= 1) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
  }

  private drawBeams(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.beams) {
      const t = clamp(b.life / b.maxLife, 0, 1);
      // 外圈散光 + 内芯白热：让"瞬间一击"看起来比普通子弹重得多
      ctx.globalAlpha = 0.22 * t;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * 3.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      ctx.globalAlpha = 0.65 * t;
      ctx.lineWidth = b.width * 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      ctx.globalAlpha = 0.95 * t;
      ctx.strokeStyle = '#fffbe8';
      ctx.lineWidth = Math.max(1.5, b.width * 0.5);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      ctx.globalAlpha = 0.7 * t;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.ex, b.ey, b.width * (1.2 + (1 - t) * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private updateArcs(dt: number): void {
    for (let i = this.arcs.length - 1; i >= 0; i -= 1) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
  }

  private drawArcs(ctx: CanvasRenderingContext2D): void {
    if (!this.arcs.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.arcs) {
      const t = a.life / a.maxLife;
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.strokeStyle = pass === 0 ? a.color : '#ffffff';
        ctx.lineWidth = pass === 0 ? 8 : 2.4;
        ctx.globalAlpha = (pass === 0 ? 0.3 : 0.92) * t;
        ctx.beginPath();
        ctx.moveTo(a.pts[0], a.pts[1]);
        for (let i = 2; i < a.pts.length; i += 2) {
          const x0 = a.pts[i - 2];
          const y0 = a.pts[i - 1];
          const x1 = a.pts[i];
          const y1 = a.pts[i + 1];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const segs = 5;
          for (let s = 1; s <= segs; s += 1) {
            const u = s / segs;
            const jitter = s === segs ? 0 : Math.sin(a.seed + i * 3.1 + s * 1.7) * 10;
            ctx.lineTo(x0 + dx * u + nx * jitter, y0 + dy * u + ny * jitter);
          }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private nearestEnemy(x: number, y: number, maxDist: number, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist * maxDist;
    const lc = this.lightCtx();
    this.enemies.forEach((e) => {
      if (exclude && exclude.has(e.id)) return;
      if (e.def.requiresLight) {
        const dx = e.x - lc.px;
        const dy = e.y - lc.py;
        if (dx * dx + dy * dy > lc.lightRadius * lc.lightRadius) return;
      }
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  applyHit(e: Enemy, damage: number, crit: boolean, kx: number, ky: number, knockback: number, opts: { burn?: number; slow?: number } = {}): boolean {
    if (!this.enemies.isVulnerable(e, this.lightCtx())) return false;
    // 咒盾：元素免疫 + 额外减伤，逼玩家在「堆元素」和「堆物理」之间做选择
    const warded = e.affix === 'warded';
    if (warded) opts = {};
    const reduced = damage * (1 - e.dr) * (warded ? 0.75 : 1);
    const killed = this.enemies.damage(e, reduced, this.lightCtx(), kx, ky, knockback);
    this.damageDealt += reduced;
    if (reduced > this.maxHit) this.maxHit = reduced;
    this.floaters.damage(e.x, e.y - e.radius - 6, reduced, crit);
    if (opts.burn) this.enemies.applyBurn(e, opts.burn);
    if (opts.slow && opts.slow > 0 && e.active) e.slowTimer = Math.max(e.slowTimer, opts.slow);
    if (this.player.flags.lifesteal > 0) {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + reduced * this.player.flags.lifesteal);
    }
    this.particles.burst(e.x, e.y, crit ? 5 : 2, crit ? '#fff0a8' : '#ffb14e', { speed: 120, size: 2.5, life: 0.3 });
    if (killed) this.hitStop = Math.max(this.hitStop, 0.035);
    else this.audio.play('hit');
    return killed;
  }

  private addDecal(x: number, y: number, r: number, color: string, life: number): void {
    if (this.decals.length > 70) this.decals.shift();
    this.decals.push({ x, y, r, life, maxLife: life, color });
  }

  private updateDecals(dt: number): void {
    for (let i = this.decals.length - 1; i >= 0; i -= 1) {
      this.decals[i].life -= dt;
      if (this.decals[i].life <= 0) this.decals.splice(i, 1);
    }
  }

  private damagePlayer(amount: number, x = this.player.x, y = this.player.y, drain = 0, source?: string): void {
    if (this.player.invuln > 0 || this.player.dashTimer > 0) return;
    const scaled = amount * DIFFICULTIES[this.difficulty].dmgMult;
    const applied = this.player.takeDamage(scaled, x, y, drain);
    if (!applied) return;
    // 记下这一下是谁打的：死亡结算里"被谁扑灭"比一串数字有用得多
    const killer = SOURCE_LABEL[source ?? ''] ?? (source ? ENEMY_MAP[source] : undefined);
    if (killer) this.lastKiller = { name: killer.name, color: killer.color ?? '#ff6b81' };
    this.damageTaken += scaled;
    this.bounties.onPlayerHit();
    this.hitStop = Math.max(this.hitStop, 0.05);
    this.audio.play('hurt');
    this.camera.addTrauma(0.35, this.settings.data.shake * this.settings.motionScale);
    this.postfx.triggerGlitch(0.5);
    this.particles.burst(this.player.x, this.player.y, 8, '#ff6b6b', { speed: 140, size: 3 });
    this.events.emit('playerHit', { amount: scaled });
    if (this.player.hp <= 0) this.handleDeath();
  }

  private onEnemyDeath(e: Enemy): void {
    this.kills += 1;
    this.totalKills += 1;
    this.save.killsTotal += 1;
    this.combo += 1;
    this.comboTimer = 2.2;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.bounties.onCombo(this.combo);
    const tier = this.combo >= 50 ? 4 : this.combo >= 30 ? 3 : this.combo >= 15 ? 2 : this.combo >= 6 ? 1 : 0;
    if (tier > this.comboTier) {
      this.comboTier = tier;
      const bonus = Math.round(tier * 4 * this.player.flags.goldMult);
      this.gold += bonus;
      this.floaters.label(this.player.x, this.player.y - 30, `连杀 ×${this.combo}  +${bonus}`, '#ffd24e', 16);
      if (this.combo >= 30) this.achievements.unlock('combo30');
      this.audio.play('ui');
    }
    const def = ENEMY_MAP[e.defId];
    if (def) this.codex.discover('enemy', e.defId);
    this.bounties.onKill(e.defId);
    if (e.defId === 'splinter') {
      this.splinterKills += 1;
      if (this.splinterKills >= 12) this.achievements.unlock('splinter_slain');
    }
    if (e.defId === 'echo') {
      this.echoKills += 1;
      if (this.echoKills >= 10) this.achievements.unlock('echo_bane');
    }
    if (e.defId === 'siphon') {
      this.siphonKills += 1;
      if (this.siphonKills >= 5) this.achievements.unlock('siphon_slain');
    }
    this.particles.burst(e.x, e.y, e.boss ? 60 : e.elite ? 24 : 10, def.color, { speed: e.boss ? 320 : 180, size: e.boss ? 6 : 4, life: e.boss ? 1 : 0.6 });
    this.particles.shockwave(e.x, e.y, def.color, e.radius * 2.5, 0.4);
    this.audio.play('kill');
    let gold = 0;
    if (e.boss) gold = 30;
    else if (e.elite) gold = 9;
    else if (this.rng.next() < 0.4) gold = 1 + Math.floor(this.wave / 4);
    gold = Math.round(gold * this.player.flags.goldMult * this.curseGoldMult);
    this.loot.dropFromEnemy(e, this.player.stats.oilGainMult * DIFFICULTIES[this.difficulty].oilMult, this.rng, gold);
    if (def.splits) {
      // 碎魂：死亡时炸成几只影蛭，逼你处理"余党"
      for (let i = 0; i < def.splits.count; i += 1) {
        const a = (i / def.splits.count) * Math.PI * 2 + this.rng.next();
        this.enemies.spawn(def.splits.id, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, this.director.bossHpMult * 0.4, this.director.bossDmgMult * 0.8);
      }
      this.particles.burst(e.x, e.y, 8, '#8fb0ff', { speed: 140, size: 3 });
    }
    if (e.affix === 'split') {
      for (let i = 0; i < 2; i += 1) {
        this.enemies.spawn('shade', e.x + (i - 0.5) * 34, e.y + 14, 1 + this.wave * 0.12, 1 + this.wave * 0.05);
      }
    } else if (e.affix === 'ember') {
      this.addGround(e.x, e.y, 82, 3.5, 9, 'fire');
    } else if (e.affix === 'venom') {
      this.addGround(e.x, e.y, 96, 4.5, 7, 'poison');
    } else if (e.affix === 'fell') {
      // 「噬魂」：死前把附近同伴喂饱，逼你先拆散成群词缀怪
      this.enemies.forEach((o) => {
        if (o === e || !o.active) return;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 220 * 220) return;
        if (o.hp >= o.maxHp) return;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
        this.particles.burst(o.x, o.y, 4, '#8affc1', { speed: 70, size: 2, life: 0.5 });
      });
    }
    this.events.emit('kill', { x: e.x, y: e.y, defId: e.defId });
    if (this.kills === 1) this.achievements.unlock('first_blood');
    if (e.elite) this.camera.addTrauma(0.3);
    if (e.boss) {
      this.bossKills += 1;
      this.camera.addTrauma(1);
      this.postfx.triggerGlitch(1.4);
      this.slowmo = Math.max(this.slowmo, 1.3);
      this.flash = 0.5;
      this.hitStop = Math.max(this.hitStop, 0.1);
      this.addDecal(e.x, e.y, e.radius * 2, 'rgba(120,20,10,0.5)', 10);
      this.hud?.toast(`击败 ${def.name}！`);
      if (e.defId === 'thornlord') this.achievements.unlock('thorn_king');
      if (e.defId === 'extinguisher') this.achievements.unlock('boss_rush');
      if (e.defId === 'emberwake') this.achievements.unlock('ashen_king');
      if (e.defId === 'nightfall') this.achievements.unlock('nightfall_king');
    }
  }

  private collect(p: Pickup): void {
    const res = this.loot.apply(p);
    if (res.xp > 0) this.gainXp(res.xp);
    if (res.oil > 0) {
      this.player.oil = Math.min(this.player.oilMax, this.player.oil + (res.oil / 100) * this.player.oilMax);
      this.audio.play('oil');
      this.oilPickups += 1;
      this.particles.burst(p.x, p.y, 3, '#ffd24e', { speed: 80, size: 2 });
    }
    if (res.hearts > 0) {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 18);
      this.particles.burst(p.x, p.y, 6, '#ff6b81', { speed: 100 });
    }
    if (res.gold > 0) {
      this.gold += res.gold;
      this.audio.play('oil');
      this.floaters.label(p.x, p.y - 10, `+${res.gold}`, '#ffd24e', 13);
    }
    if (res.chest) this.grantChest();
  }

  private grantChest(): void {
    const offers = this.upgrades.generate(this.player, 1, this.rng);
    if (offers.length) {
      this.upgrades.apply(this.player, offers[0]);
      this.upgradedCount += 1;
      this.hud?.toast(`宝箱：${offers[0].name}`);
      this.audio.play('evolve');
    }
  }

  /** 图鉴有新发现时的统一处理：写盘、收集成就、提示。 */
  private onCodexDiscover(entry: CodexEntry, seen: number, total: number): void {
    this.storage.save(this.save);
    // 开局那一下会一次扫出好几条（灯火/关卡/初始武器/被动），这时合并成一条提示，
    // 免得一进游戏就被四条 toast 糊脸。
    if (this.codexBatching) {
      this.codexBatchCount += 1;
    } else {
      this.hud?.toast(`📖 图鉴 ${seen}/${total} · ${entry.name}`);
    }
    if (seen >= 50) this.achievements.unlock('codex50');
    if (seen >= total) this.achievements.unlock('codex_all');
  }

  /** 扫描玩家当前持有的一切（武器/被动/遗物/夜咒/灯火/关卡）并记进图鉴。 */
  private syncCodex(): void {
    this.codexBatching = true;
    this.codexBatchCount = 0;
    this.codex.syncFromRun(this.player, this.lanternId, this.currentStage().id, this.curse?.id ?? null);
    this.codexBatching = false;
    if (this.codexBatchCount >= 2) this.hud?.toast(`📖 图鉴 +${this.codexBatchCount} 条`);
    this.codexBatchCount = 0;
  }

  /**
   * 首次遭遇精英 / 首领时弹一张打法提示。
   *
   * 每只精英还随机带一条词缀，所以提示按「敌人 + 词缀」去重：
   * 同一个"咒盾烛母"只讲一次，下次换个词缀再讲——玩家学到的是具体的应对，而不是一句"小心"。
   */
  private scanEncounters(): void {
    this.enemies.forEach((e) => {
      if (!e.def.boss && !e.def.elite) return;
      const affix = e.affix ? AFFIX_MAP[e.affix] : null;
      const head = e.def.boss ? '首领' : '精英';
      const parts = [e.def.note ?? '', affix ? `${affix.name}：${affix.blurb}` : ''];
      this.showTip(
        `${e.defId}|${e.affix ?? ''}`,
        `${head} · ${e.def.name}${affix ? ` · ${affix.name}` : ''}`,
        parts.filter(Boolean).join('　'),
      );
    });
  }

  /** 弹一张提示卡（同一条只弹一次，之后写进存档）。 */
  showTip(key: string, title: string, text: string): boolean {
    const seen = (this.save.tips ??= []);
    if (seen.includes(key)) return false;
    seen.push(key);
    this.storage.save(this.save);
    this.hud?.tip(title, text);
    return true;
  }

  private gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.playerLevel += 1;
      this.xpToNext = Math.round(8 + this.playerLevel * 5 + Math.pow(this.playerLevel, 1.6));
      this.pendingLevels += 1;
      this.events.emit('levelUp', { level: this.playerLevel });
    }
    if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
  }

  private openLevelUp(): void {
    this.rerollsLeft = this.meta.bonuses().rerolls;
    this.currentOffers = this.upgrades.generate(this.player, 3, this.rng);
    if (this.currentOffers.length === 0) {
      this.pendingLevels = 0;
      return;
    }
    this.state = 'levelup';
    this.audio.play('levelup');
    this.ui?.setOffers(this.currentOffers, this.rerollsLeft);
    this.ui?.showScreen('levelup');
  }

  chooseUpgrade(offer: UpgradeOffer): void {
    this.upgrades.apply(this.player, offer);
    if (offer.kind === 'passive') this.player.recomputeStats();
    this.upgradedCount += 1;
    this.pendingLevels -= 1;
    if (this.playerLevel >= 10) this.achievements.unlock('level10');
    if (this.upgradedCount >= 6) this.achievements.unlock('greedy');
    if (this.currentOffers.some((o) => o.tag === 'evolve' && o.id === offer.id)) {
      this.achievements.unlock('evolved');
      this.audio.play('evolve');
    }
    this.currentOffers = [];
    this.storage.save(this.save);
    if (this.pendingLevels > 0) {
      this.openLevelUp();
    } else {
      this.state = 'playing';
      this.ui?.showScreen('playing');
    }
  }

  reroll(): void {
    if (this.rerollsLeft <= 0) return;
    this.rerollsLeft -= 1;
    this.currentOffers = this.upgrades.generate(this.player, 3, this.rng);
    this.ui?.setOffers(this.currentOffers, this.rerollsLeft);
    this.audio.play('ui');
  }

  private resolveProjectiles(dt: number): void {
    void dt;
    for (const p of this.projectiles.all) {
      if (!p.active) continue;
      if (pointInWalls(p.x, p.y, this.level.walls, 0)) {
        if (p.explode > 0) this.explode(p);
        p.active = false;
        continue;
      }
      if (p.fromPlayer) {
        this.enemies.forEach((e) => {
          if (!p.active) return;
          if (p.hitIds.includes(e.id)) return;
          const rr = p.radius + e.radius;
          if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= rr * rr) {
            const crit = Math.random() < this.player.stats.critChance;
            const dmg = p.damage * (crit ? this.player.stats.critMult : 1);
            this.applyHit(e, dmg, crit, p.vx, p.vy, p.knockback, { burn: p.burn, slow: p.slow });
            p.hitIds.push(e.id);
            if (p.returning) {
              this.bladeReturnHits += 1;
              if (this.bladeReturnHits >= 25) this.achievements.unlock('blade_return');
            }
            if (p.explode > 0) {
              this.explode(p);
              p.active = false;
              return;
            }
            if (p.pierce > 0) p.pierce -= 1;
            else p.active = false;
          }
        });
      } else {
        const dx = p.x - this.player.x;
        const dy = p.y - this.player.y;
        const rr = p.radius + this.player.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          this.damagePlayer(p.damage, p.x, p.y, 0, p.ownerId || undefined);
          this.particles.burst(p.x, p.y, 4, '#c9a3ff', { speed: 100 });
          p.active = false;
        }
      }
    }
  }

  private explode(p: Projectile): void {
    const radius = p.explode * (1 + (this.player.stats.areaMult - 1) * 0.5);
    this.particles.shockwave(p.x, p.y, '#ff7a2f', radius, 0.45);
    this.particles.burst(p.x, p.y, 18, '#ff9d2e', { speed: 240, size: 4, life: 0.6 });
    this.camera.addTrauma(0.2, this.settings.data.shake * this.settings.motionScale);
    this.addDecal(p.x, p.y, radius * 0.8, 'rgba(20,8,4,0.55)', 6);
    this.enemies.forEach((e) => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= radius + e.radius) {
        const falloff = 1 - clamp((d / radius) * 0.5, 0, 0.6);
        const dmg = p.damage * falloff;
        this.applyHit(e, dmg, false, e.x - p.x, e.y - p.y, p.knockback, { burn: p.burn, slow: p.slow });
      }
    });
  }

  private addGround(x: number, y: number, r: number, life: number, dps: number, kind: 'fire' | 'poison' | 'mud' = 'fire'): void {
    this.grounds.push({ x, y, r, life, dps, kind });
    this.particles.shockwave(x, y, kind === 'mud' ? '#9fb7c9' : '#ff7a2f', r, life);
  }

  /**
   * 地形减速：踩进「织雾者」的滞行雾里，脚步会沉下去。
   * 每帧重算并写在玩家身上，由 Player.update 读取（而不是让地面直接改玩家速度，
   * 免得一个技能把玩家的属性改得收不回来）。
   */
  private updateTerrain(dt: number): void {
    let slow = 1;
    for (const g of this.grounds) {
      if (g.kind !== 'mud') continue;
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      if (dx * dx + dy * dy <= g.r * g.r) slow = Math.min(slow, 0.6);
    }
    this.player.terrainSlow = slow;
    if (slow < 1) {
      this.mudTime += dt;
      if (this.mudTime >= 20) this.achievements.unlock('mirewalker');
    }
  }

  private resolveGrounds(dt: number): void {
    for (let i = this.grounds.length - 1; i >= 0; i -= 1) {
      const g = this.grounds[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.grounds.splice(i, 1);
        continue;
      }
      if (g.kind === 'mud') continue;
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      if (dx * dx + dy * dy <= g.r * g.r) this.damagePlayer(g.dps * dt, g.x, g.y, 0, g.kind);
      this.light.addGlow(g.x, g.y, g.r * 1.2, g.kind === 'poison' ? 0.3 : 0.5);
    }
  }

  private handleHazard(kind: string): void {
    const p = this.player;
    const tip = HAZARD_TIP[kind];
    if (tip) this.showTip(`hazard:${kind}`, `险境 · ${HAZARD_LABEL[kind] ?? kind}`, tip);
    switch (kind) {
      case 'meteor':
      case 'collapse': {
        for (let i = 0; i < 4; i += 1) {
          const a = this.rng.angle();
          const d = this.rng.range(60, 320);
          this.hazards.push({ kind, timer: 1.2 + i * 0.15, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: kind === 'meteor' ? 96 : 120 });
        }
        this.hud?.toast(kind === 'meteor' ? '☄ 陨石雨' : '🧱 塌方预警');
        break;
      }
      case 'eruption': {
        for (let i = 0; i < 5; i += 1) {
          const a = this.rng.angle();
          this.addGround(p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, 90, 6, 12);
        }
        this.hud?.toast('🌋 熔岩喷发');
        break;
      }
      case 'fog': {
        this.fogTimer = 8;
        this.darknessBoost = Math.max(this.darknessBoost, 0.4);
        this.hud?.toast('🌫 浓雾笼罩');
        break;
      }
      case 'wispstorm': {
        const count = 18;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2;
          this.projectiles.spawn({ x: p.x + Math.cos(a) * 340, y: p.y + Math.sin(a) * 340, vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, damage: 8, radius: 7, color: '#8f7bff', fromPlayer: false, maxLife: 2.4 });
        }
        this.hud?.toast('✨ 相位风暴');
        break;
      }
      case 'echoes': {
        // 一次放几只「回响」出来：它们追的是你刚才走过的地方，所以"原地绕圈"会被合围
        const count = 2 + (this.rng.next() < 0.4 ? 1 : 0);
        for (let i = 0; i < count; i += 1) {
          const a = this.rng.angle();
          const d = 340 + this.rng.next() * 220;
          const mx = clamp(p.x + Math.cos(a) * d, -this.level.halfW + 40, this.level.halfW - 40);
          const my = clamp(p.y + Math.sin(a) * d, -this.level.halfH + 40, this.level.halfH - 40);
          this.enemies.spawn('echo', mx, my, this.director.bossHpMult * 0.8, this.director.bossDmgMult * 0.9);
        }
        this.hud?.toast('🌒 回声涌来');
        break;
      }
      case 'oilvoid': {
        this.player.oil = Math.max(0, this.player.oil - 0.25);
        this.hud?.toast('💧 灯油被抽取');
        break;
      }
      default:
        break;
    }
  }

  private updateHazards(dt: number): void {
    for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
      const h = this.hazards[i];
      h.timer -= dt;
      if (h.timer <= 0) {
        this.hazards.splice(i, 1);
        const hc = h.kind === 'meteor' ? '#ff7a2f' : h.kind === 'thorn' ? '#9fd45a' : '#8fa7ff';
        this.particles.shockwave(h.x, h.y, hc, h.r, 0.5);
        this.particles.burst(h.x, h.y, 20, hc, { speed: 260, size: 4, life: 0.6 });
        this.camera.addTrauma(0.35, this.settings.data.shake * this.settings.motionScale);
        const dx = this.player.x - h.x;
        const dy = this.player.y - h.y;
        if (dx * dx + dy * dy <= h.r * h.r) {
          this.damagePlayer(h.kind === 'meteor' ? 22 : h.kind === 'thorn' ? 18 : 16, h.x, h.y, 0, h.kind);
        }
      }
    }
  }

  private onStageComplete(): void {
    this.save.best = Math.max(this.save.best, this.stageIndex + 1);
    this.storage.save(this.save);
    if (this.stageIndex === 0) this.achievements.unlock('survivor');
    if (this.difficulty === 'nightmare') this.achievements.unlock('nightmare');
    if (this.curse) this.achievements.unlock('curse_bearer');
    if (this.curse && (this.curse.id === 'whisper' || this.curse.id === 'starve')) this.achievements.unlock('curse_veteran');
    if (this.endless) {
      this.openShop('无尽之夜 · 补给站');
      return;
    }
    if (this.stageIndex >= STAGES.length - 1) {
      this.finishCampaign();
      return;
    }
    this.openShop(`${STAGES[this.stageIndex].theme.name} · 已平定`);
  }

  // ─────────────────────── shop ───────────────────────

  private openShop(header: string): void {
    this.shopHeader = header;
    this.forgeUsed = false;
    this.state = 'shop';
    this.audio.setMood('calm');
    this.audio.play('levelup');
    this.rollShop();
    this.ui?.showScreen('shop');
  }

  private rollShop(): void {
    const owned = this.player.relics;
    const pool = RELICS.filter((r) => !owned.has(r.id));
    const weights = pool.map((r) => (r.rarity === 'common' ? 3 : r.rarity === 'rare' ? 2 : 1));
    const picks = [] as typeof pool;
    const poolCopy = [...pool];
    const weightCopy = [...weights];
    const priceScale = 1 + this.stageIndex * 0.12 + (this.endless ? Math.floor(this.wave / 5) * 0.15 : 0);
    for (let i = 0; i < 3 && poolCopy.length; i += 1) {
      const total = weightCopy.reduce((a, b) => a + b, 0);
      let roll = this.rng.next() * total;
      let idx = 0;
      for (; idx < weightCopy.length; idx += 1) {
        roll -= weightCopy[idx];
        if (roll <= 0) break;
      }
      idx = Math.min(idx, poolCopy.length - 1);
      picks.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
      weightCopy.splice(idx, 1);
    }
    const items: ShopItem[] = picks.map((r) => ({
      kind: 'relic',
      id: r.id,
      name: r.name,
      blurb: r.blurb,
      icon: r.icon,
      color: r.color,
      price: Math.round(r.price * priceScale),
      sold: false,
    }));
    const offer = this.upgrades.generate(this.player, 1, this.rng)[0];
    if (offer) {
      items.push({
        kind: 'upgrade',
        id: offer.id,
        name: offer.name,
        blurb: offer.blurb,
        icon: offer.icon,
        color: offer.color,
        price: Math.round(28 * priceScale),
        sold: false,
        offer,
      });
    }
    items.push({ kind: 'heal', id: 'heal', name: '热汤', blurb: '回复 40% 生命。', icon: '🍲', color: '#8affc1', price: Math.round(20 * priceScale), sold: false });
    items.push({ kind: 'oil', id: 'oil', blurb: '立刻回满灯油。', name: '满壶灯油', icon: '🛢️', color: '#ffd24e', price: Math.round(12 * priceScale), sold: false });
    this.shopItems = items;
  }

  /** 熔铸台的价格：越深的关卡越贵（那时金币也多）。 */
  get forgePrice(): number {
    return 55 + this.stageIndex * 15;
  }

  /**
   * 熔铸：把一件已有遗物烧掉，换成另一件。
   *
   * 契约型遗物（双芯 / 猎人之眼 / 苦修之环……）是"更强但带代价"，可代价原本没有出口；
   * 有了熔铸台，玩家就能在"忍"和"花金币换掉"之间做一次真正的决定。
   */
  forgeRelic(id: string): void {
    if (this.forgeUsed || this.state !== 'shop') return;
    if (!this.player.relics.has(id)) return;
    const price = this.forgePrice;
    if (this.gold < price) {
      this.hud?.toast('金币不够熔铸');
      return;
    }
    const old = RELIC_MAP[id];
    const rarity = old?.rarity ?? 'common';
    const owned = this.player.relics;
    const sameRarity = RELICS.filter((r) => !owned.has(r.id) && r.id !== id && r.rarity === rarity);
    const anyLeft = RELICS.filter((r) => !owned.has(r.id) && r.id !== id);
    const pool = sameRarity.length ? sameRarity : anyLeft;
    if (!pool.length) {
      this.hud?.toast('没有可以换上的遗物了');
      return;
    }
    this.gold -= price;
    this.forgeUsed = true;
    this.player.removeRelic(id);
    const next = this.rng.pick(pool);
    this.player.addRelic(next.id);
    this.codex.discover('relic', next.id);
    this.audio.play('evolve');
    this.flash = 0.3;
    this.achievements.unlock('forge_first');
    this.hud?.toast(`🔥 熔铸：${old?.name ?? id} → ${next.name}`);
    // 不重掷商品：玩家可能正攒钱等某一件，熔铸不该把它换掉
    this.ui?.showScreen('shop');
  }

  rerollShop(): void {
    if (this.gold < 8) return;
    this.gold -= 8;
    this.rollShop();
    this.audio.play('ui');
    this.ui?.showScreen('shop');
  }

  buyShop(index: number): boolean {
    const item = this.shopItems[index];
    if (!item || item.sold || this.gold < item.price) return false;
    this.gold -= item.price;
    item.sold = true;
    if (item.kind === 'relic') {
      this.player.addRelic(item.id);
      this.achievements.unlock('relic_first');
      if (this.player.relics.size >= 4) this.achievements.unlock('relic_hoard');
      this.audio.play('evolve');
    } else if (item.kind === 'upgrade' && item.offer) {
      this.upgrades.apply(this.player, item.offer);
      this.player.recomputeStats();
      this.upgradedCount += 1;
      this.audio.play('levelup');
    } else if (item.kind === 'heal') {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + this.player.stats.maxHp * 0.4);
      this.audio.play('oil');
    } else if (item.kind === 'oil') {
      this.player.oil = this.player.oilMax;
      this.audio.play('oil');
    }
    this.ui?.showScreen('shop');
    return true;
  }

  leaveShop(): void {
    this.audio.play('ui');
    if (this.endless) {
      this.rollBounty();
      this.state = 'playing';
      this.ui?.showScreen('playing');
      return;
    }
    this.continueStage();
  }

  private handleDeath(): void {
    if (this.state === 'dead') return;
    if (this.player.revives > 0) {
      this.player.revives -= 1;
      this.player.hp = this.player.stats.maxHp * 0.5;
      this.player.invuln = 2;
      this.player.oil = this.player.oilMax;
      this.particles.shockwave(this.player.x, this.player.y, '#ffd24e', 300, 0.8);
      this.particles.burst(this.player.x, this.player.y, 40, '#ffb14e', { speed: 300, size: 5, life: 1 });
      this.postfx.triggerGlitch(1.4);
      this.camera.addTrauma(1);
      this.hud?.toast('✦ 复燃！');
      return;
    }
    this.state = 'dead';
    this.audio.setMood('calm');
    this.finalizeRun('defeat');
    this.ui?.showScreen('dead');
  }

  /**
   * 结算一局（死亡或通关都走这里）：算收益、写生涯、发成就。
   * 通关有额外余烬——之前只有死亡才会结算，通关反而不给余烬，这里一并修掉。
   */
  private finalizeRun(outcome: 'clear' | 'defeat'): void {
    const mods = DIFFICULTIES[this.difficulty];
    const cleared = outcome === 'clear';
    let base = Math.round(this.runTime * 0.6 + this.kills * 1.4 + this.wave * 12 + this.bossKills * 120 + this.playerLevel * 8);
    if (cleared) base = Math.round(base * 1.25) + 120;
    const embers = Math.max(1, Math.round(base * mods.emberMult * (1 + this.meta.bonuses().emberMult)));
    this.embersEarned = embers;
    this.save.embers += embers;
    this.save.runs += 1;
    if (this.endless) this.save.bestEndlessWave = Math.max(this.save.bestEndlessWave, this.wave);
    this.save.best = Math.max(this.save.best, this.stageIndex + 1);
    this.runOutcome = outcome;
    this.recordHighlights = this.records.record(this.runStats(), cleared);
    if (this.dailyPlan) this.recordDaily();
    if (this.save.runs >= 25) this.achievements.unlock('runs25');
    if (this.save.records.clearedRuns >= 3) this.achievements.unlock('clears3');
    this.storage.save(this.save);
    this.events.emit('gameOver', { stats: this.runStats() });
  }

  /** 今日灯芯的成绩（跨天自动重置成新的一天）。 */
  dailySave(): DailySave {
    const key = dailyKey();
    if (this.save.daily.key !== key) {
      this.save.daily = { ...defaultDaily(), key };
      this.storage.save(this.save);
    }
    return this.save.daily;
  }

  /** 今日灯芯结算：记次数、留最好的一次。 */
  private recordDaily(): void {
    const plan = this.dailyPlan;
    if (!plan) return;
    const d = this.save.daily;
    if (d.key !== plan.key) Object.assign(d, defaultDaily(), { key: plan.key });
    d.attempts += 1;
    const stats = this.runStats();
    const cleared = this.runOutcome === 'clear';
    const score = dailyScore({ kills: stats.kills, stage: stats.stage, level: stats.level, bossKills: stats.bossKills, cleared });
    this.dailyScore = score;
    if (score > d.bestScore) {
      this.dailyBest = true;
      d.bestScore = score;
      d.bestKills = stats.kills;
      d.bestStage = stats.stage;
      d.bestLantern = stats.lantern;
      d.cleared = cleared;
    }
    this.storage.save(this.save);
  }

  /** 成就解锁：发余烬奖励 + 提示。奖励计进本局统计，结算界面单列一行。 */
  private onAchievement(id: string): void {
    const def = ACHIEVEMENT_MAP[id];
    const bonus = def?.embers ?? 0;
    if (bonus > 0) {
      this.save.embers += bonus;
      this.achievementEmbers += bonus;
    }
    this.storage.save(this.save);
    // 提示里用中文成就名，别把内部 id 甩到玩家脸上
    this.hud?.toast(`🏆 成就解锁 · ${def?.name ?? id}${bonus > 0 ? ` +${bonus} 余烬` : ''}`);
  }

  runStats(): RunStats {
    return {
      kills: this.kills,
      level: this.playerLevel,
      xp: Math.round(this.xp),
      time: this.runTime,
      wave: this.wave,
      stage: this.stageIndex + 1,
      embers: this.embersEarned,
      damageDealt: Math.round(this.damageDealt),
      damageTaken: Math.round(this.damageTaken),
      bestCombo: this.bestCombo,
      bossKills: this.bossKills,
      difficulty: this.difficulty,
      lantern: this.lanternId,
      stageId: this.currentStage().id,
      endless: this.endless,
      daily: !!this.dailyPlan,
    };
  }

  /** Tab：随时翻看当前构筑（等同暂停，但不打断节奏感）。 */
  /** 开始今日灯芯：灯火 / 难度 / 每一关的夜咒与悬赏都由日期决定。 */
  startDailyRun(key: string = dailyKey()): void {
    const plan = buildDailyPlan(key);
    this.newRun(plan.lantern, plan.difficulty, false, plan);
    this.hud?.announce(`今日灯芯 · ${dailyLabel(plan)}`, true);
  }

  toggleSheet(): void {
    if (this.state === 'loadout') {
      this.state = this.sheetReturn;
      this.ui?.showScreen(this.sheetReturn);
      return;
    }
    if (this.state === 'playing' || this.state === 'paused') {
      this.sheetReturn = this.state;
      this.state = 'loadout';
      this.ui?.showScreen('loadout');
    }
  }

  togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui?.showScreen('paused');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui?.showScreen('playing');
    }
  }

  buyMeta(id: string): boolean {
    const ok = this.meta.buy(id);
    if (ok) {
      this.storage.save(this.save);
      this.audio.play('ui');
      this.ui?.setMeta(this.meta);
    }
    return ok;
  }

  resetSave(): void {
    this.save = this.storage.reset();
    this.meta = new MetaSystem(this.save);
    this.achievements = new AchievementSystem(this.save, (id) => this.onAchievement(id));
    this.codex = new CodexSystem(this.save, (entry, seen, total) => this.onCodexDiscover(entry, seen, total));
    this.records = new RecordsSystem(this.save);
    this.bounties = new BountySystem();
    this.ui?.setMeta(this.meta);
  }

  // ─────────────────────────── render ───────────────────────────

  setInput(moveX: number, moveY: number, dash: boolean, nova: boolean): void {
    this.inputSnapshot.moveX = moveX;
    this.inputSnapshot.moveY = moveY;
    this.inputSnapshot.dash = dash;
    this.inputSnapshot.nova = nova;
  }

  /** 主菜单 / 图鉴类界面：不放实时战斗，改画一张动态"守夜人剪影"海报。 */
  private get attract(): boolean {
    return (
      this.state === 'menu' ||
      this.state === 'select' ||
      this.state === 'meta' ||
      this.state === 'codex' ||
      this.state === 'records' ||
      this.state === 'achievements' ||
      this.state === 'settings'
    );
  }

  render(): void {
    const r = this.renderer;
    // 动态分辨率：按实测帧间隔自动升降内部渲染分辨率（高分屏下这一项决定能不能跑到 60fps）
    r.adaptive = this.settings.data.adaptive;
    r.setQuality(this.settings.data.quality);
    r.sampleFrame();
    r.begin();
    const theme = this.currentStage().theme;
    r.clear(theme.fog);
    const ctx = r.ctx;
    const w = r.width;
    const h = r.height;

    if (this.attract) {
      this.drawAttract(ctx, w, h, this.time);
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      this.postfx.applyGrade(ctx, w, h, w * 0.5, h * 0.72, 0.8);
      this.postfx.applyBloom(ctx, w, h);
      this.postfx.applyMain(ctx, w, h);
      if (this.screenFade > 0) {
        ctx.fillStyle = `rgba(2,3,6,${this.screenFade.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }

    this.drawWorld(ctx, w, h);
    this.light.setDarkness(clamp(0.94 + this.darknessBoost, 0, 0.99));
    this.light.render(ctx, this.camera, w, h, this.time);
    this.drawPyreGlow(ctx, w, h);

    // Screen-space overlays
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    // 暖色分级：让灯火最亮的地方偏暖，暗部偏冷，画面立刻有"分级"而不是灰蒙蒙
    this.postfx.applyGrade(ctx, w, h, this.renderer.width / 2, this.renderer.height / 2, 1);
    this.postfx.applyBloom(ctx, w, h);
    this.postfx.applyMain(ctx, w, h);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,242,214,${this.flash.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // 方位指示放在后处理之后：屏幕边缘本来就被暗角压暗，再叠一层泛光只会看不清
    this.drawTargetPointers(ctx, w, h);
    if (this.screenFade > 0) {
      ctx.fillStyle = `rgba(2,3,6,${this.screenFade.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * 没点亮的灯台在黑暗里透出的一小团余烬微光。
   *
   * 世界在暗幕之下，远处的目标按说就该看不见——但"完全不知道该往哪走"不是难，是迷失。
   * 所以给熄灭的灯台留一点将熄的暖色：够看见方向，不够看清路。
   */
  private drawPyreGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cam = this.camera;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const py of this.level.pyres) {
      if (py.lit) continue;
      const s = cam.worldToScreen(py.x, py.y);
      if (s.x < -90 || s.y < -90 || s.x > w + 90 || s.y > h + 90) continue;
      const pulse = 0.72 + Math.sin(this.time * 2.4 + py.x * 0.01) * 0.28;
      const r = (78 + py.progress * 40) * cam.zoom;
      const g = ctx.createRadialGradient(s.x, s.y - 26 * cam.zoom, 0, s.x, s.y - 26 * cam.zoom, r);
      g.addColorStop(0, `rgba(255,170,90,${0.3 * pulse})`);
      g.addColorStop(0.45, `rgba(255,120,40,${0.13 * pulse})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 26 * cam.zoom, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 出屏的目标（灯台 / 祭坛）在屏幕边缘留一枚箭头，最多三个，免得一圈箭头糊住画面。
   *
   * 边距照 HUD 的口袋来定：左边一列被悬赏 / 灯台 / 构筑芯片占着，所以左侧缩得更多，
   * 免得箭头和标签正好落在状态栏上。
   */
  private drawTargetPointers(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cam = this.camera;
    // 按比例收，窄屏（竖屏手机）上才不会被压成负数、把箭头甩到屏幕中间
    const left = Math.min(244, w * 0.3);
    const right = Math.min(134, w * 0.17);
    // 顶部留得更多：屏幕正中偏上是公告 / 图鉴 / 成就的常驻位，箭头挤进去会被它们盖住
    const top = Math.min(196, h * 0.32);
    const bottom = Math.min(84, h * 0.17);
    const targets: { x: number; y: number; label: string; color: string }[] = [];
    for (const py of this.level.pyres) if (!py.lit) targets.push({ x: py.x, y: py.y, label: '灯台', color: '#ffb15e' });
    for (const sh of this.level.shrines) if (!sh.used) targets.push({ x: sh.x, y: sh.y, label: '祭坛', color: '#9dc4ff' });
    if (!targets.length) return;
    targets.sort(
      (a, b) => Math.hypot(a.x - cam.x, a.y - cam.y) - Math.hypot(b.x - cam.x, b.y - cam.y),
    );
    ctx.save();
    ctx.font = '600 12px system-ui, -apple-system, "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of targets.slice(0, 3)) {
      const s = cam.worldToScreen(t.x, t.y);
      const inside = s.x > left && s.x < w - right && s.y > top && s.y < h - bottom;
      if (inside) continue;
      const dx = s.x - w / 2;
      const dy = s.y - h / 2;
      const k = Math.min(
        (w / 2 - (dx < 0 ? left : right)) / Math.max(1, Math.abs(dx)),
        (h / 2 - (dy < 0 ? top : bottom)) / Math.max(1, Math.abs(dy)),
      );
      const ax = w / 2 + dx * k;
      const ay = h / 2 + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = t.color;
      const dist = Math.round(Math.hypot(dx, dy) / cam.zoom / 100) * 100;
      const tx = clamp(ax - Math.cos(ang) * 40, left + 26, w - right - 12);
      const ty = clamp(ay - Math.sin(ang) * 40, top, h - bottom);
      ctx.fillText(`${t.label} ${dist}`, tx, ty);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** 灯台：熄灭时是一座冷掉的石灯，点亮后是一束长明的火。 */
  private drawPyres(ctx: CanvasRenderingContext2D): void {
    if (!this.level.pyres.length) return;
    ctx.save();
    for (const py of this.level.pyres) {
      const flicker = 1 + Math.sin(this.time * 8 + py.x * 0.03) * 0.12;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(py.x, py.y + 9, 30, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = py.lit ? '#3a3145' : '#262238';
      ctx.beginPath();
      ctx.moveTo(py.x - 10, py.y + 6);
      ctx.lineTo(py.x + 10, py.y + 6);
      ctx.lineTo(py.x + 6, py.y - 16);
      ctx.lineTo(py.x - 6, py.y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = py.lit ? '#4c3f57' : '#332d49';
      ctx.beginPath();
      ctx.ellipse(py.x, py.y - 18, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (py.lit) {
        const g = ctx.createRadialGradient(py.x, py.y - 28, 0, py.x, py.y - 28, 58 * flicker);
        g.addColorStop(0, 'rgba(255,238,196,0.95)');
        g.addColorStop(0.4, 'rgba(255,160,60,0.5)');
        g.addColorStop(1, 'rgba(255,110,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(py.x, py.y - 28, 58 * flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,214,0.95)';
        ctx.beginPath();
        ctx.ellipse(py.x, py.y - 32, 7 * flicker, 12 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 只剩一撮将熄的余烬：既是没有点亮的提示，也是黑暗里的一点定位
        const e = ctx.createRadialGradient(py.x, py.y - 22, 0, py.x, py.y - 22, 22 * flicker);
        e.addColorStop(0, 'rgba(255,150,70,0.5)');
        e.addColorStop(1, 'rgba(255,110,20,0)');
        ctx.fillStyle = e;
        ctx.beginPath();
        ctx.arc(py.x, py.y - 22, 22 * flicker, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // 点燃进度：只有站在旁边才画，读起来就像"按住不放"
      if (!py.lit && py.progress > 0.01) {
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.arc(py.x, py.y - 20, 34, 0, Math.PI * 2);
        ctx.stroke();
        // 正在点燃时是明亮的暖白；走开之后进度回落，环也跟着变暗——不必再画一行说明
        ctx.strokeStyle = py === this.pyreChannel ? '#ffe3b0' : '#8a6a48';
        ctx.beginPath();
        ctx.arc(py.x, py.y - 20, 34, -Math.PI / 2, -Math.PI / 2 + py.progress * Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 菜单海报：暖色天光 + 层叠剪影 + 上升的火星 + 中央的持灯人。 */
  private drawAttract(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    const rnd = (n: number): number => {
      const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    };

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070911');
    bg.addColorStop(0.5, '#100d12');
    bg.addColorStop(1, '#04050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.72;
    const pulse = 0.92 + Math.sin(time * 0.9) * 0.08;

    // 星空：稀疏、微微闪烁，给暗色天幕一点层次
    ctx.save();
    for (let i = 0; i < 90; i += 1) {
      const sx = rnd(i + 101) * w;
      const sy = rnd(i + 211) * h * 0.55;
      const tw = 0.25 + 0.75 * Math.abs(Math.sin(time * 0.9 + i * 1.3));
      ctx.globalAlpha = 0.16 + rnd(i + 307) * 0.5 * tw;
      ctx.fillStyle = rnd(i + 401) > 0.7 ? '#cfe0ff' : '#ffffff';
      const size = 0.6 + rnd(i + 503) * 1.3;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 月亮：冷色光源，与暖色的灯形成冷暖对撞
    const mx = w * 0.79;
    const my = h * 0.19;
    const mr = Math.min(w, h) * 0.075;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const moonGlow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4.2);
    moonGlow.addColorStop(0, 'rgba(200,218,255,0.30)');
    moonGlow.addColorStop(0.35, 'rgba(150,175,235,0.10)');
    moonGlow.addColorStop(1, 'rgba(120,150,220,0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, w, h);
    const moonBody = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    moonBody.addColorStop(0, 'rgba(245,250,255,0.95)');
    moonBody.addColorStop(0.75, 'rgba(206,220,248,0.85)');
    moonBody.addColorStop(1, 'rgba(160,180,220,0.6)');
    ctx.fillStyle = moonBody;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(150,168,205,0.35)';
    for (const [ox, oy, cr] of [[-0.28, -0.22, 0.19], [0.22, 0.1, 0.13], [0.05, 0.36, 0.09]]) {
      ctx.beginPath();
      ctx.arc(mx + mr * ox, my + mr * oy, mr * cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 冷色天光，给暖色的灯火留出对比
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sky = ctx.createRadialGradient(cx, -h * 0.2, 0, cx, -h * 0.2, h * 1.15);
    sky.addColorStop(0, 'rgba(60,90,160,0.20)');
    sky.addColorStop(1, 'rgba(20,30,70,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 中心的灯焰光晕
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.8 * pulse);
    halo.addColorStop(0, 'rgba(255,186,104,0.22)');
    halo.addColorStop(0.32, 'rgba(255,140,60,0.10)');
    halo.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 三层地面剪影
    const layers = [
      { base: 0.72, amp: 26, freq: 0.0035, color: 'rgba(14,18,26,0.85)', phase: 0.0 },
      { base: 0.8, amp: 34, freq: 0.005, color: 'rgba(9,12,18,0.92)', phase: 1.7 },
      { base: 0.88, amp: 22, freq: 0.007, color: 'rgba(5,7,11,0.97)', phase: 3.1 },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 14) {
        const y = h * l.base + Math.sin(x * l.freq + l.phase) * l.amp + Math.sin(x * l.freq * 2.7 + l.phase) * l.amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // 缓慢横移的雾带：给静止海报一点流动感
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band += 1) {
      const by = h * (0.5 + band * 0.14);
      const drift = ((time * (8 + band * 5)) % (w + 420)) - 210;
      const fg = ctx.createLinearGradient(drift - 320, 0, drift + 320, 0);
      fg.addColorStop(0, 'rgba(90,120,180,0)');
      fg.addColorStop(0.5, `rgba(120,150,210,${0.05 - band * 0.012})`);
      fg.addColorStop(1, 'rgba(90,120,180,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, by - h * 0.05, w, h * 0.1);
    }
    ctx.restore();

    // 上升的火星
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 130; i += 1) {
      const speed = 10 + rnd(i + 7) * 34;
      const span = h + 80;
      let y = (rnd(i + 31) * span - time * speed) % span;
      if (y < 0) y += span;
      const x = rnd(i) * w + Math.sin(time * 0.5 + i * 0.7) * 12;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.6 + i));
      ctx.globalAlpha = (0.14 + rnd(i + 3) * 0.5) * twinkle;
      ctx.fillStyle = rnd(i + 5) > 0.55 ? '#ffb14e' : '#ff7a2f';
      const size = 0.9 + rnd(i + 11) * 1.9;
      ctx.beginPath();
      ctx.arc(x, y - 40, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 中央的持灯人（复用真实角色绘制，只是换到屏幕坐标）
    const p = this.player;
    const keep = { x: p.x, y: p.y, angle: p.angle, moving: p.moving, invuln: p.invuln };
    p.x = cx;
    p.y = cy;
    p.angle = -2.32;
    p.moving = false;
    p.invuln = 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(2.3, 2.3);
    ctx.translate(-cx, -cy);
    p.draw(ctx, time, { cone: 0.5, halo: 1.25 });
    ctx.restore();
    p.x = keep.x;
    p.y = keep.y;
    p.angle = keep.angle;
    p.moving = keep.moving;
    p.invuln = keep.invuln;

    // 底部压暗，让 DOM 面板上的文字更清楚
    const foot = ctx.createLinearGradient(0, h * 0.55, 0, h);
    foot.addColorStop(0, 'rgba(3,4,8,0)');
    foot.addColorStop(1, 'rgba(3,4,8,0.75)');
    ctx.fillStyle = foot;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  private drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cam = this.camera;
    void w;
    void h;
    ctx.save();
    ctx.translate(this.renderer.width / 2 + cam.shakeX, this.renderer.height / 2 + cam.shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const theme = this.currentStage().theme;
    this.drawFloor(ctx, theme);
    this.drawDecals(ctx);
    this.drawGrounds(ctx);
    this.drawHazards(ctx);
    this.drawShrines(ctx);
    this.drawPyres(ctx);
    this.pickups.draw(ctx, this.time);
    this.projectiles.draw(ctx);
    this.enemies.draw(ctx, this.time, this.player.x, this.player.y);
    this.player.draw(ctx, this.time);
    this.drawArcs(ctx);
    this.drawBeams(ctx);
    this.particles.draw(ctx);
    this.floaters.draw(ctx);

    ctx.restore();
  }

  private drawFloor(ctx: CanvasRenderingContext2D, theme: import('../types').StageTheme): void {
    const lvl = this.level;
    this.textures.build(ctx, theme.id, theme.floor, theme.wall, theme.accent);
    // 地面（径向渐变 + 碎石贴图）只跟主题和关卡尺寸有关，是纯静态内容。
    // 每帧对整块 3000x2200 区域做 pattern 填充在软件光栅化下要 7ms，所以烘焙成一张位图后按需重绘。
    const baked = this.floorLayer(theme);
    if (baked) {
      ctx.drawImage(baked, -lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
    } else {
      const floorGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(lvl.halfW, lvl.halfH));
      floorGrad.addColorStop(0, theme.wall);
      floorGrad.addColorStop(0.6, theme.floor);
      floorGrad.addColorStop(1, theme.fog);
      ctx.fillStyle = floorGrad;
      ctx.fillRect(-lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
      const groundPattern = this.textures.groundFor(theme.id);
      if (groundPattern) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = groundPattern;
        ctx.fillRect(-lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = theme.wall;
    ctx.lineWidth = 2;
    const grid = 150;
    for (let x = -lvl.halfW; x <= lvl.halfW; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, -lvl.halfH);
      ctx.lineTo(x, lvl.halfH);
      ctx.stroke();
    }
    for (let y = -lvl.halfH; y <= lvl.halfH; y += grid) {
      ctx.beginPath();
      ctx.moveTo(-lvl.halfW, y);
      ctx.lineTo(lvl.halfW, y);
      ctx.stroke();
    }
    ctx.restore();

    // 主题布景
    const view = { x: this.camera.x, y: this.camera.y, halfW: this.camera.width / 2, halfH: this.camera.height / 2 };
    drawDecor(ctx, theme.id, lvl.decor, view, this.time, lvl.details);

    // Walls (with soft drop shadow for depth)
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#000';
    for (const wall of lvl.walls) {
      ctx.fillRect(wall.x + 6, wall.y + 8, wall.w, wall.h);
    }
    ctx.restore();
    const wallPattern = this.textures.wallFor(theme.id);
    for (const wall of lvl.walls) {
      const { x, y, w: ww, h: wh } = wall;
      // 主体（贴图）
      ctx.fillStyle = wallPattern ?? theme.wall;
      ctx.fillRect(x, y, ww, wh);
      // 顶部受光的高光带，暗示"这是有体积的障碍"
      const topLight = ctx.createLinearGradient(0, y, 0, y + Math.min(wh, 46));
      topLight.addColorStop(0, 'rgba(255,255,255,0.085)');
      topLight.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = topLight;
      ctx.fillRect(x, y, ww, wh);
      // 底部与右侧的暗面
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + wh - Math.min(10, wh * 0.2), ww, Math.min(10, wh * 0.2));
      ctx.fillRect(x + ww - Math.min(10, ww * 0.2), y, Math.min(10, ww * 0.2), wh);
      // 顶边一小段月光描边
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 1);
      ctx.lineTo(x + ww - 2, y + 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 深色轮廓把石块与地面分开
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, ww, wh);
    }

    // Arena border
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 6;
    ctx.strokeRect(-lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
    ctx.globalAlpha = 1;
  }

  /** 烘焙好的静态地面层（渐变 + 贴图），按主题/尺寸缓存。 */
  private floorCache: { key: string; canvas: HTMLCanvasElement | null } | null = null;

  private floorLayer(theme: import('../types').StageTheme): HTMLCanvasElement | null {
    const lvl = this.level;
    const key = `${theme.id}|${lvl.halfW}x${lvl.halfH}`;
    if (this.floorCache && this.floorCache.key === key) return this.floorCache.canvas;
    this.floorCache = { key, canvas: null };
    try {
      const wpx = lvl.halfW * 2;
      const hpx = lvl.halfH * 2;
      // 地面只有低频渐变 + 噪点贴图，稍微降采样画不出来差别，却能把显存/内存压在几 MB 内
      const scale = Math.max(0.25, Math.min(1, Math.sqrt(2.2e6 / (wpx * hpx))));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(wpx * scale));
      c.height = Math.max(1, Math.round(hpx * scale));
      const g = c.getContext('2d');
      if (!g) return null;
      const grad = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) / 2);
      grad.addColorStop(0, theme.wall);
      grad.addColorStop(0.6, theme.floor);
      grad.addColorStop(1, theme.fog);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      const tex = this.textures.groundCanvas(theme.id);
      if (tex) {
        try {
          const pat = g.createPattern(tex, 'repeat');
          if (pat) {
            g.globalAlpha = 0.5;
            g.fillStyle = pat;
            g.fillRect(0, 0, c.width, c.height);
            g.globalAlpha = 1;
          }
        } catch {
          /* pattern 不可用就只留渐变 */
        }
      }
      this.floorCache = { key, canvas: c };
      return c;
    } catch {
      return null;
    }
  }

  private drawDecals(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const d of this.decals) {
      ctx.globalAlpha = clamp(d.life / d.maxLife, 0, 1) * 0.8;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGrounds(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const g of this.grounds) {
      if (g.kind !== 'mud') continue;
      // 滞行雾是"压暗"而不是"发光"：用普通混合盖一层灰，再用虚线勾出边界，
      // 让玩家一眼知道"这块地会拖住我"。
      const fade = clamp(g.life / 8, 0, 1);
      ctx.globalAlpha = fade * 0.72;
      const mg = ctx.createRadialGradient(g.x, g.y, g.r * 0.22, g.x, g.y, g.r);
      mg.addColorStop(0, 'rgba(20,28,38,0.94)');
      mg.addColorStop(0.72, 'rgba(40,56,72,0.66)');
      mg.addColorStop(1, 'rgba(70,92,116,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * (0.42 + 0.12 * Math.sin(g.life * 3));
      ctx.strokeStyle = '#b6cfe2';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([9, 11]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * 0.97, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.grounds) {
      if (g.kind === 'mud') continue;
      const g2 = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      if (g.kind === 'poison') {
        g2.addColorStop(0, 'rgba(140,235,110,0.42)');
        g2.addColorStop(1, 'rgba(70,170,60,0)');
      } else {
        g2.addColorStop(0, 'rgba(255,120,40,0.5)');
        g2.addColorStop(1, 'rgba(255,60,20,0)');
      }
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHazards(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const hz of this.hazards) {
      const t = 1 - clamp(hz.timer / 1.5, 0, 1);
      ctx.globalAlpha = 0.35 + 0.4 * t;
      ctx.strokeStyle = hz.kind === 'meteor' ? '#ff9d2e' : hz.kind === 'thorn' ? '#a8e05f' : '#8fa7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  get xpFrac(): number {
    return clamp(this.xp / this.xpToNext, 0, 1);
  }

  get activeLanternColor(): string {
    return LANTERN_MAP[this.lanternId]?.color ?? '#ffb14e';
  }
}

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES[d].label;
}

export { STAGE_MAP };
