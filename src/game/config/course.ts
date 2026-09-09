export interface Terrain { id: string; x: number; y: number; width: number; height: number; oneWay?: boolean }
export const terrain: Terrain[] = [
  { id: 'ground-west', x: 0, y: 600, width: 1280, height: 160 },
  { id: 'ground-east', x: 1460, y: 600, width: 940, height: 160 },
  { id: 'step-8', x: 570, y: 592, width: 70, height: 8 },
  { id: 'step-16', x: 700, y: 584, width: 70, height: 16 },
  { id: 'step-28', x: 840, y: 572, width: 80, height: 28 },
  { id: 'platform-low', x: 1670, y: 515, width: 165, height: 18, oneWay: true },
  { id: 'platform-high', x: 1880, y: 430, width: 175, height: 18, oneWay: true },
  { id: 'platform-solid', x: 2100, y: 515, width: 180, height: 85 },
];
export const stations = [
  { x: 180, y: 580, label: '01 / FLAT GROUND' },
  { x: 505, y: 580, label: '02 / STEP ASSIST' },
  { x: 1130, y: 580, label: '03 / RUNNING JUMP' },
  { x: 1715, y: 495, label: '04 / PLATFORM DROP' },
] as const;
