/**
 * 图鉴（编年史）：把数据表里的一切都当成可以"被玩家看见"的条目。
 *
 * 设计上刻意做成"扫描式"而不是到处埋点：能拿到玩家状态的时刻调用 syncFromRun 扫一遍，
 * 敌人 / 精英词缀这类不在玩家身上的东西再单独 discover。这样以后新增遗物或武器时，
 * 只要它在数据表里，就会被自动纳入图鉴。
 */
import { AFFIXES } from '../data/affixes';
import { ENEMY_MAP } from '../data/enemies';
import { CURSES } from '../data/curses';
import { ENEMIES } from '../data/enemies';
import { LANTERNS } from '../data/lanterns';
import { RELICS } from '../data/relics';
import { STAGES } from '../data/stages';
import { GRAZE } from '../data/graze';
import { MINE } from '../data/mines';
import { PASSIVES, PASSIVE_MAP } from '../data/upgrades';
import { WEAPONS } from '../data/weapons';
import { WEAPON_MAP } from '../data/weapons';
import type { Player } from '../entities/Player';
import type { SaveData } from '../types';

export type CodexKind = 'enemy' | 'weapon' | 'relic' | 'passive' | 'curse' | 'affix' | 'lantern' | 'stage' | 'hazard' | 'mechanic';

export interface CodexEntry {
  kind: CodexKind;
  id: string;
  name: string;
  blurb: string;
  /** 副标题，例如"首领""进化""稀有" */
  tag?: string;
  color?: string;
  icon?: string;
  /** 详情页的数值行（名称 → 数值），让图鉴不只是收藏，还能当手册查 */
  rows?: [string, string][];
  /** 详情页的补充说明（进化链、应对要点之类） */
  extra?: string;
}

/** 敌人行为的玩家向说法。 */
const BEHAVIOR_LABEL: Record<string, string> = {
  chase: '直线追击',
  dash: '短距突进',
  ranged: '保持距离射击',
  dive: '高速俯冲',
  tank: '厚甲慢行',
  drain: '偷取灯油',
  bomber: '贴身自爆',
  charge: '蓄力直线突进',
  beacon: '速度光环',
  echo: '沿你一秒前的路径追击',
  weaver: '留下滞行雾',
  siphon: '吊在中距离抽取灯火',
  quench: '专扑你点亮的灯台',
};

/** 关卡险境的玩家向说法。 */
export const HAZARD_LABEL: Record<string, string> = {
  fog: '浓雾',
  meteor: '陨石雨',
  collapse: '塌方',
  wispstorm: '相位风暴',
  eruption: '熔岩喷发',
  oilvoid: '灯油枯竭',
  echoes: '回声涌来',
  bramble: '荆棘回廊',
  coldfront: '寒潮',
};

/**
 * 险境的打法提示：第一次遇上某个险境时弹一次。
 * 险境每十几秒就来一次，但"该怎么应对"不该靠死几次学会。
 */
export const HAZARD_TIP: Record<string, string> = {
  fog: '视野会被压到只剩灯焰周围一圈，先往空地挪，别在敌群里硬撑。',
  meteor: '落点先亮一圈预警，站进去就挨砸——边走边打，别在原地待着。',
  collapse: '地面会被砸开，短时间内别贴着墙和石堆走。',
  wispstorm: '相位风暴会撕碎灯光，视野忽明忽暗；先把灯油补满再进敌群。',
  eruption: '熔岩喷发留下的火海会封路，把它当成会移动的墙。',
  oilvoid: '灯油被直接抽走——那几秒灯火又暗又弱，先退开再说。',
  echoes: '会从远处刷出「回响」：它们追的是你一秒前的位置，走折线，别直线跑。',
  bramble: '一圈荆棘把你围住，只留一道缺口——别硬撞，先环视一圈找那条缝。',
  coldfront: '踩进霜冻里会又慢又费油、灯火也暗一截，不咬人但很拖；提前绕开那几片蓝霜。',
};

