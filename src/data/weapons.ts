import type { WeaponDef, WeaponStats } from '../types';

function scale(base: WeaponStats, growth: Partial<Record<keyof WeaponStats, number>>, count = 5): WeaponStats[] {
  const out: WeaponStats[] = [];
  for (let i = 0; i < count; i += 1) {
    const s: WeaponStats = { ...base };
    for (const k of Object.keys(growth) as (keyof WeaponStats)[]) {
      const g = growth[k] as number;
      if (k === 'cooldown') {
        s.cooldown = base.cooldown * Math.pow(g, i);
        continue;
      }
      // 可选的那些（「旋灯」的 drag 是个 0/1 开关）不参与长大，谁都不用管它
      const from = base[k];
      if (typeof from !== 'number') continue;
      s[k] = from + g * i;
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
    id: 'beam',
    name: '光矛',
    kind: 'beam',
    color: '#fff3c4',
    blurb: '瞬发一道贯穿光束，沿途所有敌人都被串起来。',
    levels: scale({ ...base, damage: 24, cooldown: 1.6, count: 1, speed: 0, range: 430, radius: 13, pierce: 99, spread: 0, knockback: 140 }, { damage: 11, radius: 2, range: 34, cooldown: 0.92 }),
    evolve: { passive: 'reach', into: 'beam_dawnbreak' },
  },
  {
    id: 'boomerang',
    name: '回旋灯刃',
    kind: 'boomerang',
    color: '#8ff0c8',
    blurb: '掷出灯刃再飞回手里，去程与回程各能伤到一次。',
    levels: scale({ ...base, damage: 17, cooldown: 1.5, count: 1, speed: 470, range: 300, radius: 12, pierce: 99, knockback: 90 }, { damage: 8, count: 1, range: 22, cooldown: 0.92 }),
    evolve: { passive: 'swift', into: 'blade_twinmoon' },
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

  // 「伏灯」这两件里，`range` 是**踩响**的距离，`radius` 是它炸多大一片。
  // `burn` 对它们又是另一件事：那是"炸完在地上留下的那片火烧几层"，
  // 0 就是不留火——所以 1 级的伏灯只炸一圈，进化的连珠伏灯才留一片
  // （留火的时间 / 伤害在 data/mines.ts 的 fireLife / fireDps）。
  {
    id: 'mine',
    name: '伏灯',
    kind: 'mine',
    color: '#ffca7a',
    blurb: '跑着往身后撒一颗伏灯：上弦之后被踩到就炸一圈。',
    levels: scale(
      { ...base, damage: 34, cooldown: 2.6, count: 1, speed: 0, range: 40, radius: 58, pierce: 0, spread: 0, knockback: 95 },
      { damage: 16, cooldown: 0.92, count: 0.25, radius: 5, range: 4 },
    ),
    evolve: { passive: 'might', into: 'mine_chain' },
  },

  // 「旋灯」：这一局里第一件给别人打下手的武器。伤害不是它的活——
  // 它把一群人拢到同一点，让燃爆 / 光矛 / 雷弧 / 伏灯去打那一点。
  {
    id: 'vortex',
    name: '旋灯',
    kind: 'vortex',
    color: '#8fb8ff',
    blurb: '扔出去一盏会转的灯：把一圈人往里拽、拢到一点，转完缩成一下炸。',
    levels: scale(
      { ...base, damage: 24, cooldown: 3.1, count: 1, speed: 0, range: 250, radius: 116, pierce: 0, spread: 0, knockback: 0, slow: 0, drag: 0 },
      { damage: 11, cooldown: 0.88, radius: 9, range: 12 },
    ),
    evolve: { passive: 'magnet', into: 'vortex_maelstrom' },
  },

  // 「倾灯」：这一局里第一件**花油**的武器。到 v58 为止，灯油只是一条"捡得越多越亮"的曲线；
  // 它把这条曲线变成弹药——倒出去一瓢就是一片火海，代价是你接下来会明显暗一阵。
  // 于是"灯火"从一件只能攒的东西，变成一件要决定什么时候花的东西。
  {
    id: 'pour',
    name: '倾灯',
    kind: 'pour',
    color: '#f0a13c',
    blurb: '把灯火本身倒出去：一瓢砸出一片火海，倒完自己也暗一阵。',
    levels: scale(
      { ...base, damage: 58, cooldown: 2.5, count: 1, speed: 200, range: 300, radius: 88, pierce: 0, spread: 0, knockback: 150, burn: 2, pour: 0.15 },
      { damage: 17, cooldown: 0.9, radius: 7, range: 14, burn: 1, pour: -0.012 },
    ),
    evolve: { passive: 'oilrain', into: 'pour_tide' },
  },
  {
    id: 'aura',
    name: '燎灯',
    kind: 'aura',
    color: '#ffd08a',
    blurb: '你的灯光本身在烧：罩在光里的敌人，每隔一下就被烤一遍。',
    // `range` / `radius` / `count` / `speed` 都留 0：这一件不发射任何东西，它的**射程就是灯火半径**
    // （见 data/aura.ts 里那一段）。真正跟着等级长的只有两样——每一下有多重、心跳有多快。
    // `knockback: 0`：光不推人——而且真推的话，怪会被一下一下推出光圈，等于这件武器在拆自己的台。
    levels: scale({ ...base, damage: 5, cooldown: 0.44, count: 0, speed: 0, range: 0, radius: 0, knockback: 0 }, { damage: 1.25, cooldown: 0.94 }),
    evolve: { passive: 'scorch', into: 'aura_wild' },
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
    id: 'beam_dawnbreak',
    name: '晨光破晓',
    kind: 'beam',
    color: '#fffbe0',
    blurb: '贯穿全场的黎明光束，命中即点燃。',
    evolved: true,
    levels: scale({ ...base, damage: 78, cooldown: 0.95, count: 2, speed: 0, range: 900, radius: 30, pierce: 99, burn: 3, knockback: 260 }, { damage: 30, radius: 4, count: 1, cooldown: 0.94 }),
  },
  {
    id: 'blade_twinmoon',
    name: '双月轮',
    kind: 'boomerang',
    color: '#c8ffe8',
    blurb: '三枚月轮同时旋出，回程还会把敌人拖住。',
    evolved: true,
    levels: scale({ ...base, damage: 44, cooldown: 0.85, count: 3, speed: 620, range: 460, radius: 17, pierce: 99, slow: 1.6, knockback: 140 }, { damage: 17, range: 26, slow: 0.4, cooldown: 0.93 }),
  },
  {
    id: 'vortex_maelstrom',
    name: '漩涡灯',
    kind: 'vortex',
    color: '#a8d8ff',
    blurb: '一次两盏，而且连弹幕一起卷：卷到中心的那些，还没打到你就不见了。',
    evolved: true,
    levels: scale(
      { ...base, damage: 78, cooldown: 1.6, count: 2, speed: 0, range: 320, radius: 152, pierce: 0, spread: 0, knockback: 0, slow: 0, drag: 1, burn: 1 },
      { damage: 22, cooldown: 0.93, radius: 10, range: 14 },
    ),
  },
  {
    id: 'pour_tide',
    name: '灯潮',
    kind: 'pour',
    color: '#ffd08a',
    blurb: '一瓢变三瓢：扇形泼出去，一片接着一片地烧，还是那一瓢的价钱。',
    evolved: true,
    levels: scale(
      { ...base, damage: 132, cooldown: 2.2, count: 3, speed: 210, range: 330, radius: 104, pierce: 0, spread: 0.62, knockback: 170, burn: 3, pour: 0.15 },
      { damage: 20, cooldown: 0.93, radius: 5, range: 12, burn: 1 },
    ),
  },
  {
    id: 'mine_chain',
    name: '连珠伏灯',
    kind: 'mine',
    color: '#ffb14e',
    blurb: '一次布下两颗，炸完还留一片火——一条会自己烧起来的路。',
    evolved: true,
    levels: scale(
      { ...base, damage: 104, cooldown: 1.5, count: 2, speed: 0, range: 60, radius: 92, pierce: 0, spread: 0, knockback: 140, burn: 2 },
      { damage: 22, cooldown: 0.93, radius: 6, range: 3 },
    ),
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
  {
    id: 'aura_wild',
    name: '燎野',
    kind: 'aura',
    color: '#ffb14e',
    blurb: '火从灯里漫出去：烫得更勤、更狠，而且每一跳都在敌人身上留一层火。',
    // `range` 在这一件里是**灯火之外再烧出去多远**（60px）：灯照不到的地方，火还能烧到一点点。
    // 于是"燎野"和"燎原"（被动，灼烧伤害 +40%）连着用才对——它现在一半的输出在灼烧那条账上。
    levels: scale({ ...base, damage: 11, cooldown: 0.3, count: 0, speed: 0, range: 60, radius: 0, burn: 1, knockback: 0 }, { damage: 2, cooldown: 0.95 }),
    evolved: true,
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export function weaponAt(id: string, level: number): WeaponStats {
  const def = WEAPON_MAP[id];
  const idx = Math.max(0, Math.min(def.levels.length - 1, level - 1));
  return def.levels[idx];
}

export const STARTER_WEAPONS = ['ring', 'wisp', 'fireball', 'whip', 'shard', 'spray'] as const;

/**
 * 升级面板里"新武器"这一档的候选：**所有非进化的武器，去掉开局就有的那六件**。
 *
 * ⚠ 这一份是**从数据表派生**出来的，不是手抄的 id 清单——手抄过一回，漏了两回：
 * v62 加「旋灯」、v73 加「燎灯」，两次都没往那张手写的表里补一笔。于是这两件武器
 * 数据齐全、图鉴有词条、成就挂着、体检脚本也在跑，**可玩家一局都抽不到它**。
 * 一件进不了升级池的武器等于不存在，而这类漏法**不会报任何错**：它只是安静地少一个选项。
 * 所以这里改成"谁在武器表里谁就是候选"，并且让 tests/aura.test.mjs 里那条用例真的去抽
 * 三百次升级面板、把"抽不到"变成一条会红的断言——从两头把它堵死。
 *
 * 进化的形态不在这里：它们只能由"满级 + 对应被动满级"那条路解锁（见 UpgradeSystem）。
 */
export const NEW_WEAPON_POOL: readonly string[] = WEAPONS.filter(
  (w) => !w.evolved && !(STARTER_WEAPONS as readonly string[]).includes(w.id),
).map((w) => w.id);
