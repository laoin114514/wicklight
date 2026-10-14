import { PASSIVES, PASSIVE_MAP } from '../data/upgrades';
import { NEW_WEAPON_POOL, WEAPON_MAP } from '../data/weapons';
import type { Random } from '../core/Random';
import type { UpgradeOffer } from '../types';
import type { Player } from '../entities/Player';

const MAX_WEAPONS = 6;
const MAX_PASSIVES = 8;

export class UpgradeSystem {
  generate(player: Player, count: number, rng: Random): UpgradeOffer[] {
    const pool: UpgradeOffer[] = [];

    for (const [id, level] of player.weapons) {
      const def = WEAPON_MAP[id];
      if (!def) continue;
      const maxed = level >= def.levels.length;
      if (def.evolve && maxed && player.passiveLevel(def.evolve.passive) >= (PASSIVE_MAP[def.evolve.passive]?.maxLevel ?? 99)) {
        const into = WEAPON_MAP[def.evolve.into];
        pool.push({
          kind: 'weapon', id: def.evolve.into, name: into.name, blurb: `进化：${into.blurb}`,
          icon: '🌟', color: into.color, level: 1, maxLevel: into.levels.length, tag: 'evolve',
        });
      } else if (!maxed) {
        pool.push({
          kind: 'weapon', id, name: def.name, blurb: def.blurb,
          icon: '🔥', color: def.color, level: level + 1, maxLevel: def.levels.length, tag: 'level',
        });
      }
    }

    if (player.weapons.size < MAX_WEAPONS) {
      for (const id of NEW_WEAPON_POOL) {
        if (player.weapons.has(id)) continue;
        const def = WEAPON_MAP[id];
        if (!def || def.evolved) continue;
        pool.push({
          kind: 'weapon', id, name: def.name, blurb: def.blurb,
          icon: '✨', color: def.color, level: 1, maxLevel: def.levels.length, tag: 'new',
        });
      }
    }

    for (const p of PASSIVES) {
      const lvl = player.passiveLevel(p.id);
      if (lvl >= p.maxLevel) continue;
      if (lvl === 0 && player.passives.size >= MAX_PASSIVES) continue;
      pool.push({
        kind: 'passive', id: p.id, name: p.name, blurb: p.blurb,
        icon: p.icon, color: p.color, level: lvl + 1, maxLevel: p.maxLevel, tag: lvl === 0 ? 'new' : 'level',
      });
    }

    rng.shuffle(pool);
    const picked: UpgradeOffer[] = [];
    const seen = new Set<string>();
    for (const offer of pool) {
      if (picked.length >= count) break;
      const key = `${offer.kind}:${offer.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(offer);
    }
    if (picked.length === 0) {
      const fallback: UpgradeOffer[] = [
        { kind: 'passive', id: '__restore_hp', name: '暖意回涌', blurb: '立即回复 40% 生命。', icon: '❤️', color: '#ff6b81', level: 1, maxLevel: 1, tag: 'meta' },
        { kind: 'passive', id: '__restore_oil', name: '添油', blurb: '立即回满灯油。', icon: '🕯️', color: '#ffd24e', level: 1, maxLevel: 1, tag: 'meta' },
        { kind: 'passive', id: '__restore_both', name: '长明', blurb: '回复 20% 生命并回满灯油。', icon: '✨', color: '#fff0a8', level: 1, maxLevel: 1, tag: 'meta' },
      ];
      return fallback.slice(0, count);
    }
    return picked;
  }

  apply(player: Player, offer: UpgradeOffer): void {
    if (offer.id === '__restore_hp') {
      player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.maxHp * 0.4);
      return;
    }
    if (offer.id === '__restore_oil') {
      player.oil = player.oilMax;
      return;
    }
    if (offer.id === '__restore_both') {
      player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.maxHp * 0.2);
      player.oil = player.oilMax;
      return;
    }
    if (offer.kind === 'weapon') {
      if (offer.tag === 'evolve') {
        for (const [id, def] of Object.entries(WEAPON_MAP)) {
          if (def.evolve?.into === offer.id) {
            player.weapons.delete(id);
            break;
          }
        }
        player.addWeapon(offer.id);
        player.levelWeapon(offer.id);
      } else if (offer.tag === 'new') {
        player.addWeapon(offer.id);
      } else {
        player.levelWeapon(offer.id);
      }
    } else {
      player.addPassive(offer.id, 1);
      player.recomputeStats();
    }
  }
}
