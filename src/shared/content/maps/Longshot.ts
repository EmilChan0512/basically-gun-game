import type { MapGeometry, Terrain, Waypoint } from '../MapTypes';

// Open upper firing lane, sheltered ground approaches, and two exits per nest.
const terrain: Terrain[] = [
  { x: 0, y: 960, width: 4800, height: 120 },
  { x: 0, y: 0, width: 24, height: 960 },
  { x: 4776, y: 0, width: 24, height: 960 },
  { x: 600, y: 720, width: 960, height: 24 },
  { x: 3240, y: 720, width: 960, height: 24 },
];
const covers = [720, 1320, 2220, 2520, 3420, 4020];
for (const x of covers) terrain.push({ x, y: 912, width: 60, height: 48 });
const navigation: Waypoint[] = [];
const stairTreads: Terrain[] = [];
const node = (x: number, y: number) => { navigation.push({ x, y: y - .5, links: [] }); return navigation.length - 1; };
const connect = (a: number, b: number) => { navigation[a].links.push(b); navigation[b].links.push(a); };
const ground: number[] = [];
const xs = [...new Set([...Array.from({ length: 79 }, (_, i) => 60 + i * 60), ...covers.map(x => x + 30)])].sort((a,b) => a-b);
for (const x of xs) {
  if (covers.some(c => x === c || x === c + 60)) continue;
  const cover = covers.some(c => x > c && x < c + 60);
  const id = node(x, cover ? 912 : 960);
  if (ground.length) connect(ground[ground.length - 1], id);
  ground.push(id);
}
const nearest = (row: number[], x: number) => row.reduce((a,b) => Math.abs(navigation[a].x-x) < Math.abs(navigation[b].x-x) ? a : b);
for (const left of [600, 3240]) {
  const upper: number[] = [];
  for (let x = left + 30; x < left + 960; x += 60) {
    const id = node(x, 720);
    if (upper.length) connect(upper[upper.length - 1], id);
    upper.push(id);
  }
  for (const side of [-1, 1]) {
    const base = side === -1 ? left - 480 : left + 1440;
    let previous = nearest(ground, base);
    for (let step = 1; step <= 10; step++) {
      const x = side === -1 ? base + (step - 1) * 48 : base - step * 48;
      const y = 960 - step * 24;
      stairTreads.push({ x, y, width: 48, height: 16 });
      const id = node(x + 24, y); connect(previous, id); previous = id;
    }
    connect(previous, side === -1 ? upper[0] : upper[upper.length - 1]);
  }
}
export const LONGSHOT_GEOMETRY: MapGeometry = {
  width: 4800, height: 1080, killY: 1200, terrain, stairTreads,
  minimapTerrain: [...terrain, ...stairTreads], navigation,
  spawns: [[900, 990, 1080, 1170], [3900, 3810, 3720, 3630]].map(xs => xs.map(x => ({ x, y: 959.5 }))) as MapGeometry['spawns'],
  objective: { x: 2400, y: 959.5 },
  palette: { sky: 0x263c4c, wall: 0x69736c, trim: 0xe1c68a },
};
