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
const atriumTerrain = [
  { x: 0, y: 1280, width: 3200, height: 120 },
  ...[0, 1, 2, 3].flatMap(i => [
    { x: 400 + i*200, y: 1160-i*120, width: 240, height: 28 },
    { x: 2560-i*200, y: 1160-i*120, width: 240, height: 28 },
  ]),
  { x: 1200, y: 680, width: 800, height: 32 },
];
const atriumPoints = [
  ...[200,500,800,1100,1400,1600,1800,2100,2400,2700,3000].map(x => ({ x, y:1279.5 })),
  ...[0,1,2,3].map(i=>({x:520+i*200,y:1159.5-i*120})),
  {x:1300,y:679.5},{x:1600,y:679.5},{x:1900,y:679.5},
  ...[3,2,1,0].map(i=>({x:2680-i*200,y:1159.5-i*120})),
];
const atriumLinks = atriumPoints.map(()=>[] as number[]);
for (const route of [[0,1,2,3,4,5,6,7,8,9,10],[1,11,12,13,14,15,16,17,18,19,20,21,9]]) {
  for(let i=1;i<route.length;i++){atriumLinks[route[i-1]].push(route[i]);atriumLinks[route[i]].push(route[i-1]);}
}
export const MAPS: MapDefinition[] = [
  { id:'atrium', name:'纵深大楼 · 天穹中庭', version:1, modes:['tdm','dom'], geometry:{
    width:3200,height:1400,killY:1500,terrain:atriumTerrain,
    navigation:atriumPoints.map((p,i)=>({...p,links:atriumLinks[i]})),
    spawns:[[100,180,260,340].map(x=>({x,y:1279.5})),[3100,3020,2940,2860].map(x=>({x,y:1279.5}))],
    objective:{x:1600,y:679.5},palette:{sky:0x101e2c,wall:0x293e4b,trim:0x8bccce},
  } },
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
