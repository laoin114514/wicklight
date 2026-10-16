import { FIRE_LINES, FIRE_MAP, META_MAP, META_TREE, fireCost, type FireLineDef } from '../data/meta';
import { LANTERN_MAP } from '../data/lanterns';
import type { MetaNodeDef, SaveData } from '../types';

export interface MetaBonuses {
  hpMult: number;
  oilMult: number;
  emberMult: number;
  dashMult: number;
  rerolls: number;
  weaponLevel: number;
  startPassives: number;
  revives: number;
  startGold: number;
  startRelic: number;
  lightMult: number;
  moveSpeedMult: number;
  /**
   * 「薪火 · 薪柴」烧出来的火力底子（0 = 没有，0.24 = +24%）。
   * 元进度到 v80 为止从来没动过火力——它是**最贵**的那一条，所以放了 6 级在这儿，
   * 由 `Player.metaMods.damageMult` 套进 `computeStats`（和移速同一条路：重算不会冲掉它）。
   */
  damageMult: number;
}

export class MetaSystem {
  constructor(private save: SaveData) {}

  get owned(): Set<string> {
    return new Set(this.save.meta);
  }

  canBuy(node: MetaNodeDef): boolean {
    if (this.owned.has(node.id)) return false;
    if (node.requires && !this.owned.has(node.requires)) return false;
    return this.save.embers >= node.cost;
  }

  buy(nodeId: string): boolean {
    const node = META_MAP[nodeId];
    if (!node || !this.canBuy(node)) return false;
    this.save.embers -= node.cost;
    this.save.meta.push(nodeId);
    if (node.effect.key === 'lantern') {
      const lantern = LANTERN_MAP[nodeId];
      void lantern;
      const target = Object.values(LANTERN_MAP).find((l) => l.unlockedBy === nodeId);
      if (target && !this.save.unlockedLanterns.includes(target.id)) {
        this.save.unlockedLanterns.push(target.id);
      }
    }
    return true;
  }

  bonuses(): MetaBonuses {
    const out: MetaBonuses = {
      hpMult: 0,
      oilMult: 0,
      emberMult: 0,
      dashMult: 0,
      rerolls: 0,
      weaponLevel: 0,
      startPassives: 0,
      revives: 0,
      startGold: 0,
      startRelic: 0,
      lightMult: 0,
      moveSpeedMult: 0,
      damageMult: 0,
    };
    for (const id of this.save.meta) {
      const node = META_MAP[id];
      if (!node) continue;
      const { key, value } = node.effect;
      switch (key) {
        case 'hpMult': out.hpMult += value; break;
        case 'oilMult': out.oilMult += value; break;
        case 'emberMult': out.emberMult += value; break;
        case 'dashMult': out.dashMult += value; break;
        case 'rerolls': out.rerolls += value; break;
        case 'weaponLevel': out.weaponLevel += value; break;
        case 'startPassives': out.startPassives += value; break;
        case 'revives': out.revives += value; break;
        case 'startGold': out.startGold += value; break;
        case 'startRelic': out.startRelic += value; break;
        case 'lightMult': out.lightMult += value; break;
        case 'moveSpeedMult': out.moveSpeedMult += value; break;
        default: break;
      }
    }
    // 「薪火」那三条梯子：按级数把每一级的量加起来（和树上那些节点是同一件事，只是可以重复买）
    for (const line of FIRE_LINES) {
      const lv = this.fireLevel(line.id);
      if (!lv) continue;
      switch (line.key) {
        case 'damageMult': out.damageMult += line.value * lv; break;
        case 'lightMult': out.lightMult += line.value * lv; break;
        case 'oilMult': out.oilMult += line.value * lv; break;
        default: break;
      }
    }
    return out;
  }

  // ── 「薪火」：可重复的那三条梯子（v80）──
  //
  // 存档那一格（`save.fire`）故意做成"每一条线一个数字"，而不是把每一级都写成一个 id 扔进 `save.meta`：
  // `save.meta` 是"你买过哪些节点"的集合，而梯子是"这一条烧到了几级"——两种东西分成两个字段，
  // 面板上那一句"树上还剩几个节点"和"炉子烧到几级"才各有各的真话。

  /** 这一条烧到几级了（老存档 / 没烧过 = 0）。 */
  fireLevel(id: string): number {
    return this.save.fire?.[id] ?? 0;
  }

  fireMaxed(line: FireLineDef): boolean {
    return this.fireLevel(line.id) >= line.levels;
  }

  /** 三条梯子加起来几级（面板上那个分母用它）。 */
  fireLevelsTotal(): number {
    return FIRE_LINES.reduce((sum, line) => sum + this.fireLevel(line.id), 0);
  }

  canBuyFire(line: FireLineDef): boolean {
    if (this.fireMaxed(line)) return false;
    return this.save.embers >= fireCost(line, this.fireLevel(line.id));
  }

  buyFire(id: string): boolean {
    const line = FIRE_MAP[id];
    if (!line || !this.canBuyFire(line)) return false;
    const level = this.fireLevel(line.id);
    this.save.embers -= fireCost(line, level);
    this.save.fire = { ...(this.save.fire ?? {}), [line.id]: level + 1 };
    return true;
  }

  available(): MetaNodeDef[] {
    return META_TREE.filter((n) => !this.owned.has(n.id) && (!n.requires || this.owned.has(n.requires)));
  }
}
