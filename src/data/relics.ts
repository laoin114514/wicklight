export type RelicRarity = 'common' | 'rare' | 'epic';

/** 遗物的「族」：同族凑够数量会触发灯火共鸣（额外加成）。 */
export type RelicTribeId = 'flame' | 'lamp' | 'oil' | 'shade';

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
  /** 灯台余温倍率（0.5 = 每座灯台的余温翻倍） */
  pyreBonus?: number;
  /** 灯焰被吹灭的速度降低（0.45 = 慢 45%） */
  pyreGuard?: number;
  /** 「掠影」热度积攒速度加成（0.45 = 攒得快 45%） */
  grazeHeat?: number;
  /** 「掠影」回油加成（1 = 擦出去的那口油翻倍） */
  grazeOil?: number;
  /** 「灯焰高涨」持续时长加成（0.5 = 六秒变九秒） */
  blazeTime?: number;
  /** 「灯焰高涨」期间的减伤（0.3 = 少挨三成） */
  blazeGuard?: number;
  /** 「爆灯」之后的短时伤害加成（0.35 = 那 4 秒里伤害 +35%） */
  overburnDamage?: number;
  /** 「爆灯」烧掉的油有多大比例会烧回来（0.5 = 一半） */
  overburnRefund?: number;
  /** 「爆灯」的灯火门槛降低（0.25 = 从 55% 降到 30%） */
  overburnEase?: number;
  /** 「爆灯」之后的短时减伤（0.45 = 少挨四成五） */
  overburnGuard?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  rarity: RelicRarity;
  price: number;
  /** 所属之族，用于灯火共鸣 */
  tribe: RelicTribeId;
  mods: RelicMods;
}

export interface TribeTier {
  /** 需要同族遗物的数量 */
  count: number;
  blurb: string;
  mods: RelicMods;
}

export interface TribeDef {
  id: RelicTribeId;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  tiers: TribeTier[];
}

