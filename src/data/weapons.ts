import type { WeaponDef, WeaponStats } from '../types';

function scale(base: WeaponStats, growth: Partial<Record<keyof WeaponStats, number>>, count = 5): WeaponStats[] {
  const out: WeaponStats[] = [];
  for (let i = 0; i < count; i += 1) {
    const s: WeaponStats = { ...base };
    for (const k of Object.keys(growth) as (keyof WeaponStats)[]) {
      const g = growth[k] as number;
      if (k === 'cooldown') s.cooldown = base.cooldown * Math.pow(g, i);
      else s[k] = base[k] + g * i;
    }
    out.push(s);
  }
  return out;
}

const base: Omit<WeaponStats, never> = {
  damage: 8,
  cooldown: 1,
  count: 1,
  speed: 320,
  range: 260,
  radius: 8,
  pierce: 0,
  spread: 0.2,
  knockback: 60,
  burn: 0,
  slow: 0,
};

export const WEAPONS: WeaponDef[] = [
  {
    id: 'ring',
    name: '环形火环',
    kind: 'orbit',
    color: '#ffb14e',
    blurb: '围绕你旋转的火焰，触碰即灼烧。',
    levels: scale({ ...base, damage: 9, cooldown: 0, count: 2, speed: 2.2, radius: 12, range: 76 }, { damage: 4, count: 1, radius: 2, speed: 0.15, range: 6 }),
    evolve: { passive: 'longlasting', into: 'ring_corona' },
  },
  {
    id: 'wisp',
    name: '追踪火苗',
    kind: 'wisp',
    color: '#7be0ff',
    blurb: '自动追向最近的黑暗，射出飞萤。',
    levels: scale({ ...base, damage: 6, cooldown: 1.1, count: 1, speed: 300, radius: 7, pierce: 0, range: 340 }, { damage: 3, count: 1, cooldown: 0.9, pierce: 1 }),
    evolve: { passive: 'oilrain', into: 'wisp_swarm' },
  },
  {
    id: 'fireball',
    name: '爆裂火球',
    kind: 'fireball',
    color: '#ff7a2f',
    blurb: '抛出会爆炸的火球，范围灼烧。',
    levels: scale({ ...base, damage: 22, cooldown: 1.9, count: 1, speed: 240, radius: 20, range: 300 }, { damage: 10, count: 1, radius: 4, cooldown: 0.94 }),
    evolve: { passive: 'scorch', into: 'fireball_sunfall' },
  },
  {
    id: 'whip',
    name: '烈焰鞭',
    kind: 'whip',
    color: '#ff4d6d',
    blurb: '朝索敌方向挥出燃烧弧刃，可击退。',
    levels: scale({ ...base, damage: 14, cooldown: 1.2, count: 1, range: 130, radius: 46, spread: 1.1, knockback: 220 }, { damage: 7, range: 12, radius: 6, knockback: 40 }),
    evolve: { passive: 'warmlight', into: 'whip_dragonbreath' },
  },
  {
    id: 'shard',
    name: '光刃碎片',
    kind: 'shard',
    color: '#ffe27a',
    blurb: '射出可穿透多个敌人的细长光刃。',
    levels: scale({ ...base, damage: 10, cooldown: 1.0, count: 1, speed: 640, radius: 7, pierce: 2, range: 520 }, { damage: 5, count: 1, pierce: 2, cooldown: 0.93 }),
    evolve: { passive: 'focusgem', into: 'shard_dawnlance' },
  },
  {
    id: 'spray',
    name: '灯油喷射',
    kind: 'spray',
    color: '#ffd24e',
    blurb: '喷出短程火舌，同时点燃多个目标。',
    levels: scale({ ...base, damage: 5, cooldown: 0.5, count: 3, range: 150, radius: 10, spread: 0.7, burn: 1 }, { damage: 3, count: 1, range: 12, burn: 0.5 }),
    evolve: { passive: 'oilrain', into: 'spray_firestorm' },
  },

  {
    id: 'arc',
    name: '雷弧',
    kind: 'arc',
    color: '#8ff0ff',
    blurb: '在敌人之间跳跃的闪电，跳跃次数越多衰减越小。',
    levels: scale({ ...base, damage: 16, cooldown: 1.7, count: 1, speed: 0, range: 320, radius: 0, pierce: 2, spread: 0, knockback: 30 }, { damage: 8, pierce: 1, cooldown: 0.9, range: 22 }),
    evolve: { passive: 'crit', into: 'arc_tempest' },
  },
  {
    id: 'frost',
    name: '霜棱',
    kind: 'shard',
    color: '#9ad0ff',
    blurb: '射出霜棱，命中令敌人减速。',
    levels: scale({ ...base, damage: 8, cooldown: 1.0, count: 1, speed: 620, radius: 8, pierce: 1, range: 480, slow: 1.4 }, { damage: 4, count: 1, pierce: 1, slow: 0.3, cooldown: 0.93 }),
    evolve: { passive: 'haste', into: 'frost_glacier' },
  },

  // ── Evolved forms (unlocked via UpgradeSystem) ──
  {
    id: 'ring_corona',
    name: '日冕',
    kind: 'orbit',
    color: '#fff0a8',
    blurb: '恒定的火焰光环，范围巨大且不熄灭。',
    evolved: true,
    levels: scale({ ...base, damage: 46, cooldown: 0, count: 5, speed: 2.6, radius: 20, range: 118, burn: 2 }, { damage: 18, count: 1, radius: 3, range: 8 }),
  },
  {
    id: 'wisp_swarm',
    name: '群萤',
    kind: 'wisp',
    color: '#a8f0ff',
    blurb: '成群的飞萤追踪黑暗，穿刺后继续飞行。',
    evolved: true,
    levels: scale({ ...base, damage: 24, cooldown: 0.6, count: 4, speed: 380, radius: 9, pierce: 3, range: 420 }, { damage: 10, count: 1, pierce: 2 }),
  },
  {
    id: 'fireball_sunfall',
    name: '陨火',
    kind: 'fireball',
    color: '#ff5a1f',
    blurb: '天降陨火，爆炸范围与灼烧大幅提升。',
    evolved: true,
    levels: scale({ ...base, damage: 74, cooldown: 1.5, count: 3, speed: 260, radius: 40, range: 340, burn: 2 }, { damage: 30, count: 1, radius: 6 }),
  },
  {
    id: 'whip_dragonbreath',
    name: '龙息',
    kind: 'whip',
    color: '#ff2d55',
    blurb: '横扫的烈焰，击退并点燃整片区域。',
    evolved: true,
    levels: scale({ ...base, damage: 58, cooldown: 0.95, count: 1, range: 200, radius: 74, spread: 1.5, knockback: 340, burn: 2 }, { damage: 24, range: 16, radius: 8 }),
  },
  {
    id: 'shard_dawnlance',
    name: '破晓长枪',
    kind: 'shard',
    color: '#fffbe0',
    blurb: '贯穿全场的光之枪，无视绝大多数敌人。',
    evolved: true,
    levels: scale({ ...base, damage: 48, cooldown: 0.7, count: 3, speed: 780, radius: 10, pierce: 9, range: 720 }, { damage: 20, count: 1, pierce: 3 }),
  },
  {
    id: 'frost_glacier',
    name: '永冻冰川',
    kind: 'shard',
    color: '#c7e6ff',
    blurb: '冰川长矛贯穿敌阵，并将一切冻结在原地。',
    evolved: true,
    levels: scale({ ...base, damage: 40, cooldown: 0.78, count: 3, speed: 760, radius: 11, pierce: 6, range: 660, slow: 2.4 }, { damage: 16, count: 1, pierce: 2, slow: 0.4 }),
  },
  {
    id: 'arc_tempest',
    name: '千雷',
    kind: 'arc',
    color: '#d8f6ff',
    blurb: '撕裂黑夜的雷暴，沿敌群连续跳跃并留下灼痕。',
    evolved: true,
    levels: scale({ ...base, damage: 42, cooldown: 1.05, count: 1, speed: 0, range: 460, radius: 0, pierce: 6, spread: 0, knockback: 40, burn: 1 }, { damage: 16, pierce: 2, cooldown: 0.94, range: 26 }),
  },
  {
    id: 'spray_firestorm',
    name: '焚风',
    kind: 'spray',
    color: '#ff9d2e',
    blurb: '扇形的炽热火风，持续焚烧。',
    evolved: true,
    levels: scale({ ...base, damage: 20, cooldown: 0.34, count: 5, range: 210, radius: 14, spread: 0.9, burn: 3 }, { damage: 8, count: 1, burn: 1 }),
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export function weaponAt(id: string, level: number): WeaponStats {
  const def = WEAPON_MAP[id];
  const idx = Math.max(0, Math.min(def.levels.length - 1, level - 1));
  return def.levels[idx];
}

export const STARTER_WEAPONS = ['ring', 'wisp', 'fireball', 'whip', 'shard', 'spray'] as const;
export const NEW_WEAPON_POOL = ['wisp', 'fireball', 'whip', 'shard', 'spray', 'ring', 'frost', 'arc'] as const;
