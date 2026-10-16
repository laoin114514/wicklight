import { Camera } from './Camera';
import { PostFX } from './PostFX';
import { LightSystem } from './LightSystem';
import { Renderer } from './Renderer';
import { Random } from './Random';
import { TextureBank } from './Textures';
import { Settings } from './Settings';
import { Storage, type Storage as StorageType } from './Storage';
import { EventBus, type GameEvents } from './Events';
import { clamp, segDist } from './MathUtils';
import { CombatHaptics } from './Haptics';
import { isTouchDevice, perfProfile, type PerfProfile } from './Perf';
import { AudioEngine } from '../audio/AudioEngine';
import { Player, type PlayerContext } from '../entities/Player';
import { EnemySystem, applySlow, type Enemy, type EnemyContext, type LightCtx } from '../entities/enemies/Enemy';
import { ParticleSystem } from '../entities/Particle';
import { FloatingTextSystem } from '../entities/FloatingText';
import { PickupSystem, type Pickup } from '../entities/Pickup';
import { ProjectileSystem, type Projectile } from '../entities/Projectile';
import { Director } from '../systems/Director';
import { generateLevel, refinishLevel, type Level } from '../systems/LevelGen';
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
import { GRAZE } from '../data/graze';
import { WICK } from '../data/wick';
import { MINE } from '../data/mines';
import { VORTEX } from '../data/vortex';
import { POUR } from '../data/pour';
import { AURA } from '../data/aura';
import { EMBERWIND } from '../data/emberwind';
import { ENEMY_MAP } from '../data/enemies';
import { ARRIVAL } from '../data/arrival';
import { LANTERN_MAP, LANTERNS } from '../data/lanterns';
import { RELICS, RELIC_MAP, TRIBES, WICK_FAMILY_IDS } from '../data/relics';
import { AFFIXES, AFFIX_MAP } from '../data/affixes';
import { PASSIVES, PASSIVE_MAP, baseStats, type PlayerStats } from '../data/upgrades';
import { WEAPON_MAP } from '../data/weapons';
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
  | 'curse'
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

/** 地面网格的格距（世界单位）。 */
const GRID_STEP = 150;

/** 墙体精灵外扩：投影往右下偏 (6, 8)，2px 描边还有一半在框外，留 12px 富余。 */
const WALL_SPRITE_PAD = 12;

/**
 * 「分灯」：把一小罐灯油点在地上，照亮一小圈，并把附近的黑暗引过去。
 * 它是一次**取舍**而不是一次免费的控制：油就是光，光就是命——
 * 分出一点油，换几秒钟"黑暗去扑那盏灯、而不是扑你"。
 */
const LAMP_COST = 0.14;
const LAMP_COOLDOWN = 7;
const LAMP_LIFE = 11;
/** 亮芯的半径：它是一盏小灯，固定大小（不跟你手上的灯火一起变大） */
const LAMP_RADIUS = 152;
/**
 * 引怪的半径，同时也是"被照亮的那一大片"的半径。
 *
 * 一开始这里只画了一圈虚线（半径 430），截图一看全是错：844×390 的横屏高的一半才 195，
 * 那么大一个圆只有两条几乎笔直的弧落在屏幕里，看着像画面撕裂，不像"警戒线"。
 * 改成让**光照本身**说明这一片：亮芯之外再补一圈很淡的大光，
 * 于是"亮着的地方 = 会引怪的地方"成了同一条规则，不用再解释。
 */
const LAMP_LURE = 340;
/** 少于这个油量不让分：油见底本来就要开始掉血，别让玩家把自己点死 */
const LAMP_MIN_OIL = 0.2;
/** 怪凑到这么近就把灯吃掉（人越多，灯灭得越快） */
const LAMP_SNUFF_R = 34;

interface WallSprite {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
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

/**
 * 一颗被风推着走的火种（见 `data/emberwind.ts`）。
 *
 * 它不复用弹幕：弹幕的语义是"碰到就扣血、扣完就没了"，而火种的语义是
 * "碰到会**粘住**，然后一直烧你的油"——那不是同一件事，塞进弹幕里只会让两边的规则都变糊。
 */
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 左右飘的相位（每颗不一样，免得一整排看起来像一条直线） */
  phase: number;
  /** 垂直风向的摆动幅度 */
  wob: number;
  /** 还剩多久熄灭（秒）：飘出场地或烧尽就熄，不留在地上 */
  life: number;
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

/**
 * 「这一下是谁干的」的玩家向说法——**两个方向共用一张表**：
 * 挨打的时候用来写"灯火熄灭于 ×××"（和 ENEMY_MAP 一起查），
 * 打出去的时候用来写「本局伤害构成」里那几行不是武器的行。
 * 共用是因为它回答的本来就是同一个问题（"这个东西叫什么"），
 * 分成两张表迟早会有一边忘了加。
 */
const SOURCE_LABEL: Record<string, { name: string; color: string }> = {
  meteor: { name: '陨石雨', color: '#ff8a4e' },
  collapse: { name: '塌方', color: '#b48a5a' },
  thorn: { name: '荆棘地刺', color: '#9fd45a' },
  fire: { name: '火海', color: '#ff7a2f' },
  poison: { name: '毒地', color: '#7ddc6a' },
  // 玩家这一侧的三个非武器来源（见 creditDamage）
  nova: { name: '燃爆', color: '#ffb14e' },
  lantern: { name: '灯火', color: '#ffd98a' },
  other: { name: '其他', color: '#8fa7ff' },
};

interface Ground {
  x: number;
  y: number;
  r: number;
  life: number;
  dps: number;
  kind?: 'fire' | 'poison' | 'mud' | 'frost';
  /**
   * 「倾灯」倒出来的那片油火：**只烧它们，不烧你**。
   *
   * 别的火（爆裂菇的词缀、连珠伏灯留下的那层）都是 `dps` 打玩家，这一片反过来——
   * 踩在里面的怪会被一遍遍点上灼烧（走怪自己那套 burn）。为什么自己的火不烧自己：
   * 倾灯是**自动开火**的，罚一件玩家没有主动按下扳机的东西不叫代价，叫冤枉；
   * 它的代价写在油上（倒一瓢，你的灯就暗一阵）。
   */
  ignites?: boolean;
  /** 上一次给火里的怪续灼烧的计时（秒），把点火节流到 `POUR.igniteEvery` */
  igniteIn?: number;
  /** 画这片火用的一点随机相位：每片火的火舌抖法错开，同一片火前后连贯 */
  phase?: number;
  /** 这片火是谁放的（武器 id）：它续上的每一层灼烧都记在那个来源头上（见 `creditDamage`） */
  source?: string;
}

/**
 * 地上的一颗「伏灯」。
 *
 * 它和弃灯（分灯放下的那盏）是两种东西：弃灯是**饵**，怪会去吃掉它；
 * 伏灯是**雷**，怪踩上来它就炸——所以它不怕被啃，只怕没人来。
 */
interface Mine {
  x: number;
  y: number;
  /** 剩余寿命（放着不管也会自己烧尽） */
  life: number;
  /** 上弦还剩多久：> 0 时踩不响（刚放下就炸的话，它是手雷不是陷阱） */
  arm: number;
  damage: number;
  /** 爆炸半径（已经被范围加成乘过一遍，爆炸时再补另一半，与火球同一条算式） */
  radius: number;
  /** 触发距离（量到怪的边缘，所以大块头会踩得更早） */
  trigger: number;
  /** 炸完在地上留下的那片火烧几层（0 = 不留火，只有进化的连珠伏灯会留） */
  fire: number;
  /** 画面上的一点随机相位：一排雷不该同步地闪 */
  phase: number;
  /** 连爆引信：> 0 表示"被旁边那一颗点着了"，正在读秒（这期间不再等踩，只等引信烧完） */
  fuse: number;
  /** 点着它的那一颗在哪（地上那道烧过来的火花要从这儿画起） */
  fuseX: number;
  fuseY: number;
  /** 这是这一串里的第几节（0 = 被踩响的那一颗；音高与成就都看这个数） */
  link: number;
  /** 谁埋的（武器 id）：炸出来的伤害记在它头上 */
  source: string;
}

/**
 * 地上转着的一盏「旋灯」：它只做两件事——把附近的东西往里拽，然后缩成一下炸。
 */
interface Vortex {
  x: number;
  y: number;
  /** 还能转多久 */
  life: number;
  maxLife: number;
  /** 吸到多远（也是这一圈的范围本身） */
  radius: number;
  /** 收缩那一下的伤害 */
  damage: number;
  burn: number;
  /** 卷不卷弹幕（0/1，进化那一把才有） */
  drag: number;
  /** 画面上旋臂的相位：每盏转的圈不必同步 */
  phase: number;
  /** 谁放的（武器 id）：收缩那一下的伤害记在它头上 */
  source: string;
}

/** 地上的一盏弃灯（「分灯」放下的）。 */
export interface DroppedLamp {
  x: number;
  y: number;
  life: number;
  maxLife: number;
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
  /** 首领血条：无尽里第 3 / 5 轮起会有两三位同时在场，一列排下来。 */
  setBosses(list: { name: string; frac: number }[]): void;
  toast(text: string): void;
  /** 首次遭遇的提示卡（标题 + 一行说明）。 */
  tip(title: string, text: string): void;
  announce(text: string, big?: boolean): void;
  /** 清掉屏幕上挂着的卡片与排队待讲的（新开一局时用）。 */
  clearCards(): void;
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
  /**
   * 战斗触感：受伤 / 濒死 / 升级 / 死亡各一种节奏。手机上两只拇指都压在屏幕上，
   * 血条与油条都长在视野的两个角上——手是唯一空着的反馈通道。
   */
  readonly haptics: CombatHaptics;

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
  /**
   * 无尽之夜用的是哪一片战场（`STAGES` 的下标）。
   *
   * 无尽里 `stageIndex` 是**难度与经济档位**——它一直钉在最后一关（首领更硬、物价更高、
   * 悬赏更深），而战场本身一轮换一片：四位首领轮着来，四个战场也跟着轮，
   * 每一轮的险境与精英池都换一批。两者分开记，才不用为了换场景去动难度。
   */
  endlessArena = 0;
  paused = false;
  pendingLevels = 0;
  private sheetReturn: 'playing' | 'paused' = 'playing';
  oilPickups = 0;
  hazards: Hazard[] = [];
  /** 「余烬风」飘在场上的火种（见 `data/emberwind.ts`） */
  embers: Ember[] = [];
  /** 身上粘着的「燎」层数：每层每秒烧一截灯油，冲刺一下清零 */
  emberStacks = 0;
  /** 这一阵余烬风还要吹多久 */
  private emberwindTimer = 0;
  /** 已经吹了多久（用来让风越吹越急） */
  private emberwindElapsed = 0;
  /** 下一排火种的倒计时 */
  private emberwindSpawnT = 0;
  /** 两次沾身之间的最短间隔 */
  private emberwindStackCd = 0;
  /** 这一帧玩家是不是站在某座亮着的灯台的光里（火种扑到身上会灭，身上的层数往回掉） */
  private emberPyreNear = false;
  /**
   * 灯台扑火的记账：**在灯光里**待满 1/pyreDecay 秒就抖掉一层。
   *
   * ⚠ 这个计时器只往里走、而且离开光圈**不清零**（只当没在走）。清掉的话，
   * 站在判定圈边界上来回蹭（进-出各两像素，几帧的事）就等于每次进圈白送一层——
   * 那种"贴边抖"的玩法不该存在；现在它最多也就是"在光里待了多久就是多久"。
   */
  private emberPyreT = 1;
  /** 风往哪边吹（只取四个正交方向，见 handleHazard） */
  private emberwindDirX = 1;
  private emberwindDirY = 0;
  /** 上一次看到的冲刺计数：用来认出"这一帧刚起步的那次冲刺" */
  private emberwindDashSeen = 0;
  grounds: Ground[] = [];
  /** 光矛这类瞬时直线特效 */
  beams: BeamFx[] = [];
  fogTimer = 0;
  darknessBoost = 0;
  /** 夜咒「深潜」带来的持续黑暗（不会被浓雾衰减吃掉） */
  private curseDarkness = 0;
  bossName: string | null = null;
  bossFrac = 0;
  /** 场上每一位首领的名字与血量，按先来后到排列（HUD 一列画下来）。 */
  bossList: { name: string; frac: number }[] = [];
  damageDealt = 0;
  damageTaken = 0;
  bestCombo = 0;
  combo = 0;
  splinterKills = 0;
  echoKills = 0;
  siphonKills = 0;
  /** 单局在滞行雾里待过的时间（秒） */
  mudTime = 0;
  frostTime = 0;
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
  /**
   * 「本局伤害构成」：每个来源（武器 id / `nova` / `lantern` / `other`）在本局一共打出去多少。
   *
   * 为什么要有它：这一局的枪法是自动的，玩家唯一一直在做的决定是**把升级给谁**——
   * 可到了结算页，他能看到的只有一个总伤害。哪件在扛、哪件在刮，只能靠感觉猜；
   * 而"猜"在一个以构筑为核心的游戏里是说不通的：肉鸽的乐趣就长在"下一步该堆什么"上。
   *
   * 报的是**名义值**、不按剩余血量截断（和"最强一击"同一个口径），并且
   * **连灼烧那条路也算在内**（`Enemy` 每帧扣的那一点，见 `Enemy.burnSource`）——
   * 于是"所有桶加起来恒等于 `damageDealt`"，这条恒等式有测试钉着。
   * 顺带把 `damageDealt` 本身补准了：从前它漏掉灼烧，倾灯那种"伤害全在灼烧里"的武器
   * 在结算页上会显示成几乎没打伤害。
   */
  damageBySource = new Map<string, number>();
  /** 本局燃爆次数（结算用） */
  novaCount = 0;
  /** 本局掠影多少次（结算 / 成就用） */
  grazeCount = 0;
  /**
   * 掠影判定用的"这一帧走过的那一段路"的起点：在 `player.update` **之前**记一次。
   * 判定看线段而不是终点，手机掉帧时的一次冲刺才不会从掠影带里整帧跳过去。
   */
  private grazeFromX = 0;
  private grazeFromY = 0;
  /**
   * 焰烧着的时候往上飘的火星，按固定节拍（秒）发一小撮。
   * 这是「灯焰高涨」在**世界里**的样子：HUD 上再补一行字也好、脚边那圈符文也好，
   * 都不如"身上一直在冒火"这一条来得直接——它在余光里就能看见，不用去读任何数字。
   */
  private blazeEmit = 0;
  /** 最后一下是谁打的：死亡结算要交代清楚（"被谁扑灭"）。 */
  lastKiller: { name: string; color: string } | null = null;
  /** 首局的开局引导队列（剩下的条目），跑完就不再出现。 */
  private hintQueue: { at: number; text: string }[] = [];
  /** 本关灯台总数（HUD 显示 n/m）。 */
  pyreTotal = 0;
  /** 地上的弃灯（「分灯」放下的那盏小灯）。 */
  lamps: DroppedLamp[] = [];
  /** 地上的伏灯（武器「伏灯」撒下的雷）。 */
  mines: Mine[] = [];
  /** 本局一共布下过多少颗（结算用）。 */
  mineCount = 0;
  /** 本局连爆过的最长一串有几颗（结算用；1 = 只是单响） */
  mineChainBest = 0;
  /** 本局被吹灯客吹灭过几颗雷（结算用；> 0 才写那一行） */
  mineSnuffed = 0;
  /** 本局被伏灯炸到的灯蛾总数（成就「以灯为饵」看这个） */
  mineMothHits = 0;
  /** 场上转着的「旋灯」（最多也就同时两三盏） */
  vortexes: Vortex[] = [];
  /** 本局转起过几个「旋灯」（结算用） */
  vortexCount = 0;
  /** 本局一个漩涡里同时拽住过几只（结算与成就「一网打尽」看这个） */
  vortexBest = 0;
  /** 收尾那一下拢住最多的一次（结算里"最狠的一网"） */
  vortexCaught = 0;
  /** 那一网打出的最高伤害（基础 + 每收到一只的奖励；结算里跟在「最狠的一网 n 只」后面） */
  vortexPayoff = 0;
  /** 本局倒了几瓢「倾灯」、累计倒掉多少桶油（结算用） */
  pourCount = 0;
  pourSpent = 0;
  /**
   * 最近这一瓢花掉的那点油（占油桶的比例），以及「拾油」在这一瓢里已经收回来多少。
   *
   * 为什么这两个数要留在 Game 上（而不是算在玩家身上）：`emberCap` 那条封顶是**按瓢**的
   * （见 data/pour.ts 里那一段的算术），而"这一瓢"这件事只有倒出去的那一下知道。
   * 每倒一瓢就把这两个数清一次，于是"一瓢最多收回它代价的六成"是一句可以直读的话。
   */
  pourCastCost = 0;
  pourEmberGained = 0;
  lampCd = 0;
  lampCdMax = 0;
  /** 本局分过几盏灯（结算用） */
  lampCount = 0;
  /** 还没教过「分灯」时，开局安静下来之后弹那张说明卡（秒，<0 = 不用弹） */
  private lampTipIn = -1;
  /**
   * 还没教过「爆灯」时，开局安静下来之后弹那张说明卡（秒，<0 = 不用弹）。
   * 比分灯那张再晚八秒：一局里第一次同时冒出来的"新东西"不该挤在同一个十秒里。
   */
  private novaTipIn = -1;
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
  /** 下一关可选的三条夜咒（开战前由玩家自己挑一条） */
  curseOffers: CurseDef[] = [];
  /** 玩家挑好的那条，等 loadStage 时真正降临 */
  private pendingCurse: CurseDef | null = null;
  private curseGoldMult = 1;
  private slowmoScale = 0.35;
  private frameCooldowns = { hurt: 0 };
  /** 「拨芯」这条线那句"要你先按 C"讲过了没有（见 `scanWickFamily`）。 */
  private wickHintDone = false;
  private emberTimer = 0;
  private moteTimer = 0;
  private inputSnapshot = { moveX: 0, moveY: 0, dash: false, nova: false, lamp: false, dim: false, aim: false, aimX: 0, aimY: 0 };
  private startSeed = 1;
  /** 当前性能档位（掌上设备 / 桌面 × 画质），每帧开头刷新一次，全游戏只有这一处结论。 */
  profile: PerfProfile = perfProfile('high');
  private profileKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.postfx = new PostFX(this.settings);
    // 先定档位：后面 generateLevel 才知道该铺多少布景
    this.refreshPerf();
    this.audio = new AudioEngine(this.settings);
    // 设置里关掉震动（或不是掌上设备）时，下面这些调用会安静地什么都不做
    this.haptics = new CombatHaptics(() => this.settings.data.vibrate !== false);
    this.loot = new LootSystem(this.pickups);
    // 飞完射程还没落地的那一发：只有倾灯那一瓢要收尾（留一片火），别的子弹就是消失。
    // 为什么只放倾灯进来：别的带爆炸的子弹（爆裂火球）也是"打到东西才炸"，
    // 那是它本来的手感——顺手一起改等于悄悄给火球加了一截射程。
    this.projectiles.onExpire = (p) => {
      if (p.poolRadius > 0) this.explode(p);
    };
    this.save = this.storage.load();
    this.meta = new MetaSystem(this.save);
    this.achievements = new AchievementSystem(this.save, (id) => this.onAchievement(id));
    this.codex = new CodexSystem(this.save, (entry, seen, total) => this.onCodexDiscover(entry, seen, total));
    this.records = new RecordsSystem(this.save);
    this.bounties = new BountySystem();
    const startStage = STAGES[0];
    this.level = generateLevel(startStage, 1, this.profile.detailScale);
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
    this.clearEmberwind();
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
    // 难度那一档的灯油进项（见 Player.difficultyOilMult）：乘在掉落 / 擦身 / 灯台余温上
    this.player.difficultyOilMult = DIFFICULTIES[difficulty].oilMult;

