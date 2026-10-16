export interface Vec2 {
  x: number;
  y: number;
}

export type Difficulty = 'relaxed' | 'normal' | 'nightmare';

export type WeaponKind =
  | 'orbit'
  | 'wisp'
  | 'fireball'
  | 'whip'
  | 'shard'
  | 'spray'
  | 'arc'
  | 'beam'
  | 'boomerang'
  | 'mine'
  | 'vortex'
  | 'pour';

export interface WeaponStats {
  damage: number;
  cooldown: number;
  count: number;
  speed: number;
  range: number;
  radius: number;
  pierce: number;
  spread: number;
  knockback: number;
  burn: number;
  slow: number;
  /**
   * 只有「旋灯」看这一项：卷不卷弹幕（0 = 不卷，1 = 卷）。
   * 和 `burn` 对伏灯是"炸完留几层火"、`range` 对伏灯是"触发距离"一样，
   * 这里也允许"同一个字段在不同武器里意思不同"——省得为一个布尔开一堆新字段。
   */
  drag?: number;
  /**
   * 只有「倾灯」看这一项：这一瓢从油桶里取走多少（占一桶的比例）。
   * 和 `drag` 一样是"同一个字段在不同武器里意思不同"的写法——
   * 它的好处是**能跟着 `scale()` 一起长大**：升级之后同一瓢更省油。
   */
  pour?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  color: string;
  blurb: string;
  levels: WeaponStats[];
  evolve?: { passive: string; into: string };
  evolved?: boolean;
}

export type EnemyBehavior =
  | 'chase'
  | 'dash'
  | 'ranged'
  | 'dive'
  | 'tank'
  | 'drain'
  | 'quench'
  | 'bomber'
  | 'charge'
  | 'beacon'
  | 'echo'
  | 'weaver'
  | 'siphon';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  oil: number;
  behavior: EnemyBehavior;
  color: string;
  elite?: boolean;
  boss?: boolean;
  minWave?: number;
  lightShy?: boolean;
  requiresLight?: boolean;
  phases?: number;
  /** 死亡时分裂出的小怪 */
  splits?: { id: string; count: number };
  /** 「回响」沿玩家走过的路径追击时的延迟（秒） */
  trailDelay?: number;
  /** 图鉴里的一句话说明 */
  note?: string;
}

export interface PassiveDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  maxLevel: number;
}

export type UpgradeKind = 'weapon' | 'passive';

export interface UpgradeOffer {
  kind: UpgradeKind;
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  level: number;
  maxLevel: number;
  tag: 'new' | 'level' | 'evolve' | 'meta';
}

export interface ShopItem {
  kind: 'relic' | 'upgrade' | 'heal' | 'oil';
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  price: number;
  sold: boolean;
  offer?: UpgradeOffer;
}

export interface LanternDef {
  id: string;
  name: string;
  title: string;
  weapon: string;
  passive: string;
  blurb: string;
  color: string;
  unlockedBy?: string;
}

export interface StageTheme {
  id: string;
  name: string;
  subtitle: string;
  floor: string;
  wall: string;
  accent: string;
  fog: string;
  hue: number;
}

export interface StageDef {
  id: string;
  theme: StageTheme;
  waves: number;
  boss: string | null;
  elites: string[];
  hazards: string[];
  /** 场上「灯台」数量：熄灭的石灯，停留片刻点燃可长明此夜（不给就是 3 座）。 */
  pyres?: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  blurb: string;
  /** 解锁时额外奖励的余烬。 */
  embers?: number;
  /** 成就面板里的分组（不写归入「其他」） */
  group?: AchievementGroup;
}

export type AchievementGroup = '战斗' | '关卡与首领' | '抉择与风险' | '收集与档案';

export interface MetaNodeDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  requires?: string;
  effect: MetaEffect;
}

export interface MetaEffect {
  key: string;
  value: number;
}

export interface RunStats {
  kills: number;
  level: number;
  xp: number;
  time: number;
  wave: number;
  stage: number;
  embers: number;
  damageDealt: number;
  damageTaken: number;
  bestCombo: number;
  bossKills: number;
  difficulty: Difficulty;
  lantern: string;
  stageId: string;
  endless: boolean;
  /** 是否今日灯芯 */
  daily: boolean;
}

/** 单局战报（生涯档案里"最近对局"用的那一条）。 */
export interface RunRecord {
  /** 记录时间戳（毫秒） */
  at: number;
  lantern: string;
  difficulty: Difficulty;
  stageId: string;
  /** 抵达的关卡序号（1 起） */
  stage: number;
  endless: boolean;
  /** 无尽模式抵达的波次 */
  wave: number;
  /** 是否走完了全部关卡 */
  cleared: boolean;
  kills: number;
  level: number;
  time: number;
  bestCombo: number;
  damageDealt: number;
  bossKills: number;
  embers: number;
  /** 是否今日灯芯 */
  daily?: boolean;
}

