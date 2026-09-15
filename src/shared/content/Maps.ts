import { ATRIUM_GEOMETRY } from './maps/Atrium';
import plane from './maps/hijack.json' with { type: 'json' };
import type { Mission } from '../../game/campaign/Missions';
import arenas from './maps/original-arenas.json' with { type: 'json' };
import type { MapGeometry } from './MapTypes';
import { scenarioFor } from './PvEScenarios';
import { objectiveIssues } from './MapObjectives';

// Original graph remains in hijack.json. These shortcuts fail the current movement traversal probe;
// the remaining graph preserves access to every original platform in both directions.
const unsupportedShortcuts = new Set(['1:15', '5:6', '6:5', '8:9', '11:10']);
const planeNavigation = plane.navigation.map((node, from) => ({ ...node, links: node.links.filter(to => !unsupportedShortcuts.has(`${from}:${to}`)) }));

export interface MapDefinition {
  id: string; name: string; version: number; modes: Mission['mode'][];
  geometry: MapGeometry;
}
export const MAPS: MapDefinition[] = [
  { id:'atrium', name:'大楼 · 四层攻坚', version:3, modes:['tdm','dom','ctf'], geometry:ATRIUM_GEOMETRY },
  ...arenas.map(m => ({ id: m.id, name: m.name, version: 1, modes: ['tdm', 'dom'] as Mission['mode'][], geometry: m.geometry as MapGeometry })),
  { id: 'hijack', name: '失控飞机', version: 2, modes: ['tdm', 'dom', 'coop', 'ctf'], geometry: {
    width: plane.width, height: plane.height, killY: 1260, terrain: [], collisionMask: plane.collisionMask,
    navigation: planeNavigation, spawns: [plane.spawns[0], plane.spawns[1]], objective: plane.navigation[11],
    // NodeCtfFlag symbol1222 placements, extracted by tools/archaeology/plane-map.ts.
    deliveryBases: [{ x: 376.1, y: 1008.85 }, { x: 2457.2, y: 622.05 }],
    palette: { sky: 0x668592, wall: 0x52616a, trim: 0xc3d6d4 },
    artwork: { id: 'hijack', x: 143.45, y: 312.1, width: 2532, height: 935 },
  } },
];
export function customMatch(mapId: string, mode: Mission['mode'] = 'tdm'): Mission {
  const map = MAPS.find(m => m.id === mapId);
  if (!map || !map.modes.includes(mode)) throw Error('Unsupported map/mode');
  const issues = objectiveIssues(map.geometry, mode === 'coop' ? 'cooperative' : mode === 'ctf' ? 'delivery' : mode === 'dom' ? 'control' : 'combat');
  if (issues.length) throw Error(issues.join('；'));
  const geometry = structuredClone(map.geometry);
  const scenario = mode === 'coop' ? scenarioFor(map.id) : undefined;
  // The original campaign uses at most three per team; custom 4v4 needs a fourth slot.
  for (const [index, spawns] of geometry.spawns.entries()) {
    if (spawns.length < 4) spawns.push({ x: spawns[spawns.length - 1].x + (index === 0 ? 80 : -80), y: spawns[0].y });
  }
  return { ...geometry, id: `custom-${map.id}`, title: map.name, location: map.name,
    brief: '', debrief: '自定义对局结束。', mode, scenario, goal: scenario ? scenario.waves.length : mode === 'ctf' ? 3 : mode === 'tdm' ? 20 : 60,
    seconds: scenario?.seconds ?? 300, allies: mode === 'coop' ? 0 : 3, enemies: mode === 'coop' ? 0 : 4 };
}
