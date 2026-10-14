export interface Vec2 {
  x: number;
  y: number;
}

export type Difficulty = 'relaxed' | 'normal' | 'nightmare';

export type WeaponKind = 'orbit' | 'wisp' | 'fireball' | 'whip' | 'shard' | 'spray' | 'arc' | 'beam' | 'boomerang';

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
  /** 是否走完了三关 */
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
}

export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  dash: boolean;
  nova: boolean;
  focus: boolean;
  pause: boolean;
  sheet: boolean;
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
