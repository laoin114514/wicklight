import type { LanternDef } from '../types';

export const LANTERNS: LanternDef[] = [
  {
    id: 'warden',
    name: '守夜人',
    title: '长明的守卫',
    weapon: 'ring',
    passive: 'longlasting',
    blurb: '环形火环环绕周身，灯油燃得最久。适合稳扎稳打的玩家。',
    color: '#ffb14e',
  },
  {
    id: 'lamplighter',
    name: '灯语者',
    title: '引虫的守灯人',
    weapon: 'wisp',
    passive: 'oilrain',
    blurb: '追踪火苗自动狩猎，击杀掉落更多灯油。视野越亮越强。',
    color: '#7be0ff',
    unlockedBy: 'lantern_lamplighter',
  },
  {
    id: 'emberkin',
    name: '焚烬者',
    title: '点燃一切的孩子',
    weapon: 'fireball',
    passive: 'might',
    blurb: '爆裂火球范围巨大，伤害随亮度飙升。爆发流的首选。',
    color: '#ff7a2f',
    unlockedBy: 'lantern_emberkin',
  },
  {
    id: 'shadewalker',
    name: '暗行者',
    title: '与黑暗同行',
    weapon: 'whip',
    passive: 'swift',
    blurb: '烈焰鞭近身撕碎敌人，身法极快但灯火更暗。高手向。',
    color: '#ff4d6d',
    unlockedBy: 'lantern_shadewalker',
  },
];

export const LANTERN_MAP: Record<string, LanternDef> = Object.fromEntries(LANTERNS.map((l) => [l.id, l]));
