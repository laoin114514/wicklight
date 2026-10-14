/**
 * 图鉴（编年史）：把数据表里的一切都当成可以"被玩家看见"的条目。
 *
 * 设计上刻意做成"扫描式"而不是到处埋点：能拿到玩家状态的时刻调用 syncFromRun 扫一遍，
 * 敌人 / 精英词缀这类不在玩家身上的东西再单独 discover。这样以后新增遗物或武器时，
 * 只要它在数据表里，就会被自动纳入图鉴。
 */
import { AFFIXES } from '../data/affixes';
import { CURSES } from '../data/curses';
import { ENEMIES } from '../data/enemies';
import { LANTERNS } from '../data/lanterns';
import { RELICS } from '../data/relics';
import { STAGES } from '../data/stages';
import { PASSIVES } from '../data/upgrades';
import { WEAPONS } from '../data/weapons';
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
}

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
    });
  }
  for (const p of PASSIVES) {
    out.push({ kind: 'passive', id: p.id, name: p.name, blurb: p.blurb, tag: `上限 ${p.maxLevel}`, color: p.color, icon: p.icon });
  }
  for (const c of CURSES) {
    out.push({ kind: 'curse', id: c.id, name: c.name, blurb: c.blurb, color: '#ff6b81', icon: c.icon });
  }
  for (const a of AFFIXES) {
    out.push({ kind: 'affix', id: a.id, name: a.name, blurb: a.blurb, color: a.color });
  }
  for (const l of LANTERNS) {
    out.push({ kind: 'lantern', id: l.id, name: l.name, blurb: `${l.title} · ${l.blurb}`, color: l.color });
  }
  for (const s of STAGES) {
    out.push({ kind: 'stage', id: s.id, name: s.theme.name, blurb: s.theme.subtitle, color: s.theme.accent });
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