/** 单盏灯火的累计战绩。 */
export interface LanternRecord {
  runs: number;
  /** 最佳关卡（3 = 通关） */
  bestStage: number;
  bestKills: number;
  bestWave: number;
  /** 通关次数 */
  cleared: number;
  /** 最快通关用时（秒），0 = 尚未通关 */
  bestTime: number;
}

/** 生涯纪录：只记"最好的一次"。 */
export interface RecordsData {
  bestCombo: number;
  bestKills: number;
  bestLevel: number;
  bestDamage: number;
  bestEmbers: number;
  /** 最快通关用时（秒），0 = 尚未通关 */
  bestTime: number;
  /** 累计存活时长（秒） */
  totalTime: number;
  clearedRuns: number;
  endlessRuns: number;
  /** 累计完成的悬赏数 */
  bounties: number;
  lanterns: Record<string, LanternRecord>;
}

/** 今日灯芯（每日挑战）的成绩记录。 */
export interface DailySave {
  /** 这份成绩属于哪一天（YYYY-MM-DD） */
  key: string;
  attempts: number;
  bestScore: number;
  bestKills: number;
  bestStage: number;
  cleared: boolean;
  /** 最佳成绩用的灯火 */
  bestLantern: string;
}

export interface SaveData {
  version: number;
  embers: number;
  unlockedLanterns: string[];
  meta: string[];
  achievements: string[];
  best: number;
  bestEndlessWave: number;
  runs: number;
  killsTotal: number;
  /** 图鉴已发现的条目，形如 "enemy:shade"。 */
  codex: string[];
  /** 生涯最佳纪录 */
  records: RecordsData;
  /** 最近若干局的战报，最新的在前 */
  history: RunRecord[];
  /** 今日灯芯的成绩（每天重置） */
  daily: DailySave;
  settings: SettingsData;
  /** 首局的开局引导是否已经放完（老存档没有这个字段，等于没放过）。 */
  hintsSeen?: boolean;
  /** 已经弹过的"首次遭遇"提示（精英 / 首领 / 险境），只弹一次。 */
  tips?: string[];
}

export interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  shake: number;
  reduceMotion: boolean;
  /** 动态分辨率：帧率吃紧时自动降低内部渲染分辨率。 */
  adaptive: boolean;
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  bloom: boolean;
  /** 触感反馈（手机上的短震动）。老存档没有这一项，按"开"处理。 */
  vibrate: boolean;
}

export interface InputState {
  moveX: number;
  moveY: number;
  /**
   * 手动瞄准（触屏，见 TouchControls 里"屏幕右侧那块地方"那一段）：
   * `aim` = 手指正按着在瞄；`aimX/aimY` 是一个二维向量，**方向**是"往哪儿倒"，
   * **长度**（0~1）是"推了多远"——推到底 = 自动瞄准那个射程，刚过死区 = 落在脚前。
   * 两者合成一个向量，是因为它们本来就来自同一根手指的同一段位移，
   * 拆成"角度 + 力度"两个字段反而要写两遍钳位。
   * 关掉（`aim === false`）时这三个字段都没有意义：自动瞄准照旧。
   */
  aim: boolean;
  aimX: number;
  aimY: number;
  dash: boolean;
  nova: boolean;
  /** 桌面上的手动瞄准（鼠标右键按住）：真时由指针位置给出方向与力度，见 Input.aimVector。 */
  focus: boolean;
  pause: boolean;
  sheet: boolean;
  /** 分灯：一次性输入（按下那一帧为 true），不是按住 */
  lamp: boolean;
  /**
   * 面板热键（都是一次性：按下那一帧才为真）。三块会"打断"战斗的面板——升级卡、
   * 祭坛、商店——从前只能用鼠标点，而这场战斗里手是离不开 WASD 的（开火是自动的），
   * 于是每升一级就要把手从键盘上拿开一次。这几个字段把那些选择接回键盘。
   *
   * · `pick`：按了第几个数字键（**1~4，0 = 这帧没按**）。做成一个数而不是四个布尔，
   *   是因为下游只想问"选了第几张"，而"第几张"本来就是一个数；
   * · `reroll`：R（升级面板重掷 / 商店刷新）；
   * · `confirm`：回车（结算面板上的主按钮）。
   *
   * 为什么塞进 `Input` 而不是让每块面板自己监听 `keydown`：这个游戏里"哪个键对应哪个动作"
   * 只有 `Input.KEYMAP` 一处，面板再各挂一份监听，迟早会出现同一个键在两处有不同的解释。
   */
  pick: number;
  reroll: boolean;
  confirm: boolean;
}

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface RunContext {
  difficulty: Difficulty;
  lantern: string;
  stageIndex: number;
  endless: boolean;
  seed: number;
}

export interface StageRuntime {
  def: StageDef;
  wavesCleared: number;
  spawnTimer: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  complete: boolean;
}