    // 上一局挂着的卡片（和它身后排队的那些话）不进这一局。
    // ⚠ 必须在 loadStage 之前清：那一关的"关卡 · xxx"提示卡就是 loadStage 里弹的，
    // 清晚了会把这一局的第一张教学卡一起抹掉（实测：关卡卡从来没讲过）。
    this.hud?.clearCards();
    // 无尽之夜：战场从「幽林」开始，一轮换一片（难度档位不跟着走，见 endlessArena）
    this.endlessArena = 0;
    const stage = STAGES[endless ? 0 : this.stageIndex];
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
          {
            at: 3,
            text: isTouchDevice()
              ? '自动开火 · 右下角的冲刺有无敌帧 · 燃爆可以清场'
              : '自动开火 · 空格冲刺（有无敌帧）· Q 燃爆清场',
          },
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
    this.clearEmberwind();
    this.grounds.length = 0;
    this.beams.length = 0;
    this.time = 0;
    this.runTime = 0;
    this.wave = 0;
    this.lamps.length = 0;
    this.lampCd = 0;
    this.lampCdMax = 0;
    this.lampCount = 0;
    this.mines.length = 0;
    this.mineCount = 0;
    this.mineChainBest = 0;
    this.mineSnuffed = 0;
    this.mineMothHits = 0;
    this.vortexes.length = 0;
    this.vortexCount = 0;
    this.vortexBest = 0;
    this.vortexCaught = 0;
    this.vortexPayoff = 0;
    this.pourCount = 0;
    this.pourSpent = 0;
    this.pourCastCost = 0;
    this.pourEmberGained = 0;
    // 没被教过就往开局 14 秒后插一张卡：躲开开局的关卡提示卡，
    // 也别在最乱的那两秒讲新东西
    this.lampTipIn = this.save.tips?.includes('verb:lamp') ? -1 : 14;
    this.novaTipIn = this.save.tips?.includes('verb:nova') ? -1 : 22;
    this.kills = 0;
    this.xp = 0;
    this.xpToNext = 8;
    this.playerLevel = 1;
    this.pendingLevels = 0;
    this.rerollsLeft = 0;
    this.damageDealt = 0;
    this.damageBySource.clear();
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
    this.bossList = [];
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
    this.grazeCount = 0;
    this.blazeEmit = 0;
    this.lastKiller = null;
    this.bounties.reset();
    this.codex.reset();
    this.haptics.reset();
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
    // 移速走 metaMods（由 recomputeStats 套用），这样后面拿到遗物重算也不会把它冲掉
    this.player.metaMods = { moveSpeedMult: 1 + b.moveSpeedMult };
    this.player.recomputeStats();
    this.player.baseLightMult = 1 + b.lightMult;
    this.gold += b.startGold;
    for (let i = 0; i < b.startRelic; i += 1) {
      const pool = RELICS.filter((r) => !this.player.relics.has(r.id));
      if (!pool.length) break;
      const relic = this.rng.pick(pool);
      const tiers = this.player.tribeTiers();
      this.player.addRelic(relic.id);
      this.codex.discover('relic', relic.id);
      this.hud?.toast(`🕯️ 旧灯 · ${relic.name}`);
      this.announceTribeResonance(tiers);
    }
    this.player.hp = this.player.stats.maxHp;
  }

  private loadStage(
    stage: import('../types').StageDef,
    index: number,
    fresh: boolean,
    opts: { seed?: number; rest?: boolean; curse?: boolean } = {},
  ): void {
    // rest 默认跟着 fresh 走（换关歇一口，重开不歇）；无尽换战场时两个都不要
    const rest = opts.rest ?? !fresh;
    this.screenFade = 1;
    this.stageIndex = index;
    this.level = generateLevel(stage, this.startSeed + index * 7919 + (opts.seed ?? 0), this.profile.detailScale);
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
    this.clearEmberwind();
    this.frostTime = 0;
    this.pyresLit = 0;
    this.pyreTotal = this.level.pyres.length;
    this.runPyres += this.pyreTotal;
    this.pyreChannel = null;
    if (fresh) {
      this.player.oil = this.player.oilMax;
    } else if (rest) {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + this.player.stats.maxHp * 0.4);
      this.player.oil = Math.min(this.player.oilMax, this.player.oil + this.player.oilMax * 0.5);
    }
    if (opts.curse ?? true) this.rollCurse(stage, index, fresh);
    this.rollBounty();
    this.titleFor(stage);
    this.noteStageTip(stage);
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