/** 险境的一句话是什么样：图鉴里先讲"它长什么样"，再讲"怎么应付"。 */
export const HAZARD_DESC: Record<string, string> = {
  fog: '大片浓雾压过来，灯火被压到只剩脚边一圈。',
  meteor: '天上开始落石，落点会先亮起一圈预警。',
  collapse: '地面接连砸开，贴着墙和石堆走最容易吃亏。',
  wispstorm: '灯光被撕碎，视野忽明忽暗，像隔着水面看东西。',
  eruption: '熔岩在脚下绽开，留下一片会封路的火海。',
  oilvoid: '灯油被整片抽走，灯火骤然变暗。',
  echoes: '黑暗里涌出追着你旧脚印的回响。',
  bramble: '一圈荆棘合拢，只留一道缺口。',
  coldfront: '一片霜冻铺开，踩上去又慢又费油。',
};

/** 险境在卡片上的图标与配色。 */
const HAZARD_ICON: Record<string, string> = {
  fog: '🌫️',
  meteor: '☄️',
  collapse: '🧱',
  wispstorm: '🌀',
  eruption: '🌋',
  oilvoid: '🫗',
  echoes: '🔊',
  bramble: '🌿',
  coldfront: '❄️',
};

const HAZARD_COLOR: Record<string, string> = {
  fog: '#8fa7ff',
  meteor: '#ff7a2f',
  collapse: '#c9a3ff',
  wispstorm: '#7be0ff',
  eruption: '#ff6b3d',
  oilvoid: '#ffd24e',
  echoes: '#9fd8ff',
  bramble: '#9fd45a',
  coldfront: '#bfe6ff',
};

const pct = (mult: number): string => `+${Math.round((mult - 1) * 100)}%`;
const r1 = (v: number): string => `${Math.round(v * 10) / 10}`;

export interface CodexSection {
  kind: CodexKind;
  title: string;
  hint: string;
}

export const CODEX_SECTIONS: CodexSection[] = [
  { kind: 'enemy', title: '敌人', hint: '击杀后记录' },
  { kind: 'weapon', title: '武器', hint: '获得或进化后记录' },
  { kind: 'relic', title: '遗物', hint: '拾取后记录' },
  { kind: 'passive', title: '被动', hint: '选取后记录' },
  { kind: 'curse', title: '夜咒', hint: '经历后记录' },
  { kind: 'affix', title: '精英词缀', hint: '遇到精英后记录' },
  { kind: 'lantern', title: '灯火', hint: '解锁后记录' },
  { kind: 'hazard', title: '险境', hint: '遇上后记录' },
  { kind: 'mechanic', title: '机制', hint: '用出来就记录' },
  { kind: 'stage', title: '关卡', hint: '抵达后记录' },
];

