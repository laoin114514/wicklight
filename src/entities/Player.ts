import { baseStats, PASSIVE_MAP, type PlayerStats } from '../data/upgrades';
import { RELIC_MAP, TRIBES, type RelicMods, type RelicTribeId } from '../data/relics';
import { weaponAt, WEAPON_MAP } from '../data/weapons';
import { applySlow, type Enemy, type EnemySystem } from './enemies/Enemy';
import type { ParticleSystem } from './Particle';
import type { ProjectileSystem } from './Projectile';
import { clamp, TAU } from '../core/MathUtils';
import { GRAZE } from '../data/graze';
import { WICK } from '../data/wick';
import { AURA } from '../data/aura';
import { POUR } from '../data/pour';
import { NOVA } from '../data/nova';

/**
 * 冲刺 / 燃爆按下缓冲的长度（秒）：冷却还差这么久以内按下的操作，冷却一转完就替他放出去。
 * 冲刺 0.2 是"手比冷却早了半拍"的那一段；燃爆短一点，见 Player.dashBuffer 上那一段的解释。
 */
const DASH_BUFFER = 0.2;
const NOVA_BUFFER = 0.15;
/**
 * 「收力」（v87）：冲刺跑完之后人是**滑**着的——残余速度是走速的 3.4 倍（748px/s），
 * 手上那个方向键得花 20 帧（0.33 秒）才扳得回来（探针实测）。
 * 这一点惯性是冲刺的一部分（顺着它跑，那一发本来就多送几十像素），但它只该在**你顺着它**的时候存在：
 * 逆着推，就该当场刹住。这是乘在走路那个加速度上的倍率，而且**只在"逆着推、且速度还高于走速"时**生效——
 * 寻常走路的掉头只要 7 帧（0.12 秒）、松手滑停也照旧（那是惯性该有的样子），两样都不该被这一条顺手改掉。
 * 4 这个数是台架量出来的：冲刺收尾按住反方向，起步 20 帧 → **3 帧**、走开 30px 28 帧 → **15 帧**；
 * 2 倍只有 12 帧（不够）、6 倍会变成"一帧急停"（比走路掉头还快，手感发硬）。
 */
const DASH_BRAKE = 4;
/** 逆着推、而且残余速度还在走速两倍以上的那一帧：在地上留一撮灰（见走路那一段里的注释）。 */
const BRAKE_DUST = 2;
/** 燎灯脉冲的可见角度采样数（v104）：72 段在 320px 外约每 28px 一段。 */
const AURA_ARC_SEGMENTS = 72;

/** 把一段圆形范围按"看得见 / 看不见"切成连续弧段；可见数组也给边缘火星挑角度。 */
function sightArcs(
  x: number,
  y: number,
  radius: number,
  sight: (x0: number, y0: number, x1: number, y1: number) => boolean,
): { visible: boolean[]; arcs: [number, number][] } {
  const visible: boolean[] = [];
  for (let i = 0; i < AURA_ARC_SEGMENTS; i += 1) {
    const a = ((i + 0.5) / AURA_ARC_SEGMENTS) * TAU;
    visible.push(sight(x, y, x + Math.cos(a) * radius, y + Math.sin(a) * radius));
  }
  const arcs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= AURA_ARC_SEGMENTS; i += 1) {
    const on = i < AURA_ARC_SEGMENTS && visible[i];
    if (on && start < 0) start = i;
    else if (!on && start >= 0) {
      arcs.push([(start / AURA_ARC_SEGMENTS) * TAU, (i / AURA_ARC_SEGMENTS) * TAU]);
      start = -1;
    }
  }
  return { visible, arcs };
}

