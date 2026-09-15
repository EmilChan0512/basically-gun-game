import type { MapGeometry, Terrain, Waypoint } from '../MapTypes';

// Orbital station: observation decks, continuous ramps and magnetic relay pods.
export const STATION_RAMPS = [
  { x: 120, y: 960, width: 480, rise: -240 },
  { x: 1560, y: 720, width: 480, rise: 240 },
  { x: 2760, y: 960, width: 480, rise: -240 },
  { x: 4200, y: 720, width: 480, rise: 240 },
];
export const STATION_PODS = [
  { x: 2100, y: 864, width: 120, height: 32 },
  { x: 2280, y: 816, width: 240, height: 48 },
  { x: 2580, y: 864, width: 120, height: 32 },
];
export const STATION_CABIN = { x: 1680, y: 360, width: 1440, height: 64 };
export const STATION_CABIN_COVERS = [1900, 2180, 2540, 2820].map(x => ({ x, y: 304, width: 80, height: 56 }));
export const STATION_PORTALS = [
  { id: 'west-up', entrance: { x: 1740, y: 959.5 }, exit: { x: 2040, y: 359.5 }, requiresCrouch: true },
  { id: 'east-up', entrance: { x: 3060, y: 959.5 }, exit: { x: 2760, y: 359.5 }, requiresCrouch: true },
  { id: 'west-down', entrance: { x: 1830, y: 359.5 }, exit: { x: 1620, y: 959.5 }, requiresCrouch: true },
  { id: 'east-down', entrance: { x: 2970, y: 359.5 }, exit: { x: 3180, y: 959.5 }, requiresCrouch: true },
];
const terrain: Terrain[] = [
  { x: 0, y: 960, width: 4800, height: 120 },
  { x: 0, y: 0, width: 24, height: 960 },
  { x: 4776, y: 0, width: 24, height: 960 },
  { x: 600, y: 720, width: 960, height: 96 },
  { x: 3240, y: 720, width: 960, height: 96 },
  ...STATION_PODS,
  STATION_CABIN,
  { x: 1800, y: 96, width: 1200, height: 24 },
  { x: 1800, y: 120, width: 24, height: 104 },
  { x: 2976, y: 120, width: 24, height: 104 },
  ...STATION_CABIN_COVERS,
];
const covers = [720, 1320, 2220, 2520, 3420, 4020];
for (const x of covers) terrain.push({ x, y: 912, width: 60, height: 48 });
const navigation: Waypoint[] = [];
const stairTreads: Terrain[] = [];
// One-way ramps reuse authority/prediction support. Each 2px sample rises only 1px.
for (const ramp of STATION_RAMPS) for (let x = 0; x < ramp.width; x += 2) {
  stairTreads.push({ x: ramp.x + x, y: ramp.y + ramp.rise * (x + 1) / ramp.width, width: 2, height: 16 });
}
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
      const y = 960 - (step - .5) * 24;
      const id = node(x + 24, y); connect(previous, id); previous = id;
    }
    connect(previous, side === -1 ? upper[0] : upper[upper.length - 1]);
  }
}
const podRows = STATION_PODS.map(pod => {
  const row: number[] = [];
  for (let x = pod.x + 30; x < pod.x + pod.width; x += 60) {
    const id = node(x, pod.y);
    if (row.length) connect(row[row.length - 1], id);
    row.push(id);
  }
  return row;
});
// Launch from outside the pod footprint to avoid hitting its underside.
connect(nearest(ground, 1980), podRows[0][0]);
connect(nearest(ground, 2820), podRows[2][podRows[2].length - 1]);
for (let i = 1; i < podRows.length; i++) connect(podRows[i-1][podRows[i-1].length-1], podRows[i][0]);
const cabin: number[] = [];
const cabinXs = [...new Set([...Array.from({ length: 24 }, (_, i) => 1710 + i * 60), ...STATION_CABIN_COVERS.map(c => c.x + c.width / 2), 2040, 2400, 2760])].sort((a,b) => a-b);
for (const x of cabinXs) {
  if (STATION_CABIN_COVERS.some(c => x !== c.x + c.width / 2 && x > c.x - 30 && x < c.x + c.width + 30)) continue;
  const cover = STATION_CABIN_COVERS.find(c => x >= c.x && x < c.x + c.width);
  const id = node(x, cover ? cover.y : 360);
  if (cabin.length) connect(cabin[cabin.length - 1], id);
  cabin.push(id);
}
// Only directed portal links lead into the cabin; no jump/ramp link reaches its height.
for (const portal of STATION_PORTALS) {
  const up = portal.id.endsWith('-up');
  const entrance = nearest(up ? ground : cabin, portal.entrance.x);
  const exit = nearest(up ? cabin : ground, portal.exit.x);
  navigation[entrance].links.push(exit);
  navigation[entrance].portalTo = exit;
}
export const LONGSHOT_GEOMETRY: MapGeometry = {
  width: 4800, height: 1080, killY: 1200, terrain, stairTreads,
  minimapTerrain: [...terrain, ...stairTreads], navigation,
  spawns: [[900, 990, 1080, 1170], [3900, 3810, 3720, 3630]].map(xs => xs.map(x => ({ x, y: 959.5 }))) as MapGeometry['spawns'],
  portals: STATION_PORTALS,
  objective: { x: 2400, y: 359.5 },
  palette: { sky: 0x07111f, wall: 0x344c63, trim: 0x81e6fa },
};
