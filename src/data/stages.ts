import type { StageDef } from '../types';

export const STAGES: StageDef[] = [
  {
    id: 'gloamwood',
    theme: { id: 'gloamwood', name: '幽林', subtitle: '光照不见的树影', floor: '#101a14', wall: '#1d3324', accent: '#5fe08a', fog: '#0a120d', hue: 130 },
    waves: 7,
    boss: 'thornlord',
    elites: ['wickmother'],
    hazards: ['fog', 'meteor'],
  },
  {
    id: 'ashenkeep',
    theme: { id: 'ashenkeep', name: '残堡', subtitle: '被熄灯者占据的废墟', floor: '#141520', wall: '#2a2c42', accent: '#8fa7ff', fog: '#0b0c15', hue: 220 },
    waves: 8,
    boss: 'extinguisher',
    elites: ['darkless', 'siphon'],
    hazards: ['collapse', 'wispstorm'],
  },
  {
    id: 'emberhold',
    theme: { id: 'emberhold', name: '熔窟', subtitle: '焚天的巢穴', floor: '#1b0f0c', wall: '#3a1c10', accent: '#ff7a2f', fog: '#120806', hue: 20 },
    waves: 9,
    boss: 'emberwake',
    elites: ['wickmother', 'darkless', 'siphon'],
    hazards: ['eruption', 'meteor', 'oilvoid'],
  },
  {
    id: 'nightcity',
    theme: {
      id: 'nightcity',
      name: '长夜之城',
      subtitle: '终夜盘踞的地方',
      floor: '#140f1e',
      wall: '#2a2140',
      accent: '#c9a3ff',
      fog: '#0a0714',
      hue: 275,
    },
    waves: 10,
    boss: 'nightfall',
    elites: ['wickmother', 'darkless', 'siphon'],
    hazards: ['echoes', 'wispstorm', 'meteor', 'oilvoid'],
  },
];

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