  /** 该悬赏在当前深度是否可行（要打的敌人得真刷得出来、要会的机制得先见过）。 */
  private bountyAvailable(def: BountyDef, depth: number): boolean {
    if (def.minDepth && depth < def.minDepth) return false;
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
    // 玩家在岔口挑好的那条优先；没挑过（测试直接调 loadStage）才现抽
    const chosen = this.pendingCurse;
    this.pendingCurse = null;
    const curse = chosen ?? (forced ? CURSE_MAP[forced] : null) ?? this.rng.pick(pool);
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

  /**
   * 无尽之夜：一轮打完，收拾东西去下一片战场。
   *
   * 只在补给站里发生（这一轮的结算点），所以不会打到一半把场地抽走；
   * 换的是战场本身——主题、布景、险境池、精英池、灯台与祭坛全部重铺，
   * 但**不送血也不送油**（那一口得在补给站里买），难度档位与物价也照旧往上走。
   */
  private advanceEndlessArena(round: number): void {
    const next = round % STAGES.length;
    this.endlessArena = next;
    const stage = STAGES[next];
    // 每片战场进来的次数不同（第 5 轮会再回幽林），种子带上轮次，免得第二次进来一模一样
    this.loadStage(stage, this.stageIndex, false, { seed: round * 104729, rest: false, curse: false });
    this.syncCodex();
  }

  /** 下一片战场（无尽专属）：补给站里先告诉玩家，离开之前就能盘算。 */
  nextArena(): import('../types').StageDef | null {
    if (!this.endless) return null;
    const round = Math.max(1, Math.floor(this.director.wave / 5));
    return STAGES[round % STAGES.length];
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

  /**
   * 离开商店后的岔口：下一关的夜咒由玩家自己挑。
   *
   * 夜咒原本是"随机降临"的——难度确实变了，但玩家只能被动接受。
   * 让它在三条里选一条，风险—回报就真的成了玩家的决定：
   * 是拿「群潮」换 35% 金币，还是赌「深潜」那 45% 但摸黑走完全程。
   * 今日灯芯的夜咒由日期定死（大家的夜晚要是同一个），不参与挑选。
   */
  private openCurseChoice(nextIndex: number): void {
    const forced = this.dailyPlan ? this.dailyPlan.curses[nextIndex] : null;
    if (forced) {
      this.pendingCurse = CURSE_MAP[forced] ?? null;
      this.continueStage();
      return;
    }
    const pool = [...CURSES];
    const offers: CurseDef[] = [];
    for (let i = 0; i < 3 && pool.length; i += 1) {
      const [pick] = pool.splice(Math.floor(this.rng.next() * pool.length), 1);
      offers.push(pick);
    }
    // 按回报从轻到重排，取舍一眼看得出来
    offers.sort((a, b) => a.goldMult - b.goldMult);
    this.curseOffers = offers;
    this.state = 'curse';
    this.audio.setMood('calm');
    this.ui?.showScreen('curse');
  }

  chooseCurse(id: string): void {
    if (this.state !== 'curse') return;
    const chosen = this.curseOffers.find((c) => c.id === id) ?? this.curseOffers[0] ?? null;
    this.curseOffers = [];
    this.pendingCurse = chosen;
    this.audio.play('ui');
    this.continueStage();
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
    // 一次性输入要在这一帧吃干净：暂停 / 升级面板里按下的那次不能攒着，
    // 等回到战场上再"自己"放下一盏灯。
    const lampPressed = this.inputSnapshot.lamp;
    this.inputSnapshot.lamp = false;
    const wickPressed = this.inputSnapshot.dim;
    this.inputSnapshot.dim = false;
    // 拨芯是**状态**而不是这一帧的动作，所以在任何早退（顿帧 / 非战斗状态）之前就先翻掉：
    // 玩家按下去了却"什么都没发生"，是这个游戏一直在避免的那种操作丢失。
    // 反过来，"不在战斗中"这一条也得挡住——暂停 / 升级面板上按下的 C 不该攒着，
    // 等回到战场上"自己"把灯拨小（和上面分灯那条注释是同一个道理）。
    if (wickPressed && this.state === 'playing') this.toggleWick();
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
    this.haptics.update(dt, this.player.stats.maxHp > 0 ? this.player.hp / this.player.stats.maxHp : 1);
    this.bounties.tick(dt);
    this.checkBounty();
    this.codexTimer -= dt;
    if (this.codexTimer <= 0) {
      this.codexTimer = 0.75;
      this.syncCodex();
      this.scanEncounters();
      this.scanWickFamily();
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
    if (this.lampTipIn > 0) {
      this.lampTipIn -= dt;
      if (this.lampTipIn <= 0) {
        this.lampTipIn = -1;
        this.showTip(
          'verb:lamp',
          '分灯 · 把黑暗引开',
          '按 E（手机上点右下角的「分灯」）在原地点一盏小灯：它照亮一小圈，并把附近的黑暗引过去。' +
            '油就是光，所以这是拿自己的亮换几秒喘息；凑上来的怪会把它吃掉。',
        );
      }
    }
    if (this.novaTipIn > 0) {
      this.novaTipIn -= dt;
      if (this.novaTipIn <= 0) {
        this.novaTipIn = -1;
        this.showTip(
          'verb:nova',
          '燃爆 · 灯火旺的时候会「爆灯」',
          '灯火过半时按燃爆（手机上右下角那枚）会「爆灯」：这一发自己烧掉两倍的灯油，' +
            '换一圈更大、更狠、还带灼烧的火。代价是接下来那十几秒你会明显变暗——' +
            '烧掉的是视野，不只是伤害。想稳一点就等它转回冷却，想拼一下就把灯灌满再按。',
        );
      }
    }
    if (lampPressed) this.tryPlantLamp();
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
    this.grazeFromX = this.player.x;
    this.grazeFromY = this.player.y;
    this.player.update(dt, this.inputSnapshot, this.playerCtx());
    // 手动瞄准的那盏灯：手指按下去的时候，灯也往那个方向偏一点。
    // 两个理由，都不是装饰：① 落点标记必须看得见——射程能到 300px，而灯火最暗时视野只有 96px，
    // 不给这一点光，暗处按下手指就是"盲倒"（那正是这件武器最贵的时候）；
    // ② 这件事本来就叫"倾灯"——把灯提起来偏过去，光当然跟着偏。
    // ⚠ 只有手指按着的那几秒有（`pourAim` 里带 `aimManual`），松手就还给自动瞄准。
    const pourAim = this.player.pourAim;
    if (pourAim) {
      const ax = this.player.x + Math.cos(pourAim.angle) * pourAim.away;
      const ay = this.player.y + Math.sin(pourAim.angle) * pourAim.away;
      // 光跟着"还要多久"一起亮起来：圆环快填满时那一带也越来越亮——
      // 这一件响不响看的是油，油快攒够的时候玩家本来就该看得见那片战场
      this.light.addGlow(ax, ay, pourAim.pool * 1.25, 0.22 + 0.3 * pourAim.charge);
    }
    const pcol = collideWalls(this.player.x, this.player.y, this.player.radius, this.level.walls);
    const clamped = clampToArena(pcol.x, pcol.y, this.player.radius, this.level.halfW, this.level.halfH);
    this.player.x = clamped.x;
    this.player.y = clamped.y;

    // 旋灯要在怪把速度积分成位移之前更新：吸力是加在怪自己的速度上的（见 Enemy.behave 里那一步）
    this.updateVortexes(dt);
    // 余烬风排在玩家**之后**：火种粘不粘得上、冲刺有没有把身上那几层抖掉，都得看这一帧
    // 玩家最后站在哪儿、这一帧有没有起一次新的冲刺（排在玩家前面，扑火会慢一整帧）
    this.updateEmberwind(dt);
    this.enemies.update(dt, this.enemyCtx());
    const livingBosses = this.enemies.bosses;
    this.bossList = livingBosses.map((e) => ({ name: ENEMY_MAP[e.defId].name, frac: clamp(e.hp / e.maxHp, 0, 1) }));
    this.bossName = this.bossList.length ? this.bossList[0].name : null;
    this.bossFrac = this.bossList.length ? this.bossList[0].frac : 0;

    this.projectiles.update(dt, (p) => this.nearestEnemy(p.x, p.y, 460), { x: this.player.x, y: this.player.y });
    this.updateBeams(dt);
    this.resolveProjectiles(dt);
    this.resolveGrounds(dt);
    this.resolveGraze(dt);

    this.updateBlazeEmbers(dt);
    this.resolveMines(dt);
    this.updatePyres(dt);
    this.updateLamps(dt);
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
    if (this.endless && this.wave >= 60) this.achievements.unlock('endless60');
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
        // 灯焰被吹走一半，灯就暗一半——"快被吹灭了"应该是看得见的
        const ember = 0.45 + 0.55 * clamp(py.flame, 0, 1);
        const flicker = 1 + Math.sin(this.time * 7.5 + py.x * 0.02) * 0.05;
        this.light.addLight(py.x, py.y, 250 * flicker * ember, 0.82 * ember);
        this.light.addGlow(py.x, py.y, 215 * ember, 0.5 * ember);
        if (this.rng.next() < dt * 3 * ember) this.particles.ember(py.x + this.rng.range(-14, 14), py.y - 30, '#ffc46b');
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
    py.flame = 1;
    this.pyresLit += 1;
    this.pyresLitTotal += 1;
    const p = this.player;
    // 「守夜灯」把每座灯台的余温翻倍：点一座顶两座
    p.pyreMods.damageMult *= 1 + 0.05 * p.flags.pyreBonus;
    p.pyreMods.lightMult *= 1 + 0.06 * p.flags.pyreBonus;
    p.recomputeStats();
    p.oil = Math.min(p.oilMax, p.oil + p.oilMax * 0.14 * p.difficultyOilMult);
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
    this.summonSnuffers(py);
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

  /** 最近的、还亮着的灯台；超出范围就当作"这片没灯"。 */
  private nearestLitPyre(x: number, y: number, maxDist: number): { x: number; y: number } | null {
    let best: Pyre | null = null;
    let bestD = maxDist;
    for (const py of this.level.pyres) {
      if (!py.lit || py.flame <= 0) continue;
      const d = Math.hypot(py.x - x, py.y - y);
      if (d < bestD) {
        bestD = d;
        best = py;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /** 吹灯客的目标：最近的亮灯台，或者最近的弃灯（谁近扑谁）。 */
  private nearestLitOrLamp(x: number, y: number, maxDist: number): { x: number; y: number } | null {
    const pyre = this.nearestLitPyre(x, y, maxDist);
    const lamp = this.nearestLamp(x, y, maxDist);
    if (!lamp) return pyre;
    if (!pyre) return { x: lamp.x, y: lamp.y };
    const dp = Math.hypot(pyre.x - x, pyre.y - y);
    const dl = Math.hypot(lamp.x - x, lamp.y - y);
    return dl < dp ? { x: lamp.x, y: lamp.y } : pyre;
  }

  /** 吹灯客站在灯台边抽灯焰；灯焰归零，这座灯台就重新熄掉。 */
  private quenchPyre(x: number, y: number, dt: number): void {
    // 你放下的那盏小灯更脆：吹灯客贴身就是一口气的事
    for (let i = this.lamps.length - 1; i >= 0; i -= 1) {
      const l = this.lamps[i];
      if ((l.x - x) ** 2 + (l.y - y) ** 2 < 70 * 70) {
        this.lamps.splice(i, 1);
        this.particles.burst(l.x, l.y - 10, 12, '#b6a6ff', { speed: 80, size: 2.2, life: 0.5 });
        return;
      }
    }
    let best: Pyre | null = null;
    let bestD = Infinity;
    for (const py of this.level.pyres) {
      if (!py.lit || py.flame <= 0) continue;
      const d = Math.hypot(py.x - x, py.y - y);
      if (d < bestD) {
        bestD = d;
        best = py;
      }
    }
    if (!best || bestD > 96) return;
    // 「守夜灯」让灯焰更难被吹灭
    best.flame -= dt * 0.42 * this.player.flags.pyreGuard;
    if (best.flame <= 0) {
      best.flame = 0;
      this.extinguishPyre(best);
    }
  }

  /** 熄灭一座灯台：余温按点灯时加过的比例原路收回，位置重新变回"黑着的灯"。 */
  private extinguishPyre(py: Pyre): void {
    py.lit = false;
    py.progress = 0;
    this.pyresLit = Math.max(0, this.pyresLit - 1);
    const p = this.player;
    p.pyreMods.damageMult /= 1 + 0.05 * p.flags.pyreBonus;
    p.pyreMods.lightMult /= 1 + 0.06 * p.flags.pyreBonus;
    p.recomputeStats();
    this.particles.burst(py.x, py.y - 24, 24, '#5f6a8f', { speed: 150, size: 3, life: 0.8 });
    this.camera.addTrauma(0.25);
    this.audio.play('quench');
    this.hud?.toast('💨 一盏灯台被吹灭了');
  }

  /** 点灯会招来吹灯客：你点亮一处，黑暗就派人来吹灭它。 */
  private summonSnuffers(py: Pyre): void {
    const count = this.stageIndex >= 2 || this.endless ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const a = this.rng.angle();
      const d = 430 + this.rng.next() * 200;
      this.spawnWithScaling(
        'snuffer',
        py.x + Math.cos(a) * d,
        py.y + Math.sin(a) * d,
        this.director.bossHpMult * 0.7,
        this.director.bossDmgMult * 0.9,
      );
    }
    // 第一次点灯就会招来它：这是唯一一次"它想干什么"还来得及讲清楚的时机
    const def = ENEMY_MAP.snuffer;
    if (def?.note) this.showTip('quench:snuffer', `敌人 · ${def.name}`, def.note);
    this.hud?.toast('💨 有东西朝灯台去了');
  }

  /** 分灯：扣油、点亮。返回是否真的放下了（测试与手感都看这个返回值）。 */
  tryPlantLamp(): boolean {
    if (this.state !== 'playing') return false;
    if (this.lampCd > 0) return false;
    const p = this.player;
    if (p.oil < LAMP_MIN_OIL) {
      this.hud?.toast('🪫 灯油不够分灯（要两成）');
      return false;
    }
    p.oil = Math.max(0, p.oil - LAMP_COST);
    this.lamps.push({ x: p.x, y: p.y, life: LAMP_LIFE, maxLife: LAMP_LIFE });
    this.lampCd = LAMP_COOLDOWN;
    this.lampCdMax = LAMP_COOLDOWN;
    this.lampCount += 1;
    this.audio.play('lamp');
    this.particles.burst(p.x, p.y - 6, 14, '#ffca7a', { speed: 120, size: 2.6, life: 0.6 });
    this.hud?.toast('🕯️ 分灯 · 黑暗会朝它去');
    return true;
  }

  /**
   * 地上的弃灯：寿命到了就熄；有怪凑近会被"吃掉"（提前熄）。
   * 人越多灯灭得越快——一群人扑上来时它只能顶一两秒，
   * 所以它是"买几秒空间"，不是"清场"。
   */
  private updateLamps(dt: number): void {
    if (this.lampCd > 0) this.lampCd = Math.max(0, this.lampCd - dt);
    if (!this.lamps.length) return;
    for (let i = this.lamps.length - 1; i >= 0; i -= 1) {
      const l = this.lamps[i];
      l.life -= dt;
      let snuffed = false;
      this.enemies.forEach((e) => {
        if (snuffed) return;
        const dx = e.x - l.x;
        const dy = e.y - l.y;
        if (dx * dx + dy * dy <= LAMP_SNUFF_R * LAMP_SNUFF_R) snuffed = true;
      });
      if (snuffed && l.life > 0.35) {
        l.life = 0.35;
        this.particles.burst(l.x, l.y - 10, 12, '#b6a6ff', { speed: 90, size: 2.4, life: 0.5 });
      }
      if (this.rng.next() < dt * 4) this.particles.ember(l.x + this.rng.range(-6, 6), l.y - 16, '#ffc46b');
      if (l.life > 0) continue;
      this.lamps.splice(i, 1);
      this.particles.burst(l.x, l.y - 8, 10, '#8b7f6a', { speed: 70, size: 2, life: 0.5 });
    }
  }

  /** 最近的弃灯（黑暗被它引走时用）。没有就返回 null。 */
  nearestLamp(x: number, y: number, maxDist = LAMP_LURE): DroppedLamp | null {
    let best: DroppedLamp | null = null;
    let bestD = maxDist * maxDist;
    for (const l of this.lamps) {
      const d = (l.x - x) ** 2 + (l.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** 分灯的冷却比例（0 = 可以按，1 = 刚放完）——触屏那枚按钮画圈就靠它。 */
  get lampCdFrac(): number {
    if (this.lampCdMax <= 0) return 0;
    return clamp(this.lampCd / this.lampCdMax, 0, 1);
  }

  /** 现在能不能分灯（冷却好了、油够、在打）。 */
  get lampReady(): boolean {
    return this.state === 'playing' && this.lampCd <= 0 && this.player.oil >= LAMP_MIN_OIL;
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
        const tiers = p.tribeTiers();
        if (pool.length) p.addRelic(this.rng.pick(pool).id);
        this.announceTribeResonance(tiers);
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
    return STAGES[this.endless ? this.endlessArena : this.stageIndex];
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
      // 「燎灯」的一次脉冲真的烫到了东西：第一次就把它记进图鉴「机制」那一章，
      // 顺手判一下「照单全收」（一次同时烤到 8 只）。空转（什么都没烫到）不报——
      // 图鉴与成就都该是"用出来了"，不是"带在身上"。
      onAura: (hits) => {
        this.codex.discover('mechanic', 'aura');
        if (hits >= AURA.crowd) this.achievements.unlock('aura_crowd');
        // 「吮灯」（遗物）：烫到就回油，一次脉冲封顶（见 AURA.siphonMax）。
        // 它只在**真的烫到东西**时结账——空转的那一下不补，不然"对着空气也能回油"就没有代价了。
        const siphon = this.player.flags.auraSiphon;
        if (siphon > 0) {
          const p = this.player;
          p.oil = Math.min(p.oilMax, p.oil + p.oilMax * Math.min(AURA.siphonMax, siphon * hits));
        }
      },
      mine: (x, y, damage, radius, trigger, fire, source) =>
        this.placeMine(x, y, damage, radius, trigger, fire, source),
      vortex: (x, y, damage, radius, burn, drag, source) =>
        this.placeVortex(x, y, damage, radius, burn, drag, source),
      pour: (cost) => {
        this.pourCount += 1;
        this.pourSpent += cost;
        // 新的一瓢：代价写下来，「拾油」的账从头开始（"一瓢最多收回代价的几成"是它的规矩）
        this.pourCastCost = cost;
        this.pourEmberGained = 0;
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
      // 灼烧每帧扣的那一点也要进账（见 Enemy.burnSource）：不然"倾灯"这种
      // 全靠地上那片火续灼烧的武器，在「本局伤害构成」里会显示成几乎没打伤害。
      onBurn: (amount, source) => this.creditDamage(source, amount),
      snuffLight: (amount) => {
        this.player.oil = Math.max(0, this.player.oil - amount);
        this.darknessBoost = Math.min(0.5, this.darknessBoost + amount * 1.5);
      },
      spawnAdd: (defId, x, y) => this.enemies.spawn(defId, x, y, this.director.bossHpMult * 0.6, this.director.bossDmgMult),
      ignitGround: (x, y) => this.addGround(x, y, 60, 4, 10),
      fog: (x, y, r) => this.addGround(x, y, r, 8, 0, 'mud'),
      // 吹灯客的目标：最近的亮灯台，或者你刚放下的那盏弃灯（谁近扑谁）
      pyreTarget: (x, y) => this.nearestLitOrLamp(x, y, 1600),
      lureTarget: (x, y) => this.nearestLamp(x, y),
      // 灯蛾扑的是**光**：地上的伏灯也算（只有上弦之后的那颗才算"亮着"）。
      // ⚠ 「香饵」（遗物）改的就是这个距离，而**只有这里**能改：Enemy 那边原来抄了一份
      //   同样的 380（`MINE_LURE`），v77 删掉了——两处真话只要有一处没跟上，就会出现
      //   "店里写着引得更远、实际一只蛾都没多引来"这种谁都看不出来的错。
      mineLure: (x, y) => this.nearestArmedMine(x, y, MINE.lure * (1 + this.player.flags.mineLure)),
      pull: (e) => this.applyVortexPull(e),
      quench: (x, y, dt) => this.quenchPyre(x, y, dt),
      regen: this.curse?.mods.enemyRegen ?? 0,
      // 「循灯」窗口由 Director 判定（见 data/hunt.ts）：一整波打完了、只剩最后几只的时候，
      // 还没到场的那几只直奔玩家，玩家不用回头把它们一个个捡回来
      hunt: this.director.hunting,
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
      spawnPoint: (speed?: number) => this.randomSpawnPoint(speed),
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
      // 收尾窗口刚打开：给一句话，玩家才知道那几只为什么突然快起来了。
      // 只讲一次（Director 管着），不然这一波剩下的几秒里会一直刷。
      onHunt: () => {
        this.floaters.label(this.player.x, this.player.y - 46, '余党循灯而来', '#ffb15e', 14);
        this.audio.play('ui');
        // 第一次看见就记进图鉴「机制」那一章：那几只为什么突然快起来，该有个地方读到
        this.codex.discover('mechanic', 'hunt');
      },
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

  /**
   * 刷怪点。`speed` 是这只怪的脚力——传了就按「赴灯」（`data/arrival.ts`）算：
   * **距离 = 到场时间 × 脚力**，走得慢的从近处出发，让它们一起到场。
   * 不传（精英 / 首领）就还是老规矩：620~940px 的那个环，让它们自己走进来——
   * 那两种的登场是**给玩家看的**（有预告、有大字），刷近了反而像凭空冒出来。
   */
  private randomSpawnPoint(speed?: number): { x: number; y: number } {
    // 近边界是"灯火的当前半径 + margin"而不是一个死数（见 data/arrival.ts）：
    // 灯火越亮、环越往外让，"看得见就不许刷"才是恒等式。
    const near = Math.max(ARRIVAL.min, this.player.lightRadius + ARRIVAL.margin);
    const base = speed ? clamp(ARRIVAL.target * speed, near, ARRIVAL.max) : 620 + this.rng.next() * 320;
    // 抖动与 620~940 那条老环一样的比例（±8%）：全都落在同一个半径上会显得像一圈"弹出来的"
    const jitter = speed ? base * ARRIVAL.jitter : 0;
    for (let i = 0; i < 30; i += 1) {
      const a = this.rng.angle();
      // 抖动收在 [near, max] 里：抖动往外没问题，往里抖到近边界以内就等于把"看得见就不许刷"破了
      const dist = speed ? clamp(base + (this.rng.next() * 2 - 1) * jitter, near, ARRIVAL.max) : base;
      const x = clamp(this.player.x + Math.cos(a) * dist, -this.level.halfW + 40, this.level.halfW - 40);
      const y = clamp(this.player.y + Math.sin(a) * dist, -this.level.halfH + 40, this.level.halfH - 40);
      if (!pointInWalls(x, y, this.level.walls, 26)) return { x, y };
    }
    return { x: this.player.x + base, y: this.player.y };
  }

  /** 连锁闪电：从起点逐个跳向最近的敌人，并记录一道电弧特效。 */
  private chainZap(x: number, y: number, damage: number, jumps: number, range: number, color: string, opts: { burn?: number; slow?: number; source?: string }): void {
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
    opts: { burn?: number; slow?: number; knockback?: number; source?: string } = {},
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
        source: opts.source,
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

  applyHit(
    e: Enemy,
    damage: number,
    crit: boolean,
    kx: number,
    ky: number,
    knockback: number,
    opts: { burn?: number; slow?: number; slowPower?: number; source?: string } = {},
  ): boolean {
    if (!this.enemies.isVulnerable(e, this.lightCtx())) return false;
    // ⚠ 来源要在咒盾清空 opts **之前**抄下来：`opts = {}` 那一句是为了"元素免疫连灼烧一起免掉"，
    //   可它是整份 opts 换掉——先读出来，账才不会因为对手有个词缀就整笔记到 `other` 去。
    const source = opts.source;
    // 咒盾：元素免疫 + 额外减伤，逼玩家在「堆元素」和「堆物理」之间做选择
    const warded = e.affix === 'warded';
    if (warded) opts = {};
    const reduced = damage * (1 - e.dr) * (warded ? 0.75 : 1);
    const killed = this.enemies.damage(e, reduced, this.lightCtx(), kx, ky, knockback);
    this.creditDamage(source, reduced);
    if (reduced > this.maxHit) this.maxHit = reduced;
    this.floaters.damage(e.x, e.y - e.radius - 6, reduced, crit);
    // 「暗火」：拨着芯时每次命中都为敌人添一层灼烧。
    // 为什么要挂在这一层（而不是某一件武器里）：拨芯拨的是**这盏灯**，它该跟着"你打出去的每一下"，
    // 而不是某一根枪管；而且灼烧那条账本来就在这一层（`opts.burn`）——同一句话写在一个地方，
    // 结算里的「伤害构成」才不用为它单开一栏（谁打的那一下，这口火就算谁的）。
    // 咒盾（`warded`）照旧免掉：那条规矩是"元素免疫连灼烧一起免"——暗火点的也是火，
    // 它得走同一条规矩，而不是从旁边绕过去。
    const ember = this.player.dimmed && !warded ? this.player.flags.wickEmber : 0;
    const burn = (opts.burn ?? 0) + ember;
    if (burn > 0) this.enemies.applyBurn(e, burn, source ?? null);
    // 减速的合并规矩（谁更狠听谁的）只有一份，在 `applySlow` 里——燎灯那一拍也走它。
    if (opts.slow && opts.slow > 0 && e.active) applySlow(e, opts.slow, opts.slowPower ?? 0.5);
    if (this.player.flags.lifesteal > 0) {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + reduced * this.player.flags.lifesteal);
    }
    this.particles.burst(e.x, e.y, crit ? 5 : 2, crit ? '#fff0a8' : '#ffb14e', { speed: 120, size: 2.5, life: 0.3 });
    if (killed) this.hitStop = Math.max(this.hitStop, 0.035);
    else this.audio.play('hit');
    return killed;
  }

  /**
   * 记一笔伤害：**总额与"谁打的"同时往上走**。
   *
   * 两者写在同一个函数里是有意的：分头去加迟早会有一条路只加了其中一边，
   * 而那种错在界面上完全看不出来（少记的那笔谁也发现不了）。
   * 现在只要所有伤害都从这里过，"各桶加起来 = 造成伤害"就是恒等式。
   *
   * `source` 缺省时归到 `other`——宁可有一个"其他"，也不要把说不清的那部分漏掉。
   */
  private creditDamage(source: string | null | undefined, amount: number): void {
    if (!(amount > 0)) return;
    this.damageDealt += amount;
    const key = source || 'other';
    this.damageBySource.set(key, (this.damageBySource.get(key) ?? 0) + amount);
  }

  /**
   * 把账本整理成能给界面用的行：按伤害从多到少排，带上名字与占比。
   *
   * 名字从两处现取：武器走 `WEAPON_MAP`（改武器名，这里不会漂），
   * 其余几个固定 id 走 `SOURCE_LABEL`（和"被谁扑灭"共用一张表）。认不出来的 id 就直接把 id 当名字——
   * "显示一个说不清名字的东西"也比"少一行、总数对不上"强。
   */
  damageBreakdown(): { id: string; name: string; color: string; amount: number; frac: number }[] {
    const total = this.damageDealt || 1;
    return [...this.damageBySource.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, amount]) => {
        const w = WEAPON_MAP[id];
        const label = SOURCE_LABEL[id];
        return {
          id,
          name: w?.name ?? label?.name ?? id,
          color: w?.color ?? label?.color ?? '#8fa7ff',
          amount,
          frac: amount / total,
        };
      })
      .sort((a, b) => b.amount - a.amount);
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
    // 「影缝」：焰烧着的时候更难被打灭——贴着脸打总归要挨几下，这是那几下里的折扣。
    // 只在烧着的时候生效：它不是一件无条件的护甲，而是"贴着打"这套牌的兜底。
    // 「炭衣」同理，但它那几秒是"你自己点出来的"：爆出去的火挡在身前（ashGuard 是 1 或减伤后的倍率）。
    // 「遮光」：拨着芯时更难被打中——最危险的那一段（贴上去打）正好也是你最小的时候。
    // 「烬护」：倒完那一瓢之后你的灯正好最暗（代价就写在那儿），所以这一件买的是
    // **站在自己倒的火里**时的那层掩护——它是一个位置换来的，不是白给的一层甲。
    const guard =
      (this.player.blazing ? 1 - this.player.flags.blazeGuard : 1) *
      this.player.ashGuard *
      (this.player.dimmed ? 1 - this.player.flags.wickGuard : 1) *
      (this.player.inOilFire ? 1 - this.player.flags.pourShelter : 1);
    const scaled = amount * DIFFICULTIES[this.difficulty].dmgMult * guard;
    const applied = this.player.takeDamage(scaled, x, y, drain);
    if (!applied) return;
    // 记下这一下是谁打的：死亡结算里"被谁扑灭"比一串数字有用得多
    const killer = SOURCE_LABEL[source ?? ''] ?? (source ? ENEMY_MAP[source] : undefined);
    if (killer) this.lastKiller = { name: killer.name, color: killer.color ?? '#ff6b81' };
    this.damageTaken += scaled;
    this.bounties.onPlayerHit();
    this.hitStop = Math.max(this.hitStop, 0.05);
    this.haptics.hurt();
    this.audio.play('hurt');
    this.camera.addTrauma(0.35, this.settings.data.shake * this.settings.motionScale);
    this.postfx.triggerGlitch(0.5);
    this.particles.burst(this.player.x, this.player.y, 8, '#ff6b6b', { speed: 140, size: 3 });
    this.events.emit('playerHit', { amount: scaled });
    if (this.player.hp <= 0) this.handleDeath();
  }

  private onEnemyDeath(e: Enemy): void {
    // 「拾油」（遗物）：**死在你倒出来的那片油火里**的怪，把那口油还给你一点。
    // 判据是"死的时候身上还带着你倒的那层火"（`burnTimer > 0`，来源认 `kind: 'pour'`）。
    // ⚠ 来源是从武器表里**认**出来的（`WEAPON_MAP[...].kind`），不是手抄的 id 清单——
    //   写两个字面量的话，以后再加一件"倒油"的武器，这一件就会对它静默失效。
    // 单只回油很少（0.5%），真正有力量的是"往人堆里倒"：所以封顶是**按瓢**的
    // （一瓢最多收回它代价的六成，见 POUR.emberCap），不然一片 30 只的怪群就是一口油井。
    const ember = this.player.flags.pourEmber;
    const burnSource = e.burnSource;
    if (ember > 0 && e.burnTimer > 0 && burnSource && WEAPON_MAP[burnSource]?.kind === 'pour') {
      const p = this.player;
      const cap = p.oilMax * POUR.emberCap * this.pourCastCost;
      const gain = Math.max(0, Math.min(p.oilMax * ember, cap - this.pourEmberGained));
      if (gain > 0) {
        this.pourEmberGained += gain;
        p.oil = Math.min(p.oilMax, p.oil + gain);
        this.floaters.label(e.x, e.y - e.radius - 10, `+${(gain * 100).toFixed(1)}% 油`, '#ffd24e', 12);
      }
    }
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
    // 焰是自己擦出来的，让它烧下去的是击杀（见 data/graze.ts 的 blazeExtend）：
    // 焰一烧着，"停下来"就变成了有代价的事——这正是这一版想塞进那六秒里的张力。
    if (this.player.blazing && this.player.extendBlaze(GRAZE.blazeExtend)) {
      this.particles.ember(e.x, e.y, '#ffd9a0');
    }
    if (e.boss && this.player.blazing) this.achievements.unlock('blaze_boss');
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
    this.loot.dropFromEnemy(e, this.player.stats.oilGainMult * this.player.difficultyOilMult, this.rng, gold);
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
      if (this.endless && this.director.bossPair && this.enemies.bosses.filter((b) => b !== e).length === 0) {
        this.achievements.unlock('twin_boss');
        // 三位同台的一轮清场：比双首领再往上记一笔
        if (this.director.bossCount >= 3) this.achievements.unlock('trio_boss');
      }
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

  /**
   * 「拨芯」这条线（遮光 / 暗火 / 夜步 / 守芯）：四件只在**拨着芯**的时候生效，
   * 所以第一次拿到它们、而玩家**还没按过 C** 的时候，这件事值得讲一次——
   * 不讲的话，抽到的那件在他手里就是一张废牌（README 的「已知取舍」写着这个代价）。
   *
   * 量在"有没有这件遗物"而不是"在哪儿拿到的"：遗物的入口有五处（精英掉落、商店、祭坛、熔铸、旧灯），
   * 逐处去挂等于把同一句话抄五遍，将来漏一处也没人看得出来。这里每 0.75 秒扫一遍遗物表
   * （和 `scanEncounters` 同一个节拍、同一处调用），拿没拿到由名单自己说。
   * 反过来，"已经按过 C 的人"不用再听这一句——他早就知道按一下会发生什么。
   */
  private scanWickFamily(): void {
    if (this.wickHintDone) return;
    if (this.codex.has('mechanic', 'wick')) {
      this.wickHintDone = true;
      return;
    }
    if (!WICK_FAMILY_IDS.some((id) => this.player.relics.has(id))) return;
    this.wickHintDone = true;
    this.showTip(
      'relic:wick-family',
      '拨芯 · 这件要你先按 C',
      '遮光 / 暗火 / 夜步 / 守芯这四件只在把灯芯拨小的时候生效：按 C（手机点右下角的「拨芯」）' +
        '把火压住——看得近一半、打得轻三成五，换来的是一桶油多烧近两倍；再按一下拨回来。',
    );
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
    this.haptics.levelUp();
    this.audio.play('levelup');
    this.ui?.setOffers(this.currentOffers, this.rerollsLeft);
    this.ui?.showScreen('levelup');
  }

  chooseUpgrade(offer: UpgradeOffer): void {
    this.upgrades.apply(this.player, offer);
    this.maybeTipUpgrade(offer);
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
    // 只在升级面板里才算数：热键是从主循环喂进来的，而 R 在战场上没有别的意思，
    // 不挡的话"战斗中随手按一下 R"会白白吃掉一次重掷（还会把三张卡悄悄换掉）。
    if (this.state !== 'levelup') return;
    if (this.rerollsLeft <= 0) return;
    this.rerollsLeft -= 1;
    this.currentOffers = this.upgrades.generate(this.player, 3, this.rng);
    this.ui?.setOffers(this.currentOffers, this.rerollsLeft);
    // ⚠ 换了牌就得重画。面板是按 `offers` 渲染的一张静态 DOM，而重掷是**唯一**一次
    //   "面板还开着的时候换了牌"——只更新数据不重画，屏幕上留下的是上一把牌。
    //   那不是"看着旧、点下去还是对的"：卡片点下去时按**屏幕上那个 id**去 `offers` 里找，
    //   找不到就 `return`（什么都不做）。于是整块面板看起来好好的，三张卡却可能一张都点不动，
    //   重掷按钮上写的还是旧数字——只能刷页面。真实浏览器里量到过（重掷一次就撞上，
    //   见 `tools/playtest.mjs` 里"重掷之后面板上的牌就是手里的牌"那几条）。
    this.ui?.showScreen('levelup');
    this.audio.play('ui');
  }

  /**
   * 面板热键的总入口：主循环每帧把这一帧按下的键喂进来，规则全在这儿。
   *
   * 为什么不是主循环自己 `switch (state)`：那样"哪块面板认哪几个键"就只活在 main.ts 里，
   * 而 main.ts 没有任何测试能碰到（软件测试跑的是主循环之外的那条路）——这条规则会长歪。
   * 摊到这儿之后，无头测试可以直接调它，主循环只负责把键盘读出来交过去。
   *
   * `confirm`（回车）不在这里：它按下去是**换一块面板**，那件事归界面自己交代
   * （`UIManager.panelPrimary`），不属于"这一局的状态"。
   */
  panelHotkeys(pick: number, reroll: boolean): void {
    if (pick) {
      if (this.state === 'levelup') this.pickOffer(pick - 1);
      else if (this.state === 'shrine') this.pickShrine(pick - 1);
      else if (this.state === 'shop') this.pickShopItem(pick - 1);
    }
    if (reroll) {
      if (this.state === 'levelup') this.reroll();
      else if (this.state === 'shop') this.rerollShop();
    }
  }

  /**
   * 面板热键：直接走**第几张**（0 起）。
   *
   * 三个入口（升级卡 / 祭坛供物 / 商店商品）长得一样，是因为它们回答的是同一个问题：
   * "这块面板上的第 n 个按钮是哪个"。做成三个方法而不是一个通用的"点第 n 个"，
   * 是因为它们按下去之后走的路完全不同——一张卡改数值、一件供物换代价、一件商品花钱——
   * 而每一条路都已经有一个名字了（`chooseUpgrade` / `chooseShrine` / `buyShop`），
   * 这里只是把"第几张"翻译成那个名字，不复制任何规则。
   *
   * 返回真假：没选成（不在那块面板上 / 那个位置没有东西）就是假——测试要能分辨
   * "热键按了但没用"和"热键根本没走到这"。
   */
  pickOffer(index: number): boolean {
    if (this.state !== 'levelup') return false;
    const offer = this.currentOffers[index];
    if (!offer) return false;
    this.chooseUpgrade(offer);
    return true;
  }

  pickShrine(index: number): boolean {
    if (this.state !== 'shrine') return false;
    const offer = this.shrineOffers[index];
    if (!offer) return false;
    this.chooseShrine(offer.id);
    return true;
  }

  pickShopItem(index: number): boolean {
    if (this.state !== 'shop') return false;
    if (!this.shopItems[index]) return false;
    return this.buyShop(index);
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
            this.applyHit(e, dmg, crit, p.vx, p.vy, p.knockback, { burn: p.burn, slow: p.slow, source: p.weaponId });
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
          // 那 0.32 秒的无敌帧里从子弹**正中**穿过去：不挨打，但算一次「掠过」（双倍热度）。
          // 不这么写的话，冲刺穿弹幕反而拿不到掠影——子弹正中心撞上就被这一句吃掉了，
          // 而"从危险正中穿过去"恰恰是这一版最想奖赏的那一下。
          if (this.player.dashTimer > 0) {
            const fresh = !p.grazed;
            p.grazed = true;
            this.grazeDash(p.x, p.y, fresh);
          } else this.damagePlayer(p.damage, p.x, p.y, 0, p.ownerId || undefined);
          this.particles.burst(p.x, p.y, 4, '#c9a3ff', { speed: 100 });
          p.active = false;
        }
      }
    }
  }

  private explode(p: Projectile): void {
    const spread = 1 + (this.player.stats.areaMult - 1) * 0.5;
    const radius = p.explode * spread;
    this.blast(p.x, p.y, radius, p.damage, {
      knockback: p.knockback,
      burn: p.burn,
      slow: p.slow,
      source: p.weaponId,
      spark: '#ff9d2e',
      sparkCount: 18,
    });
    // 「倾灯」落地：炸完之后在地上留一片**自己烧的火**（别的武器没有这一项，`poolRadius` 是 0）
    if (p.poolRadius > 0) this.pourPool(p.x, p.y, p.poolRadius * spread, p.poolLife, p.weaponId);
  }

  /**
   * 倒出去的那一瓢落在地上：留一片油火，并顺手看看这一瓢够不够「火上浇油」。
   *
   * 「火上浇油」的判据刻意是"**已经**有几只正站在你的火里"——先数、再放这片新火
   * （顺序反过来，新火自己就会把它们算进去，那这条成就就变成"随便往人堆里倒"了）。
   * 而且要求那只怪脚下那片火是**自己的**（`ignites`）：连珠伏灯留下的那层火不算，
   * 那层火本来就在烧玩家，不是倒出来的油。
   */
  private pourPool(x: number, y: number, r: number, life: number, source: string): void {
    let doused = 0;
    this.enemies.forEach((e) => {
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > r * r) return;
      for (const g of this.grounds) {
        if (!g.ignites) continue;
        if ((e.x - g.x) ** 2 + (e.y - g.y) ** 2 <= g.r * g.r) {
          doused += 1;
          return;
        }
      }
    });
    this.addGround(x, y, r, life, 0, 'fire', true, source);
    // 第一瓢落地就把图鉴「机制」那一章的条目记上（和伏灯 / 旋灯一样：条目里的数是现取的）
    this.codex.discover('mechanic', 'pour');
    if (doused >= POUR.douse) this.achievements.unlock('pour_douse');
    this.audio.play('pour_splash');
  }

  /**
   * 一圈爆炸，火球的落地爆炸与「伏灯」都是它。
   *
   * 抽出来是因为它们是同一件事——"以某点为心，按距离衰减打一圈"；
   * 分开写迟早会有一边被忘掉（比如后来给火球加了击退、忘了给伏灯加）。
   * 返回值是**炸到了几只**：伏灯的成就与音效层次要看这个数。
   */
  private blast(
    x: number,
    y: number,
    radius: number,
    damage: number,
    opts: {
      knockback?: number;
      burn?: number;
      /** 减速持续几秒（0 = 不减速）。强度是下面那个 `slowPower` */
      slow?: number;
      /** 减速的强度：0.5 = 移速砍一半（默认 0.5，和 `applySlow` 那条合并规矩同一个写法） */
      slowPower?: number;
      ring?: string;
      spark?: string;
      sparkCount?: number;
      /** 地上那道焦痕的颜色。默认是暖色的"烧焦"（火球、伏灯那种），冷色的武器可以自己换。 */
      decal?: string;
      /** 这一炸是谁放的（武器 id）：一圈炸到的每一只都记在那个来源头上 */
      source?: string;
    } = {},
  ): number {
    const ring = opts.ring ?? '#ff7a2f';
    this.particles.shockwave(x, y, ring, radius, 0.45);
    this.particles.burst(x, y, opts.sparkCount ?? 14, opts.spark ?? '#ff9d2e', { speed: 240, size: 4, life: 0.6 });
    this.camera.addTrauma(0.2, this.settings.data.shake * this.settings.motionScale);
    this.addDecal(x, y, radius * 0.8, opts.decal ?? 'rgba(20,8,4,0.55)', 6);
    let hits = 0;
    this.enemies.forEach((e) => {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius + e.radius) return;
      // 边缘只吃四成：站在爆炸圈最外沿不该和正中一样疼
      const falloff = 1 - clamp((d / radius) * 0.5, 0, 0.6);
      this.applyHit(e, damage * falloff, false, e.x - x, e.y - y, opts.knockback ?? 0, {
        burn: opts.burn,
        slow: opts.slow,
        slowPower: opts.slowPower,
        source: opts.source,
      });
      hits += 1;
    });
    return hits;
  }

  /**
   * 布一颗「伏灯」。
   *
   * 落点由玩家决定（武器在玩家身后 22px 处撒下来），这里只管放上去：
   * 上弦半秒、亮一盏小灯（黑暗里得看得见它，而且它本来就是一盏灯）、
   * 上弦期间踩不响——那是玩家刚转身离开的那半秒。
   */
  placeMine(x: number, y: number, damage: number, radius: number, trigger: number, fire: number, source: string): void {
    // 地上最多留六颗：不给上限的话，一路小跑就能铺出一条雷带（见 data/mines.ts）。
    // 「灯阵」（遗物）把它抬到 8 颗——**抬的是上限，不是取消上限**：这条规矩要拦的是
    // "一路小跑铺出一条雷带"，多两颗只是让"铺一条路"这件事做得成，不是让它变成唯一解。
    if (this.mines.length >= MINE.max + this.player.flags.mineMax) this.mines.shift();
    this.mines.push({
      x,
      y,
      life: MINE.life + this.player.flags.mineLife,
      arm: MINE.arm,
      damage,
      radius,
      trigger,
      fire,
      phase: this.rng.next() * 6.283,
      fuse: 0,
      fuseX: x,
      fuseY: y,
      link: 0,
      source,
    });
    this.mineCount += 1;
    // 第一次布下伏灯就把「机制」那一章的条目记上（图鉴里的数是现取的，改调参会自己跟上）
    this.codex.discover('mechanic', 'mine');
    this.particles.burst(x, y, 5, '#ffca7a', { speed: 90, size: 2.4, life: 0.4 });
    this.audio.play('ui');
  }

  /**
   * 伏灯：上弦、亮着、等人踩；踩到就炸，放着不管就自己烧尽。
   * 自己烧尽**不炸**——不然"跑过去把雷耗掉"就成了一种清场手段。
   */
  private resolveMines(dt: number): void {
    if (!this.mines.length) return;
    // 这一帧有没有谁被踩响。一帧只响一颗，而且响的是**离怪最近的那一颗**：
    // 雷撒得密的时候（落点间距中位数只有 16px，见 README 的台架记录），
    // 一只怪常常同时站在两三颗雷的触发圈里——按数组顺序随便挑一颗的话，
    // 爆炸中心会飘到怪脚边之外，而且被点着的邻居会从两个方向同时烧（一格串被拆成两半）。
    // 挑最近的那颗，爆炸就正好在它脚下，一串灯也只从脚下往外烧。
    //
    // ⚠ 记的是**那颗雷本身**，不是它的下标：这个循环往回遍历、而且一路上会 splice
    //   （烧尽的、引信烧完的）。等循环走完再 `this.mines[下标]`，中间只要有一颗更靠前的雷
    //   离场，数组整体前移一格，取到的就是别人（数组短了就是 undefined —— 台架上撞到的
    //   那次崩溃：`Cannot read properties of undefined (reading 'radius')`）。
    let stepped: Mine | null = null;
    let steppedDist = Infinity;
    for (let i = this.mines.length - 1; i >= 0; i -= 1) {
      const m = this.mines[i];
      m.life -= dt;
      // 雷本来就是一盏灯：它照亮脚边一小圈（既是"它在哪"的答案，也让它能被看见）
      this.light.addLight(m.x, m.y, MINE.lightRadius, MINE.lightIntensity);
      this.light.addGlow(m.x, m.y, MINE.glow, 0.15);
      if (m.life <= 0) {
        this.mines.splice(i, 1);
        this.particles.burst(m.x, m.y, 6, '#8b7f6a', { speed: 60, size: 2, life: 0.5 });
        continue;
      }
      // 引信点着了：这颗已经"有主"了，不再等踩踏，只等引信烧到脚边
      if (m.fuse > 0) {
        m.fuse -= dt;
        if (m.fuse <= 0) this.detonateMine(m, i);
        continue;
      }
      if (m.arm > 0) {
        m.arm -= dt;
        continue;
      }
      let near = Infinity;
      this.enemies.forEach((e) => {
        const rr = m.trigger + e.radius;
        const d = (e.x - m.x) ** 2 + (e.y - m.y) ** 2;
        if (d <= rr * rr && d < near) near = d;
      });
      if (near < steppedDist) {
        stepped = m;
        steppedDist = near;
      }
    }
    if (!stepped) return;
    // 走进你的触发圈的**如果是吹灯客**，那颗雷不炸——被它吹灭了。
    // 它本来就是"专扑灯"的那种怪，而伏灯是一盏灯：这一条不靠着再给一个范围常数，
    // 而是把"你的触发圈"直接反过来用（它扑得进来，就吹得灭）。
    // 于是它成了伏灯唯一的天敌：埋在地上的一整条路，它一边走一边给你掐灭——
    // 想用雷，就先把吹灯客点掉。
    // 取回它此刻真正的下标（这一帧里可能有别的雷先离场）
    const idx = this.mines.indexOf(stepped);
    if (idx < 0) return;
    if (this.snufferInRange(stepped)) this.snuffMine(idx);
    else this.detonateMine(stepped, idx);
  }

  /** 这颗雷的触发圈里有没有吹灯客（有的话它不是"被踩响"，而是"被吹灭"）。 */
  private snufferInRange(m: Mine): boolean {
    let hit = false;
    this.enemies.forEach((e) => {
      if (e.defId !== 'snuffer') return;
      const reach = m.trigger + e.radius;
      if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= reach * reach) hit = true;
    });
    return hit;
  }

  /** 吹灯客一口气吹灭脚边那颗雷：不炸、不留火，只留一小撮紫烟。 */
  private snuffMine(index: number): void {
    const m = this.mines[index];
    this.mines.splice(index, 1);
    this.mineSnuffed += 1;
    this.particles.burst(m.x, m.y - 8, 10, '#b6a6ff', { speed: 70, size: 2.2, life: 0.5 });
    this.audio.play('quench');
  }

  /**
   * 转起一盏「旋灯」。
   *
   * 落点由玩家给（Player 只知道"我朝哪儿"，锁的是最近那只怪），
   * 剩下的都在这里：吸力、卷弹幕、收缩那一下。
   */
  placeVortex(x: number, y: number, damage: number, radius: number, burn: number, drag: number, source: string): void {
    this.vortexes.push({
      x,
      y,
      life: VORTEX.life,
      maxLife: VORTEX.life,
      radius,
      damage,
      burn,
      drag,
      phase: this.rng.next() * 6.283,
      source,
    });
    this.vortexCount += 1;
    this.codex.discover('mechanic', 'vortex');
    this.particles.burst(x, y, 10, '#8fb8ff', { speed: 120, size: 3, life: 0.5 });
    this.audio.play('ui');
  }

  /**
   * 每一盏旋灯：读秒、照亮、数它拽住了几只、卷弹幕，最后缩成一下炸。
   *
   * 这里不直接掰怪的位置：挪动是留给 `applyVortexPull`（挂在怪自己积分那一步）的，
   * 否则"吸力"就变成"瞬移"，跑得快跑得慢也就没差别了。
   */
  private updateVortexes(dt: number): void {
    if (!this.vortexes.length) return;
    for (let i = this.vortexes.length - 1; i >= 0; i -= 1) {
      const v = this.vortexes[i];
      v.life -= dt;
      v.phase += dt * VORTEX.spin;
      this.light.addLight(v.x, v.y, VORTEX.lightRadius, VORTEX.lightIntensity);
      this.light.addGlow(v.x, v.y, v.radius * 0.55, 0.2);
      // 同时拽住几只：首领不算（它站在那儿不是被卷进来的）
      const held = this.countHeld(v.x, v.y, v.radius);
      if (held > 0) {
        this.vortexBest = Math.max(this.vortexBest, held);
        if (held >= VORTEX.crowd) this.achievements.unlock('vortex_crowd');
      }
      // 进化的那一把：弹幕被卷进来，卷到中心就吞掉（这是它"替你挡一片"的题眼）
      if (v.drag > 0) this.dragEnemyShots(v, dt);
      if (v.life > 0) continue;
      // 收尾：缩成一下炸。**没有击退**——它的用处是把人拢在一块儿，最后把人推开就白拢了。
      // 伤害随"这一下真的打到几只"涨：数的是**收尾圈里**的那些（不是吸力圈里）——
      // 圈边那些还在往外挣的、够不着吸力中心的，本来就不会被这一下打到，不该算进账里。
      // 它们已经被拽到中心、正好吃满伤害（`blast` 的边缘衰减按 d/radius 算，中心是 1 倍）。
      const caught = this.countHeld(v.x, v.y, v.radius * VORTEX.burst);
      const dmg = v.damage + VORTEX.reward * caught;
      // 「收网」看的是**收到几只**，不是打出多少点：伤害会随等级（24→68）和灯火（0.65~1.35 倍）飘，
      // 同一个操作能差两倍；只数才不会（data/vortex.ts 的 haul 那一段写了为什么）。
      const netted = caught >= VORTEX.haul;
      this.vortexCaught = Math.max(this.vortexCaught, caught);
      this.vortexPayoff = Math.max(this.vortexPayoff, Math.round(dmg));
      if (netted) this.achievements.unlock('vortex_payoff');
      this.vortexes.splice(i, 1);
      this.blast(v.x, v.y, v.radius * VORTEX.burst, dmg, {
        knockback: 0,
        burn: v.burn,
        source: v.source,
        ring: '#8fb8ff',
        spark: '#dcefff',
        sparkCount: 20 + caught * 3,
        // 冷色的武器不该在地上留一道烧焦：这里只留一圈被"抽过风"的冷痕
        decal: 'rgba(16,22,44,0.5)',
      });
      // 拢得多，那一下就越大越响：多一圈外环、更重的屏震、头顶上一个数。
      // 为什么要做大：这一条改动本身是"拢得好有回报"，可回报要是看不见，玩家就学不会挑时机。
      if (caught >= 3) {
        // 那圈收尾的环按结果上色：收成了是金的，没收成还是原来那圈青的（同一个东西的两种状态，
        // 不是多炸一圈——多一圈就会和升级那圈金环撞脸，也把画面弄乱）。
        this.particles.shockwave(
          v.x,
          v.y,
          netted ? '#ffd24e' : '#a8d8ff',
          v.radius * VORTEX.burst * (1.6 + Math.min(caught, 12) * 0.06) * (netted ? 1.15 : 1),
          netted ? 0.66 : 0.55,
        );
        // 收成那一行用**浅金**写在金环上面：同一支金色会和环糊在一起，浅一号才在环上读得出来。
        this.floaters.label(v.x, v.y - 34, `收网 ${caught} 只 · ${Math.round(dmg)}`, netted ? '#ffe9a8' : '#cfe8ff', netted ? 19 : 17);
        this.camera.addTrauma(Math.min(0.42, 0.1 + caught * 0.03), this.settings.data.shake * this.settings.motionScale);
      }
      // 收成的那一下再补一次更重的屏震：门槛是"一次 10 只"，而 9 只和 10 只在画面上本来一模一样——
      // 玩家只会看到一串数，学不会自己这一网离收成还差多远。成 / 不成两种颜色 + 一次更沉的手感 +
      // 一层往上走的音（`vortex_net`），那串飘字才变成一个能读懂的量表。
      // 这里刻意**不加**第二个字：头顶本来就飘着"收网 n 只"，再叠一个"收网"既挤又重，
      // 成就条自己会弹出来报名字。
      if (netted) {
        this.camera.addTrauma(0.2, this.settings.data.shake * this.settings.motionScale);
      }
      this.audio.play(netted ? 'vortex_net' : 'vortex_burst');
      this.camera.addTrauma(0.16, this.settings.data.shake * this.settings.motionScale);
    }
  }

  /**
   * 圈里站着几只（首领不算：它站在那儿不是被卷进来的，也不该为"收网"的伤害加成出力）。
   * 吸入圈和收尾圈共用这一个判据，所以"拽住几只"和"这一下打到几只"不会两套口径。
   */
  private countHeld(x: number, y: number, radius: number): number {
    let n = 0;
    this.enemies.forEach((e) => {
      if (e.boss) return;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= radius * radius) n += 1;
    });
    return n;
  }

  /**
   * 旋灯卷弹幕：**不改速度大小、只拐方向**，所以看起来是"被卷着打转"而不是"突然停住"；
   * 卷到中心（吸入半径 × `swallow`）就吞掉——那颗子弹再也打不到你。
   */
  private dragEnemyShots(v: Vortex, dt: number): void {
    const core = v.radius * VORTEX.swallow;
    for (const p of this.projectiles.all) {
      if (!p.active || p.fromPlayer) continue;
      const dx = v.x - p.x;
      const dy = v.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d <= core) {
        p.active = false;
        this.particles.burst(p.x, p.y, 3, '#dcefff', { speed: 60, size: 2.2, life: 0.3 });
        continue;
      }
      if (d > v.radius) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const bend = (1 - d / v.radius) * 4.2 * dt;
      p.vx += (dx / d) * sp * bend;
      p.vy += (dy / d) * sp * bend;
      const sp2 = Math.hypot(p.vx, p.vy) || 1;
      p.vx = (p.vx / sp2) * sp;
      p.vy = (p.vy / sp2) * sp;
    }
  }

  /**
   * 挂在怪自己积分那一步上的吸力：加在它自己的速度上，所以快慢怪挣得脱的程度不一样。
   *
   * 这里是**速度**增量而不是"加速度 × dt"：怪的 `vx/vy` 每帧都被它自己的 AI 重新写一遍
   * （见 EnemySystem.update 的 `e.vx = …`），所以这次加法只影响**这一帧**的位移。
   * 于是"乘 dt"反而会变成"帧率越低、每步加得越多、总位移越大"（30 帧下是 60 帧的两倍，
   * 手机上掉帧就成了另一件武器）。直接给速度，位移自然就是 `v * dt`，掉帧手感不变。
   *
   * 也因此 `VORTEX.pull` 是"往里拽的速度"（px/s），它和怪自己的速度在同一个量纲上打架：
   * 石守 34、影蛭 68、灯蛾 96、疾影 132——所以靠外一点的疾影挣得开，石守只能被拖着走。
   *
   * 衰减用 `pullShape` 而不是线性（见 data/vortex.ts）：线性衰减下画出来的那道边界是空头承诺，
   * 圈边上的怪一步都不动；垫起来之后"站在线里的都会被收走"才是真的。
   */
  private applyVortexPull(e: Enemy): void {
    if (!this.vortexes.length) return;
    for (const v of this.vortexes) {
      const dx = v.x - e.x;
      const dy = v.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > v.radius || d < 0.5) continue;
      const resist = e.boss ? VORTEX.bossPull : e.def.elite ? VORTEX.elitePull : 1;
      const force = VORTEX.pull * (1 - d / v.radius) ** VORTEX.pullShape * resist;
      e.vx += (dx / d) * force;
      e.vy += (dy / d) * force;
    }
  }

  /** 最近的、**已经上弦**的伏灯（灯蛾扑的就是它）。 */
  private nearestArmedMine(x: number, y: number, maxDist: number): { x: number; y: number } | null {
    let best: Mine | null = null;
    let bestD = maxDist * maxDist;
    for (const m of this.mines) {
      if (m.arm > 0 && m.fuse <= 0) continue;
      const d = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /** 伏灯被踩响：一圈爆炸（进化的那颗还会在脚下留一片火）。 */
  private detonateMine(m: Mine, index: number): void {
    this.mines.splice(index, 1);
    const radius = m.radius * (1 + (this.player.stats.areaMult - 1) * 0.5);
    // 「以灯为饵」：先把够得着的那几只蛾**记下来**，再炸——炸完它们就没了（`active` 变 false），
    // 而「香饵」（遗物）要数的正是"这几只里被你炸死了几只"。所以这里记的是名单，不是只数。
    const baited: Enemy[] = [];
    const p = this.player;
    this.enemies.forEach((e) => {
      if (e.defId !== 'moth') return;
      // 判据和 blast 一字不差（半径再加怪自己那一圈）：数出来的就是"真被这炸打到的"。
      // 但还得再补一条：**它离这盏灯比离你更近**——这一条才是"被灯引过去"，
      // 也正是蛾改道去扑灯用的那条规则（Enemy.behave 里的 `ld < d`）。
      // 少了这一条，「以灯为饵」就变成"顺手炸死几只蛾"，一盏灯扔哪儿都算数。
      const reach = radius + e.radius;
      const dm = (e.x - m.x) ** 2 + (e.y - m.y) ** 2;
      const dp = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (dm <= reach * reach && dm < dp) baited.push(e);
    });
    const moths = baited.length;
    if (moths > 0) {
      this.mineMothHits += moths;
      // 「以灯为饵」看的是**一次**炸到几只，而不是攒够多少只：
      // 攒数的话随便扔雷都会慢慢够，而"把一群蛾引到同一盏灯上"才是这件事的难点。
      if (moths >= MINE.mothBait) this.achievements.unlock('mine_moth');
    }
    // 「绊线」（遗物）：踩响的这一圈**走不动**。走的是 `applyHit` 那条共用的减速账
    // （合并规矩只有一份，见 Enemy.applySlow）——所以它和霜印 / 烟熏撞在一起时，
    // 谁更狠听谁的，强度不会叠着算两次。
    const snare = p.flags.mineSnare;
    const hits = this.blast(m.x, m.y, radius, m.damage, {
      knockback: MINE.knockback,
      burn: m.fire,
      slow: snare > 0 ? MINE.snareSpan : 0,
      slowPower: 1 - snare,
      ring: '#ffb14e',
      spark: '#ffd9a0',
      sparkCount: 22,
      source: m.source,
    });
    // 「香饵」（遗物）：被你这一炸炸死的灯蛾，每只把那口油还给你的灯。
    // 为什么数"炸死"而不是"炸到"：蛾扑的是光、自己撞上来，那口油本来就该是"它烧完了"的结果；
    // 而且按只算，往蛾群里摆一盏灯才真的划算——这正是这一族想教的那件事。
    // （判据是 `active`，它由 `EnemySystem.damage` 在血扣到 0 的那一下写成 false。）
    const mothOil = p.flags.mineMothOil;
    if (mothOil > 0) {
      let killed = 0;
      for (const e of baited) if (!e.active) killed += 1;
      if (killed > 0) {
        const gain = Math.min(p.oilMax - p.oil, p.oilMax * mothOil * killed);
        if (gain > 0) {
          p.oil += gain;
          this.floaters.label(m.x, m.y - 16, `+${(gain * 100).toFixed(1)}% 油`, '#ffd24e', 12);
        }
      }
    }
    if (m.fire > 0) this.addGround(m.x, m.y, radius * 0.75, MINE.fireLife, MINE.fireDps, 'fire', false, m.source);
    // 一次炸到一片：这是伏灯最想要的那一下（也是「伏击」成就的判据）
    if (hits >= MINE.multiHit) this.achievements.unlock('mine_multi');
    // 连爆：这一炸够得着的其他雷会被引信点着。排得密就一串响，排得开就一颗一颗响——
    // 不是同一帧一起炸（那样看见的只是一团白光），而是隔 0.09 秒顺着串烧过去。
    // 「接火」（遗物）：这一串能接上更远的那一颗。撒得开（跑着撒）本来就只有一颗一颗响的份，
    // 加成之后"隔着一颗爆炸半径"的位置也能接上——"排成一列"这件事第一次有了回报。
    const reach = radius * MINE.chainReach * (1 + p.flags.mineChain);
    let lit = 0;
    for (const other of this.mines) {
      if (other.fuse > 0 || other === m) continue;
      if ((other.x - m.x) ** 2 + (other.y - m.y) ** 2 > reach * reach) continue;
      other.fuse = MINE.chainFuse;
      other.fuseX = m.x;
      other.fuseY = m.y;
      other.link = m.link + 1;
      other.arm = 0;
      lit += 1;
    }
    if (lit) this.audio.play('chain', Math.min(m.link + 1, 5));
    this.mineChainBest = Math.max(this.mineChainBest, m.link + 1);
    if (m.link + 1 >= MINE.chainBest) this.achievements.unlock('minechain');
    this.audio.play('nova');
    this.haptics.mine();
  }

  private addGround(
    x: number,
    y: number,
    r: number,
    life: number,
    dps: number,
    kind: 'fire' | 'poison' | 'mud' | 'frost' = 'fire',
    ignites = false,
    source?: string,
  ): void {
    this.grounds.push({ x, y, r, life, dps, kind, ignites, igniteIn: 0, phase: ignites ? this.rng.next() * 6.283 : 0, source });
    const tint = kind === 'mud' ? '#9fb7c9' : kind === 'frost' ? '#bfe6ff' : '#ff7a2f';
    this.particles.shockwave(x, y, tint, r, life);
  }

  /**
   * 地形减速：踩进「织雾者」的滞行雾里，脚步会沉下去。
   * 每帧重算并写在玩家身上，由 Player.update 读取（而不是让地面直接改玩家速度，
   * 免得一个技能把玩家的属性改得收不回来）。
   */
  private updateTerrain(dt: number): void {
    let slow = 1;
    let oil = 1;
    let light = 1;
    let frost = false;
    // 「烬护」（遗物）问的是"倒完之后那几步走在哪儿"：**你自己倒出来的**那片油火
    // （`ignites`）站进去就是一处掩体。别的火（爆裂菇的词缀、连珠伏灯留下的那层）不算——
    // 那些本来就烧你，躲进去不是"掩体"而是"挨打"。
    let shelter = false;
    for (const g of this.grounds) {
      if (g.ignites) {
        const gx = this.player.x - g.x;
        const gy = this.player.y - g.y;
        if (gx * gx + gy * gy <= g.r * g.r) shelter = true;
        continue;
      }
      if (g.kind !== 'mud' && g.kind !== 'frost') continue;
      if (g.kind === 'mud') {
        const dx = this.player.x - g.x;
        const dy = this.player.y - g.y;
        if (dx * dx + dy * dy <= g.r * g.r) slow = Math.min(slow, 0.6);
        continue;
      }
      // 霜冻不咬人，但会让脚底发滑不起来、灯火烧得更凶也更暗
      frost = true;
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      if (dx * dx + dy * dy <= g.r * g.r) {
        slow = Math.min(slow, 0.55);
        oil = Math.max(oil, 1.35);
        light = Math.min(light, 0.82);
      }
    }
    this.player.terrainSlow = slow;
    this.player.terrainOil = oil;
    this.player.terrainLight = light;
    this.player.inOilFire = shelter;
    if (slow < 1) {
      this.mudTime += dt;
      if (this.mudTime >= 20) this.achievements.unlock('mirewalker');
    }
    if (frost) {
      this.frostTime += dt;
      if (this.frostTime >= 6) this.achievements.unlock('frost_walker');
    }
    // 拨芯：这条成就量的是**拨着芯**走了多久，不是"按过几次"——它想奖励的是那种
    // "把火压住慢慢摸过去"的走法，蹭两下不算。累计那一步在 `Player.update` 里
    // （只有真的拨着才算秒数），这里只管到线了发一条。
    if (this.player.wickTime >= WICK.achieveSeconds) this.achievements.unlock('wickwalk');
  }

  private resolveGrounds(dt: number): void {
    for (let i = this.grounds.length - 1; i >= 0; i -= 1) {
      const g = this.grounds[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.grounds.splice(i, 1);
        continue;
      }
      if (g.kind === 'mud' || g.kind === 'frost') continue;
      if (g.ignites) {
        // 「倾灯」的那片油火：给火里的怪一遍遍续上灼烧（走的是怪自己那套 burn，
        // 所以它吃「燎原」的加成、也不用每帧刷伤害数字），**不烧玩家**。
        g.igniteIn = (g.igniteIn ?? 0) - dt;
        if (g.igniteIn <= 0) {
          g.igniteIn = POUR.igniteEvery;
          this.enemies.forEach((e) => {
            if ((e.x - g.x) ** 2 + (e.y - g.y) ** 2 > (g.r + e.radius) ** 2) return;
            // 「浇油」（遗物）：一次多续一层。12 层是 `applyBurn` 自己的上限，
            // 所以这一件买到的不是"更高"，而是"更快到顶"（1 层要 7.2 秒，2 层 3.6 秒到 12 层）。
            this.enemies.applyBurn(e, POUR.igniteStacks + this.player.flags.pourStacks, g.source ?? null);
          });
        }
        // 它也是一片光：油烧起来比别的火亮，暗幕里那圈火自己就是路标
        this.light.addGlow(g.x, g.y, g.r * 1.45, 0.55);
        // 火星子往上飘：这是这个游戏里"有东西在烧"一直都在用的那句话（灯台、余烬也是它）。
        // 静静的火苗在暗幕里太像一张贴图了，飘起来的几点火星才让它像在烧。
        if (this.rng.next() < dt * 11) {
          const ea = this.rng.next() * 6.283;
          const ed = g.r * Math.sqrt(this.rng.next()) * 0.78;
          this.particles.ember(g.x + Math.cos(ea) * ed, g.y + Math.sin(ea) * ed, '#ffc46b');
        }
        continue;
      }
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      if (dx * dx + dy * dy <= g.r * g.r) this.damagePlayer(g.dps * dt, g.x, g.y, 0, g.kind);
      this.light.addGlow(g.x, g.y, g.r * 1.2, g.kind === 'poison' ? 0.3 : 0.5);
    }
  }

  /**
   * 「掠影」：这一帧有没有从危险旁边**擦**过去。规则与调参见 `data/graze.ts`。
   *
   * 为什么判定用"这一帧走过的那一段路"而不是终点：手机上掉到 30fps 时，
   * 一次冲刺一帧就是 25px，而掠影带一共 26px 宽——只看终点会整帧跳过去，
   * 玩家明明贴着子弹掠过却什么都没发生，手感就变成了"有时候算有时候不算"。
   */
  private resolveGraze(dt: number): void {
    const p = this.player;
    const fx = this.grazeFromX;
    const fy = this.grazeFromY;
    const px = p.x;
    const py = p.y;
    // "在动"用**这一帧真的挪了多少**来量，而不是速度矢量：
    // 按住方向键顶在墙上时速度是满的、位移是 0——那不是掠影。
    // （只看速度的话，"卡在墙角按住方向键"会变成一个稳定的刷热度姿势：
    //  怪凑在带子里啃墙、你一动不动地把表攒满。）
    const speed = dt > 0 ? Math.hypot(px - fx, py - fy) / dt : 0;
    // 掠影要求你**在动**：站着不动被围住时热度不该自己往上走，
    // 否则"缩在怪堆里不动"会变成最省事的刷法，和这一版想鼓励的事正好相反。
    if (speed < GRAZE.speedFloor) {
      // 停下来的时候记账冷却照走：不然一停一动，同一只怪会被立刻重复记一次
      this.enemies.forEach((e) => {
        if (e.grazeCd > 0) e.grazeCd -= dt;
      });
      return;
    }
    const vig = Math.min(1.6, speed / GRAZE.speedRef);
    const dashing = p.dashTimer > 0;
    // 热度是**按这一帧离危险多近**一点点累起来的，不是"擦到就发一笔"：
    // 判定发生在刚进带子的那一瞬，而那一瞬的距离永远正好等于带子宽度——
    // 按事件发钱的话，"贴着判定边掠过"和"从带子最外沿溜过"给的一样多，
    // 那"敢贴多近"就没被奖励到。按距离持续累加，贴得久、贴得近的自然拿得多。
    let rate = 0;

    this.enemies.forEach((e) => {
      if (e.grazeCd > 0) e.grazeCd -= dt;
      const rr = e.radius + p.radius;
      const d = segDist(e.x, e.y, fx, fy, px, py);
      if (d <= rr || d > rr + GRAZE.rangeEnemy) {
        // 出了带子就快速回味（比攒快三倍）：绕出去再绕回来，才算新的一次"掠过"
        e.grazeHold = Math.max(0, e.grazeHold - dt * GRAZE.holdBack);
        return;
      }
      e.grazeHold += dt;
      // 外沿只算四分之一、贴着判定边算满；同一只怪贴超过 holdMax 秒之后贡献归零
      //（"掠影"是擦过去，不是搂着不放，不然绕着最慢的那只怪转圈就能一直刷）
      const fresh = Math.max(0, 1 - e.grazeHold / GRAZE.holdMax);
      rate += GRAZE.rateEnemy * (0.25 + 0.75 * (1 - (d - rr) / GRAZE.rangeEnemy)) * fresh;
      if (e.grazeCd <= 0) {
        e.grazeCd = GRAZE.cdEnemy;
        this.grazeEvent(e.x, e.y, 'enemy', dashing);
      }
    });

    for (const proj of this.projectiles.all) {
      if (!proj.active || proj.fromPlayer) continue;
      const rr = proj.radius + p.radius;
      const d = segDist(proj.x, proj.y, fx, fy, px, py);
      if (d <= rr || d > rr + GRAZE.rangeShot) continue;
      rate += GRAZE.rateShot * (0.25 + 0.75 * (1 - (d - rr) / GRAZE.rangeShot));
      if (!proj.grazed) {
        proj.grazed = true;
        this.grazeEvent(proj.x, proj.y, 'shot', dashing);
      }
    }

    if (rate <= 0) return;
    // 上限按"三只怪的权重"封顶：一堆怪同时挤在身上是同一件事，不该平方级地涨
    if (p.addHeat(Math.min(rate, GRAZE.rateEnemy * GRAZE.rateCap) * dt * vig)) this.igniteBlaze(px, py);
  }

  /**
   * 焰烧着的时候，从身上往上飘一点火星。
   *
   * 节拍固定（0.08 秒一小撮），所以它跟帧率无关、不随掉帧变成一坨；
   * `ember()` 自己会按粒子密度抽样，手机上降档时自然就稀了。
   * 另外它**只走视觉**：粒子池满了会自己丢弃，不会有任何玩法上的副作用。
   */
  private updateBlazeEmbers(dt: number): void {
    if (!this.player.blazing) {
      this.blazeEmit = 0;
      return;
    }
    this.blazeEmit -= dt;
    if (this.blazeEmit > 0) return;
    this.blazeEmit = 0.08;
    const p = this.player;
    const a = this.rng.angle();
    const d = this.rng.range(2, p.radius * 0.9);
    this.particles.ember(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, '#ffd9a0');
  }

  /**
   * 「拨芯」（`KeyC` / 手机右下角那枚按钮）：把灯芯拨小一格，或者拨回来。
   *
   * 它翻的是 `player.wickOn`，真正逐帧往下算的是 `Player.update` 里那一段
   * （几个乘数怎么插值、为什么拨小快拨回来慢，都写在 `data/wick.ts`）。
   * 这里只做三件"属于这一层"的事：翻开关、给玩家一句看得见的反馈、把它记进图鉴。
   *
   * 为什么飘字是必要的：拨芯改的是**画面**（火矮下去、光晕收进去），
   * 可玩家按下键的那一瞬间低头看的是 HUD 或者怪——一个明确的"拨芯 · 微光"比"画面暗了一点"更结实。
   * 两次飘字用两种颜色（冷蓝 / 暖黄），和火本身亮不亮是同一个语言。
   */
  private toggleWick(): void {
    const p = this.player;
    p.wickOn = !p.wickOn;
    this.floaters.label(
      p.x,
      p.y - 34,
      p.wickOn ? '拨芯 · 微光' : '拨芯 · 复明',
      p.wickOn ? WICK.color : '#ffd24e',
      15,
    );
    this.audio.play('ui');
    this.codex.discover('mechanic', 'wick');
    // 第一次拨小给一张说明卡。这个动作的收益与代价都不在"按下去的那一瞬"——
    // 它按下去的瞬间只是画面暗了一下，真正省下来的油要过十几秒才看得见，
    // 真正丢掉的东西（看得见的范围、索敌范围）更是要撞上一次才知道。
    // 所以它和分灯 / 燃爆一样值得讲一次：一张卡换玩家知道自己在做什么。
    if (p.wickOn) {
      this.showTip(
        'verb:wick',
        '拨芯 · 把火压小',
        '灯芯拨到底：看得近一半、打得轻三成五，换来的是一桶油多烧近两倍。' +
          '赶路、绕开怪群的时候拨小，动手之前拨回来（再按一下 C / 再点一下右下角的「拨芯」）。',
      );
    }
  }

  /**
   * 记一次掠影（"擦过去"这件事本身）：算一次数、回一口灯油、蹦两粒火星、响一声"叮"。
   * 热度在 `resolveGraze` 里按距离持续累加，这里只管那一下的**动静**。
   *
   * @param dashing 是不是在无敌帧里穿过去的（双倍）
   */
  private grazeEvent(x: number, y: number, kind: 'enemy' | 'shot', dashing: boolean): void {
    const p = this.player;
    this.grazeCount += 1;
    // 油就是光：擦着黑暗走能一直亮着，这一小口就是"火苗被撩旺了"
    //「撩芯」把这一口翻倍——贴着脸打的那套牌，续航是靠"擦"接起来的，不是靠掉落
    p.oil = Math.min(p.oilMax, p.oil + GRAZE.oil * (1 + p.flags.grazeOil) * (dashing ? GRAZE.dashMult : 1) * p.stats.oilGainMult * p.difficultyOilMult);
    this.bounties.onGraze();
    this.codex.discover('mechanic', 'graze');
    const mx = (x + p.x) / 2;
    const my = (y + p.y) / 2;
    // 火星跟着"擦的是什么"变色：擦敌人是暖的，擦弹幕是紫的（跟敌人的子弹一个色系），
    // 冲刺穿过去是青的。三秒钟就能学会"刚才那下是擦到了什么"。
    const spark = dashing ? '#9fe6ff' : kind === 'shot' ? '#d9b6ff' : '#ffd97a';
    this.particles.burst(mx, my, dashing ? 4 : 2, spark, { speed: 90, size: 2.2, life: 0.32 });
    this.audio.play(dashing ? 'graze_dash' : 'graze');
    p.pulseGraze(dashing);
    if (this.grazeCount === 1) {
      this.showTip(
        'verb:graze',
        '掠影 · 擦着危险走过去',
        '贴着敌人或弹幕走（脚边那圈符文会长）就攒热度，还会回一点灯油：离得越近、走得越快，涨得越快；' +
          '站着不动不算。攒满会点着一阵「灯焰高涨」——照得更远、伤害 +25%、走得更快、' +
          '代价是火大油也烧得凶（+30%），但焰里每杀一只怪都会给它续一点时间。' +
          '冲刺里从弹幕正中穿过，那一下是双倍。',
      );
    }
    if (this.grazeCount === 60) this.achievements.unlock('graze60');
  }

  /**
   * 从弹幕**正中**穿过去：那一下给一笔明显的热度（见 GRAZE.heatDash）。
   *
   * 两次保护：一次冲刺只认一次（`Player.dashGraze`），同一颗子弹也只记一次数
   * （`Projectile.grazed`，它可能已经在带子里被"路过"记过了）。
   */
  private grazeDash(x: number, y: number, count: boolean): void {
    const p = this.player;
    // 一次冲刺只认一次：不然往一片弹幕里冲一下，三颗子弹就是三笔，攒了半天的表被一次冲刺填满
    if (p.dashGraze <= 0) return;
    p.dashGraze = 0;
    // 这颗子弹可能已经在带子里被"路过"记过数了（`Projectile.grazed`），那就不再重复记
    if (count) this.grazeEvent(x, y, 'shot', true);
    if (p.addHeat(GRAZE.heatDash)) this.igniteBlaze(x, y);
    this.particles.burst(x, y, 6, '#9fe6ff', { speed: 130, size: 2.6, life: 0.36 });
  }

  /** 攒满热度的那一下：一圈火星 + 一声"腾"，外加一句公告与一段触感。 */
  private igniteBlaze(x: number, y: number): void {
    const p = this.player;
    this.particles.shockwave(p.x, p.y, '#ffb14e', 132, 0.55);
    this.particles.burst(x, y, 20, '#ffd9a0', { speed: 210, size: 3.4, life: 0.7 });
    this.light.addGlow(p.x, p.y, 210, 1);
    this.flash = Math.max(this.flash, 0.26);
    this.camera.addTrauma(0.24, this.settings.data.shake * this.settings.motionScale);
    this.audio.play('blaze');
    this.haptics.blaze();
    this.floaters.label(p.x, p.y - 36, '灯焰高涨', '#ffd97a', 19);
    this.hud?.toast('🔥 灯焰高涨 · 伤 +25% / 光 +30% · 焰里每杀一只续 0.3 秒 · 但油耗也多了三成');
    this.bounties.onBlaze();
    this.codex.discover('mechanic', 'blaze');
    // 一局点着六次：掠影那条线要真的走进玩家的走位里，六次算跨过"偶尔擦到"那一档
    if (p.blazeCount >= 6) this.achievements.unlock('blaze6');
  }

  private handleHazard(kind: string): void {
    const p = this.player;
    const tip = HAZARD_TIP[kind];
    if (tip) this.showTip(`hazard:${kind}`, `险境 · ${HAZARD_LABEL[kind] ?? kind}`, tip);
    this.codex.discover('hazard', kind);
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
      case 'bramble': {
        // 荆棘回廊：一圈荆棘围住你，只留一道缺口——别硬撞，找缝
        const ring = 15;
        const gapAt = Math.floor(this.rng.next() * ring);
        const gap = 4;
        const radius = 250;
        for (let i = 0; i < ring; i += 1) {
          const d = (i - gapAt + ring) % ring;
          if (d < gap) continue;
          const a = (i / ring) * Math.PI * 2;
          this.hazards.push({ kind: 'thorn', timer: 1.5, x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius, r: 54 });
        }
        this.hud?.toast('🌵 荆棘回廊');
        break;
      }
      case 'coldfront': {
        // 寒潮：不咬人，但踩进霜冻里会又慢又费油、灯火也暗一截
        for (let i = 0; i < 5; i += 1) {
          const a = this.rng.angle();
          const d = i === 0 ? this.rng.range(0, 70) : this.rng.range(80, 340);
          this.addGround(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 112, 6, 0, 'frost');
        }
        this.hud?.toast('❄ 寒潮来袭');
        break;
      }
      case 'oilvoid': {
        this.player.oil = Math.max(0, this.player.oil - 0.25);
        this.hud?.toast('💧 灯油被抽取');
        break;
      }
      case 'emberwind': {
        // 风向只取四个正交方向：风是要一眼看懂的，斜着一个角度只会让人分不清该往哪跑。
        // 每阵重新掷一次，所以"这阵风往哪吹"是每局都要现读的东西。
        const dir = this.rng.int(0, 3);
        this.emberwindDirX = dir === 0 ? 1 : dir === 1 ? -1 : 0;
        this.emberwindDirY = dir === 2 ? 1 : dir === 3 ? -1 : 0;
        this.emberwindTimer = EMBERWIND.time;
        this.emberwindElapsed = 0;
        this.emberwindSpawnT = 0;
        this.embers.length = 0;
        this.emberStacks = 0;
        this.emberwindStackCd = 0;
        this.hud?.toast('🔥 余烬风');
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

  /**
   * 「余烬风」：火种顺着风飘过来，沾在身上的那几层一直在烧油。规则与调参见 `data/emberwind.ts`。
   *
   * 三条动线都在这一个函数里，因为它们共用一份状态（风的方向 / 还要吹多久 / 身上几层）：
   *   1. 起风时一排排地推火种过来（一排比随机撒更好读：一眼就能看出风朝哪边吹）；
   *   2. 火种自己飘、摆动、烧尽；
   *   3. 碰到玩家就粘住一层，**冲刺**一下全抖掉。
   */
  private updateEmberwind(dt: number): void {
    const p = this.player;
    // 一次新的冲刺 = 一次扑火。看计数而不是看 dashTimer：后者分不清"刚起步"和"同一段冲刺的后半截"
    if (p.dashCount !== this.emberwindDashSeen) {
      this.emberwindDashSeen = p.dashCount;
      if (this.emberStacks > 0) {
        this.emberStacks = 0;
        this.floaters.label(p.x, p.y - 32, '火星抖落', '#ffd9a0', 14);
        this.particles.burst(p.x, p.y, 12, '#ffc46b', { speed: 150, size: 3, life: 0.4 });
      }
    }
    if (this.emberwindStackCd > 0) this.emberwindStackCd -= dt;
    // 「灯台」那条解（见 data/emberwind.ts 的 pyreDecay）：站在亮着的灯台旁边，
    // 身上的层数一分一分往回掉，而且这一会儿不再往上叠（火种扑进那圈光里就灭了，见 stepEmbers）。
    this.emberPyreNear = this.litPyreWithin(p.x, p.y, EMBERWIND.pyreRadius);
    if (this.emberPyreNear && this.emberStacks > 0) {
      this.emberPyreT -= dt;
      if (this.emberPyreT <= 0) {
        this.emberPyreT = 1 / EMBERWIND.pyreDecay;
        this.emberStacks -= 1;
        this.floaters.label(p.x, p.y - 30, this.emberStacks > 0 ? `灯下不燎 ×${this.emberStacks}` : '灯下不燎', '#dfe9ff', 14);
        // 白烟：一撮火被光按灭该有的样子（橘色是"烧起来了"，这里正好相反）
        this.particles.burst(p.x, p.y - 6, 6, '#dfe9ff', { speed: 70, size: 2.6, life: 0.5 });
      }
    }
    if (this.emberStacks > 0) {
      // 这一口不是"挨一下"，是"背着一笔账"：层数在的时候每秒都在扣油。
      // 直接写油而不是走 damagePlayer：它咬的是灯油这条账，不是生命；
      // 油见底之后按这一局一直以来的规矩（油空 = 掉血）自然会接上。
      p.oil = Math.max(0, p.oil - this.emberStacks * EMBERWIND.oilPerStack * dt);
      if (this.rng.next() < dt * 12) this.particles.ember(p.x + this.rng.range(-8, 8), p.y - 6, '#ffb15e');
    }
    // ⚠ 风停了（timer 归零）**不等于**可以提前 return：场上的火种还要顺风飘完、自己烧尽。
    //   早先写成"风一停就 return"，那些火种会**冻在画面上**不动也不灭——最难查的那种错。
    if (this.emberwindTimer > 0) {
      this.emberwindTimer -= dt;
      this.emberwindElapsed += dt;
      const ramp = Math.min(1, this.emberwindElapsed / EMBERWIND.time);
      const speed = p.stats.moveSpeed * (EMBERWIND.speedStart + (EMBERWIND.speedEnd - EMBERWIND.speedStart) * ramp);
      this.emberwindSpawnT -= dt;
      this.pushEmberRows(p, speed);
    }
    this.stepEmbers(dt);
  }

  /** 起风期间每隔 `rowEvery` 秒推一排火种过来（一整排比随机撒更好读：一眼看得出风朝哪边吹）。 */
  private pushEmberRows(p: Player, speed: number): void {
    if (this.emberwindSpawnT <= 0) {
      this.emberwindSpawnT = EMBERWIND.rowEvery;
      // 垂直于风向的那条线：把一排火种铺开（风向的法线）
      const nx = -this.emberwindDirY;
      const ny = this.emberwindDirX;
      const jitter = this.rng.range(-1, 1) * EMBERWIND.rowSpread * 0.16;
      for (let i = 0; i < EMBERWIND.rowCount; i += 1) {
        const t = EMBERWIND.rowCount > 1 ? i / (EMBERWIND.rowCount - 1) : 0.5;
        const off = (t - 0.5) * 2 * EMBERWIND.rowSpread + jitter;
        const x = p.x - this.emberwindDirX * EMBERWIND.upwind + nx * off;
        const y = p.y - this.emberwindDirY * EMBERWIND.upwind + ny * off;
        // 生成在场地外的不生成（墙外"飘进来"看着就是穿墙）。
        // 顺带立了一条规矩：贴着上风口的墙站，能少挨一半——那是玩家自己发现的便宜
        if (Math.abs(x) > this.level.halfW || Math.abs(y) > this.level.halfH) continue;
        this.embers.push({
          x,
          y,
          vx: this.emberwindDirX * speed,
          vy: this.emberwindDirY * speed,
          phase: this.rng.next() * 6.2832,
          wob: 22 + this.rng.next() * 18,
          life: EMBERWIND.moteLife,
        });
      }
    }
  }

  /** 火种自己飘、摆动、烧尽；碰到玩家就粘住一层。 */
  private stepEmbers(dt: number): void {
    const p = this.player;
    const rr = p.radius + EMBERWIND.radius;
    for (let i = this.embers.length - 1; i >= 0; i -= 1) {
      const m = this.embers[i];
      m.life -= dt;
      m.phase += dt * 2.6;
      const wob = Math.sin(m.phase) * m.wob;
      m.x += (m.vx - this.emberwindDirY * wob) * dt;
      m.y += (m.vy + this.emberwindDirX * wob) * dt;
      // 飘出场地（或者烧尽）就熄
      if (m.life <= 0 || Math.abs(m.x) > this.level.halfW + 200 || Math.abs(m.y) > this.level.halfH + 200) {
        this.embers.splice(i, 1);
        continue;
      }
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      // 站在灯台的光里：火种扑到身上就灭，哪一颗都一样、也不管冷却
      //（这一条是"跑向灯"那条路在算术上成立的前提——少了它，站在灯台边清一层来一层）
      if (this.emberPyreNear) {
        this.embers.splice(i, 1);
        this.particles.burst(m.x, m.y, 3, '#dfe9ff', { speed: 60, size: 2, life: 0.35 });
        continue;
      }
      // ⚠ 冷却里的那一颗**不消费**：它还留在你身上飘，冷却一过就再烫你一下（每 0.4 秒一层）。
      // 这是"迎着风站进一排里会被糊满三层"的全部来源——台架量出来的那张方向矩阵（0/0/3/3）
      // 就是它量出来的，所以这一行不能顺手改掉。
      // （改这一版时真踩过：把"碰到就消费"挪到冷却判断前面，余烬风静悄悄地轻了一半，
      //  浏览器实测"逆风跑 2.6 秒"从稳拿一层变成一层都拿不到。）
      if (this.emberwindStackCd > 0) continue;
      this.embers.splice(i, 1);
      this.emberwindStackCd = EMBERWIND.stackCd;
      if (this.emberStacks < EMBERWIND.stackMax) {
        this.emberStacks += 1;
        this.floaters.label(p.x, p.y - 30, `燎 ×${this.emberStacks}`, '#ff9d2e', 14);
      }
      this.particles.burst(m.x, m.y, 5, '#ffb15e', { speed: 110, size: 2.6, life: 0.35 });
    }
  }

  /** 这一点附近有没有**亮着的**灯台（灯焰被吹灭的灯台不算：它自己都保不住）。 */
  private litPyreWithin(x: number, y: number, r: number): boolean {
    const rr = r * r;
    for (const py of this.level.pyres) {
      if (!py.lit) continue;
      if ((py.x - x) ** 2 + (py.y - y) ** 2 <= rr) return true;
    }
    return false;
  }

  /** 换关 / 重开 / 回主菜单：把余烬风整段收掉，别让上一阵的火种飘进下一局。 */
  private clearEmberwind(): void {
    this.embers.length = 0;
    this.emberStacks = 0;
    this.emberwindTimer = 0;
    this.emberwindElapsed = 0;
    this.emberwindSpawnT = 0;
    this.emberwindStackCd = 0;
    this.emberPyreNear = false;
    this.emberPyreT = 1 / EMBERWIND.pyreDecay;
    this.emberwindDashSeen = this.player.dashCount;
  }

  private onStageComplete(): void {
    this.save.best = Math.max(this.save.best, this.stageIndex + 1);
    this.storage.save(this.save);
    if (this.stageIndex === 0) this.achievements.unlock('survivor');
    if (this.difficulty === 'nightmare') this.achievements.unlock('nightmare');
    if (this.curse) this.achievements.unlock('curse_bearer');
    if (this.curse && (this.curse.id === 'whisper' || this.curse.id === 'starve')) this.achievements.unlock('curse_veteran');
    if (this.endless) {
      const round = Math.max(1, Math.floor(this.director.wave / 5));
      this.openShop(`无尽之夜 · 第 ${round} 轮 · 补给站`);
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
    const tiers = this.player.tribeTiers();
    this.player.removeRelic(id);
    const next = this.rng.pick(pool);
    this.player.addRelic(next.id);
    this.announceTribeResonance(tiers);
    this.codex.discover('relic', next.id);
    this.audio.play('evolve');
    this.flash = 0.3;
    this.achievements.unlock('forge_first');
    this.hud?.toast(`🔥 熔铸：${old?.name ?? id} → ${next.name}`);
    // 不重掷商品：玩家可能正攒钱等某一件，熔铸不该把它换掉
    this.ui?.showScreen('shop');
  }

  /**
   * 第一次拿到某把武器：把"它是什么、能长成什么"讲一次。
   * 二十把武器靠图鉴自己翻太慢，第一次上手时正是一个人最愿意读说明的时候。
   */
  private noteWeaponTip(id: string): void {
    const def = WEAPON_MAP[id];
    if (!def) return;
    const evo = def.evolve
      ? ` 满级 + ${PASSIVE_MAP[def.evolve.passive]?.name ?? def.evolve.passive} 满级即可进化成「${WEAPON_MAP[def.evolve.into]?.name ?? def.evolve.into}」。`
      : ' 这件没有进化线，但每一级都会更强。';
    // 「倾灯」得额外讲一句"它有时候为什么不响"：一件会自己停下来的武器，
    // 不把规矩说清楚就只会被当成坏了。
    // 触屏上这一件多讲一条：它那一瓢的落点归玩家（手指按住屏幕右侧拖着，见 TouchControls）。
    // 只在这件武器上教——别的武器不吃这一套，提前讲会让人以为屏幕坏了。
    // 这一件的落点归玩家，两条路上各用各的说法：手机上"手指按住屏幕右侧拖"，
    // 桌面上"按住鼠标右键"（编码是同一种：方向 + 力度，见 InputState 上那一段）。
    const aimRule = isTouchDevice()
      ? ' 手机上：手指按住屏幕右侧拖着，这一瓢就「往你指的方向倒」——推得越远落得越远，松手还给自动瞄准。'
      : ' 桌面上：按住鼠标右键，指针指哪儿这一瓢就倒哪儿（指针离人越远落得越远）。';
    const rule =
      def.kind === 'pour'
        ? ` 它只在灯火 ≥ ${Math.round(POUR.minOil * 100)}% 时才倒——不满就整发不出手，所以它响不响看的是你补油快不快（擦身、击杀掉落、灯台都算）。倒下的地方会留一片火，往同一片上再倒一瓢，火会一层层叠上去。${aimRule}`
        : def.kind === 'aura'
          ? ` 它没有枪管：**它的射程就是你自己的灯火半径**——灯照到哪儿就烤到哪儿，灯外面一点都够不着（吊在你光圈外的远程怪，这一件帮不上忙）。反过来，灯火越亮它打得越狠，拨了芯它跟着一起小下去；「燎灯」和拨芯那四件遗物是两条相反的路。`
        : '';
    this.showTip(`weapon:${id}`, `武器 · ${def.name}`, `${def.blurb}${rule}${evo}`);
  }

  /** 升级 / 商店拿到武器或完成进化时，按第一次讲一次。 */
  private maybeTipUpgrade(offer: UpgradeOffer): void {
    if (offer.kind !== 'weapon') return;
    if (offer.tag === 'evolve') {
      const evolved = WEAPON_MAP[offer.id];
      this.showTip(
        `evolve:${offer.id}`,
        `进化 · ${offer.name}`,
        `${evolved?.blurb ?? ''} 进化武器不再升级，但吃得住你全部的整体加成。`,
      );
    } else if (offer.tag === 'new') {
      this.noteWeaponTip(offer.id);
    }
  }

  /** 第一次走进某一关：先把这一关的样子说清楚（主题、险境、首领）。 */
  private noteStageTip(stage: import('../types').StageDef): void {
    const hazards = stage.hazards.map((h) => HAZARD_LABEL[h] ?? h).join(' / ');
    const boss = stage.boss ? `；首领：${ENEMY_MAP[stage.boss]?.name ?? stage.boss}` : '';
    this.showTip(
      `stage:${stage.id}`,
      `关卡 · ${stage.theme.name}`,
      `${stage.theme.subtitle}。险境：${hazards || '无'}${boss}。`,
    );
  }

  /** 拿到新遗物后，看看是否刚好凑齐了某一族的灯火共鸣，凑齐了就报一声。 */
  private announceTribeResonance(before: Record<string, number>): void {
    for (const tribe of TRIBES) {
      const now = this.player.tribeTier(tribe.id);
      if (now <= (before[tribe.id] ?? 0)) continue;
      const tier = tribe.tiers[now - 1];
      const n = this.player.tribeCount(tribe.id);
      this.achievements.unlock('resonance');
      if (TRIBES.filter((t) => this.player.tribeTier(t.id) > 0).length >= 2) this.achievements.unlock('resonance_pair');
      this.hud?.toast(`灯火共鸣 · ${tribe.icon}${tribe.name} ${n}/${tier.count} — ${tier.blurb}`);
      this.flash = Math.max(this.flash, 0.22);
      this.audio.play('evolve');
    }
  }

  rerollShop(): void {
    if (this.state !== 'shop') return;
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
      const tiers = this.player.tribeTiers();
      this.player.addRelic(item.id);
      this.announceTribeResonance(tiers);
      this.achievements.unlock('relic_first');
      if (this.player.relics.size >= 4) this.achievements.unlock('relic_hoard');
      this.audio.play('evolve');
    } else if (item.kind === 'upgrade' && item.offer) {
      this.upgrades.apply(this.player, item.offer);
      this.player.recomputeStats();
      this.upgradedCount += 1;
      this.maybeTipUpgrade(item.offer);
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
      // 一轮一片战场：出去之前先把新的铺好（rollBounty 由 loadStage 一并重抽）
      this.advanceEndlessArena(Math.max(1, Math.floor(this.director.wave / 5)));
      this.state = 'playing';
      this.ui?.showScreen('playing');
      return;
    }
    if (this.stageIndex + 1 >= STAGES.length) {
      this.continueStage();
      return;
    }
    this.openCurseChoice(this.stageIndex + 1);
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
      this.haptics.died();
      this.hud?.toast('✦ 复燃！');
      return;
    }
    this.state = 'dead';
    this.haptics.died();
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

  setInput(
    moveX: number,
    moveY: number,
    dash: boolean,
    nova: boolean,
    lamp = false,
    aim: { x: number; y: number } | null = null,
    dim = false,
  ): void {
    this.inputSnapshot.moveX = moveX;
    this.inputSnapshot.moveY = moveY;
    this.inputSnapshot.dash = dash;
    this.inputSnapshot.nova = nova;
    if (lamp) this.inputSnapshot.lamp = true;
    // 拨芯和分灯一样是"按下那一帧"的一次性输入，所以只在自己为真时写进去（不清零）。
    if (dim) this.inputSnapshot.dim = true;
    // 手动瞄准（触屏）：方向 + 力度合成一个向量，传 null 就是"没在瞄"（自动瞄准照旧）
    this.inputSnapshot.aim = !!aim;
    this.inputSnapshot.aimX = aim?.x ?? 0;
    this.inputSnapshot.aimY = aim?.y ?? 0;
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

  /**
   * 把当前档位下发到各个子系统。每帧调一次，但除了第一次（或画质档真的变了）
   * 之外都是空转：`Renderer.setProfile` 内部先比再改，Set 也不产生分配。
   * 布景密度变了意味着地面陈设要重铺——同一颗种子重铺，墙/神龛/灯台都不动。
   */
  refreshPerf(): void {
    const p = perfProfile(this.settings.data.quality);
    this.profile = p;
    this.renderer.setProfile(p);
    this.postfx.setProfile(p);
    this.particles.density = p.particleScale;
    this.light.setScale(this.renderer.dpr, p.lightScale);
    const key = `${p.handheld ? 'h' : 'd'}|${this.settings.data.quality}`;
    if (key === this.profileKey) return;
    const first = !this.profileKey;
    this.profileKey = key;
    if (!first && this.level) refinishLevel(this.level, this.startSeed + this.stageIndex * 7919, p.detailScale);
  }

  render(): void {
    const r = this.renderer;
    // 动态分辨率：按实测帧间隔自动升降内部渲染分辨率（高分屏下这一项决定能不能跑到 60fps）
    r.adaptive = this.settings.data.adaptive;
    this.refreshPerf();
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
      this.postfx.applyGlow(ctx, w, h, { px: w * 0.5, py: h * 0.72, strength: 0.8 });
      this.postfx.applyMain(ctx, w, h);
      if (this.screenFade > 0) {
        ctx.fillStyle = `rgba(2,3,6,${this.screenFade.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }

    this.drawWorld(ctx, w, h);
    this.light.setDarkness(clamp(0.94 + this.darknessBoost, 0, 0.99));
    this.light.setScale(r.dpr, this.profile.lightScale);
    this.light.render(ctx, this.camera, w, h, this.time);
    this.drawPyreGlow(ctx, w, h);
    this.drawEmberGlow(ctx, w, h);
    this.drawFrostHaze(ctx, w, h);

    // Screen-space overlays
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    // 暖色分级 + 泛光：两件都是加法叠加，合成一趟做（手机上省一次整屏读改写）
    this.postfx.applyGlow(ctx, w, h, { px: this.renderer.width / 2, py: this.renderer.height / 2, strength: 1 });
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
   * 霜冻地带的冷雾。
   *
   * 寒潮不咬人，躲不躲得开全看"有没有看见"。所以这片霜也跟熄灭的灯台一样，
   * 在暗幕之后补一层很淡的冷色——够你看清该绕开哪里，不足以照亮路。
   */
  private drawFrostHaze(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cam = this.camera;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.grounds) {
      if (g.kind !== 'frost') continue;
      const s = cam.worldToScreen(g.x, g.y);
      const r = g.r * cam.zoom;
      if (s.x < -r || s.y < -r || s.x > w + r || s.y > h + r) continue;
      const fade = clamp(g.life / 6, 0, 1) * (0.82 + Math.sin(this.time * 2 + g.x * 0.01) * 0.18);
      const grad = ctx.createRadialGradient(s.x, s.y, r * 0.12, s.x, s.y, r);
      grad.addColorStop(0, `rgba(150,215,255,${(0.17 * fade).toFixed(3)})`);
      grad.addColorStop(0.7, `rgba(110,175,225,${(0.08 * fade).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(80,140,200,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3 * fade;
      ctx.strokeStyle = '#cfeaff';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 0.96, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
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
   * 火种画在**灯光之后**（和灯台的余晖同一趟，加法叠加）。
   *
   * 它们是"黑地里还在烧的东西"，跟着世界层一起被暗幕压暗就等于没画；
   * 而这一阵险境要教的第一件事就是"风往哪边吹"——看不见火种，这一句就无从谈起。
   * 沾在玩家身上的那几层也画在这里：玩家得能一眼看见自己身上烧着几层，
   * 不然只会觉得油莫名其妙在掉。
   */
  private drawEmberGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.embers.length && this.emberStacks <= 0) return;
    const cam = this.camera;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.embers) {
      const s = cam.worldToScreen(m.x, m.y);
      if (s.x < -40 || s.y < -40 || s.x > w + 40 || s.y > h + 40) continue;
      const a = clamp(m.life / EMBERWIND.fade, 0, 1);
      // 顺着风拖一条尾迹：火种本身只是个亮点，"风往哪边吹"这件事全靠这条尾巴讲。
      // 尾巴短（11px 上下）——再长就成了一串流星，看不出是一颗一颗的火种。
      ctx.strokeStyle = `rgba(255,150,60,${0.3 * a})`;
      ctx.lineWidth = 1.6 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(s.x - this.emberwindDirX * 11 * cam.zoom, s.y - this.emberwindDirY * 11 * cam.zoom);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      const r = 9 * cam.zoom;
      // 外圈那点虚光 + 中间一颗实的芯：两点就够了（这一段每帧要画几十颗，
      // 每颗都去 createRadialGradient 太贵；灯台那种一屏两三座才用得起渐变）
      ctx.fillStyle = `rgba(255,120,40,${0.18 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,150,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.1 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.emberStacks > 0) {
      const p = this.player;
      const s = cam.worldToScreen(p.x, p.y);
      const rr = (p.radius + 12) * cam.zoom;
      // 身上那圈光要**很小很淡**：这是加法叠加，给多一点就把玩家整个人糊成一团白，
      // 反而看不见自己在哪。层数靠那几颗绕圈的火星数，不靠这圈光的大小。
      ctx.fillStyle = `rgba(255,170,80,${0.05 * this.emberStacks})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr * 0.8, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < this.emberStacks; i += 1) {
        const a = this.time * 3.2 + (i / this.emberStacks) * Math.PI * 2;
        ctx.fillStyle = 'rgba(255,190,110,0.85)';
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * 0.78, 2.6 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
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
    // 按比例收，窄屏（竖屏手机）上才不会被压成负数、把箭头甩到屏幕中间。
    // 掌上设备另有两条硬约束：横屏 HUD 是"左右两列"——左边生命/灯油/经验 + 构筑芯片，
    // 右边记分 + 悬赏 + 灯台。画布在 DOM 之下，箭头钻到那两列底下就真的看不见了，
    // 所以手机把整个环收进两列之间（左边留到构筑芯片右沿，右边按记分列的宽度让开）。
    const handheld = this.profile.handheld;
    const left = handheld ? Math.min(258, w * 0.34) : Math.min(244, w * 0.3);
    const right = handheld ? Math.min(222, w * 0.36) : Math.min(134, w * 0.17);
    // 顶部留得更多：屏幕正中偏上是公告 / 图鉴 / 成就的常驻位，箭头挤进去会被它们盖住
    const top = handheld ? Math.min(198, h * 0.34) : Math.min(196, h * 0.32);
    const bottom = handheld ? Math.min(96, h * 0.3) : Math.min(84, h * 0.17);
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
    // 已经放下的标签框：两个目标在同一个方向上时，两个标签会直接压在一起
    // （手机横屏实测："灯台 1000" 与 "祭坛 800" 叠成一团，谁也读不出来）。
    // 箭头方向往里挪不行（会撞到箭头本体），所以沿箭头法线左右让开，最多让两次。
    const placed: { x: number; y: number; w: number }[] = [];
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
      const label = `${t.label} ${dist}`;
      const tw = ctx.measureText(label).width;
      const baseX = clamp(ax - Math.cos(ang) * 40, left + 26, w - right - 12);
      const baseY = clamp(ay - Math.sin(ang) * 40, top, h - bottom);
      // 法线方向（箭头方向转 90°）：沿它左右让开，让开之后仍然贴着箭头，读起来还是一组
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      let tx = baseX;
      let ty = baseY;
      for (const step of [0, 18, -18, 36, -36]) {
        const cx = clamp(baseX + nx * step, left + 26, w - right - 12);
        const cy = clamp(baseY + ny * step, top + 8, h - bottom - 8);
        const clash = placed.some((b) => Math.abs(b.x - cx) < (b.w + tw) / 2 + 6 && Math.abs(b.y - cy) < 15);
        if (!clash || step === -36) {
          tx = cx;
          ty = cy;
          break;
        }
      }
      placed.push({ x: tx, y: ty, w: tw });
      ctx.fillText(label, tx, ty);
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
        // 灯焰越少，火越小：被吹灯客抽着的时候一眼就看得出来
        const flame = clamp(py.flame ?? 1, 0, 1);
        const glowR = 58 * flicker * (0.45 + 0.55 * flame);
        const g = ctx.createRadialGradient(py.x, py.y - 28, 0, py.x, py.y - 28, glowR);
        g.addColorStop(0, `rgba(255,238,196,${0.35 + 0.6 * flame})`);
        g.addColorStop(0.4, `rgba(255,160,60,${0.18 + 0.32 * flame})`);
        g.addColorStop(1, 'rgba(255,110,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(py.x, py.y - 28, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,246,214,${0.5 + 0.45 * flame})`;
        ctx.beginPath();
        ctx.ellipse(py.x, py.y - 32, 7 * flicker * (0.6 + 0.4 * flame), 12 * flicker * (0.5 + 0.5 * flame), 0, 0, Math.PI * 2);
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

  /** 当前镜头的世界视口（带余量），给视野裁剪用。 */
  private worldView(): { x: number; y: number; halfW: number; halfH: number } {
    return {
      x: this.camera.x,
      y: this.camera.y,
      halfW: this.camera.width / 2,
      halfH: this.camera.height / 2,
    };
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
    // 手动瞄准的落点标记：和滞行雾 / 险境预警同一层（地上的规矩画在地上），
    // 而且在敌人**之前**——一瓢落在人群里，那个圈本来就该被他们盖住。
    this.drawPourAim(ctx);
    this.drawHazards(ctx);
    this.drawShrines(ctx);
    this.drawPyres(ctx);
    this.drawLamps(ctx);
    this.drawMines(ctx);
    this.drawVortexes(ctx);
    this.pickups.draw(ctx, this.time);
    this.projectiles.draw(ctx);
    this.enemies.draw(ctx, this.time, this.player.x, this.player.y, this.worldView());
    // 倾灯倒出来的火舌画在敌人**上面**、玩家**下面**：一瓢落点永远是人群里，
    // 火苗本来就该从他们身上窜起来（不然最该被看见的一团火只露出一圈边）；
    // 而玩家得始终看得见自己站在哪儿，所以人还在火苗之上。
    this.drawGroundTops(ctx);
    this.player.draw(ctx, this.time);
    this.drawArcs(ctx);
    this.drawBeams(ctx);
    this.particles.draw(ctx, this.worldView());
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
      // 地面位图是 0.58 倍分辨率再放大的（省内存），双线性放大要按目标像素做滤波，
      // 一次整屏读改写就是几毫秒。掌上设备改用最近邻：地面本来就是噪点贴图，
      // 硬边缘反而更像碎石子，而且 94% 的面积还压在暗幕底下。
      // 桌面保持双线性（屏幕更大、看得更仔细，不差这几毫秒）。
      // 地面位图是 0.58 倍分辨率再放大的（省内存），双线性放大要按目标像素做滤波，
      // 一次整屏读改写就是几毫秒。掌上设备改用最近邻：地面本来就是噪点贴图，
      // 硬边缘反而更像碎石子，而且 94% 的面积还压在暗幕底下（冻结同一帧逐像素比对：
      // 均值 0.65/255，差异全在石子边缘）。桌面保持双线性——屏幕更大，看得更仔细。
      const smooth = ctx.imageSmoothingEnabled;
      if (this.profile.handheld) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(baked, -lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
      ctx.imageSmoothingEnabled = smooth;
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

    // 主题布景
    drawDecor(ctx, theme.id, lvl.decor, this.worldView(), this.time, lvl.details);

    // 墙：每面墙十几个命令（贴图主体 + 高光渐变 + 暗面 + 描边 + 投影）合起来是这一帧里
    // 最肥的一块地面开销，而它们**一整局都不动**。所以烘焙成"每面墙一张精灵"，
    // 每帧只 drawImage 一次（见 wallLayer）。真机逐像素比对：与原实现最大差
    // 1/255（手机）/ 5/255（桌面 1.6 倍率）。
    this.drawWalls(ctx, theme);

    // Arena border
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 6;
    ctx.strokeRect(-lvl.halfW, -lvl.halfH, lvl.halfW * 2, lvl.halfH * 2);
    ctx.globalAlpha = 1;
  }

  /**
   * 墙体精灵层：每面墙一张 1:1 的位图（含投影），画一次就冻结到关卡换掉为止。
   * 关卡里只有 10~16 面墙，但它们加起来是地面开销里最肥的一块——每帧每面墙要
   * 贴图填充 + 一次线性渐变 + 两次暗面 + 一次描边 + 一次描边矩形 + 投影，十几个命令。
   * 烘成精灵后每帧每面墙只剩一次 drawImage：手机横屏每帧画布命令 1605 → 1273 条、
   * 整帧 −1.35ms（FROZEN=1 固定场面，844×390 dpr1），桌面 1440×810 整帧 −6.6ms。
   */
  private wallCache: { walls: unknown; themeId: string; sprites: WallSprite[] | null } | null = null;

  private wallLayer(theme: import('../types').StageTheme): WallSprite[] | null {
    const lvl = this.level;
    const cache = this.wallCache;
    if (cache && cache.walls === lvl.walls && cache.themeId === theme.id) return cache.sprites;
    this.wallCache = { walls: lvl.walls, themeId: theme.id, sprites: null };
    const sprites: WallSprite[] = [];
    const pattern = this.textures.wallFor(theme.id);
    const pad = WALL_SPRITE_PAD;
    // 桌面档烘 2 倍再缩回来：高分屏上石头贴图要按设备像素重新采样，
    // 1 倍精灵被放大 1.6~2 倍会糊一点（实测最大 14/255），2 倍精灵缩下去就是原样。
    // 掌上档不这么做：那里画面本来就在 0.4~0.8 倍上跑，1 倍精灵是被缩小的，
    // 而且移动端内存更紧（2 倍精灵要 4 倍显存），实测 1 倍与原实现差 ≤5/255。
    const k = this.profile.handheld ? 1 : 2;
    // 精灵总像素预算（≈24MB）：墙最大 350×350，全部按 2 倍烘的话极端一局能吃掉几十 MB。
    // 超了就从这一面墙起退回 1 倍——后画的墙只损失一点点贴图锐度，换来内存有上限。
    let budget = 6e6;
    try {
      for (const wall of lvl.walls) {
        const kk = budget > 0 ? k : 1;
        const pw = Math.ceil((wall.w + pad * 2) * kk);
        const ph = Math.ceil((wall.h + pad * 2) * kk);
        budget -= pw * ph;
        const c = document.createElement('canvas');
        c.width = pw;
        c.height = ph;
        const g = c.getContext('2d');
        if (!g) return null;
        g.setTransform(kk, 0, 0, kk, (pad - wall.x) * kk, (pad - wall.y) * kk);
        this.paintWall(g, wall, theme, pattern);
        sprites.push({
          canvas: c,
          x: wall.x - pad,
          y: wall.y - pad,
          w: c.width / kk,
          h: c.height / kk,
        });
      }
    } catch {
      // 建不出画布（内存吃紧 / 无 document）：退回逐面墙直接画，画面照旧
      this.wallCache = { walls: lvl.walls, themeId: theme.id, sprites: null };
      return null;
    }
    this.wallCache = { walls: lvl.walls, themeId: theme.id, sprites };
    return sprites;
  }

  /** 一面墙的全部笔画（含投影），世界坐标。烘焙与逐帧兜底走的是同一份代码。 */
  private paintWall(
    ctx: CanvasRenderingContext2D,
    wall: { x: number; y: number; w: number; h: number },
    theme: import('../types').StageTheme,
    pattern: CanvasPattern | null,
  ): void {
    const { x, y, w: ww, h: wh } = wall;
    // 投影：先声明"这是立起来的东西"
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 6, y + 8, ww, wh);
    ctx.restore();
    // 主体（贴图）
    ctx.fillStyle = pattern ?? theme.wall;
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

  private drawWalls(ctx: CanvasRenderingContext2D, theme: import('../types').StageTheme): void {
    const sprites = this.wallLayer(theme);
    if (!sprites) {
      const pattern = this.textures.wallFor(theme.id);
      for (const wall of this.level.walls) this.paintWall(ctx, wall, theme, pattern);
      return;
    }
    for (const s of sprites) ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h);
  }

  /** 烘焙好的静态地面层（渐变 + 贴图 + 网格），按主题/尺寸缓存。 */
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
      // 地面网格：横竖 ~36 条线，位置只跟关卡尺寸有关，也一起烘进来。
      // 逐条 stroke 是 144 条命令、合成一条路径 74 条，而真正贵的是那 36 条 2600px 长的描边
      // （软件光栅化下 ~0.3ms/帧）；烘进来之后每帧一次 drawImage 全带上了。
      // 它只是一层 alpha 0.07 的底纹，降到 0.58 倍分辨率再放大看不出来。
      g.save();
      g.setTransform(scale, 0, 0, scale, c.width / 2, c.height / 2);
      g.globalAlpha = 0.07;
      g.strokeStyle = theme.wall;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = -lvl.halfW; x <= lvl.halfW; x += GRID_STEP) {
        g.moveTo(x, -lvl.halfH);
        g.lineTo(x, lvl.halfH);
      }
      for (let y = -lvl.halfH; y <= lvl.halfH; y += GRID_STEP) {
        g.moveTo(-lvl.halfW, y);
        g.lineTo(lvl.halfW, y);
      }
      g.stroke();
      g.restore();
      this.floorCache = { key, canvas: c };
      return c;
    } catch {
      return null;
    }
  }

  /**
   * 地上的弃灯。两件事要一眼看得出来：光在哪（灯焰与光照），
   * 以及"这一片是饵"（一圈虚线）。最后 2.6 秒灯焰开始萎下去——
   * 那是"要灭了，趁现在"的倒计时。
   */
  private drawLamps(ctx: CanvasRenderingContext2D): void {
    if (!this.lamps.length) return;
    ctx.save();
    for (const l of this.lamps) {
      const fade = clamp(l.life / 2.6, 0, 1);
      const flicker = 1 + Math.sin(this.time * 9 + l.x * 0.05) * 0.08;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(l.x, l.y + 7, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2536';
      ctx.beginPath();
      ctx.moveTo(l.x - 7, l.y + 4);
      ctx.lineTo(l.x + 7, l.y + 4);
      ctx.lineTo(l.x + 4, l.y - 12);
      ctx.lineTo(l.x - 4, l.y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3d3550';
      ctx.beginPath();
      ctx.ellipse(l.x, l.y - 13, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const glowR = 44 * flicker * (0.4 + 0.6 * fade);
      const g = ctx.createRadialGradient(l.x, l.y - 18, 0, l.x, l.y - 18, glowR);
      g.addColorStop(0, `rgba(255,240,200,${0.55 * fade})`);
      g.addColorStop(0.42, `rgba(255,170,70,${0.3 * fade})`);
      g.addColorStop(1, 'rgba(255,110,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y - 18, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,246,214,${0.8 * fade})`;
      ctx.beginPath();
      ctx.ellipse(l.x, l.y - 22, 4.5 * flicker, 8 * flicker * (0.45 + 0.55 * fade), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // 两盏灯：亮芯（看得见的那盏）+ 一大圈很淡的光（"这一片都会被引过去"）
      this.light.addLight(l.x, l.y, LAMP_RADIUS * (0.4 + 0.6 * fade), 0.85 * fade, 0.05);
      this.light.addLight(l.x, l.y, LAMP_LURE * (0.55 + 0.45 * fade), 0.2 * fade, 0);
      this.light.addGlow(l.x, l.y, LAMP_RADIUS * 0.9 * fade, 0.45 * fade);
    }
    ctx.restore();
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

  /**
   * 地上的旋灯。三件事要看得出来：
   * **它有多大**（外圈那道淡淡的吸力边界）、**它在往里转**（三条旋臂 + 沿臂往里跑的碎屑），
   * 以及**它快要缩了**（越接近结束，整盏灯越小越亮——那一下炸就是它的收场）。
   *
   * 旋臂画成螺线（而不是同心圆）是刻意的：同心圆看起来像"围起来了"，螺线才像"在吸"。
   */
  private drawVortexes(ctx: CanvasRenderingContext2D): void {
    if (!this.vortexes.length) return;
    ctx.save();
    for (const v of this.vortexes) {
      const t = 1 - clamp(v.life / v.maxLife, 0, 1);
      const fade = clamp(v.life / 0.22, 0, 1); // 最后 0.22 秒开始收（免得"啪"地凭空消失）
      // 缩小的终点**就是**那一下爆炸的半径（`burst`）：画的圈和挨炸的圈是同一个数，
      // 所以"它要炸在哪儿"在收尾那几帧是看得出来的——不用另画一个预警圈，
      // 玩家看见旋臂缩到多小，那就是这一炸会碰到多远。
      const r = v.radius * (1 - t * (1 - VORTEX.burst));
      ctx.globalCompositeOperation = 'lighter';
      // 底：一圈往里暗下去的光（越靠中心越亮，方向感就在这里）
      const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, r);
      g.addColorStop(0, `rgba(198,232,255,${0.22 * fade})`);
      g.addColorStop(0.45, `rgba(120,158,255,${0.13 * fade})`);
      g.addColorStop(1, 'rgba(70,90,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
      ctx.fill();
      // 外圈那道吸力边界：吸力本身是看不见的，得给它一条线。
      // 它还是那道"它管到哪儿为止"的线——站在线外的怪一步都不会挪。
      // 画成断续的一圈（而不是一整道实线）：实线读起来像"一颗气泡/一个罩子"，
      // 断口才像"一道场"，而且它自己慢慢转，看上去是活的。
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(150,196,255,${0.42 * fade})`;
      const seg = 26;
      for (let s = 0; s < seg; s += 2) {
        const a0 = v.phase * 0.4 + (s / seg) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, r, a0, a0 + (Math.PI * 2) / seg);
        ctx.stroke();
      }
      // 三条旋臂（螺线：越靠中心越密，这就是"在吸"的形状）
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (let a = 0; a < 3; a += 1) {
        const base = v.phase + (a / 3) * Math.PI * 2;
        ctx.strokeStyle = `rgba(214,240,255,${0.62 * fade})`;
        ctx.beginPath();
        for (let s = 0; s <= 12; s += 1) {
          const k = s / 12; // 0 = 外圈 → 1 = 中心
          const rr = r * (1 - k) ** 1.25;
          const ang = base + k * 2.3;
          const px = v.x + Math.cos(ang) * rr;
          const py = v.y + Math.sin(ang) * rr;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // 沿旋臂往里跑的碎屑：一眼就看得见"有东西在被卷进去"
      for (let i = 0; i < 9; i += 1) {
        const k = (this.time * 0.85 + i / 9) % 1;
        const rr = r * (1 - k) ** 1.15;
        const ang = v.phase + i * 1.9 + t * VORTEX.spin * 2 + k * 2.4;
        const px = v.x + Math.cos(ang) * rr;
        const py = v.y + Math.sin(ang) * rr;
        ctx.fillStyle = `rgba(236,248,255,${0.75 * (1 - k) * fade})`;
        ctx.beginPath();
        ctx.arc(px, py, 2.6 - k * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 中心那点灯芯：它也是一盏灯，只是这盏往里照（所以芯是暖的、外圈是冷的）
      const core = 14 * (0.7 + t * 0.6);
      const cg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, core);
      cg.addColorStop(0, `rgba(255,246,226,${0.7 * fade})`);
      cg.addColorStop(0.35, `rgba(224,240,255,${0.45 * fade})`);
      cg.addColorStop(1, 'rgba(110,160,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(v.x, v.y, core, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /**
   * 地上的伏灯。四件事要一眼看得出来：
   * **在哪儿**（暖色的灯身与光）、**上弦了没有**（外圈那道进度弧，没转完就是还不能踩）、
   * **它能管多大一片**（上弦之后才出现的虚线触发圈——不该在还没上弦的时候就吓人），
   * 以及**它是不是已经被点着了引信**（地上那道从上一颗烧过来的火花，火花烧到头它就响）。
   * 快烧尽时灯身会暗下去：那是"这颗要没了，别指望它"的暗示。
   */
  private drawMines(ctx: CanvasRenderingContext2D): void {
    if (!this.mines.length) return;
    ctx.save();
    for (const m of this.mines) {
      // 引信点着了也算"亮着"：它已经不为踩踏服务了，而是马上一声
      const armed = m.arm <= 0 || m.fuse > 0;
      // 快烧尽（最后 1.6 秒）开始黯淡：不画个倒计时，而是让它的光弱下去
      const fade = clamp(m.life / 1.6, 0, 1);
      const pulse = 0.5 + Math.sin(this.time * 6 + m.phase) * 0.5;
      const flicker = 1 + Math.sin(this.time * 9 + m.phase * 3) * 0.06;
      // 一小片压在地上的影子：它是**摆件**，不是站着的灯（弃灯是站着的，伏灯是蹲着的）
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 4, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 引信：从上一颗雷烧到这一颗的那道火花。一串雷唯一看得见的部分就是它，
      // 所以画得显眼：烧过的路径留一道暗红，火花头是个亮点。
      if (m.fuse > 0) {
        const blow = 1 - clamp(m.fuse / MINE.chainFuse, 0, 1);
        const hx = m.fuseX + (m.x - m.fuseX) * blow;
        const hy = m.fuseY + (m.y - m.fuseY) * blow;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,110,40,0.45)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(m.fuseX, m.fuseY);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,196,90,0.3)';
        ctx.beginPath();
        ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,214,0.95)';
        ctx.beginPath();
        ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // 灯身：矮胖的灯笼。先画壳，再把光叠在壳上——
      // 顺序反过来（先光后壳）的时候，那点光会把壳糊成一团火球，看不出"这是盏灯"。
      ctx.fillStyle = '#241f2e';
      ctx.beginPath();
      ctx.moveTo(m.x - 9, m.y + 4);
      ctx.lineTo(m.x + 9, m.y + 4);
      ctx.lineTo(m.x + 6, m.y - 10);
      ctx.lineTo(m.x - 6, m.y - 10);
      ctx.closePath();
      ctx.fill();
      // 提梁：两根斜撑 + 一横，灯和火球的分界线就在这几笔上
      ctx.strokeStyle = '#4a4160';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x - 6, m.y - 10);
      ctx.lineTo(m.x - 3.5, m.y - 15);
      ctx.lineTo(m.x + 3.5, m.y - 15);
      ctx.lineTo(m.x + 6, m.y - 10);
      ctx.stroke();
      ctx.fillStyle = '#3a3350';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 4, 9.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.x - 8, m.y - 11);
      ctx.lineTo(m.x + 8, m.y - 11);
      ctx.lineTo(m.x + 5, m.y - 15);
      ctx.lineTo(m.x - 5, m.y - 15);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      // 罩子里那点芯：上弦之前是冷的（青灰），上弦之后是暖的（琥珀）——颜色本身就是状态。
      // 半径收得很小：伏灯的亮该是"灯芯"，不是"炸开的那一下"（那一下由 blast 去画）。
      const coreR = (armed ? 13 : 9) * (0.55 + 0.45 * fade) * flicker;
      const cg = ctx.createRadialGradient(m.x, m.y - 4, 0, m.x, m.y - 4, coreR);
      if (armed) {
        cg.addColorStop(0, `rgba(255,244,212,${0.92 * fade})`);
        cg.addColorStop(0.45, `rgba(255,178,80,${0.42 * fade})`);
        cg.addColorStop(1, 'rgba(255,120,20,0)');
      } else {
        cg.addColorStop(0, `rgba(206,232,250,${0.62 * fade})`);
        cg.addColorStop(0.5, `rgba(120,172,214,${0.28 * fade})`);
        cg.addColorStop(1, 'rgba(90,140,190,0)');
      }
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(m.x, m.y - 4, coreR, 0, Math.PI * 2);
      ctx.fill();
      // 洒在脚边地上的那一圈光（比弃灯小得多：它只是一盏小灯，别和主灯抢）
      const poolR = 30 * (0.55 + 0.45 * fade) * (1 + pulse * 0.06);
      const pg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, poolR);
      pg.addColorStop(0, armed ? `rgba(255,168,78,${0.2 * fade})` : `rgba(120,180,220,${0.13 * fade})`);
      pg.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(m.x, m.y, poolR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // 上弦进度：一圈从正上方顺时针合拢的弧；合拢了就等于"能踩了"
      if (!armed) {
        ctx.globalAlpha = 0.5 + pulse * 0.25;
        ctx.strokeStyle = '#bfe0ff';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(m.x, m.y - 2, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - m.arm / MINE.arm));
        ctx.stroke();
      } else if (m.fuse <= 0) {
        // 触发圈：虚线，随呼吸一涨一缩——它管的范围看得见，才谈得上"布"这个字。
        // （引信烧着的那颗不画：它已经不为"等谁来踩"服务了）
        ctx.globalAlpha = (0.16 + pulse * 0.12) * fade;
        ctx.strokeStyle = '#ffb14e';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 9]);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.trigger * (0.97 + pulse * 0.03), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawGrounds(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 「倾灯」倒出来的那片油火自成一格：别的火是"一团径向渐变"，铺满这么一大片会读成
    // "地上放了一盏灯"。它是这一版的招牌，得读成"地上真有一摊正在烧的油"（见 drawOilFire）。
    for (const g of this.grounds) {
      if (g.ignites) this.drawOilFire(ctx, g);
    }
    for (const g of this.grounds) {
      if (g.kind !== 'mud' && g.kind !== 'frost') continue;
      // 滞行雾与霜冻都是"压暗"而不是"发光"：用普通混合盖一层，再用虚线勾出边界，
      // 让玩家一眼知道"这块地会拖住我"。
      const icy = g.kind === 'frost';
      const fade = clamp(g.life / (icy ? 6 : 8), 0, 1);
      ctx.globalAlpha = fade * 0.72;
      const mg = ctx.createRadialGradient(g.x, g.y, g.r * 0.22, g.x, g.y, g.r);
      if (icy) {
        mg.addColorStop(0, 'rgba(24,44,58,0.9)');
        mg.addColorStop(0.72, 'rgba(72,124,150,0.6)');
        mg.addColorStop(1, 'rgba(150,210,240,0)');
      } else {
        mg.addColorStop(0, 'rgba(20,28,38,0.94)');
        mg.addColorStop(0.72, 'rgba(40,56,72,0.66)');
        mg.addColorStop(1, 'rgba(70,92,116,0)');
      }
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * (0.42 + 0.12 * Math.sin(g.life * 3));
      ctx.strokeStyle = icy ? '#cfeaff' : '#b6cfe2';
      ctx.lineWidth = 2.4;
      ctx.setLineDash(icy ? [4, 7] : [9, 11]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * 0.97, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.grounds) {
      if (g.kind === 'mud' || g.ignites) continue;
      const g2 = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      if (g.kind === 'frost') {
        // 给霜冻一点冷光：它藏在黑暗里的话，玩家根本没机会躲
        g2.addColorStop(0, 'rgba(150,215,255,0.2)');
        g2.addColorStop(1, 'rgba(90,150,200,0)');
      } else if (g.kind === 'poison') {
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

  /**
   * 「倾灯」倒出来的那片油火（**垫底那一半**：油渍 + 火体柔光）。
   *
   * 分两层画，是因为它和别的地面不一样——别的火只是"地上一块会发光的地皮"，
   * 这一片是**烧在敌人脚下**的：一瓢永远锁着最前那只怪落下去，所以火心必然被那一群怪盖住。
   * 全画在实体底下的话，最该被看见的一团火永远只露出一圈边。所以拆成两半：
   *   - 这一半（油渍 + 三团柔光）跟别的地面一起画在实体**下面**；
   *   - 火舌那一半画在敌人**上面**（见 drawGroundTops）——火苗本来就是从它们身上窜起来的，
   *     这样哪怕一群人正站在火里，也看得见他们在烧。
   *
   * ① 油渍（正常混合）：几团圆不规则地摊开，把地面压暗——油是吸光的，不是发光的。
   * ③ 火体：三团圆叠在一起，一团比一团小、一团比一团白。
   */
  private drawOilFire(ctx: CanvasRenderingContext2D, g: Ground): void {
    const fade = clamp(g.life / 1.1, 0, 1); // 烧到最后一点慢慢收，不是"啪"一下没了
    const ph = g.phase ?? 0;
    const t = this.time;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = 0; i < 7; i += 1) {
      const a = ph + i * 0.8976; // 一片撒得不规则的油渍（等分的话会读成一个正圆）
      const d = g.r * (0.2 + 0.13 * ((i * 3) % 3));
      const rr = g.r * (0.44 + 0.12 * ((i * 5) % 3));
      ctx.globalAlpha = (0.17 + 0.07 * ((i * 3) % 3)) * fade;
      ctx.fillStyle = '#150c07';
      ctx.beginPath();
      ctx.arc(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, rr, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    const breath = 0.86 + 0.14 * Math.sin(t * 3.4 + ph * 2);
    const body = (ox: number, oy: number, rr: number, al: number, c0: string, c1: string): void => {
      const grd = ctx.createRadialGradient(g.x + ox, g.y + oy, 0, g.x + ox, g.y + oy, rr);
      grd.addColorStop(0, c0);
      grd.addColorStop(1, c1);
      ctx.globalAlpha = al * breath * fade;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(g.x + ox, g.y + oy, rr, 0, 6.2832);
      ctx.fill();
    };
    body(0, 0, g.r, 0.34, 'rgba(255,120,44,0.8)', 'rgba(255,70,16,0)');
    body(g.r * 0.07, -g.r * 0.05, g.r * 0.62, 0.38, 'rgba(255,170,72,0.8)', 'rgba(255,110,30,0)');
    body(-g.r * 0.05, -g.r * 0.1, g.r * 0.3, 0.42, 'rgba(255,234,172,0.9)', 'rgba(255,150,60,0)');
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * 「倾灯」那片火的**上面那一半**：火舌 + 一圈热边。画在敌人之后、玩家之前。
   *
   * 火舌按**面积**撒（半径取 √u）。撒在半径上的话火会自己排成一圈、中间留个洞——
   * 那是"一圈灯"，不是"一片火"。外焰一朵 + 内焰一朵 = 一条会抖的舌头，每朵还罩一点柔光，
   * 因为它们是描出来的形状（边是硬的），罩一层雾边才化得开。
   */
  private drawGroundTops(ctx: CanvasRenderingContext2D): void {
    let any = false;
    for (const g of this.grounds) {
      if (!g.ignites) continue;
      if (!any) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        any = true;
      }
      const fade = clamp(g.life / 1.1, 0, 1);
      const ph = g.phase ?? 0;
      const t = this.time;
      // 每一朵的"身高 / 胖瘦 / 抖得多快"都由一个只跟序号和相位有关的散列给：
      // 几朵一个样的话，一眼就是"摆了一排"，而不是"在烧"。
      const hash = (k: number): number => {
        const s2 = Math.sin(k * 12.9898 + ph * 78.233) * 43758.5453;
        return s2 - Math.floor(s2);
      };
      const n = Math.round(clamp(g.r / 6.5, 10, 20));
      for (let i = 0; i < n; i += 1) {
        const a = ph + i * 2.39996; // 黄金角：撒得匀又不成行
        const d = g.r * 0.68 * Math.sqrt((i + 0.5) / n);
        const r1 = hash(i);
        const r2 = hash(i + 53);
        const wob = 0.5 + 0.5 * Math.sin(t * (5 + r1 * 3) + i * 1.7 + ph * 3);
        const bx = g.x + Math.cos(a) * d;
        const by = g.y + Math.sin(a) * d;
        const core = 1 - clamp(d / g.r, 0, 1);
        // 高的一朵拔得很高、矮的一朵只有一小截：参差才像火
        const h = g.r * (0.14 + 0.72 * r1) * (0.7 + 0.45 * core) * (0.8 + 0.35 * wob);
        const w = g.r * (0.045 + 0.075 * r2);
        const tip = bx + Math.sin(t * 4.4 + i * 2.3 + ph) * w * 0.6; // 火尖自己也会飘
        ctx.globalAlpha = (0.16 + 0.22 * wob) * (0.7 + 0.5 * r2) * fade;
        ctx.fillStyle = core > 0.45 ? '#ff9a34' : '#ff6a1e';
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 1.2, by - h * 0.5, tip, by - h);
        ctx.quadraticCurveTo(bx + w * 1.2, by - h * 0.5, bx + w, by);
        ctx.fill();
        // 内焰只给中间那几朵（边上也白的话，整片会糊成一团奶白）
        if (core > 0.2) {
          ctx.globalAlpha = (0.14 + 0.26 * wob) * core * fade;
          ctx.fillStyle = core > 0.55 ? '#fff0c0' : '#ffbc5c';
          ctx.beginPath();
          ctx.moveTo(bx - w * 0.44, by);
          ctx.quadraticCurveTo(bx - w * 0.5, by - h * 0.3, tip, by - h * (0.5 + 0.25 * core));
          ctx.quadraticCurveTo(bx + w * 0.5, by - h * 0.3, bx + w * 0.44, by);
          ctx.fill();
        }
      }
      // 边：一圈低伏的虚线热边（"这片火烧到哪儿"要看得见边，不然玩家分不清自己站没站进去）
      ctx.globalAlpha = (0.2 + 0.1 * Math.sin(t * 2.6 + ph * 2)) * fade;
      ctx.strokeStyle = '#ff7a2f';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * 0.96, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (any) ctx.restore();
  }

  /**
   * 手动瞄准的落点标记（触屏，见 TouchControls 里"屏幕右侧那块地方"那一段）。
   *
   * 两件东西：脚下一个小扇面（"灯偏向这边"）+ 落点上那一圈**和那片火一样大**的圆——
   * 半径是 Player.pourAim 按 Game.explode 里同一串乘法算出来的，不是另估一个数：
   * 标记要是和真落下来的火对不上，这个标记就是在骗人。
   *
   * 画成什么样子是被这一版的教训定的：
   * - 方位用**压扁的扇形**（和掠影符文、险境预警是同一套"画在地上 = 规则"的语言），
   *   不画屏幕上飘的箭头：一片火是留在战场上的东西，箭头会让它读成 HUD；
   * - 落点那一圈用**正圆**（和险境预警一样）：它标的是真圆的火，压扁会让人误判范围；
   * - 中间那串点是"从灯到落点"的一条线，手指推得越远，点就撒得越开——
   *   距离是这一版新给玩家的那半个自由度，得看得见；
   * - 落地那圈是**只填一部分的**（从正上方顺时针，和掠影符文、按钮上的冷却圈同一套仪表语言）：
   *   填满的那一帧就是这一瓢出去的那一帧。倾灯的"上膛"本来就只有一帧（它是自动开火的，
   *   油够了的那一帧它就出去了），所以能预告的只有"离那一下还有多远"——
   *   而这件事正好是玩家按住手指时最想知道的：**这一条线要举多久**。
   */
  private drawPourAim(ctx: CanvasRenderingContext2D): void {
    const aim = this.player.pourAim;
    if (!aim) return;
    const p = this.player;
    const ex = p.x + Math.cos(aim.angle) * aim.away;
    const ey = p.y + Math.sin(aim.angle) * aim.away;
    const charge = aim.charge;
    const armed = charge >= 1;
    const breath = 0.5 + Math.sin(this.time * 6) * 0.5;
    ctx.save();
    ctx.lineCap = 'round';

    // 脚下的扇形：压扁（ry 只有 rx 的一半）——画在地上的东西都是扁的
    ctx.globalAlpha = armed ? 0.34 + breath * 0.12 : 0.2 + charge * 0.1;
    ctx.fillStyle = '#ffb14e';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 46, 24, 0, aim.angle - 0.42, aim.angle + 0.42);
    ctx.closePath();
    ctx.fill();

    // 从灯到落点的一串点：手指推得越远，点撒得越开（距离是这一版新给的那半个自由度）
    ctx.globalAlpha = 0.3 + charge * 0.25;
    ctx.fillStyle = '#ffb14e';
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 5;
      ctx.beginPath();
      ctx.arc(p.x + (ex - p.x) * t, p.y + (ey - p.y) * t, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 落点那一圈 = 真要落下来的那片火。底圈是"容器"，亮的那段弧是"离倒出去还有多远"
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#8a6a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, aim.pool, 0, Math.PI * 2);
    ctx.stroke();
    // 从正上方顺时针填：填满 = 这一瓢出去（和按钮上那些冷却圈是同一种读法）
    if (charge > 0.002) {
      ctx.globalAlpha = armed ? 0.6 + breath * 0.3 : 0.42 + charge * 0.24;
      ctx.strokeStyle = armed ? '#ffd07a' : '#ffb14e';
      ctx.lineWidth = armed ? 3 : 2.4;
      ctx.beginPath();
      ctx.arc(ex, ey, aim.pool, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.stroke();
    }
    // 正中心那一小撮：这就是落点（爆开的那一圈，半径小得多）
    ctx.globalAlpha = 0.35 + charge * 0.4;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd07a';
    ctx.fill();
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
