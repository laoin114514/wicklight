import { META_MAP, META_TREE } from '../data/meta';
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
    const out: MetaBonuses = { hpMult: 0, oilMult: 0, emberMult: 0, dashMult: 0, rerolls: 0, weaponLevel: 0, startPassives: 0, revives: 0 };
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
        default: break;
      }
    }
    return out;
  }

  available(): MetaNodeDef[] {
    return META_TREE.filter((n) => !this.owned.has(n.id) && (!n.requires || this.owned.has(n.requires)));
  }
}
