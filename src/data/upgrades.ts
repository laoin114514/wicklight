import type { PassiveDef } from '../types';

export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  pickupRange: number;
  critChance: number;
  critMult: number;
  regen: number;
  oilDecayMult: number;
  oilGainMult: number;
  burnMult: number;
  healOnLight: number;
  dashCooldown: number;
  luck: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 100,
    moveSpeed: 220,
    damageMult: 1,
    cooldownMult: 1,
    areaMult: 1,
    pickupRange: 92,
    critChance: 0.06,
    critMult: 1.8,
    regen: 0,
    oilDecayMult: 1,
    oilGainMult: 1,
    burnMult: 1,
    healOnLight: 0,
    dashCooldown: 1.6,
    luck: 0,
  };
}

export interface PassiveDefFull extends PassiveDef {
  apply: (s: PlayerStats, level: number) => void;
}

export const PASSIVES: PassiveDefFull[] = [
  { id: 'swift', name: '疾行', blurb: '移动速度 +8%', icon: '🌀', color: '#7be0ff', maxLevel: 5, apply: (s, l) => (s.moveSpeed *= 1 + 0.08 * l) },
  { id: 'magnet', name: '拾光', blurb: '拾取范围 +22%', icon: '🧲', color: '#8affc1', maxLevel: 4, apply: (s, l) => (s.pickupRange *= 1 + 0.22 * l) },
  { id: 'vitality', name: '暖意', blurb: '生命上限 +18', icon: '❤️', color: '#ff6b81', maxLevel: 5, apply: (s, l) => (s.maxHp += 18 * l) },
  { id: 'regen', name: '复燃', blurb: '每秒回复 +0.5 生命', icon: '🩹', color: '#ffb3c1', maxLevel: 4, apply: (s, l) => (s.regen += 0.5 * l) },
  { id: 'might', name: '灼心', blurb: '所有伤害 +12%', icon: '⚔️', color: '#ff7a2f', maxLevel: 6, apply: (s, l) => (s.damageMult *= 1 + 0.12 * l) },
  { id: 'haste', name: '疾燃', blurb: '攻击冷却 -9%', icon: '⚡', color: '#ffe27a', maxLevel: 5, apply: (s, l) => (s.cooldownMult *= Math.pow(0.91, l)) },
  { id: 'reach', name: '广照', blurb: '技能范围 +14%', icon: '🌐', color: '#c9a3ff', maxLevel: 5, apply: (s, l) => (s.areaMult *= 1 + 0.14 * l) },
  { id: 'crit', name: '星火', blurb: '暴击率 +7%', icon: '✦', color: '#fff0a8', maxLevel: 5, apply: (s, l) => (s.critChance += 0.07 * l) },
  { id: 'longlasting', name: '长明', blurb: '灯油衰减 -12%', icon: '🕯️', color: '#ffd24e', maxLevel: 5, apply: (s, l) => (s.oilDecayMult *= Math.pow(0.88, l)) },
  { id: 'oilrain', name: '油雨', blurb: '击杀掉落灯油 +25%', icon: '💧', color: '#8affc1', maxLevel: 5, apply: (s, l) => (s.oilGainMult *= 1 + 0.25 * l) },
  { id: 'scorch', name: '燎原', blurb: '灼烧伤害 +40%', icon: '🔥', color: '#ff5a1f', maxLevel: 5, apply: (s, l) => (s.burnMult *= 1 + 0.4 * l) },
  { id: 'warmlight', name: '暖光', blurb: '光照中每秒回复 +0.6 生命', icon: '🌞', color: '#ffb14e', maxLevel: 4, apply: (s, l) => (s.healOnLight += 0.6 * l) },
  { id: 'focusgem', name: '夜视', blurb: '黑暗中敌人可见并减速 12%', icon: '👁️', color: '#9ad0ff', maxLevel: 3, apply: (s, l) => (s.luck += 0.12 * l) },
  { id: 'emberheart', name: '余烬之心', blurb: '暴击伤害 +20%', icon: '💥', color: '#ff4d6d', maxLevel: 4, apply: (s, l) => (s.critMult += 0.2 * l) },
];

export const PASSIVE_MAP: Record<string, PassiveDefFull> = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));
