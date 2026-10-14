export interface Vec2 {
  x: number;
  y: number;
}

export type Difficulty = 'relaxed' | 'normal' | 'nightmare';

export type WeaponKind = 'orbit' | 'wisp' | 'fireball' | 'whip' | 'shard' | 'spray' | 'arc';

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

export type EnemyBehavior = 'chase' | 'dash' | 'ranged' | 'dive' | 'tank' | 'drain' | 'bomber' | 'charge' | 'beacon';

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
}

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