export interface PlayerContext {
  enemies: EnemySystem;
  projectiles: ProjectileSystem;
  particles: ParticleSystem;
  addLight: (x: number, y: number, r: number, i: number, flicker?: number) => void;
  addGlow: (x: number, y: number, r: number, i: number) => void;
  audio: (name: string) => void;
  shake: (amount: number) => void;
  hurt: (amount: number) => void;
  hit: (e: Enemy, damage: number, crit: boolean, kx: number, ky: number, knockback: number, opts?: { burn?: number; slow?: number; source?: string }) => boolean;
  findTarget: (x: number, y: number, maxDist: number, requireLight?: boolean) => Enemy | null;
  /**
   * 「光只沿看得见的直线走」（v88）：(x0,y0) 到 (x1,y1) 这条直线**通不通**（中间没墙）。
   * 燎灯与环形火环用这一句；墙在地图上，Player 不认识地图，所以这一句由 Game 提供。
   */
  sight: (x0: number, y0: number, x1: number, y1: number) => boolean;
  /** 「倾灯」倒了一瓢：把"这一瓢花了多少油"记回这一局的账上（结算面板要看） */
  pour: (cost: number) => void;
  chainZap: (x: number, y: number, damage: number, jumps: number, range: number, color: string, opts: { burn?: number; slow?: number; source?: string }) => void;
  /** 光矛：一条贯穿光束，沿途全部命中 */
  beam: (
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    damage: number,
    color: string,
    opts?: { burn?: number; slow?: number; knockback?: number; source?: string },
  ) => void;
  /** 燃爆真正放出去的那一刻（用于悬赏计数等）。 */
  onNova: () => void;
  /** 「燎灯」的一次脉冲真的烫到了 `hits` 只（图鉴记一条、成就数一次；空转不报）。 */
  onAura: (hits: number) => void;
  /**
   * 伏灯：在地上布一颗雷。
   * 位置由玩家给（Player 只知道"我朝哪儿走"），落点判定与爆炸都在 Game 里。
   */
  mine: (x: number, y: number, damage: number, radius: number, trigger: number, fire: number, source: string) => void;
  /**
   * 旋灯：在某处转起一盏往里吸的灯，转完缩成一下炸。
   * `drag` > 0 的那把连弹幕一起卷（卷到中心就吞掉）。
   */
  vortex: (x: number, y: number, damage: number, radius: number, burn: number, drag: number, source: string) => void;
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
  /** 「拨芯」时的减伤（遮光：0.25 = 少挨两成五） */
  wickGuard: number;
  /** 「拨芯」时每次命中添的灼烧层数（暗火：1 = 一层） */
  wickEmber: number;
  /** 「拨芯」时的移速加成（夜步：0.12 = 快 12%） */
  wickStride: number;
  /** 「拨芯」时每秒回多少灯油（守芯：0.003 = 每秒 0.3%） */
  wickThrift: number;
  /** 「漫光」（遗物）：灯火半径 +10% —— 它和拨芯是两条相反的路 */
  lightSpread: number;
  /** 「旺火」（遗物）：光里每多一只，那一下每只多受的倍率 */
  auraCrowd: number;
  /** 「吮灯」（遗物）：每烫到一只敌人回的灯油（占油桶比例） */
  auraSiphon: number;
  /** 「烟熏」（遗物）：被烫到的敌人减速多少 */
  auraSnare: number;
  /** 「浇油」（遗物）：倾灯那片火每次续的灼烧层数加成 */
  pourStacks: number;
  /** 「大瓢」（遗物）：倾灯火海的半径加成 */
  pourSpread: number;
  /** 「大瓢」（遗物）：倾灯火海多烧几秒 */
  pourLife: number;
  /** 「拾油」（遗物）：死在你油火里的怪回多少油 */
  pourEmber: number;
  /** 「烬护」（遗物）：站在你自己的油火里的减伤 */
  pourShelter: number;
  /** 「灯阵」（遗物）：地上能多留几颗伏灯 */
  mineMax: number;
  /** 「灯阵」（遗物）：伏灯能多等几秒才自己烧尽 */
  mineLife: number;
  /** 「接火」（遗物）：伏灯连爆够得着的半径加成 */
  mineChain: number;
  /** 「香饵」（遗物）：灯蛾能闻到伏灯的距离加成 */
  mineLure: number;
  /** 「香饵」（遗物）：被伏灯炸死的灯蛾每只回多少油 */
  mineMothOil: number;
  /** 「绊线」（遗物）：伏灯炸到的敌人被拖住多少（移速倍率） */
  mineSnare: number;
  /** 「张网」（遗物）：旋灯吸入半径加成 */
  vortexSpread: number;
  /** 「张网」（遗物）：旋灯多转几秒 */
  vortexTime: number;
  /** 「标灯」（遗物）：被拽住的敌人受到所有伤害的加成 */
  vortexMark: number;
  /** 「榨油」（遗物）：收网打到的每一只回多少油 */
  vortexHarvest: number;
  /** 「缠网」（遗物）：圈里的敌人被拖住多少 */
  vortexSnare: number;
  /** 「灯罩」（遗物）：弃灯的引怪半径加成 */
  lampLure: number;
  /** 「灯罩」（遗物）：弃灯多亮几秒 */
  lampSpan: number;
  /** 「焚灯」（遗物）：弃灯被吃掉时炸开一圈（> 0 就是开了） */
  lampBurst: number;
  /** 「拾灯」（遗物）：弃灯被吃掉时，朝它走着的每一只回多少油 */
  lampEmber: number;
  /** 「灯晕」（遗物）：被弃灯引着的敌人走在它的光里慢多少 */
  lampSnare: number;
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
  flags: PlayerFlags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0, wickGuard: 0, wickEmber: 0, wickStride: 0, wickThrift: 0, lightSpread: 0, auraCrowd: 0, auraSiphon: 0, auraSnare: 0, pourStacks: 0, pourSpread: 0, pourLife: 0, pourEmber: 0, pourShelter: 0, mineMax: 0, mineLife: 0, mineChain: 0, mineLure: 0, mineMothOil: 0, mineSnare: 0, vortexSpread: 0, vortexTime: 0, vortexMark: 0, vortexHarvest: 0, vortexSnare: 0, lampLure: 0, lampSpan: 0, lampBurst: 0, lampEmber: 0, lampSnare: 0 };
  oil = 1;
  oilMax = 1;
  /**
   * 「深宵之约」带来的灯油耗率倍率（v79，1 = 不变、1.4 = 烧快四成）。
   *
   * 为什么不塞进 `shrineMods`（那也是"这一局的长期修正"）：两个来源要能分开读——
   * 祭坛那几笔是玩家**中途**在祭坛上一笔一笔换来的（`shrineMods.oilDecayMult *= 0.75` 那些），
   * 而之约是**开局前**就定下的、这一局不会变的一件事。混在同一个袋子里，构筑总览就没法把
   * "你背了几条约"单列一行（那是玩家最该看见的一件事），而且以后任何一处"清掉这一局的临时修正"
   * 的写法都会顺手把它一起洗掉——那种错在画面上看不出来，只是"油耗好像回到正常了"。
   * 所以它单独走一条路：在 `computeStats` 里和 `shrineMods` 挨着乘上去，
   * 那是"重算一身属性"的**唯一**出口（拉掉遗物、升级、拨芯都会经过它）。
   */
  pactOilDecayMult = 1;
  /** 本局内由祭坛带来的长期修正（recomputeStats 会重新套用）。 */
  shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
  /**
   * 局外解锁带来的修正：也要走 recomputeStats，不然中途重算（拿到遗物）就会把它冲掉。
   * `damageMult` 是 v80「薪火 · 薪柴」那一笔（局外第一次动火力），走同一条路。
   */
  metaMods = { moveSpeedMult: 1, damageMult: 1 };
  /** 本局由「灯台」累积的余温：点亮的灯台越多，灯火越旺、伤害越高。 */
  pyreMods = { damageMult: 1, lightMult: 1 };
  brightness = 1;
  lightRadius = 300;
  /**
   * 「拨芯」（见 `data/wick.ts`）：`wickOn` 是这个开关本身（玩家按一下翻一格），
   * `wick` 是这一帧"拧到哪儿了"（0 = 全开，1 = 拨到底）。
   *
   * 为什么要两个数：状态是一格一格的（开 / 关），可**画面**不该一格一格地跳——
   * 灯芯被拨小是有过程的，几个乘数按 `wick` 插值，玩家看到的是"火矮下去"，
   * 而不是"啪"地换了一张画面。速度差（拨小快、拨回来慢）写在 data/wick.ts 里。
   */
  wickOn = false;
  wick = 0;
  /** 本局拨着芯累计走了多少秒（成就 `wickwalk` 用）。 */
  wickTime = 0;
  /** 局外解锁带来的灯火半径倍率（与灯台余温、地形各自独立） */
  baseLightMult = 1;
  /**
   * 难度档位带来的**灯油进项**倍率（放松 1.35 / 标准 1 / 噩梦 0.75，由 Game 在开局时下发）。
   *
   * 它乘在"玩的时候一直在发生的那三条进项"上：击杀掉落、擦身回油、灯台余温。
   * 为什么是进项、而且三条都要算：
   *   · 「放松」的敌人**更少**（countMult 1.1 vs 标准 1.35），击杀掉落本来就跟着变少——
   *     只放大掉落的话，越弱的档位反而越缺油，"灯油充足"这句承诺是反着的；
   *   · 擦身回油与灯台余温是同一种"我靠本事补的油"，只算一条就等于告诉玩家
   *     "这个档位只对某一种玩法生效"，而这三条本来就是一回事。
   * 一次性的结算（悬赏奖励、开局补给、夜咒补油）不乘它：那些不是"进项"，是一次给的。
   */
  difficultyOilMult = 1;
  invuln = 0;
  dashTimer = 0;
  dashCd = 0;
  /** 冲刺 / 燃爆这一次冷却的总时长：触屏按钮上那个"冷却圈"要按比例画，
   *  只有剩余时间画不出角度——冲刺的时长随遗物/词缀变化，燃爆随急速变化。 */
  dashCdMax = 0;
  dashDirX = 0;
  dashDirY = 0;
  /**
   * 一共冲刺过几次。
   *
   * 给「余烬风」用：火种粘在身上时要靠**一次新的冲刺**抖掉，而 Game 只看得到
   * "现在这一帧在不在冲刺里"（dashTimer > 0），分不清"刚起步的那一下"和"同一段冲刺的后半截"。
   * 记一个只会往上加的数，比去比 dashTimer 的跳动干净，也测得住。
   */
  dashCount = 0;
  novaCd = 0;
  novaCdMax = 0;
  /**
   * 冲刺 / 燃爆的「按下缓冲」：冷却还差一点点的时候按下的那一下，先替他记着。
   *
   * 为什么要有这个东西：冷却剩 0.1 秒时按下冲刺，原来是什么都不会发生——
   * 玩家看到的却是"我按了，人没动"。这不是难度，这是把玩家的操作丢了；
   * 尤其在"贴脸了必须立刻走"的那一瞬间，玩家按下的时机本来就只差那么一点。
   *
   * 为什么两个数不一样：冲刺是位移，记久一点没关系（0.2 秒内到期的冷却，冲出去正好是他想要的）；
   * 燃爆要花掉一桶油里的一大块，记忆得短一点——"我早就不想放了，它自己放出去"比"没按上"更糟。
   * 都按**秒**算、跟着 dt 走，所以掉帧和 120Hz 上是同一段真实时间。
   */
  dashBuffer = 0;
  novaBuffer = 0;
  /** 上一帧这两个键是不是按着：用来认出"这一帧刚按下"（缓冲只对**按下的那一下**生效）。 */
  private dashHeld = false;
  private novaHeld = false;
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
  /** 行走倾身与提灯惯性：只服务绘制，不参与碰撞或速度计算。 */
  private leanF = 0;
  private leanS = 0;
  private stepClock = 0;
  private footstep = 0;
  private footSide = 1;
  private cooldowns = new Map<string, number>();
  private orbit: OrbitState = { angle: 0, hitCooldown: new Map() };
  /**
   * 「燎灯」的心跳：离下一遍"往外烫"还有多久，以及上一遍留下的余温（0~1，只给画面用）。
   * 整盏灯只有一个计时器——不按怪挂冷却（见 data/aura.ts 里为什么）。
   */
  private auraCd = 0;
  private hitFlash = 0;
  damageMult = 1;
  oilDecayPerSec = 0.018;
  /**
   * 脚下有没有**自己倒出来的**那片油火（倾灯）：每帧由 Game 重新写入。
   * 它只服务一件事——「烬护」（遗物）的减伤要认"站在火里"这个状态。
   * 和 `terrainSlow` 同一个写法：让 Game 每帧重算，而不是让地面自己去改玩家的属性
   * （那样一个技能就可能把玩家的数改得收不回来）。
   */
  inOilFire = false;
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
  /**
   * 手动瞄准（触屏）：手指正按着在瞄时的角度，没在瞄就是 null。
   * 见 TouchControls 里"屏幕右侧那块地方"那一段——倾灯那一瓢的方向与距离都从这里来。
   */
  private aimManual: number | null = null;
  /** 同时按下去了多远（0~1）——倾灯那一瓢落在射程的几成处由它插值。 */
  private aimPull = 0;

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
    this.flags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0, wickGuard: 0, wickEmber: 0, wickStride: 0, wickThrift: 0, lightSpread: 0, auraCrowd: 0, auraSiphon: 0, auraSnare: 0, pourStacks: 0, pourSpread: 0, pourLife: 0, pourEmber: 0, pourShelter: 0, mineMax: 0, mineLife: 0, mineChain: 0, mineLure: 0, mineMothOil: 0, mineSnare: 0, vortexSpread: 0, vortexTime: 0, vortexMark: 0, vortexHarvest: 0, vortexSnare: 0, lampLure: 0, lampSpan: 0, lampBurst: 0, lampEmber: 0, lampSnare: 0 };
    this.shrineMods = { damageMult: 1, maxHpMult: 1, oilDecayMult: 1, moveSpeedMult: 1, critChance: 0, goldMult: 1 };
    this.pyreMods = { damageMult: 1, lightMult: 1 };
    // 之约在 `Game.newRun` 里按选择重新写一遍；这里先归 1，免得上一局背了 7 条的那笔账
    // 静悄悄地跟到下一局（新局不背之约时，玩家只会觉得"油耗怎么还是快的"）。
    this.pactOilDecayMult = 1;
    this.weapons.set(model.weapon, 1);
    this.addPassive(model.passive, 1);
    this.oil = 1;
    this.brightness = 1;
    this.wickOn = false;
    this.wick = 0;
    this.wickTime = 0;
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
    this.metaMods = { moveSpeedMult: 1, damageMult: 1 };
    this.curseOilMult = 1;
    this.difficultyOilMult = 1;
    this.invuln = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.dashCdMax = 0;
    this.dashCount = 0;
    this.novaCd = 0;
    this.novaCdMax = 0;
    this.dashBuffer = 0;
    this.novaBuffer = 0;
    this.dashHeld = false;
    this.novaHeld = false;
    this.overburnGlow = 0;
    this.ashTimer = 0;
    this.refundLeft = 0;
    this.refundRate = 0;
    this.leanF = 0;
    this.leanS = 0;
    this.stepClock = 0;
    this.footstep = 0;
    this.footSide = 1;
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
    const flags: PlayerFlags = { extraProjectiles: 0, lifesteal: 0, chill: 0, contactMult: 1, goldMult: 1, novaHeal: 0, lowOilDamage: 0, novaBuff: 0, pyreBonus: 1, pyreGuard: 1, grazeHeat: 0, grazeOil: 0, blazeTime: 0, blazeGuard: 0, overburnDamage: 0, overburnRefund: 0, overburnEase: 0, overburnGuard: 0, wickGuard: 0, wickEmber: 0, wickStride: 0, wickThrift: 0, lightSpread: 0, auraCrowd: 0, auraSiphon: 0, auraSnare: 0, pourStacks: 0, pourSpread: 0, pourLife: 0, pourEmber: 0, pourShelter: 0, mineMax: 0, mineLife: 0, mineChain: 0, mineLure: 0, mineMothOil: 0, mineSnare: 0, vortexSpread: 0, vortexTime: 0, vortexMark: 0, vortexHarvest: 0, vortexSnare: 0, lampLure: 0, lampSpan: 0, lampBurst: 0, lampEmber: 0, lampSnare: 0 };
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
    stats.oilDecayMult *= this.pactOilDecayMult;
    stats.moveSpeed *= sm.moveSpeedMult;
    stats.critChance += sm.critChance;
    flags.goldMult *= sm.goldMult;
    stats.damageMult *= this.pyreMods.damageMult;
    stats.moveSpeed *= this.metaMods.moveSpeedMult;
    stats.damageMult *= this.metaMods.damageMult;
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
    // 「拨芯」这条线：四件遗物各自只动一个数，条件都是同一个 `player.dimmed`。
    // 减伤取大（它是"少挨多少"的一个比例，重复拿到不该叠成无敌），其余三个往上加
    // （和「焰路」「爆灯」那两条同一个写法）。
    if (m.wickGuard) flags.wickGuard = Math.max(flags.wickGuard, m.wickGuard);
    flags.wickEmber += m.wickEmber ?? 0;
    flags.wickStride += m.wickStride ?? 0;
    flags.wickThrift += m.wickThrift ?? 0;
    // 「燎灯」这条线（v75）：四个键各记各的账。`lightSpread` 刻意不叫 auraLight——
    // 它改的是**这盏灯**的半径，照到的东西不止燎灯一件（别的武器靠它索敌更远）。
    flags.lightSpread += m.lightSpread ?? 0;
    flags.auraCrowd += m.auraCrowd ?? 0;
    flags.auraSiphon += m.auraSiphon ?? 0;
    flags.auraSnare = Math.max(flags.auraSnare, m.auraSnare ?? 0);
    // 「倾灯」这条线（v76）：前三个是"那一瓢本身"，直接相加；烬护是减伤，取最强的那一件。
    flags.pourStacks += m.pourStacks ?? 0;
    flags.pourSpread += m.pourSpread ?? 0;
    flags.pourLife += m.pourLife ?? 0;
    flags.pourEmber += m.pourEmber ?? 0;
    flags.pourShelter = Math.max(flags.pourShelter, m.pourShelter ?? 0);
    // 「伏灯」这条线（v77）：前五个是"这一片雷阵本身"，直接相加；绊线是减速，取最强的那一件。
    flags.mineMax += m.mineMax ?? 0;
    flags.mineLife += m.mineLife ?? 0;
    flags.mineChain += m.mineChain ?? 0;
    flags.mineLure += m.mineLure ?? 0;
    flags.mineMothOil += m.mineMothOil ?? 0;
    flags.mineSnare = Math.max(flags.mineSnare, m.mineSnare ?? 0);
    // 「旋灯」这条线（v78）：前四个是"这一网本身"，直接相加；缠网是减速，取最强的那一件。
    flags.vortexSpread += m.vortexSpread ?? 0;
    flags.vortexTime += m.vortexTime ?? 0;
    flags.vortexMark += m.vortexMark ?? 0;
    flags.vortexHarvest += m.vortexHarvest ?? 0;
    flags.vortexSnare = Math.max(flags.vortexSnare, m.vortexSnare ?? 0);
    // 「弃灯」这条线（v83）：两个"这一盏灯本身"（半径 / 寿命）相加，
    // 减速取最强的那一件；「焚灯」是个开关（有了就炸）；「拾灯」按只结算、累加。
    flags.lampLure += m.lampLure ?? 0;
    flags.lampSpan += m.lampSpan ?? 0;
    flags.lampBurst = Math.max(flags.lampBurst, m.lampBurst ?? 0);
    flags.lampEmber += m.lampEmber ?? 0;
    flags.lampSnare = Math.max(flags.lampSnare, m.lampSnare ?? 0);
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
    // 「拨芯」压在最外一层：爆灯、灯焰高涨、低油增伤那些加成也一起跟着缩——
    // 拨小的是**这一盏灯**，它打出去的一切都该按同一个比例小下去。
    s *= 1 - (1 - WICK.damageMult) * this.wick;
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
   * "拨着芯"这件事本身，四件遗物（遮光 / 暗火 / 夜步 / 守芯）、成就 `wickwalk`
   * 和 HUD 油条上那枚牌子共用**同一个**门槛。
   *
   * 为什么是插值过半（0.5）而不是"按下去了"：`wickOn` 是玩家的意图，`wick` 是画面上真实的火——
   * 按下去的头几帧火还没矮，这时候算"拨着芯"会让人拿到看不见的加成；
   * 反过来按回来时火还没烧旺就被剥夺，也一样说不通。过半是个两边都说得过去的点
   * （拨小 0.28 秒，也就是说按下之后 0.14 秒生效），而且它让"我现在算不算拨着芯"
   * 有一个**能自己数出来**的答案——界面上不该存着两个"一半"。
   */
  get dimmed(): boolean {
    return this.wick > 0.5;
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

  /**
   * `input` 里那几个 `aim*` 是触屏的手动瞄准（见 InputState 上那一行）：
   * 老式调用（测试 / 工具）只传前四项也照样跑——那就是"没在瞄"，这一版之前的行为一点没变。
   */
  update(
    dt: number,
    input: {
      moveX: number;
      moveY: number;
      dash: boolean;
      nova: boolean;
      aim?: boolean;
      aimX?: number;
      aimY?: number;
    },
    ctx: PlayerContext,
  ): void {
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

    // 「拨芯」：先把灯芯拧到位，再拿它去算油、光、火（见 data/wick.ts）。
    // 两个速度不一样：拨小要立刻见效（危险来了先隐下去再想别的），拨回来慢一点。
    const wickTarget = this.wickOn ? 1 : 0;
    const wickSpan = wickTarget > this.wick ? WICK.spanDown : WICK.spanUp;
    const wickStep = dt / wickSpan;
    this.wick = clamp(this.wick + clamp(wickTarget - this.wick, -wickStep, wickStep), 0, 1);
    if (this.dimmed) this.wickTime += dt;
    // 三个乘数都写成"从 1 插到那一头"：`wick = 0` 时它们**恰好是 1**，
    // 也就是说没拨芯的时候，这一版和上一版逐位相同（不是"看着差不多"）。
    const burnKeep = 1 - (1 - WICK.oilMult) * this.wick;
    const glowKeep = 1 - (1 - WICK.glowMult) * this.wick;
    const lightKeep = 1 - (1 - WICK.lightMult) * this.wick;

    // Oil decay / burning：灯焰高涨时火大，油也烧得快（见 data/graze.ts）
    this.oil = Math.max(
      0,
      this.oil -
        this.oilDecayPerSec *
          s.oilDecayMult *
          this.curseOilMult *
          this.terrainOil *
          (this.blazeTimer > 0 ? GRAZE.blazeOil : 1) *
          burnKeep *
          dt,
    );
    // 「守芯」：拨着芯时灯油自己省回来（每秒 +0.3%）。
    // 它写在**衰减之后、判空之前**：先结这一帧的账、再补这一口，免得刚好卡在 0 上白扣一次血。
    // 为什么要有这么一条"回油"（而不只是把油耗乘得更小）：漏进的油和乘出来的省是两回事——
    // 乘出来的省再狠也只是"烧得慢"，而漏进来的这一口能**叠**在油壶 / 省油咒之上，
    // 于是"拨着芯赶路"这套能在凑齐之后真的变成"油面不动"（见 data/relics.ts 里那一段）。
    if (this.dimmed && this.flags.wickThrift > 0) {
      this.oil = Math.min(this.oilMax, this.oil + this.flags.wickThrift * dt);
    }
    if (this.oil <= 0) {
      this.hp -= 3 * dt;
      if (Math.random() < dt * 8) ctx.particles.burst(this.x, this.y, 1, '#3a4a7a', { speed: 30, size: 3, life: 0.5 });
    }
    this.brightness = Math.min(1.25, (0.35 + this.oilFrac * 0.65) * (this.blazeTimer > 0 ? 1.12 : 1)) * glowKeep;
    // 灯焰高涨会把火撩大：照得更远、也更亮——但"亮 = 引怪"是同一条规则，
    // 所以这一阵子的代价是实打实的：你会被更多东西看见。
    this.lightRadius = Math.max(
      WICK.minRadius,
      (96 + this.oilFrac * 224) *
        this.pyreMods.lightMult *
        (1 + this.flags.lightSpread) *
        this.terrainLight *
        this.baseLightMult *
        (this.blazeTimer > 0 ? GRAZE.blazeLight : 1) *
        lightKeep,
    );

    // Movement
    let mvx = input.moveX;
    let mvy = input.moveY;
    const ml = Math.hypot(mvx, mvy);
    if (ml > 1) {
      mvx /= ml;
      mvy /= ml;
    }
    this.moving = ml > 0.05;

    // 「按下的那一下」先记进缓冲：冷却还差一点点的操作不算丢（见 dashBuffer 上那一段）。
    // 只有"刚按下"这一帧算一次——按着不放本来就每帧都在尝试，不需要缓冲再替它记一遍。
    if (input.dash && !this.dashHeld && this.dashCd > 0) this.dashBuffer = DASH_BUFFER;
    if (input.nova && !this.novaHeld && this.novaCd > 0) this.novaBuffer = NOVA_BUFFER;
    this.dashHeld = input.dash;
    this.novaHeld = input.nova;
    if (this.dashBuffer > 0) this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    if (this.novaBuffer > 0) this.novaBuffer = Math.max(0, this.novaBuffer - dt);

    if ((input.dash || this.dashBuffer > 0) && this.dashCd <= 0) {
      this.dashBuffer = 0;
      const d = Math.hypot(mvx, mvy) > 0.1 ? { x: mvx, y: mvy } : { x: Math.cos(this.angle), y: Math.sin(this.angle) };
      this.dashDirX = d.x;
      this.dashDirY = d.y;
      this.dashTimer = 0.18;
      this.dashCount += 1;
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
      // 「夜步」：拨着芯时脚步放得开（+12%）。它和「灯焰高涨」那条相反——
      // 一个是把火烧旺、借光跑得快，一个是把火压住、摸黑走得快，两条都只作用在走路上（冲刺不吃）。
      const walk =
        s.moveSpeed *
        this.terrainSlow *
        (this.blazeTimer > 0 ? GRAZE.blazeSpeed : 1) *
        (this.dimmed ? 1 + this.flags.wickStride : 1);
      // 「收力」：逆着残余速度推的时候刹得更狠（见 DASH_BRAKE）。
      // 判据看的是**手推的方向与当前速度的夹角**（点积为负），不是"松手"——
      // 松手照旧只是慢慢滑停（那是惯性该有的样子），要停得快就自己往回推。
      const carrySpeed = Math.hypot(this.vx, this.vy);
      const braking = carrySpeed > walk * 1.15 && mvx * this.vx + mvy * this.vy < 0;
      const rate = Math.min(1, (accel * (braking ? DASH_BRAKE : 1)) / Math.max(1, s.moveSpeed));
      this.vx += (mvx * walk - this.vx) * rate;
      this.vy += (mvy * walk - this.vy) * rate;
      // 那一下要看得见：残余速度还在走速两倍以上时刹住，只有"冲刺刚收尾"这一种情形
      //（这一档一帧就把 748 砍到走速以下，所以一次冲刺最多留一次灰），在地上划一道痕。
      if (braking && carrySpeed > walk * BRAKE_DUST) {
        ctx.particles.burst(this.x, this.y, 5, '#c8d2e6', { speed: 70, size: 2.4, life: 0.3 });
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 瞄准：最近的那只，看得见的优先（v89）——`requireLight` 是"灯罩着"，
    // `preferVisible` 是"中间没隔着墙"，两个都由 `Game.nearestEnemy` 一起算。
    const target = ctx.findTarget(this.x, this.y, 520, true);
    if (target) {
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    } else if (ml > 0.1) {
      this.angle = Math.atan2(mvy, mvx);
    }

    // ── 行走的惯性 ──
    // 这里的都是纯视觉量：倾身、摆灯和脚步落到哪一侧。它们不改速度，也不参与碰撞。
    const moveSpeed = Math.max(1, s.moveSpeed);
    const faceX = Math.cos(this.angle);
    const faceY = Math.sin(this.angle);
    const forwardFrac = clamp((this.vx * faceX + this.vy * faceY) / moveSpeed, -1, 1);
    const sideFrac = clamp((-this.vx * faceY + this.vy * faceX) / moveSpeed, -1, 1);
    const leanRate = Math.min(1, dt * 10);
    this.leanF += (forwardFrac - this.leanF) * leanRate;
    this.leanS += (sideFrac - this.leanS) * leanRate;
    const stepFrac = Math.min(1, Math.hypot(this.vx, this.vy) / moveSpeed);
    if (this.dashTimer <= 0 && stepFrac > 0.14) {
      this.stepClock += dt * (4.2 + stepFrac * 5.4);
      this.footstep -= dt;
      if (this.footstep <= 0) {
        this.footstep = 0.22 - stepFrac * 0.075;
        this.footSide *= -1;
        const side = this.radius * 0.34 * this.footSide;
        const back = this.radius * 0.68;
        ctx.particles.puff(
          this.x - faceX * back - faceY * side,
          this.y - faceY * back + faceX * side + this.radius * 0.52,
          1,
          '#6f685c',
          { speed: 8, size: 2.3 + stepFrac * 1.2, life: 0.38, drag: 2.8, grow: 2.3, gravity: -3 },
        );
      }
    } else {
      this.footstep = Math.min(this.footstep, 0.07);
    }

    // ── 手动瞄准（触屏）──
    // 手指按着在瞄的时候，人**先转过去**：这一下和别的武器不一样，它是"把灯偏向一边"。
    // 只有手里真有倾灯时才接手：没有这件武器的时候，手指在右半边划两下不该让人莫名其妙地转身。
    const aimLen = Math.hypot(input.aimX ?? 0, input.aimY ?? 0);
    this.aimManual = input.aim && aimLen > 0 ? Math.atan2(input.aimY ?? 0, input.aimX ?? 1) : null;
    // 手指推了多远（0~1）：倾灯那一瓢落多远由它定，也由它画落点标记
    this.aimPull = Math.min(1, aimLen);
    if (this.aimManual !== null && this.hasPour) this.angle = this.aimManual;

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
    if ((input.nova || this.novaBuffer > 0) && this.novaCd <= 0) {
      this.novaBuffer = 0;
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
          // 这一口火不是哪件武器打的，是**灯火本身**贴着怪烧的：记成 `lantern`（结算里叫「灯火」）
          ctx.hit(e, dmg, false, e.x - this.x, e.y - this.y, 40, { burn: 1, slow: this.flags.chill, source: 'lantern' });
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
        const opts: { burn?: number; slow?: number; source?: string } = { source: 'nova' };
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

  /** 手里有没有倾灯（含进化）：手动瞄准只给这一件武器接管朝向与落点。 */
  private get hasPour(): boolean {
    return this.weapons.has('pour') || this.weapons.has('pour_tide');
  }

  /** 手里那件倾灯的 id（「倾灯」→「灯潮」），没有就是空串。 */
  private get pourId(): string {
    if (this.weapons.has('pour_tide')) return 'pour_tide';
    return this.weapons.has('pour') ? 'pour' : '';
  }

  /**
   * 手动瞄准时"这一瓢倒多远"（占射程的比例）。
   * 没在瞄、或者手里没有倾灯时是 1：也就是这一件原来的射程，一点都不变。
   */
  private get aimFar(): number {
    if (this.aimManual === null || !this.hasPour) return 1;
    return POUR.aimNear + (1 - POUR.aimNear) * this.aimPull;
  }

  /**
   * 这一瓢现在会怎么飞：方向、落在多远、地上那片火多大，以及"离倒出下一瓢还有多远"。
   * null = 现在没在手动瞄准，或者手里没有倾灯——两种都不该在场上画那个落点标记。
   *
   * `away` 是**离自己多远**（px），`pool` 是落地之后那片火的半径——
   * 和 Game.explode 里那一句用的是同一串乘法（`spread` 与 `POUR.fireSpread` 各一次），
   * 标记画的圈必须和真落下来的那片火一样大，不然这个标记就是在骗人。
   *
   * `charge`（0~1）是**这一件唯一能给出来的预告**：倾灯是自动开火的，
   * 它响不响看的是"油够不够、冷却转完没有"，所以"上膛"这件事本身就是**一帧**的事
   * （够了的那一帧它就出去了）。要标的是"离那一下还有多远"，于是取两个闸门里更慢的那一个：
   * 油（`oilFrac / minOil`）与冷却（已经转过的比例）。圆环填满的那一帧，
   * 就是这一瓢出去的同一帧——填满 = 倒出去，这条对应关系是玩家能自己看出来的。
   */
  get pourAim(): { angle: number; away: number; pool: number; charge: number } | null {
    if (this.aimManual === null) return null;
    const id = this.pourId;
    if (!id) return null;
    const st = weaponAt(id, this.weapons.get(id) ?? 1);
    const spread = 1 + (this.stats.areaMult - 1) * 0.5;
    const cool = st.cooldown * this.stats.cooldownMult;
    const cdDone = cool > 0 ? 1 - (this.cooldowns.get(id) ?? 0) / cool : 1;
    const oilDone = this.oilFrac / POUR.minOil;
    return {
      angle: this.aimManual,
      away: st.range * this.aimFar,
      // ⚠ 这一行必须跟着 `poolRadius` 一起改：标记画的圈和真落下来的那片火差一点点，
      //   玩家就会按着标记站进火里、结果站在边沿上（「烬护」靠的就是"我在不在火里"）。
      pool: st.radius * POUR.fireSpread * spread * (1 + this.flags.pourSpread),
      charge: Math.max(0, Math.min(1, Math.min(cdDone, oilDone))),
    };
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
            if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > rr * rr) return;
            // v88：这一口火焰还得"照得到"。火环绕着你转，可它烧的是光——
            // 一堵墙后面的那只，从你这里看不见，火环就够不到它（判据是**你到怪**那条线，
            // 不是"火焰到怪"：同一件武器只有一个说法，免得玩家去算火焰转到哪儿了）。
            if (!ctx.sight(this.x, this.y, e.x, e.y)) return;
            const cd = this.orbit.hitCooldown.get(e.id) ?? 0;
            if (cd <= 0) {
              this.orbit.hitCooldown.set(e.id, 0.35);
              this.hitEnemy(e, dmg, ctx, st, e.x - ox, e.y - oy, id);
            }
          });
        }
        continue;
      }

      // 「燎灯」：唯一一件"不发射"的武器——它的射程就是灯火半径（燎野再往外多烧一截）。
      // 判定写成脉冲，所以只有**一个**心跳：到点了就把光罩子里的一切挨个烫一遍。
      // 它不走下面的"冷却 + 索敌 + 开火"那一套，因为这里根本不需要瞄准：
      // 光罩到哪儿，就是打到哪儿。
      if (def.kind === 'aura') {
        this.auraCd -= dt;
        if (this.auraCd > 0) continue;
        this.auraCd = st.cooldown * this.stats.cooldownMult;
        const reach = this.lightRadius + st.range;
        // 这一拍长什么样：一圈冲击波从人身上扩到 `reach` 为止——**它在光边上停下**，
        // 于是"烫到哪儿"和"照着哪儿"是同一个圈（见 AURA.pulseFade）。走的是这个游戏
        // 一直在用的那套话（燃爆 / 收网 / 灯台都是它），而不是另画一条线。
        // v104：伤害从 v88 起就逐只问 `sight`，这一圈却还是整圆。现在把同一句视线
        // 采样到 72 个角度上：有墙时只画可见的连续弧，墙后那一段不再亮；
        // 无墙仍走原来的整圆分支，视觉与随机数序列都不变。
        const ring = sightArcs(this.x, this.y, reach, ctx.sight);
        const openRing = ring.visible.every(Boolean);
        if (openRing) {
          ctx.particles.shockwave(this.x, this.y, def.color, reach, AURA.pulseFade);
        } else {
          for (const [a0, a1] of ring.arcs) {
            ctx.particles.shockwaveArc(this.x, this.y, def.color, reach, AURA.pulseFade, a0, a1);
          }
        }
        // 「旺火」（遗物）先数再打：一次脉冲里光里挤着几只，决定**这一下**每只多重。
        // 数两遍（先数、再打）是刻意的——一遍数一遍打的话，"打到第几只"会跟着
        // "前面那几只死没死"变，人越多越旺就变成了人越多越乱。
        let hits = 0;
        ctx.enemies.forEach((e) => {
          const rr = reach + e.radius; // 大块头从边缘就开始被烤（和伏灯的触发判定同一个道理）
          if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > rr * rr) return;
          if (!ctx.sight(this.x, this.y, e.x, e.y)) return; // v88：墙后面那几只不在这一拍里
          hits += 1;
        });
        if (hits > 0) {
          const crowd = Math.min(AURA.crowdBonusMax, (hits - 1) * this.flags.auraCrowd);
          const pulse = dmg * (1 + crowd);
          const snare = this.flags.auraSnare > 0 ? AURA.snareSpan : 0;
          ctx.enemies.forEach((e) => {
            const rr = reach + e.radius;
            if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > rr * rr) return;
            if (!ctx.sight(this.x, this.y, e.x, e.y)) return;
            this.hitEnemy(e, pulse, ctx, st, e.x - this.x, e.y - this.y, id);
            // 「烟熏」（遗物）：光里的地方他们走不开。强度记在 `slowFactor` 上——
            // 霜棱 / 霜印那 0.5 倍是另一条线的事，合并规矩只有一份（`applySlow`：谁更狠听谁的）。
            if (snare > 0 && e.active) applySlow(e, snare, 1 - this.flags.auraSnare);
          });
          ctx.audio(AURA.sound);
          ctx.onAura(hits);
        }
        // 边缘飞起的火星：这是"这盏灯在烧"唯一常驻的视觉，不烫到人时也看得见——
        // 不然一件没打到东西的武器在屏幕上就是彻底不存在。
        const emberAngles = openRing
          ? null
          : ring.visible
              .map((on, i) => (on ? ((i + 0.5) / AURA_ARC_SEGMENTS) * TAU : null))
              .filter((a): a is number => a !== null);
        for (let i = 0; i < AURA.edgeEmbers; i += 1) {
          // 墙后没有光边：火星只从看得见的那几段里挑。无墙时仍旧直接掷一个角度，
          // 保持原来那五粒火星的分布与随机数调用顺序。
          if (!openRing && !emberAngles?.length) break;
          const a = openRing ? Math.random() * TAU : emberAngles![Math.floor(Math.random() * emberAngles!.length)];
          const r = reach * (0.9 + Math.random() * 0.1);
          ctx.particles.burst(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, 1, def.color, {
            speed: 26,
            size: 2.4,
            life: 0.5,
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
        ctx.chainZap(this.x, this.y, dmg, Math.max(1, st.pierce + this.countOf(st) - 1), st.range * area, def.color, { burn: st.burn, slow: st.slow, source: id });
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
            source: id,
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
          ctx.mine(this.x + Math.cos(a) * 22, this.y + Math.sin(a) * 22, dmg, st.radius * area, st.range, st.burn, id);
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
        // 手动瞄准给这一件多出来的两件事（见 update 里"手动瞄准"那一段）：
        // · **往哪儿倒**：手指按住的那几秒，方向归玩家，自动瞄准让位（`dir`）；
        // · **倒多远**：手指推到底 = 原来那个射程，刚过死区 = 落在脚前一点点，中间线性
        //   （`POUR.aimNear` 是近的那一端）。距离靠寿命来定——这一瓢飞到那儿刚好烧完，
        //   落地由 ProjectileSystem 的 onExpire 收尾（`maxLife` 跟距离一起算，
        //   不然"倒得近"就成了"倒得慢"）。
        const far = this.aimFar;
        const dir = this.aimManual ?? aim;
        for (let i = 0; i < count; i += 1) {
          // 一瓢是准的（自动瞄准锁着最近那只怪；v89 起看得见的优先），三瓢（进化）才散开成一个扇面
          const a = dir + (count > 1 ? (i - (count - 1) / 2) * st.spread : (Math.random() - 0.5) * 0.14);
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
            maxLife: (st.range * far) / st.speed,
            weaponId: id,
            // 「大瓢」（遗物）：一瓢铺得更开、也留得更久。`pourAim.pool` 用的是**同一串乘法**
            // （下面那个 getter），标记画的圈必须和真落下来的那片火一样大。
            poolRadius: st.radius * POUR.fireSpread * (1 + this.flags.pourSpread),
            poolLife: POUR.fireLife + this.flags.pourLife,
          });
        }
        ctx.audio('pour');
        break;
      }
      case 'vortex': {
        // 落点：优先砸在最近的那只怪身上（自动瞄准本来就锁着它；v89 起看得见的优先，
        // 全看不见时还是最近的那只），附近没人才落在你朝着的方向前面。
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
          ctx.vortex(this.x + Math.cos(a) * dist, this.y + Math.sin(a) * dist, dmg, st.radius * area, st.burn, st.drag ?? 0, id);
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
          if (Math.abs(diff) > half) return;
          // v96：鞭是"挥出去的一道火弧"，墙前那一侧才是它够得着的范围。
          // 这一条和火环 / 燎灯共用同一个 `sight`（墙在 `Game` 手里，Player 只问一句），
          // 伤害与点火一起停住——不然会出现"没挨伤害却烧起来了"的半截规矩。
          if (!ctx.sight(this.x, this.y, e.x, e.y)) return;
          this.hitEnemy(e, dmg, ctx, st, dx, dy, id);
          ctx.enemies.applyBurn(e, 1, id);
        });
        ctx.audio('hit');
        break;
      }
      default:
        break;
    }
  }

  /** `source` 是这件武器自己的 id：记账用（见 Game.creditDamage）。 */
  private hitEnemy(e: Enemy, dmg: number, ctx: PlayerContext, st: { knockback: number; burn?: number; slow?: number }, kx: number, ky: number, source: string): void {
    const crit = Math.random() < this.stats.critChance;
    const finalDmg = dmg * (crit ? this.stats.critMult : 1);
    ctx.hit(e, finalDmg, crit, kx, ky, st.knockback, { burn: st.burn ?? 0, slow: Math.max(st.slow ?? 0, this.flags.chill), source });
  }

  draw(ctx: CanvasRenderingContext2D, time: number, opts?: { cone?: number; halo?: number }): void {
    const R = this.radius;
    const coneScale = opts?.cone ?? 1;
    const haloScale = opts?.halo ?? 1;
    const speed = Math.hypot(this.vx, this.vy);
    const speedFrac = Math.min(1, speed / Math.max(1, this.stats.moveSpeed));
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
      cape.addColorStop(0, 'rgba(38,45,82,0.96)');
      cape.addColorStop(0.45, 'rgba(25,30,58,0.8)');
      cape.addColorStop(1, 'rgba(13,16,33,0.08)');
      ctx.fillStyle = cape;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72);
      ctx.quadraticCurveTo(len * 0.48, -R * 0.78 + flutter, len * 0.98, -R * 0.28 + flutter);
      ctx.lineTo(len * 0.84, -R * 0.02 + flutter * 0.4);
      ctx.lineTo(len * 1.02, R * 0.13 - flutter * 0.45);
      ctx.lineTo(len * 0.8, R * 0.28 + flutter * 0.4);
      ctx.quadraticCurveTo(len * 0.45, R * 0.68 + flutter, 0, R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,8,17,0.58)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(9,12,24,0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R * 0.08, -R * 0.2);
      ctx.quadraticCurveTo(len * 0.5, -R * 0.06 + flutter * 0.7, len * 0.82, R * 0.02);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#b7c4ee';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.7);
      ctx.quadraticCurveTo(len * 0.48, -R * 0.75 + flutter, len * 0.94, -R * 0.28 + flutter);
      ctx.stroke();
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
    ctx.rotate(this.angle + this.leanS * 0.055);
    ctx.translate(this.leanF * R * 0.035, this.leanS * R * 0.035);
    ctx.globalCompositeOperation = 'lighter';
    const coneLen = (130 + 150 * this.brightness) * (0.6 + 0.4 * coneScale);
    const bands = [
      { width: 1, alpha: 0.012 },
      { width: 0.82, alpha: 0.016 },
      { width: 0.66, alpha: 0.022 },
      { width: 0.5, alpha: 0.03 },
      { width: 0.34, alpha: 0.04 },
      { width: 0.2, alpha: 0.055 },
    ];
    for (const band of bands) {
      const half = 64 * band.width;
      const alpha = band.alpha * flick * coneScale;
      const cone = ctx.createLinearGradient(0, 0, this.radius + coneLen, 0);
      cone.addColorStop(0, `rgba(255,210,145,${alpha})`);
      cone.addColorStop(0.45, `rgba(255,172,86,${alpha * 0.52})`);
      cone.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(this.radius * 0.6, -3);
      ctx.quadraticCurveTo(this.radius + coneLen * 0.58, -half * 0.64, this.radius + coneLen, -half);
      ctx.lineTo(this.radius + coneLen, half);
      ctx.quadraticCurveTo(this.radius + coneLen * 0.58, half * 0.64, this.radius * 0.6, 3);
      ctx.closePath();
      ctx.fill();
    }
    // 锥心的亮芯
    const core = ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + coneLen * 0.55);
    core.addColorStop(0, `rgba(255,224,168,${0.16 * flick * coneScale})`);
    core.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.6, -3);
    ctx.lineTo(this.radius + coneLen * 0.62, -14);
    ctx.lineTo(this.radius + coneLen * 0.62, 14);
    ctx.lineTo(this.radius * 0.6, 3);
    ctx.closePath();
    ctx.fill();

    const dust = 18;
    for (let i = 0; i < dust; i += 1) {
      const frac = (time * (0.17 + (i % 4) * 0.014) + i * 0.137) % 1;
      const reach = this.radius * 0.65 + coneLen * frac;
      const half = 3 + 59 * Math.pow(frac, 1.08);
      const drift = Math.sin(time * 0.9 + i * 2.17) * half * 0.78;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 3.4 + i * 1.9);
      const rad = (1 + (i % 3) * 0.5) * (1 - frac * 0.25);
      ctx.globalAlpha = (0.18 + twinkle * 0.36) * (1 - frac * 0.66) * flick * coneScale;
      ctx.fillStyle = i % 4 === 0 ? '#fff6dc' : '#ffd394';
      ctx.beginPath();
      ctx.arc(reach, drift, Math.max(0.5, rad), 0, TAU);
      ctx.fill();
      if (i % 4 === 0) {
        ctx.globalAlpha *= 0.62;
        ctx.fillRect(reach - rad * 3.2, drift - 0.4, rad * 6.4, 0.8);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 地面投影：一层柔和的轮廓 + 一层贴脚的接触阴影 ──
    ctx.save();
    ctx.translate(R * 0.08, R * 1.03);
    ctx.scale(1, 0.43);
    const dropShadow = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.55);
    dropShadow.addColorStop(0, 'rgba(2,3,8,0.58)');
    dropShadow.addColorStop(0.5, 'rgba(2,3,8,0.35)');
    dropShadow.addColorStop(0.82, 'rgba(2,3,8,0.1)');
    dropShadow.addColorStop(1, 'rgba(2,3,8,0)');
    ctx.fillStyle = dropShadow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(1,2,6,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.74, R * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ── 斗篷身形：上圆下摆 ──
    const cloak = this.hitFlash > 0 ? '#ff6b6b' : blink ? '#ffffff' : '#2b3357';
    const cloth = ctx.createRadialGradient(-R * 0.34, -R * 0.56, R * 0.08, 0, R * 0.1, R * 1.72);
    cloth.addColorStop(0, this.hitFlash > 0 || blink ? cloak : '#7482ba');
    cloth.addColorStop(0.32, this.hitFlash > 0 || blink ? cloak : '#566392');
    cloth.addColorStop(0.68, this.hitFlash > 0 || blink ? cloak : '#343d68');
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
    // 布料被灯火扫到的一侧有暖色漫反射，背侧则沉进冷影里——同一块剪影因此有了体积。
    ctx.save();
    ctx.clip();
    const clothWarm = ctx.createRadialGradient(R * 0.66, R * 0.16, 0, R * 0.66, R * 0.16, R * 1.75);
    clothWarm.addColorStop(0, 'rgba(255,196,126,0.19)');
    clothWarm.addColorStop(0.44, 'rgba(255,150,74,0.07)');
    clothWarm.addColorStop(1, 'rgba(255,130,50,0)');
    ctx.fillStyle = clothWarm;
    ctx.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    const clothDepth = ctx.createLinearGradient(0, -R, 0, R * 1.25);
    clothDepth.addColorStop(0, 'rgba(255,255,255,0.06)');
    clothDepth.addColorStop(0.5, 'rgba(0,0,0,0)');
    clothDepth.addColorStop(1, 'rgba(1,3,10,0.3)');
    ctx.fillStyle = clothDepth;
    ctx.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,196,128,0.16)';
    ctx.lineWidth = 1;
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
    // 织纹：只在近处看得见的一层斜向细线，避免斗篷变成一块纯色渐变。
    ctx.strokeStyle = 'rgba(183,197,235,0.07)';
    ctx.lineWidth = 0.8;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.72 + i * R * 0.26, R * 0.26);
      ctx.quadraticCurveTo(i * R * 0.19, R * 0.72, R * 0.36 + i * R * 0.14, R * 1.04);
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
    const hoodFill = ctx.createRadialGradient(R * 0.58, -R * 0.2, R * 0.04, R * 0.38, 0, R * 0.72);
    hoodFill.addColorStop(0, this.hitFlash > 0 ? '#ffeaea' : blink ? '#ffffff' : '#7181b9');
    hoodFill.addColorStop(0.58, this.hitFlash > 0 ? '#ffbcbc' : blink ? '#ffffff' : '#4d5990');
    hoodFill.addColorStop(1, this.hitFlash > 0 ? '#c85a5a' : blink ? '#e8ecff' : '#2d355e');
    ctx.fillStyle = hoodFill;
    ctx.beginPath();
    ctx.ellipse(R * 0.42, 0, R * 0.5, R * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,9,18,0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,207,146,0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(R * 0.42, 0, R * 0.47, -1.05, 1.18);
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
    // 摆动绕肩关节，不绕灯心：提梁会先把灯甩出去，玻璃罩和火舌再慢半拍。
    const lanternSwing = (this.moving ? Math.sin(this.stepClock * 1.28) * (0.018 + speedFrac * 0.052) : Math.sin(time * 2.1) * 0.01) + this.leanS * 0.028;
    ctx.save();
    ctx.translate(R * 0.5, R * 0.16);
    ctx.rotate(lanternSwing);
    ctx.translate(-R * 0.5, -R * 0.16);
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
    // 提梁、黄铜顶盖与底座
    ctx.strokeStyle = 'rgba(180,142,82,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lx, -8, 4.4, Math.PI, TAU);
    ctx.stroke();
    ctx.fillStyle = '#493a24';
    ctx.beginPath();
    ctx.moveTo(lx - 7.5, -8.5);
    ctx.lineTo(lx + 7.5, -8.5);
    ctx.lineTo(lx + 5.2, -5.5);
    ctx.lineTo(lx - 5.2, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,154,86,0.62)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // 灯罩玻璃：先压一层暗玻璃，再让火芯从里面透出来
    ctx.fillStyle = 'rgba(27,31,43,0.78)';
    ctx.beginPath();
    ctx.moveTo(lx - 5.4, -5.5);
    ctx.quadraticCurveTo(lx - 7, 0, lx - 5.2, 5.8);
    ctx.lineTo(lx + 5.2, 5.8);
    ctx.quadraticCurveTo(lx + 7, 0, lx + 5.4, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(184,144,80,0.68)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    const lanternGlow = ctx.createRadialGradient(lx, 0, 0, lx, 0, 13);
    lanternGlow.addColorStop(0, `rgba(255,246,204,${0.36 + 0.38 * flick})`);
    lanternGlow.addColorStop(0.4, `rgba(255,171,72,${0.16 + 0.16 * flick})`);
    lanternGlow.addColorStop(1, 'rgba(255,120,28,0)');
    ctx.fillStyle = lanternGlow;
    ctx.beginPath();
    ctx.arc(lx, 0, 13, 0, TAU);
    ctx.fill();

    // 火舌不是一颗椭圆：下面圆、上面收尖，随呼吸荡一下
    const flameLean = Math.sin(time * 7.5) * 0.8;
    ctx.fillStyle = `rgba(255,164,62,${0.7 + 0.2 * flick})`;
    ctx.beginPath();
    ctx.moveTo(lx, 6.2);
    ctx.bezierCurveTo(lx - 4.7, 4.1, lx - 3.1, -1.4, lx + flameLean, -6.7 - flick * 1.1);
    ctx.bezierCurveTo(lx + 3.2, -1.1, lx + 4.8, 3.5, lx, 6.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff7d7';
    ctx.beginPath();
    ctx.moveTo(lx, 4.4);
    ctx.bezierCurveTo(lx - 2.1, 2.6, lx - 1.4, -0.5, lx + flameLean * 0.55, -3.3);
    ctx.bezierCurveTo(lx + 1.6, -0.2, lx + 2.2, 2.5, lx, 4.4);
    ctx.closePath();
    ctx.fill();

    // 玻璃罩上的两道反光，证明它是"罩子"而不是一团色块
    ctx.strokeStyle = 'rgba(255,248,222,0.5)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(lx - 3.2, -4.1);
    ctx.quadraticCurveTo(lx - 4.3, -0.2, lx - 3.4, 3.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,252,237,0.72)';
    ctx.beginPath();
    ctx.arc(lx + 2.9, -2.7, 0.8, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#3c301d';
    ctx.beginPath();
    ctx.moveTo(lx - 6.2, 6.8);
    ctx.quadraticCurveTo(lx - 6.2, 5.6, lx - 5, 5.6);
    ctx.lineTo(lx + 5, 5.6);
    ctx.quadraticCurveTo(lx + 6.2, 5.6, lx + 6.2, 6.8);
    ctx.quadraticCurveTo(lx + 6.2, 8.6, lx + 5, 8.6);
    ctx.lineTo(lx - 5, 8.6);
    ctx.quadraticCurveTo(lx - 6.2, 8.6, lx - 6.2, 6.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(206,164,92,0.45)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  get alive(): boolean {
    return this.hp > 0;
  }
}
