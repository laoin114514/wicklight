import type { MetaNodeDef } from '../types';

export const META_TREE: MetaNodeDef[] = [
  { id: 'kindling', name: '引火', blurb: '起始生命上限 +12%', cost: 50, effect: { key: 'hpMult', value: 0.12 } },
  { id: 'tallow', name: '脂膏', blurb: '起始灯油容量 +18%', cost: 60, effect: { key: 'oilMult', value: 0.18 } },
  { id: 'purse', name: '余烬袋', blurb: '每局获得余烬 +18%', cost: 100, effect: { key: 'emberMult', value: 0.18 } },
  { id: 'wicks', name: '灯芯', blurb: '冲刺冷却 -16%', cost: 80, requires: 'kindling', effect: { key: 'dashMult', value: 0.16 } },
  { id: 'greed', name: '贪光', blurb: '升级选择可重掷 +1 次', cost: 140, effect: { key: 'rerolls', value: 1 } },
  { id: 'reservoir', name: '油库', blurb: '起始武器 +1 级', cost: 120, requires: 'tallow', effect: { key: 'weaponLevel', value: 1 } },
  { id: 'warmstart', name: '暖启', blurb: '开局随机获得 1 个被动', cost: 180, requires: 'purse', effect: { key: 'startPassives', value: 1 } },
  { id: 'secondwind', name: '复燃', blurb: '每局可复活 1 次', cost: 300, requires: 'wicks', effect: { key: 'revives', value: 1 } },
  { id: 'lantern_lamplighter', name: '解锁·灯语者', blurb: '在灯火选择中解锁灯语者。', cost: 150, effect: { key: 'lantern', value: 0 } },
  { id: 'lantern_emberkin', name: '解锁·焚烬者', blurb: '在灯火选择中解锁焚烬者。', cost: 200, requires: 'lantern_lamplighter', effect: { key: 'lantern', value: 0 } },
  { id: 'lantern_shadewalker', name: '解锁·暗行者', blurb: '在灯火选择中解锁暗行者。', cost: 260, requires: 'reservoir', effect: { key: 'lantern', value: 0 } },
];

export const META_MAP: Record<string, MetaNodeDef> = Object.fromEntries(META_TREE.map((m) => [m.id, m]));
