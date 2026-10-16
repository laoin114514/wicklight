import type { MetaNodeDef } from '../types';

export const META_TREE: MetaNodeDef[] = [
  { id: 'kindling', name: '引火', blurb: '起始生命上限 +12%', cost: 50, effect: { key: 'hpMult', value: 0.12 } },
  { id: 'tallow', name: '脂膏', blurb: '起始灯油容量 +18%', cost: 60, effect: { key: 'oilMult', value: 0.18 } },
  { id: 'purse', name: '余烬袋', blurb: '每局获得余烬 +18%', cost: 100, effect: { key: 'emberMult', value: 0.18 } },
  { id: 'wicks', name: '灯芯', blurb: '冲刺冷却 -16%', cost: 80, requires: 'kindling', effect: { key: 'dashMult', value: 0.16 } },
  { id: 'greed', name: '贪光', blurb: '升级选择可重掷 +1 次', cost: 140, effect: { key: 'rerolls', value: 1 } },
  { id: 'reservoir', name: '油库', blurb: '起始武器 +1 级', cost: 120, requires: 'tallow', effect: { key: 'weaponLevel', value: 1 } },
  { id: 'warmstart', name: '暖启', blurb: '开局随机获得 1 个被动', cost: 180, requires: 'purse', effect: { key: 'startPassives', value: 1 } },
  { id: 'secondwind', name: '复燃', blurb: '每局可复活 1 次', cost: 300, requires: 'wicks', effect: { key: 'revives', value: 1 } },
  { id: 'coinpurse', name: '钱袋', blurb: '开局金币 +40。', cost: 120, requires: 'purse', effect: { key: 'startGold', value: 40 } },
  { id: 'nightvision', name: '暗视', blurb: '起始灯火半径 +12%。', cost: 170, requires: 'kindling', effect: { key: 'lightMult', value: 0.12 } },
  { id: 'swiftstep', name: '夜行', blurb: '起始移动速度 +7%。', cost: 150, requires: 'wicks', effect: { key: 'moveSpeedMult', value: 0.07 } },
  { id: 'kindling2', name: '薪火', blurb: '起始生命上限再 +12%（与引火叠加）。', cost: 200, requires: 'kindling', effect: { key: 'hpMult', value: 0.12 } },
  { id: 'oldlamp', name: '旧灯', blurb: '开局随机获得 1 件遗物。', cost: 280, requires: 'warmstart', effect: { key: 'startRelic', value: 1 } },
  { id: 'lantern_lamplighter', name: '解锁·灯语者', blurb: '在灯火选择中解锁灯语者。', cost: 150, effect: { key: 'lantern', value: 0 } },
  { id: 'lantern_emberkin', name: '解锁·焚烬者', blurb: '在灯火选择中解锁焚烬者。', cost: 200, requires: 'lantern_lamplighter', effect: { key: 'lantern', value: 0 } },
  { id: 'lantern_shadewalker', name: '解锁·暗行者', blurb: '在灯火选择中解锁暗行者。', cost: 260, requires: 'reservoir', effect: { key: 'lantern', value: 0 } },
];

export const META_MAP: Record<string, MetaNodeDef> = Object.fromEntries(META_TREE.map((m) => [m.id, m]));

