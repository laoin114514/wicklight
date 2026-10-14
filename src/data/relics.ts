export type RelicRarity = 'common' | 'rare' | 'epic';

export interface RelicMods {
  damageMult?: number;
  maxHpMult?: number;
  pickupMult?: number;
  moveSpeedMult?: number;
  critChance?: number;
  critMult?: number;
  dashMult?: number;
  regen?: number;
  oilDecayMult?: number;
  oilGainMult?: number;
  areaMult?: number;
  cooldownMult?: number;
  extraProjectiles?: number;
  lifesteal?: number;
  chill?: number;
  contactMult?: number;
  goldMult?: number;
  novaHeal?: number;
  revives?: number;
  /** 灯油偏低时的额外伤害倍率（0.45 = +45%） */
  lowOilDamage?: number;
  /** 燃爆后短时间内获得的伤害倍率（同时意味着会返还部分灯油） */
  novaBuff?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  rarity: RelicRarity;
  price: number;
  mods: RelicMods;
}

export const RELICS: RelicDef[] = [
  { id: 'bandolier', name: '弹药带', blurb: '所有武器额外多发射 1 发。', icon: '🎒', color: '#ffb14e', rarity: 'rare', price: 70, mods: { extraProjectiles: 1 } },
  { id: 'whetstone', name: '磨石', blurb: '所有伤害 +18%。', icon: '🪨', color: '#ff7a2f', rarity: 'common', price: 50, mods: { damageMult: 0.18 } },
  { id: 'aegis', name: '护盾符', blurb: '生命上限 +28%。', icon: '🛡️', color: '#8affc1', rarity: 'common', price: 50, mods: { maxHpMult: 0.28 } },
  { id: 'loom', name: '织光囊', blurb: '拾取范围 +90%。', icon: '🧲', color: '#8affc1', rarity: 'common', price: 45, mods: { pickupMult: 0.9 } },
  { id: 'feather', name: '轻羽', blurb: '移动速度 +12%，冲刺冷却 -25%。', icon: '🪶', color: '#7be0ff', rarity: 'common', price: 45, mods: { moveSpeedMult: 0.12, dashMult: 0.25 } },
  { id: 'oilcan', name: '油壶', blurb: '灯油燃烧速度 -32%。', icon: '🛢️', color: '#ffd24e', rarity: 'rare', price: 65, mods: { oilDecayMult: -0.32 } },
  { id: 'honeypot', name: '蜜罐', blurb: '击杀掉落灯油 +60%。', icon: '🍯', color: '#ffd24e', rarity: 'common', price: 50, mods: { oilGainMult: 0.6 } },
  { id: 'scope', name: '瞄准镜', blurb: '暴击率 +12%。', icon: '🎯', color: '#fff0a8', rarity: 'rare', price: 65, mods: { critChance: 0.12 } },
  { id: 'emberheart', name: '余烬心', blurb: '暴击伤害 +65%。', icon: '💥', color: '#ff4d6d', rarity: 'rare', price: 70, mods: { critMult: 0.65 } },
  { id: 'thornring', name: '荆棘环', blurb: '近身灼烧伤害翻倍以上。', icon: '🌵', color: '#ff9d2e', rarity: 'rare', price: 70, mods: { contactMult: 1.3 } },
  { id: 'chalice', name: '血杯', blurb: '造成伤害的 4% 转化为生命。', icon: '🍷', color: '#ff6b81', rarity: 'rare', price: 75, mods: { lifesteal: 0.04 } },
  { id: 'frostsigil', name: '霜印', blurb: '所有命中令敌人减速 1.4 秒。', icon: '❄️', color: '#9ad0ff', rarity: 'rare', price: 75, mods: { chill: 1.4 } },
  { id: 'beacon', name: '长明灯', blurb: '技能范围 +20%，攻击冷却 -12%。', icon: '🕯️', color: '#ffe27a', rarity: 'epic', price: 95, mods: { areaMult: 0.2, cooldownMult: -0.12 } },
  { id: 'phoenixfeather', name: '不死羽', blurb: '每局额外复活 1 次。', icon: '🪽', color: '#ff6b81', rarity: 'epic', price: 110, mods: { revives: 1 } },
  { id: 'alchemy', name: '点金手', blurb: '金币 +60%，伤害 +10%。', icon: '🪙', color: '#ffd24e', rarity: 'epic', price: 100, mods: { goldMult: 0.6, damageMult: 0.1 } },
  { id: 'embercrown', name: '余烬之冠', blurb: '燃爆回复 25 生命，范围 +15%。', icon: '👑', color: '#ff4d6d', rarity: 'epic', price: 100, mods: { novaHeal: 25, areaMult: 0.15 } },

  // ── 带取舍的契约型遗物：更强，但也要付出代价 ──
  { id: 'twinwick', name: '双芯', blurb: '所有武器多发射 1 发，但攻击冷却 +18%。', icon: '🕯️', color: '#ffd24e', rarity: 'epic', price: 95, mods: { extraProjectiles: 1, cooldownMult: 0.18 } },
  { id: 'predator', name: '掠食徽记', blurb: '伤害 +30%，但生命上限 -12%。', icon: '🐺', color: '#ff4d6d', rarity: 'rare', price: 75, mods: { damageMult: 0.3, maxHpMult: -0.12 } },
  { id: 'hunter', name: '猎人之眼', blurb: '暴击率 +20%，但生命上限 -15%。', icon: '👁️', color: '#fff0a8', rarity: 'rare', price: 70, mods: { critChance: 0.2, maxHpMult: -0.15 } },
  { id: 'hushstone', name: '静默石', blurb: '灯油燃烧 -45%，但移动速度 -8%。', icon: '🪨', color: '#8fa7ff', rarity: 'rare', price: 80, mods: { oilDecayMult: -0.45, moveSpeedMult: -0.08 } },
  { id: 'echo', name: '回声铃', blurb: '技能范围 +35%，但伤害 -12%。', icon: '🔔', color: '#c9a3ff', rarity: 'rare', price: 70, mods: { areaMult: 0.35, damageMult: -0.12 } },
  { id: 'glutton', name: '贪食灯笼', blurb: '击杀掉落灯油 +100%，但拾取范围 -30%。', icon: '🫗', color: '#ffb14e', rarity: 'rare', price: 70, mods: { oilGainMult: 1.0, pickupMult: -0.3 } },
  { id: 'ascetic', name: '苦修之环', blurb: '伤害 +40%，但灯油燃烧 +25%。', icon: '⭕', color: '#ff7a2f', rarity: 'epic', price: 100, mods: { damageMult: 0.4, oilDecayMult: 0.25 } },
  { id: 'bloodoath', name: '血誓', blurb: '造成伤害的 3% 转为生命，伤害 +12%，生命上限 -10%。', icon: '🩸', color: '#ff6b81', rarity: 'epic', price: 105, mods: { lifesteal: 0.03, damageMult: 0.12, maxHpMult: -0.1 } },
  { id: 'lodestone', name: '磁石', blurb: '拾取范围 +160%，金币 +25%。', icon: '🧿', color: '#8affc1', rarity: 'rare', price: 65, mods: { pickupMult: 1.6, goldMult: 0.25 } },
  { id: 'galeboots', name: '疾风靴', blurb: '移动速度 +22%，冲刺冷却 -40%。', icon: '👟', color: '#7be0ff', rarity: 'rare', price: 70, mods: { moveSpeedMult: 0.22, dashMult: 0.4 } },
  { id: 'viperfang', name: '蝰牙', blurb: '命中令敌人减速 2.5 秒，伤害 +8%。', icon: '🐍', color: '#a8e05f', rarity: 'epic', price: 95, mods: { chill: 2.5, damageMult: 0.08 } },
  { id: 'thickhide', name: '厚皮', blurb: '生命上限 +55%，但移动速度 -10%。', icon: '🐗', color: '#8affc1', rarity: 'epic', price: 95, mods: { maxHpMult: 0.55, moveSpeedMult: -0.1 } },
  { id: 'wickbrand', name: '芯印', blurb: '灯油燃烧 -18%，伤害 +12%。', icon: '🔥', color: '#ffb14e', rarity: 'common', price: 55, mods: { oilDecayMult: -0.18, damageMult: 0.12 } },
  { id: 'nightowl', name: '夜枭', blurb: '灯油低于 35% 时伤害 +45%。越接近熄灭越危险。', icon: '🦉', color: '#8fa7ff', rarity: 'epic', price: 100, mods: { lowOilDamage: 0.45 } },
  { id: 'lanternkeeper', name: '守灯人', blurb: '燃爆后 3 秒内伤害 +25%，并返还部分灯油。', icon: '🏮', color: '#ffe27a', rarity: 'epic', price: 100, mods: { novaBuff: 0.25 } },
  { id: 'glassheart', name: '玻璃心', blurb: '伤害 +55%，但生命上限 -25%。', icon: '💠', color: '#ff4d6d', rarity: 'epic', price: 110, mods: { damageMult: 0.55, maxHpMult: -0.25 } },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export const RARITY_LABEL: Record<RelicRarity, string> = { common: '普通', rare: '稀有', epic: '史诗' };
