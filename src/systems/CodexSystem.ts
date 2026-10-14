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
import { PASSIVES, PASSIVE_MAP } from '../data/upgrades';
import { WEAPONS } from '../data/weapons';
import { WEAPON_MAP } from '../data/weapons';
import type { Player } from '../entities/Player';
import type { SaveData } from '../types';

export type CodexKind = 'enemy' | 'weapon' | 'relic' | 'passive' | 'curse' | 'affix' | 'lantern' | 'stage';

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
