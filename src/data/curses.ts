export interface CurseMods {
  /** 敌人数量倍率 */
  countMult?: number;
  /** 敌人生命倍率 */
  hpMult?: number;
  /** 敌人伤害倍率 */
  dmgMult?: number;
  /** 本关额外波次 */
  extraWaves?: number;
  /** 额外的黑暗（0.04 ≈ 明显更暗） */
  darkness?: number;
  /** 关卡开始时额外补充的灯油（0~1，占灯油上限比例） */
  oilBonus?: number;
}

export interface CurseDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  /** 玩家侧的回报：本关金币倍率 */
  goldMult: number;
  mods: CurseMods;
}

/**
 * 夜咒：每关开局随机降临的一层"风险—回报"修正。
 * 敌人更强，但金币产出更高——是否继续推进由玩家自己权衡（逃跑 = 放弃本关收益）。
 */
export const CURSES: CurseDef[] = [
  {
    id: 'swarmtide',
    name: '群潮',
    blurb: '敌人数量 +30%，金币 +35%',
    icon: '🐜',
    color: '#c96a2f',
    goldMult: 1.35,
    mods: { countMult: 1.3 },
  },
  {
    id: 'ironskin',
    name: '铁衣',
    blurb: '敌人生命 +35%，金币 +30%',
    icon: '🛡️',
    color: '#8fa7ff',
    goldMult: 1.3,
    mods: { hpMult: 1.35 },
  },
  {
    id: 'bloodrage',
    name: '血怒',
    blurb: '敌人伤害 +30%，金币 +30%',
    icon: '🩸',
    color: '#ff4d6d',
    goldMult: 1.3,
    mods: { dmgMult: 1.3 },
  },
  {
    id: 'deepdark',
    name: '深潜',
    blurb: '黑暗更浓，金币 +45%，开局补满灯油',
    icon: '🌑',
    color: '#8fa7ff',
    goldMult: 1.45,
    mods: { darkness: 0.045, oilBonus: 0.5 },
  },
  {
    id: 'longnight',
    name: '长夜',
    blurb: '本关波次 +2，金币 +60%',
    icon: '🌙',
    color: '#ffe27a',
    goldMult: 1.6,
    mods: { extraWaves: 2 },
  },
  {
    id: 'feast',
    name: '盛宴',
    blurb: '敌人数量 +20%、生命 +15%，金币 +70%',
    icon: '🍖',
    color: '#ff7a2f',
    goldMult: 1.7,
    mods: { countMult: 1.2, hpMult: 1.15 },
  },
  {
    id: 'nocturne',
    name: '夜曲',
    blurb: '黑暗更浓且敌人更多，金币 +55%',
    icon: '🎼',
    color: '#c9a3ff',
    goldMult: 1.55,
    mods: { darkness: 0.03, countMult: 1.15 },
  },
];

export const CURSE_MAP: Record<string, CurseDef> = Object.fromEntries(CURSES.map((c) => [c.id, c]));
