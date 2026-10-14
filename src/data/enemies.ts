import type { EnemyDef } from '../types';

export const ENEMIES: EnemyDef[] = [
  { id: 'shade', name: '影蛭', hp: 14, speed: 68, radius: 13, damage: 8, xp: 3, oil: 4, behavior: 'chase', color: '#4a5b8f', minWave: 1, note: '最普通的夜行者，成群出现；单只不足为惧，成潮时会把你围住。' },
  { id: 'crawler', name: '砾行者', hp: 12, speed: 52, radius: 12, damage: 10, xp: 4, oil: 3, behavior: 'dash', color: '#8f6f4a', minWave: 1, note: '会短距离突进扑上来，出手前有一瞬间的停顿，那一瞬是闪避窗口。' },
  { id: 'spitter', name: '喷糜者', hp: 20, speed: 40, radius: 15, damage: 9, xp: 6, oil: 5, behavior: 'ranged', color: '#6f4a8f', minWave: 2, note: '保持距离吐射糜液，逼你离开掩体；靠近它会退，但退得不快。' },
  { id: 'moth', name: '灯蛾', hp: 18, speed: 96, radius: 14, damage: 7, xp: 5, oil: 6, behavior: 'dive', color: '#a58f4a', minWave: 3, note: '被灯火吸引的蛾群，高速俯冲；它们扑的是光，不是你——地上你埋的伏灯也算光，所以雷能当饵。' },
  { id: 'bulwark', name: '石守', hp: 90, speed: 34, radius: 22, damage: 14, xp: 12, oil: 10, behavior: 'tank', color: '#5a5f6f', minWave: 4, note: '石壳厚实、移动迟缓，正面硬拼很亏，绕着打或用燃爆清场。' },
  { id: 'oilsapper', name: '蚀烛', hp: 30, speed: 74, radius: 16, damage: 6, xp: 8, oil: 0, behavior: 'drain', color: '#8f4a6f', minWave: 5, note: '专偷灯油：让它贴住你几秒，灯火会肉眼可见地暗下去，优先点掉。' },
  { id: 'bomber', name: '爆裂菇', hp: 26, speed: 56, radius: 17, damage: 26, xp: 7, oil: 6, behavior: 'bomber', color: '#c96a2f', minWave: 3, note: '靠近后自爆，伤害极高；留着它等于留一颗随时会响的地雷。' },
  { id: 'splinter', name: '碎魂', hp: 34, speed: 62, radius: 16, damage: 11, xp: 7, oil: 6, behavior: 'chase', color: '#5f86d0', minWave: 4, splits: { id: 'shade', count: 2 }, note: '五面晶体，死亡时炸成两只影蛭——先想好处理余党的手段。' },
  { id: 'lancer', name: '刺脊', hp: 30, speed: 74, radius: 15, damage: 14, xp: 8, oil: 6, behavior: 'charge', color: '#c85a86', minWave: 5, note: '蓄力后沿预警线高速突进，撞上就是重伤，必须靠冲刺让开。' },
  { id: 'skitter', name: '疾影', hp: 10, speed: 132, radius: 10, damage: 6, xp: 4, oil: 3, behavior: 'dash', color: '#7be0ff', minWave: 3, note: '极脆极快的残影，突进冷却很短；碰一下就碎，但停下不动就会被连扑。' },
  { id: 'echo', name: '回响', hp: 42, speed: 104, radius: 15, damage: 12, xp: 9, oil: 7, behavior: 'echo', trailDelay: 1.1, color: '#9fd8ff', minWave: 5, note: '不追你，追你一秒前站的地方——直线逃跑会被它从背后咬住，走折线才能甩开。' },
  { id: 'weaver', name: '织雾者', hp: 74, speed: 38, radius: 19, damage: 11, xp: 13, oil: 11, behavior: 'weaver', color: '#9fb7c9', minWave: 7, note: '走动时在脚下织出滞行雾，雾里你的脚步会沉下去；要么绕开，要么先点掉它。' },
  { id: 'beacon', name: '引灯', hp: 48, speed: 44, radius: 17, damage: 10, xp: 11, oil: 10, behavior: 'beacon', color: '#e8d38a', minWave: 6, note: '提灯亡灵，为周围敌人提供速度光环并照亮四方；优先击杀，能立刻削弱整片敌群。' },

  { id: 'snuffer', name: '吹灯客', hp: 46, speed: 86, radius: 16, damage: 8, xp: 9, oil: 7, behavior: 'quench', color: '#7a6bd6', minWave: 3, note: '不追你，追你点亮的灯台：它会绕过你直接扑向灯火，一点点把灯焰吹灭；灯台一熄，余温也跟着收回。你埋的伏灯它也照吹不误——踩进触发圈的是它，那颗雷就不炸了。' },

  { id: 'wickmother', name: '烛母', hp: 320, speed: 42, radius: 34, damage: 16, xp: 90, oil: 60, behavior: 'chase', color: '#c96a2f', elite: true, minWave: 1, note: '精英 · 厚血高伤，是前期最硬的坎；把它拖到灯火边缘慢慢磨。' },
  { id: 'siphon', name: '噬灯魅', hp: 210, speed: 62, radius: 24, damage: 15, xp: 60, oil: 44, behavior: 'siphon', color: '#c98fe8', elite: true, minWave: 1, note: '精英 · 吊在中距离持续抽取你的灯火，越拖越暗；它的血不薄，得先冲上去解决。' },
  { id: 'darkless', name: '无光者', hp: 400, speed: 58, radius: 32, damage: 20, xp: 110, oil: 70, behavior: 'chase', color: '#2b2b3a', elite: true, lightShy: true, requiresLight: true, minWave: 1, note: '精英 · 只有被光照到时才能被击破，逼你主动把灯推过去。' },

  { id: 'thornlord', name: '荆棘领主', hp: 1500, speed: 34, radius: 50, damage: 20, xp: 380, oil: 200, behavior: 'chase', color: '#6f9c3f', boss: true, phases: 3, note: '首领 · 扇形齐射 + 荆棘地刺 + 召唤灯蛾；地刺成形前有预警圈。' },
  { id: 'extinguisher', name: '熄灯者', hp: 2600, speed: 40, radius: 56, damage: 24, xp: 400, oil: 220, behavior: 'chase', color: '#3a2f5a', boss: true, phases: 3, note: '首领 · 会熄灭你的灯并四散弹幕，视野被夺走的那几秒最危险。' },
  { id: 'nightfall', name: '终夜', hp: 5400, speed: 44, radius: 66, damage: 28, xp: 780, oil: 380, behavior: 'chase', color: '#5b4bb5', boss: true, phases: 3, note: '首领 · 它会用黑暗本身压你：抽走灯火、召唤回响、在你脚边结出滞行雾。' },
  { id: 'emberwake', name: '焚天', hp: 4200, speed: 46, radius: 64, damage: 30, xp: 620, oil: 320, behavior: 'ranged', color: '#a52a1f', boss: true, phases: 3, note: '首领 · 环形火幕与熔岩封路，战场会越打越小。' },
];

export const ENEMY_MAP: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/**
 * 普通刷怪池。「吹灯客」不在里面——它是点灯招来的专属敌人：
 * 混进随机刷怪只会让它在你没点灯时变成一只没有身份的追击怪，那不如不要。
 */
export const NORMAL_ENEMIES = ENEMIES.filter((e) => !e.elite && !e.boss && e.behavior !== 'quench').map((e) => e.id);