/** 按图鉴里的展示顺序列出全部条目。 */
export function codexCatalog(): CodexEntry[] {
  const out: CodexEntry[] = [];
  for (const e of ENEMIES) {
    out.push({
      kind: 'enemy',
      id: e.id,
      name: e.name,
      blurb: e.note ?? '',
      tag: e.boss ? '首领' : e.elite ? '精英' : undefined,
      color: e.color,
      rows: [
        ['生命', `${e.hp}`],
        ['接触伤害', `${e.damage}`],
        ['移动速度', `${e.speed}`],
        ['经验 / 灯油', `${e.xp} / ${e.oil}`],
        ['行为', BEHAVIOR_LABEL[e.behavior] ?? e.behavior],
        ['登场', e.minWave && e.minWave > 1 ? `第 ${e.minWave} 波及之后` : '第一波起'],
      ],
      extra: e.splits ? `死亡时分裂出 ${e.splits.count} 只同类小怪。` : undefined,
    });
  }
  for (const w of WEAPONS) {
    out.push({
      kind: 'weapon',
      id: w.id,
      name: w.name,
      blurb: w.blurb,
      tag: w.evolved ? '进化' : undefined,
      color: w.color,
      rows: (() => {
        const a = w.levels[0];
        const b = w.levels[w.levels.length - 1];
        const rows: [string, string][] = [
          ['伤害 Lv1 → 满级', `${r1(a.damage)} → ${r1(b.damage)}`],
          ['攻击间隔', a.cooldown > 0 ? `${a.cooldown.toFixed(2)}s → ${b.cooldown.toFixed(2)}s` : '常驻环绕'],
          ['弹数', a.count === b.count ? `${a.count}` : `${a.count} → ${b.count}`],
          ['射程', `${Math.round(b.range)}`],
          ['等级上限', `${w.levels.length}`],
        ];
        return rows;
      })(),
      extra: w.evolve ? `进化：本武器满级 + 「${PASSIVE_MAP[w.evolve.passive]?.name ?? w.evolve.passive}」Lv${PASSIVE_MAP[w.evolve.passive]?.maxLevel ?? '?'} → ${WEAPON_MAP[w.evolve.into]?.name ?? w.evolve.into}` : undefined,
    });
  }
  for (const r of RELICS) {
    out.push({
      kind: 'relic',
      id: r.id,
      name: r.name,
      blurb: r.blurb,
      tag: r.rarity === 'epic' ? '史诗' : r.rarity === 'rare' ? '稀有' : undefined,
      color: r.color,
      icon: r.icon,
      rows: [['稀有度', r.rarity === 'epic' ? '史诗' : r.rarity === 'rare' ? '稀有' : '普通']],
    });
  }
  for (const p of PASSIVES) {
    out.push({
      kind: 'passive',
      id: p.id,
      name: p.name,
      blurb: p.blurb,
      tag: `上限 ${p.maxLevel}`,
      color: p.color,
      icon: p.icon,
      rows: [
        ['每级效果', p.blurb],
        ['等级上限', `Lv ${p.maxLevel}`],
      ],
    });
  }
  for (const c of CURSES) {
    out.push({
      kind: 'curse',
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      color: '#ff6b81',
      icon: c.icon,
      rows: [
        ['金币回报', pct(c.goldMult)],
        ...(c.mods.countMult ? ([['敌人数量', pct(c.mods.countMult)]] as [string, string][]) : []),
        ...(c.mods.hpMult ? ([['敌人生命', pct(c.mods.hpMult)]] as [string, string][]) : []),
        ...(c.mods.dmgMult ? ([['敌人伤害', pct(c.mods.dmgMult)]] as [string, string][]) : []),
        ...(c.mods.extraWaves ? ([['额外波次', `+${c.mods.extraWaves}`]] as [string, string][]) : []),
        ...(c.mods.darkness ? ([['黑暗加深', `+${c.mods.darkness}`]] as [string, string][]) : []),
      ],
    });
  }
  for (const a of AFFIXES) {
    out.push({ kind: 'affix', id: a.id, name: a.name, blurb: a.blurb, color: a.color });
  }
  for (const l of LANTERNS) {
    out.push({
      kind: 'lantern',
      id: l.id,
      name: l.name,
      blurb: `${l.title} · ${l.blurb}`,
      color: l.color,
      rows: [
        ['初始武器', WEAPON_MAP[l.weapon]?.name ?? l.weapon],
        ['初始被动', `${PASSIVE_MAP[l.passive]?.name ?? l.passive}（${PASSIVE_MAP[l.passive]?.blurb ?? ''}）`],
      ],
    });
  }
  // 险境：以前只在关卡条目里提一句，现在单独成一章——它本来就是每关都在发生的事
  for (const id of Object.keys(HAZARD_LABEL)) {
    const where = STAGES.filter((s) => s.hazards.includes(id)).map((s) => s.theme.name);
    out.push({
      kind: 'hazard',
      id,
      name: HAZARD_LABEL[id],
      blurb: HAZARD_DESC[id] ?? '',
      color: HAZARD_COLOR[id] ?? '#8fa7ff',
      icon: HAZARD_ICON[id],
      rows: [
        ['怎么应付', HAZARD_TIP[id] ?? '——'],
        ['出现的关卡', where.join('、') || '无尽之夜'],
      ],
    });
  }
  // 机制：掠影与灯焰高涨单独成一章。
  // 这一章存在的理由和险境那一章一样——它是"每时每刻都在发生、但没有任何一个界面
  // 讲清楚过"的东西；而且这里的每个数都直接从 data/graze.ts 取，
  // 以后改调参，图鉴不会跟着漂。
  out.push({
    kind: 'mechanic',
    id: 'graze',
    name: '掠影',
    blurb: '贴着敌人或弹幕擦过去——进了判定的边、又没被判定吃到。火苗被撩旺，热度往上走。',
    color: '#c9a3ff',
    icon: '👣',
    rows: [
      ['怎么攒', '按"离判定边多近"每秒累加，贴得越近涨得越快'],
      ['要在动', `这一帧的位移得超过 ${GRAZE.speedFloor}px/s（站着不动不算、顶着墙按方向键也不算）`],
      ['走多快算满', `移速到 ${GRAZE.speedRef}px/s 时系数拉满（上限 ×1.6）`],
      ['带子宽度', `敌人 ${GRAZE.rangeEnemy}px · 弹幕 ${GRAZE.rangeShot}px（都从双方半径之外开始量）`],
      ['一物一次', `同一只敌人 ${GRAZE.cdEnemy} 秒、同一颗子弹一辈子一次`],
      ['黏着不算', `同一只怪贴超过 ${GRAZE.holdMax} 秒之后贡献一路归零（想续就得换目标、绕出去再进来）`],
      ['每擦一次', `回 ${Math.round(GRAZE.oil * 1000) / 10}% 灯油（冲刺里翻倍）`],
      ['冲刺穿过弹幕正中', `不挨打，还额外给 ${GRAZE.heatDash} 点热度（一次冲刺只认一次）`],
      ['攒满', `点着一阵「灯焰高涨」（需要 ${GRAZE.heatMax} 点热度）`],
      ['停手之后', `${GRAZE.decayDelay} 秒才开始回落，每秒掉 ${GRAZE.decay} 点`],
    ],
    extra: `同一瞬间最多按 ${GRAZE.rateCap} 只怪的权重封顶——被三面围住已经很危险了，再多几只也只是同一件事。`,
  });
  out.push({
    kind: 'mechanic',
    id: 'blaze',
    name: '灯焰高涨',
    blurb: '掠影攒满点着的那一阵：灯火更旺、伤害更高、走得更快，代价是油烧得凶。',
    color: '#ffb14e',
    icon: '🔥',
    rows: [
      ['灯火半径', `×${GRAZE.blazeLight}`],
      ['伤害', `+${Math.round(GRAZE.blazeDamage * 100)}%`],
      ['移动速度', `+${Math.round((GRAZE.blazeSpeed - 1) * 100)}%`],
      ['灯油耗率', `×${GRAZE.blazeOil}（火烧得旺，油也去得快）`],
      ['持续', `${GRAZE.blazeTime} 秒（带「长风」是 ${GRAZE.blazeTime * 1.5} 秒）`],
      ['焰里击杀', `每杀一只续 ${GRAZE.blazeExtend} 秒，最多续到 ${GRAZE.blazeTime * GRAZE.blazeExtendCap} 秒`],
      ['烧着时攒热', `只攒一半（×${GRAZE.blazeHeatMult}）`],
      ['烧完', `最多留下 ${Math.round(GRAZE.blazeCarry * 100)}% 热度——想再来一次还得真的再擦`,
      ],
    ],
    extra: '焰是自己擦出来的，让它一直烧下去的是击杀：停下来喘口气，焰就自己烧完了。',
  });
  // 伏灯：同样是"每时每刻都在发生、但界面上讲不清楚"的东西——
  // 它跟别的武器不一样的地方全在"地上那颗雷的规则"上，所以这一条讲的是地皮，不是伤害。
  const mineDef = WEAPON_MAP.mine;
  const mineChainDef = WEAPON_MAP.mine_chain;
  out.push({
    kind: 'mechanic',
    id: 'mine',
    name: '伏灯',
    blurb: '跑着撒在身后的雷：上弦半秒，之后谁踩上来就炸一圈。位置也是要攒的东西。',
    color: '#ffca7a',
    icon: '🕯️',
    rows: [
      ['怎么摆', '撒在身后 22px；站着不动时绕自己撒一圈'],
      ['上弦', `${MINE.arm} 秒（这半秒踩不响）`],
      ['触发距离', `1 级 ${mineDef.levels[0].range} → 满级 ${mineDef.levels[mineDef.levels.length - 1].range}px；判定时再加怪自己的半径`],
      ['爆炸半径', `1 级 ${mineDef.levels[0].radius} → 满级 ${mineDef.levels[mineDef.levels.length - 1].radius}px，边缘只吃四成`],
      ['寿命', `${MINE.life} 秒；自己烧尽不炸`],
      ['地上最多', `${MINE.max} 颗（再多就先烧掉最老的那颗）`],
      ['不伤自己', '玩家自己的爆炸从来不伤自己（火球也一样）'],
      ['连爆', `一颗炸响时，离它一颗爆炸半径以内的其他伏灯会被引信点着，隔 ${MINE.chainFuse} 秒顺着串烧过去——撒得密是一串，撒得开是一颗一颗`],
      ['它是一盏灯', `「灯蛾」在 ${MINE.lure}px 内会拐过来扑它（上弦之后才算"亮着"）——拿它当饵，蛾会自己踩响`],
      ['怕吹灯客', '走进触发圈的如果是「吹灯客」，那颗雷不炸：它把你埋的灯吹灭了（不炸、不留火）'],
      ['进化', `满级 + 灼心 → 「${mineChainDef.name}」：一次两颗 + 留一片火`],
    ],
    extra: `一次炸到 ${MINE.multiHit} 只以上会解「伏击」，一串连到 ${MINE.chainBest} 颗以上会解「一串灯」，一颗雷一次炸到 ${MINE.mothBait} 只灯蛾会解「以灯为饵」。它强不强全看你怎么走——把追兵引到雷上，还是自己绕圈把它们甩在两百像素外。`,
  });
  for (const s of STAGES) {
    out.push({
      kind: 'stage',
      id: s.id,
      name: s.theme.name,
      blurb: s.theme.subtitle,
      color: s.theme.accent,
      rows: [
        ['波次', `${s.waves}`],
        ['首领', s.boss ? `${ENEMY_MAP[s.boss]?.name ?? s.boss}` : '无'],
        ['精英', s.elites.map((e) => ENEMY_MAP[e]?.name ?? e).join('、') || '无'],
        ['险境', s.hazards.map((h) => HAZARD_LABEL[h] ?? h).join('、') || '无'],
        ['灯台', `${s.pyres ?? 3} 座 · 停留点燃后长明，并给本局灯火与伤害余温`],
      ],
    });
  }
  return out;
}

