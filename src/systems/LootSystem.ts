import type { Enemy } from '../entities/enemies/Enemy';
import type { Pickup, PickupSystem } from '../entities/Pickup';

export interface LootResult {
  xp: number;
  oil: number;
  hearts: number;
  chest: boolean;
  gold: number;
}

export class LootSystem {
  constructor(private pickups: PickupSystem) {}

  dropFromEnemy(e: Enemy, oilGainMult: number, rng: { next: () => number }, gold = 0): void {
    if (gold > 0) this.pickups.spawn(e.x, e.y - 6, 'gold', gold);
    this.pickups.spawn(e.x, e.y, 'xp', e.xp);
    if (e.oil > 0) {
      const amount = Math.round(e.oil * oilGainMult);
      this.pickups.spawn(e.x + 4, e.y - 4, 'oil', amount);
    }
    if (e.elite && rng.next() < 0.6) this.pickups.spawn(e.x, e.y + 6, 'heart', 1);
    if (e.boss) {
      for (let i = 0; i < 4; i += 1) this.pickups.spawn(e.x + (i - 2) * 20, e.y + 10, 'oil', 60);
      this.pickups.spawn(e.x, e.y, 'chest', 1);
    }
    if (!e.elite && !e.boss && rng.next() < 0.012) this.pickups.spawn(e.x, e.y, 'heart', 1);
  }

  apply(p: Pickup): LootResult {
    const res: LootResult = { xp: 0, oil: 0, hearts: 0, chest: false, gold: 0 };
    if (p.kind === 'xp') res.xp = p.value;
    else if (p.kind === 'oil') res.oil = p.value;
    else if (p.kind === 'heart') res.hearts = p.value;
    else if (p.kind === 'gold') res.gold = p.value;
    else res.chest = true;
    return res;
  }
}