export const RELICS: RelicDef[] = [
  { id: 'bandolier', tribe: 'flame', name: '弹药带', blurb: '所有武器额外多发射 1 发。', icon: '🎒', color: '#ffb14e', rarity: 'rare', price: 70, mods: { extraProjectiles: 1 } },
  { id: 'whetstone', tribe: 'flame', name: '磨石', blurb: '所有伤害 +18%。', icon: '🪨', color: '#ff7a2f', rarity: 'common', price: 50, mods: { damageMult: 0.18 } },
  { id: 'aegis', tribe: 'shade', name: '护盾符', blurb: '生命上限 +28%。', icon: '🛡️', color: '#8affc1', rarity: 'common', price: 50, mods: { maxHpMult: 0.28 } },
  { id: 'loom', tribe: 'shade', name: '织光囊', blurb: '拾取范围 +90%。', icon: '🧲', color: '#8affc1', rarity: 'common', price: 45, mods: { pickupMult: 0.9 } },
  { id: 'feather', tribe: 'lamp', name: '轻羽', blurb: '移动速度 +12%，冲刺冷却 -25%。', icon: '🪶', color: '#7be0ff', rarity: 'common', price: 45, mods: { moveSpeedMult: 0.12, dashMult: 0.25 } },
  { id: 'oilcan', tribe: 'oil', name: '油壶', blurb: '灯油燃烧速度 -32%。', icon: '🛢️', color: '#ffd24e', rarity: 'rare', price: 65, mods: { oilDecayMult: -0.32 } },
  { id: 'honeypot', tribe: 'oil', name: '蜜罐', blurb: '击杀掉落灯油 +60%。', icon: '🍯', color: '#ffd24e', rarity: 'common', price: 50, mods: { oilGainMult: 0.6 } },
  { id: 'scope', tribe: 'flame', name: '瞄准镜', blurb: '暴击率 +12%。', icon: '🎯', color: '#fff0a8', rarity: 'rare', price: 65, mods: { critChance: 0.12 } },
  { id: 'emberheart', tribe: 'flame', name: '余烬心', blurb: '暴击伤害 +65%。', icon: '💥', color: '#ff4d6d', rarity: 'rare', price: 70, mods: { critMult: 0.65 } },
  { id: 'thornring', tribe: 'flame', name: '荆棘环', blurb: '近身灼烧伤害翻倍以上。', icon: '🌵', color: '#ff9d2e', rarity: 'rare', price: 70, mods: { contactMult: 1.3 } },
  { id: 'chalice', tribe: 'lamp', name: '血杯', blurb: '造成伤害的 4% 转化为生命。', icon: '🍷', color: '#ff6b81', rarity: 'rare', price: 75, mods: { lifesteal: 0.04 } },
  { id: 'frostsigil', tribe: 'shade', name: '霜印', blurb: '所有命中令敌人减速 1.4 秒。', icon: '❄️', color: '#9ad0ff', rarity: 'rare', price: 75, mods: { chill: 1.4 } },
  { id: 'beacon', tribe: 'lamp', name: '长明灯', blurb: '技能范围 +20%，攻击冷却 -12%。', icon: '🕯️', color: '#ffe27a', rarity: 'epic', price: 95, mods: { areaMult: 0.2, cooldownMult: -0.12 } },
  { id: 'phoenixfeather', tribe: 'lamp', name: '不死羽', blurb: '每局额外复活 1 次。', icon: '🪽', color: '#ff6b81', rarity: 'epic', price: 110, mods: { revives: 1 } },
  { id: 'alchemy', tribe: 'oil', name: '点金手', blurb: '金币 +60%，伤害 +10%。', icon: '🪙', color: '#ffd24e', rarity: 'epic', price: 100, mods: { goldMult: 0.6, damageMult: 0.1 } },
  { id: 'embercrown', tribe: 'lamp', name: '余烬之冠', blurb: '燃爆回复 25 生命，范围 +15%。', icon: '👑', color: '#ff4d6d', rarity: 'epic', price: 100, mods: { novaHeal: 25, areaMult: 0.15 } },

  // ── 带取舍的契约型遗物：更强，但也要付出代价 ──
  { id: 'twinwick', tribe: 'shade', name: '双芯', blurb: '所有武器多发射 1 发，但攻击冷却 +18%。', icon: '🕯️', color: '#ffd24e', rarity: 'epic', price: 95, mods: { extraProjectiles: 1, cooldownMult: 0.18 } },
  { id: 'predator', tribe: 'shade', name: '掠食徽记', blurb: '伤害 +30%，但生命上限 -12%。', icon: '🐺', color: '#ff4d6d', rarity: 'rare', price: 75, mods: { damageMult: 0.3, maxHpMult: -0.12 } },
  { id: 'hunter', tribe: 'flame', name: '猎人之眼', blurb: '暴击率 +20%，但生命上限 -15%。', icon: '👁️', color: '#fff0a8', rarity: 'rare', price: 70, mods: { critChance: 0.2, maxHpMult: -0.15 } },
  { id: 'hushstone', tribe: 'oil', name: '静默石', blurb: '灯油燃烧 -45%，但移动速度 -8%。', icon: '🪨', color: '#8fa7ff', rarity: 'rare', price: 80, mods: { oilDecayMult: -0.45, moveSpeedMult: -0.08 } },
  { id: 'echo', tribe: 'lamp', name: '回声铃', blurb: '技能范围 +35%，但伤害 -12%。', icon: '🔔', color: '#c9a3ff', rarity: 'rare', price: 70, mods: { areaMult: 0.35, damageMult: -0.12 } },
  { id: 'glutton', tribe: 'oil', name: '贪食灯笼', blurb: '击杀掉落灯油 +100%，但拾取范围 -30%。', icon: '🫗', color: '#ffb14e', rarity: 'rare', price: 70, mods: { oilGainMult: 1.0, pickupMult: -0.3 } },
  { id: 'ascetic', tribe: 'flame', name: '苦修之环', blurb: '伤害 +40%，但灯油燃烧 +25%。', icon: '⭕', color: '#ff7a2f', rarity: 'epic', price: 100, mods: { damageMult: 0.4, oilDecayMult: 0.25 } },
  { id: 'bloodoath', tribe: 'shade', name: '血誓', blurb: '造成伤害的 3% 转为生命，伤害 +12%，生命上限 -10%。', icon: '🩸', color: '#ff6b81', rarity: 'epic', price: 105, mods: { lifesteal: 0.03, damageMult: 0.12, maxHpMult: -0.1 } },
  { id: 'lodestone', tribe: 'oil', name: '磁石', blurb: '拾取范围 +160%，金币 +25%。', icon: '🧿', color: '#8affc1', rarity: 'rare', price: 65, mods: { pickupMult: 1.6, goldMult: 0.25 } },
  { id: 'galeboots', tribe: 'lamp', name: '疾风靴', blurb: '移动速度 +22%，冲刺冷却 -40%。', icon: '👟', color: '#7be0ff', rarity: 'rare', price: 70, mods: { moveSpeedMult: 0.22, dashMult: 0.4 } },
  { id: 'viperfang', tribe: 'shade', name: '蝰牙', blurb: '命中令敌人减速 2.5 秒，伤害 +8%。', icon: '🐍', color: '#a8e05f', rarity: 'epic', price: 95, mods: { chill: 2.5, damageMult: 0.08 } },
  { id: 'thickhide', tribe: 'shade', name: '厚皮', blurb: '生命上限 +55%，但移动速度 -10%。', icon: '🐗', color: '#8affc1', rarity: 'epic', price: 95, mods: { maxHpMult: 0.55, moveSpeedMult: -0.1 } },
  { id: 'wickbrand', tribe: 'oil', name: '芯印', blurb: '灯油燃烧 -18%，伤害 +12%。', icon: '🔥', color: '#ffb14e', rarity: 'common', price: 55, mods: { oilDecayMult: -0.18, damageMult: 0.12 } },
  { id: 'nightowl', tribe: 'oil', name: '夜枭', blurb: '灯油低于 35% 时伤害 +45%。越接近熄灭越危险。', icon: '🦉', color: '#8fa7ff', rarity: 'epic', price: 100, mods: { lowOilDamage: 0.45 } },
  { id: 'lanternkeeper', tribe: 'lamp', name: '守灯人', blurb: '燃爆后 3 秒内伤害 +25%，并返还部分灯油。', icon: '🏮', color: '#ffe27a', rarity: 'epic', price: 100, mods: { novaBuff: 0.25 } },
  { id: 'glassheart', tribe: 'flame', name: '玻璃心', blurb: '伤害 +55%，但生命上限 -25%。', icon: '💠', color: '#ff4d6d', rarity: 'epic', price: 110, mods: { damageMult: 0.55, maxHpMult: -0.25 } },

  // ── 与「灯台」这条线打通的遗物：点灯不只是当下的取舍，值不值得守也取决于你带了什么 ──
  { id: 'nightwatch', tribe: 'lamp', name: '守夜灯', blurb: '每座灯台的余温翻倍，灯焰被吹灭的速度 -45%。', icon: '🏮', color: '#ffe27a', rarity: 'epic', price: 95, mods: { pyreBonus: 1, pyreGuard: 0.45 } },
  { id: 'faintheart', tribe: 'flame', name: '焚心', blurb: '伤害 +22%，暴击率 +10%，但拾取范围 -20%。', icon: '🔥', color: '#ff6b3d', rarity: 'epic', price: 100, mods: { damageMult: 0.22, critChance: 0.1, pickupMult: -0.2 } },
  { id: 'slowlamp', tribe: 'oil', name: '慢灯', blurb: '灯油燃烧 -25%；灯油越低伤害越高（最多 +20%）。', icon: '🫗', color: '#ffd24e', rarity: 'rare', price: 75, mods: { oilDecayMult: -0.25, lowOilDamage: 0.2 } },
  { id: 'shadowweave', tribe: 'shade', name: '影织', blurb: '生命上限 +18%，命中的敌人会被拖慢 1.8 秒。', icon: '🕸️', color: '#9a8cff', rarity: 'rare', price: 70, mods: { maxHpMult: 0.18, chill: 1.8 } },

  // ── 「掠影」这条线的构筑：擦着危险走本来只是一种走法，这四件把它变成一套牌 ──
  // 一件一族的理由：四件正好各补一族（凑到 10 件），想走掠影线就得在"哪一族"上做取舍。
  // 数值都不大（45% / +50% / 翻倍 / -30%），因为它们叠的是**同一件事**——
  // 都围着"贴着打"转，谁单独拿出来都改变不了走位，一起拿才成为一套打法。
  { id: 'blazecore', tribe: 'flame', name: '焰心', blurb: '「掠影」攒热度快 45%——焰来得更勤。', icon: '🎇', color: '#ff7a2f', rarity: 'rare', price: 70, mods: { grazeHeat: 0.45 } },
  { id: 'longwind', tribe: 'lamp', name: '长风', blurb: '「灯焰高涨」持续 +50%（六秒变九秒）。', icon: '🌬️', color: '#7be0ff', rarity: 'rare', price: 70, mods: { blazeTime: 0.5 } },
  { id: 'wickpick', tribe: 'oil', name: '撩芯', blurb: '每次「掠影」回的那口灯油翻倍。', icon: '🪔', color: '#ffd24e', rarity: 'common', price: 45, mods: { grazeOil: 1 } },
  { id: 'shadowstitch', tribe: 'shade', name: '影缝', blurb: '「灯焰高涨」期间受到伤害 -30%。', icon: '🧵', color: '#c9a3ff', rarity: 'epic', price: 95, mods: { blazeGuard: 0.3 } },

  // ── 「爆灯」这条线：把"一口气烧掉一大口油"变成一套牌 ──
  // 上一版把燃爆改成了"灯火过半就烧两倍的油、换一发更大的"（见 data/nova.ts），
  // 于是这条线有了四种问法：**烧得起吗**（火盆把门槛砍下去）、**烧完怎么办**（引线把油烧回来）、
  // **烧出去的那一下算不算数**（猛火把那四秒接上）、**烧的时候会不会被打死**（炭衣）。
  // 四件各补一族，凑到 11 件；数值都不大，因为四件叠的是同一件事——都围着"按下去那一发"转，
  // 单独一件改不了节奏，四件一起才成为一排"十几秒来一次"的爆发。
  { id: 'flareup', tribe: 'flame', name: '猛火', blurb: '「爆灯」之后 4 秒内伤害 +35%——火打出去了，人还在火里。', icon: '🔥', color: '#ff7a2f', rarity: 'epic', price: 100, mods: { overburnDamage: 0.35 } },
  { id: 'fuse', tribe: 'oil', name: '引线', blurb: '「爆灯」烧掉的油，一半会在 4 秒里从敌人身上烧回来。', icon: '🧨', color: '#ffd24e', rarity: 'epic', price: 105, mods: { overburnRefund: 0.5 } },
  { id: 'brazier', tribe: 'lamp', name: '火盆', blurb: '「爆灯」的门槛从 55% 灯火降到 30%——半桶就能点着。', icon: '🏺', color: '#ffe27a', rarity: 'epic', price: 95, mods: { overburnEase: 0.25 } },
  { id: 'charcoat', tribe: 'shade', name: '炭衣', blurb: '「爆灯」之后 3 秒内受到伤害 -45%。', icon: '🌫️', color: '#9a8cff', rarity: 'rare', price: 80, mods: { overburnGuard: 0.45 } },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export const RARITY_LABEL: Record<RelicRarity, string> = { common: '普通', rare: '稀有', epic: '史诗' };

/**
 * 灯火共鸣：同一族的遗物凑够 3 件、再凑够 5 件，各解锁一档加成。
 * 遗物本来就是「买哪件」的取舍，共鸣把这个取舍再往前推一步——
 * 散着拿是杂牌，凑成一族才是体系。
 */
export const TRIBES: TribeDef[] = [
  {
    id: 'flame',
    name: '焰火',
    icon: '🔥',
    color: '#ff7a2f',
    blurb: '只顾进攻：伤害与暴击。',
    tiers: [
      { count: 3, blurb: '伤害 +12%', mods: { damageMult: 0.12 } },
      { count: 5, blurb: '再 +18% 伤害 · 暴击伤害 +25%', mods: { damageMult: 0.18, critMult: 0.25 } },
    ],
  },
  {
    id: 'lamp',
    name: '长明',
    icon: '🕯️',
    color: '#ffe27a',
    blurb: '越亮越强：范围、冷却与续航。',
    tiers: [
      { count: 3, blurb: '范围 +10% · 冷却 -7%', mods: { areaMult: 0.1, cooldownMult: -0.07 } },
      { count: 5, blurb: '再 +10% 范围 · 移速 +10%', mods: { areaMult: 0.1, moveSpeedMult: 0.1 } },
    ],
  },
  {
    id: 'oil',
    name: '灯油',
    icon: '🛢️',
    color: '#ffd24e',
    blurb: '把每一滴油烧得更久：灯油与金币。',
    tiers: [
      { count: 3, blurb: '灯油耗率 -20% · 金币 +15%', mods: { oilDecayMult: -0.2, goldMult: 0.15 } },
      { count: 5, blurb: '再 +50% 掉落灯油 · 拾取 +30%', mods: { oilGainMult: 0.5, pickupMult: 0.3 } },
    ],
  },
  {
    id: 'shade',
    name: '暗影',
    icon: '🌑',
    color: '#9a8cff',
    blurb: '以代价换生存：血量、吸血与减缓。',
    tiers: [
      { count: 3, blurb: '生命上限 +10% · 暴击率 +6%', mods: { maxHpMult: 0.1, critChance: 0.06 } },
      { count: 5, blurb: '再 +3% 吸血 · 伤害 +10%', mods: { lifesteal: 0.03, damageMult: 0.1 } },
    ],
  },
];

export const TRIBE_MAP: Record<RelicTribeId, TribeDef> = Object.fromEntries(
  TRIBES.map((t) => [t.id, t]),
) as Record<RelicTribeId, TribeDef>;