export class CodexSystem {
  private catalog: CodexEntry[] = codexCatalog();
  private lookup = new Map<string, CodexEntry>();
  private known = new Set<string>();
  private discoveredThisRun = new Set<string>();

  constructor(private save: SaveData, private onDiscover: (entry: CodexEntry, seen: number, total: number) => void) {
    if (!Array.isArray(this.save.codex)) this.save.codex = [];
    for (const e of this.catalog) this.lookup.set(`${e.kind}:${e.id}`, e);
    for (const k of this.save.codex) this.known.add(k);
  }

  get entries(): CodexEntry[] {
    return this.catalog;
  }

  total(): number {
    return this.catalog.length;
  }

  seenCount(): number {
    return this.known.size;
  }

  /** 按 `kind:id` 取条目（详情页用）。 */
  entry(key: string): CodexEntry | undefined {
    return this.lookup.get(key);
  }

  has(kind: CodexKind, id: string): boolean {
    return this.known.has(`${kind}:${id}`);
  }

  isFresh(kind: CodexKind, id: string): boolean {
    return this.discoveredThisRun.has(`${kind}:${id}`);
  }

  sectionSeen(kind: CodexKind): number {
    let n = 0;
    for (const e of this.catalog) if (e.kind === kind && this.known.has(`${e.kind}:${e.id}`)) n += 1;
    return n;
  }

  sectionTotal(kind: CodexKind): number {
    let n = 0;
    for (const e of this.catalog) if (e.kind === kind) n += 1;
    return n;
  }

  /** 记录一条。返回是否是"第一次发现"。 */
  discover(kind: CodexKind, id: string): boolean {
    const key = `${kind}:${id}`;
    if (this.known.has(key)) return false;
    const entry = this.lookup.get(key);
    if (!entry) return false;
    this.known.add(key);
    this.discoveredThisRun.add(key);
    this.save.codex.push(key);
    this.onDiscover(entry, this.known.size, this.catalog.length);
    return true;
  }

  reset(): void {
    this.discoveredThisRun.clear();
  }

  /** 一次扫描玩家当前持有的一切（灯火 / 关卡 / 武器 / 被动 / 遗物 / 夜咒）。 */
  syncFromRun(player: Player, lanternId: string, stageId: string, curseId: string | null): void {
    this.discover('lantern', lanternId);
    this.discover('stage', stageId);
    for (const id of player.weapons.keys()) this.discover('weapon', id);
    for (const id of player.passives.keys()) this.discover('passive', id);
    for (const id of player.relics) this.discover('relic', id);
    if (curseId) this.discover('curse', curseId);
  }
}
