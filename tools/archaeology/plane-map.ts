import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inspectTimeline, displayListAt } from './timeline';

const swf = readFileSync('archaeology/swf/sfh1_reference.swf');
const timeline = inspectTimeline(swf, 'Arena');
const frame = timeline.labels.find(l => l.name === 'plane')!.frame;
const list = displayListAt(timeline, frame);
const nodes = list.filter(p => p.character === 1273);
const ids = nodes.map(p => p.name!.split('_')[0]);
const point = (p: typeof list[number]) => ({ x: p.x!, y: p.y! });
const navigation = nodes.map(p => ({ ...point(p), links: [...p.name!.split('_')[1]].map(id => {
  const index = ids.indexOf(id); if (index < 0) throw Error(`Missing waypoint ${id}`); return index;
}) }));
const spawns = [1, 2].map(team => list.filter(p => p.character === 1276 && p.name?.endsWith(`_${team}`)).map(point));
const flags = list.filter(p => p.character === 1222).map(p => ({ ...point(p), team: Number(p.name!.split('__')[1]) }));
mkdirSync('archaeology/local', { recursive: true });
writeFileSync('archaeology/local/plane-nodes.json', JSON.stringify({ source: timeline.sha256, frame, navigation, spawns, flags }, null, 2));
console.log(`Plane: ${navigation.length} waypoints, ${spawns.map(s => s.length).join('/')} team spawns, ${flags.length} flags`);
