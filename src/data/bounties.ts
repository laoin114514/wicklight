/**
 * 悬赏：每关开局随机贴在你身上的一张小目标。
 *
 * 它不改变数值，只给这一关一个"除了活下去之外的念想"——顺手清掉一片影蛭、
 * 把连杀堆到 25、忍住 75 秒不挨打，都能换来金币与补给。
 * 奖励刻意给金币而不是余烬：金币只在局内花得掉，等于把出价换成"下一关更强"。
 */
export type BountyKind = 'hunt' | 'combo' | 'nova' | 'untouched' | 'pyre';

export interface BountyReward {
  gold: number;
  /** 按生命上限的比例回复 */
  heal?: number;
  /** 按灯油上限的比例补充 */
  oil?: number;
}

export interface BountyDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  kind: BountyKind;
  /** 目标数值：击杀数 / 连杀数 / 次数 / 秒数 */
  target: number;
  /** hunt 专用：要猎杀的敌人 id */
  enemy?: string;
  reward: BountyReward;
}

export const BOUNTIES: BountyDef[] = [
  { id: 'hunt_shade', name: '猎杀契约 · 影蛭', blurb: '在本关内击杀 24 只影蛭。', icon: '🩸', color: '#4a5b8f', kind: 'hunt', enemy: 'shade', target: 24, reward: { gold: 45 } },
  { id: 'hunt_crawler', name: '猎杀契约 · 砾行者', blurb: '在本关内击杀 16 只砾行者。', icon: '🪨', color: '#8f6f4a', kind: 'hunt', enemy: 'crawler', target: 16, reward: { gold: 45, oil: 0.2 } },
  { id: 'hunt_spitter', name: '猎杀契约 · 喷糜者', blurb: '在本关内击杀 12 只喷糜者。', icon: '🧪', color: '#6f4a8f', kind: 'hunt', enemy: 'spitter', target: 12, reward: { gold: 45, oil: 0.2 } },
  { id: 'hunt_moth', name: '猎杀契约 · 灯蛾', blurb: '在本关内击杀 14 只灯蛾。', icon: '🦋', color: '#a58f4a', kind: 'hunt', enemy: 'moth', target: 14, reward: { gold: 50, heal: 0.15 } },
  { id: 'hunt_bomber', name: '猎杀契约 · 爆裂菇', blurb: '在本关内击杀 10 只爆裂菇。', icon: '🍄', color: '#c96a2f', kind: 'hunt', enemy: 'bomber', target: 10, reward: { gold: 50, oil: 0.25 } },
  { id: 'hunt_splinter', name: '猎杀契约 · 碎魂', blurb: '在本关内击杀 10 只碎魂。', icon: '💠', color: '#5f86d0', kind: 'hunt', enemy: 'splinter', target: 10, reward: { gold: 55, heal: 0.2 } },
  { id: 'hunt_lancer', name: '猎杀契约 · 刺脊', blurb: '在本关内击杀 8 只刺脊。', icon: '🦂', color: '#c85a86', kind: 'hunt', enemy: 'lancer', target: 8, reward: { gold: 60, heal: 0.2 } },
  { id: 'hunt_beacon', name: '猎杀契约 · 引灯', blurb: '在本关内击杀 5 只引灯。', icon: '🏮', color: '#e8d38a', kind: 'hunt', enemy: 'beacon', target: 5, reward: { gold: 70, heal: 0.2 } },

  { id: 'combo15', name: '烽火 · 连杀 15', blurb: '在一次连杀中堆到 15。', icon: '🔥', color: '#ff7a2f', kind: 'combo', target: 15, reward: { gold: 40 } },
  { id: 'combo25', name: '燎原 · 连杀 25', blurb: '在一次连杀中堆到 25。', icon: '🌋', color: '#ff5a1f', kind: 'combo', target: 25, reward: { gold: 70, heal: 0.25 } },

  { id: 'nova3', name: '燃爆 · 三次清场', blurb: '本关释放 3 次燃爆。', icon: '💥', color: '#ffd24e', kind: 'nova', target: 3, reward: { gold: 35 } },
  { id: 'nova5', name: '燃爆 · 五次清场', blurb: '本关释放 5 次燃爆。', icon: '☄️', color: '#ffb14e', kind: 'nova', target: 5, reward: { gold: 60, oil: 0.3 } },

  { id: 'pyre3', name: '点灯 · 三座灯台', blurb: '在本关内点亮 3 座灯台。', icon: '🏮', color: '#ffb15e', kind: 'pyre', target: 3, reward: { gold: 55, oil: 0.3 } },
  { id: 'pyre_all', name: '点灯 · 燃尽此夜', blurb: '在本关内点亮全部灯台。', icon: '🕯️', color: '#ffd9a0', kind: 'pyre', target: 3, reward: { gold: 80, heal: 0.25 } },

  { id: 'untouched45', name: '静默 · 45 秒不受伤', blurb: '连续 45 秒不受到任何伤害。', icon: '🕊️', color: '#8affc1', kind: 'untouched', target: 45, reward: { gold: 55, heal: 0.2 } },
  { id: 'untouched75', name: '静默 · 75 秒不受伤', blurb: '连续 75 秒不受到任何伤害。', icon: '🌙', color: '#c9a3ff', kind: 'untouched', target: 75, reward: { gold: 90, heal: 0.3 } },
];

export const BOUNTY_MAP: Record<string, BountyDef> = Object.fromEntries(BOUNTIES.map((b) => [b.id, b]));
