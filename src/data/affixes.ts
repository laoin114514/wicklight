export interface AffixDef {
  id: string;
  name: string;
  blurb: string;
  color: string;
}

export const AFFIXES: AffixDef[] = [
  { id: 'swift', name: '迅捷', blurb: '移动速度 +50%', color: '#7be0ff' },
  { id: 'iron', name: '铁壁', blurb: '生命 +70%，并减免 30% 伤害', color: '#8fa7ff' },
  { id: 'split', name: '分裂', blurb: '死亡时分裂出 2 只影蛭', color: '#c96a2f' },
  { id: 'ember', name: '燃烬', blurb: '死亡时炸开一圈火焰', color: '#ff7a2f' },
  { id: 'giant', name: '巨化', blurb: '体型与生命大幅提升，但更迟缓', color: '#d08cff' },
  { id: 'regen', name: '再生', blurb: '持续回复生命', color: '#8affc1' },
  { id: 'venom', name: '剧毒', blurb: '死亡时留下一滩毒液', color: '#a8e05f' },
  { id: 'warded', name: '咒盾', blurb: '免疫灼烧与冰缓，并额外减伤 25%', color: '#c9a3ff' },
  { id: 'haste', name: '疾风', blurb: '光环：附近敌人移动速度 +35%', color: '#7be0ff' },
];

export const AFFIX_MAP: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));