/**
 * 「薪火」——余烬的第二个出口（v80）。
 *
 * 为什么要有这一套：解锁树是**一次性的**（16 个节点、一共 2560 余烬），而余烬是**一直在挣**的。
 * 台架量过：自然局里脚本玩家死在第 1 关约 150 余烬，一趟真打通（4 关 / 13 分钟）约 **3200**——
 * 也就是说**一趟通关就能把整棵树买完**。树买完之后，那个数就再没有出口了；
 * v79 的「深宵之约」还把它乘得更大（七条全背 ×2.05），于是这个洞更明显：
 * 玩家背着七条之约打穿一局，结算写着 +6600 余烬，然后盯着一个买不动任何东西的数字。
 *
 * 所以这一版补的是**炉子**，不是第二棵树。三条梯子各六层，改成一份**起手的底子**：
 *   · 薪柴——火力 +4% / 级（满 6 级 +24%）；
 *   · 亮芯——灯火半径 +3% / 级（满 6 级 +18%）；
 *   · 油瓮——起始灯油容量 +5% / 级（满 6 级 +30%）。
 * 三条合起来正好 18 级、19170 余烬：按上面那个读数，大约是**六趟通关**。
 *
 * 三条设计规矩（决定了上面的价格与数值为什么是这些数）：
 *   · **它比树贵得多，而且这是有意的**：树是买卖（60 余烬换 +18% 油），炉子是余烬的去处
 *     （320 换 +5%）——单位余烬买到的东西差着一个数量级。不这样写的话，卡在"树还没买完"
 *     的人会先来烧炉子，而那才是真的把钱花错了。价格差**本身就是引导**：先买树，再添柴。
 *   · **每一级都比上一级贵 45%**（`1.45^n`）：尾巴长的形状要对——太短（1.2 倍）是一口气买完，
 *     太长就没法一局一级。1.45 下"一条线的最后一级"单独就等于大半趟通关（`薪柴` 第 6 级 2565），
 *     于是每一级都是一个当晚能做完的决定。
 *   · **封顶**：三条各 6 级。炉子要把"余烬没有出口"这件事解决掉，而**不是**改成一门无限长的
 *     "+1% 火力"——那会让难度（之约、噩梦、无尽）全部失去意义，玩家最后是在比谁攒得久。
 *     18 级之后这个系统就说完了，说完了才好写进成就里（两条：烧满一条 / 三条全满）。
 *
 * 它和「深宵之约」正好是一对：之约是你自己签的（把余烬做大），薪火是你自己烧的（把余烬收回）。
 * 于是"我今天想轻松还是想折腾"这件事，两头都在玩家手里。
 */
export interface FireLineDef {
  id: string;
  name: string;
  /** 一句：这一条在烧什么（面板上那行小字） */
  blurb: string;
  /** 每一级改的数（写在等级刻度旁边，和升级卡同一条规矩：把数摆出来） */
  per: string;
  icon: string;
  /** 落进 `MetaSystem.bonuses()` 的那个键 */
  key: 'damageMult' | 'lightMult' | 'oilMult';
  /** 每一级的量（damageMult / lightMult / oilMult 都是加法叠） */
  value: number;
  /** 封顶几级 */
  levels: number;
  /** 第 1 级的价格 */
  baseCost: number;
  /** 每一级涨多少（1.45 = 贵 45%） */
  growth: number;
}

export const FIRE_LINES: FireLineDef[] = [
  {
    id: 'fire_damage',
    name: '薪柴',
    blurb: '每局开局的火力底子',
    per: '火力 +4%',
    icon: '🪵',
    key: 'damageMult',
    value: 0.04,
    levels: 6,
    baseCost: 400,
    growth: 1.45,
  },
  {
    id: 'fire_light',
    name: '亮芯',
    blurb: '每局开局的灯火半径',
    per: '灯火 +3%',
    icon: '🕯️',
    key: 'lightMult',
    value: 0.03,
    levels: 6,
    baseCost: 320,
    growth: 1.45,
  },
  {
    id: 'fire_oil',
    name: '油瓮',
    blurb: '每局开局的灯油容量',
    per: '灯油容量 +5%',
    icon: '🫙',
    key: 'oilMult',
    value: 0.05,
    levels: 6,
    baseCost: 320,
    growth: 1.45,
  },
];

export const FIRE_MAP: Record<string, FireLineDef> = Object.fromEntries(FIRE_LINES.map((f) => [f.id, f]));

/** 某一条梯子第 `level` 级（0 起数）要多少余烬。 */
export function fireCost(line: FireLineDef, level: number): number {
  return Math.round(line.baseCost * Math.pow(line.growth, level));
}

/** 整个炉子一共几级（三条加起来的封顶）——进度那一行要有一个分母。 */
export const FIRE_LEVELS_TOTAL = FIRE_LINES.reduce((sum, f) => sum + f.levels, 0);
