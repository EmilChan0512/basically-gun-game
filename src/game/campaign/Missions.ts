import type { Point } from '../combat/Ballistics';

export interface Terrain { x: number; y: number; width: number; height: number }
export interface Waypoint extends Point { links: number[] }
export interface Mission {
  id: string; title: string; location: string; brief: string; debrief: string;
  mode: 'tdm' | 'dom'; goal: number; seconds: number; allies: number; enemies: number;
  width: number; terrain: Terrain[]; navigation: Waypoint[];
  spawns: [Point[], Point[]]; objective: Point; palette: { sky: number; wall: number; trim: number };
}

function arena(blocks: Terrain[]) {
  return [{ x: 0, y: 600, width: 1800, height: 160 }, ...blocks];
}
function route(points: Point[]): Waypoint[] {
  return points.map((p, i) => ({ ...p, links: [i - 1, i + 1].filter(n => n >= 0 && n < points.length) }));
}
const spawns: [Point[], Point[]] = [
  [{ x: 140, y: 599.5 }, { x: 220, y: 599.5 }, { x: 300, y: 599.5 }],
  [{ x: 1660, y: 599.5 }, { x: 1580, y: 599.5 }, { x: 1500, y: 599.5 }],
];
/** Original maps, story, limits and team sizes for this short campaign. Not extracted SFH missions. */
export const MISSIONS: readonly Mission[] = [
  {
    id: 'signal', title: '01 / 失联信号', location: '沿岸研究站',
    brief: '研究站的求救信号突然中断。你是先遣队唯一抵达的队员。击退外围守卫，为小队打开入口。\n先拿下4次击杀。阵亡后会在安全区复活，敌人也一样。',
    debrief: '外围已清理。终端记录表明，袭击者正在把研究资料转移到旧铸造厂。你的队友「回声」已经抵达。',
    mode: 'tdm', goal: 4, seconds: 180, allies: 0, enemies: 1, width: 1800,
    terrain: arena([{ x: 600, y: 572, width: 90, height: 28 }, { x: 1100, y: 572, width: 90, height: 28 }]),
    navigation: route([{ x: 150, y: 599.5 }, { x: 470, y: 599.5 }, { x: 645, y: 571.5 }, { x: 900, y: 599.5 }, { x: 1145, y: 571.5 }, { x: 1320, y: 599.5 }, { x: 1650, y: 599.5 }]),
    spawns, objective: { x: 900, y: 599.5 }, palette: { sky: 0x142933, wall: 0x3b5961, trim: 0x8ab6b0 },
  },
  {
    id: 'foundry', title: '02 / 炉心回声', location: '废弃铸造厂',
    brief: '和「回声」一起夺回铸造厂。利用中央高台绕过火线，队友的击杀也计入小队分数。\n2对2，率先获得8次击杀。出生区的补给箱每10秒可补充弹药。',
    debrief: '找到的资料只是空壳。真正的数据正经由山顶中继站上传。必须先截断通讯，再追击指挥组。',
    mode: 'tdm', goal: 8, seconds: 240, allies: 1, enemies: 2, width: 1800,
    terrain: arena([{ x: 730, y: 500, width: 340, height: 100 }]),
    navigation: route([{ x: 150, y: 599.5 }, { x: 540, y: 599.5 }, { x: 790, y: 499.5 }, { x: 1010, y: 499.5 }, { x: 1260, y: 599.5 }, { x: 1650, y: 599.5 }]),
    spawns, objective: { x: 900, y: 499.5 }, palette: { sky: 0x2e2527, wall: 0x695249, trim: 0xe3a35d },
  },
  {
    id: 'uplink', title: '03 / 静默频段', location: '山顶中继站',
    brief: '占据中继终端，拦截敌方上传。留在光柱附近且没有敌人时，小队每秒获得1点控制分；双方都在时停止计分。\n2对2，先到35分获胜。击杀能清空据点，但不直接加分。',
    debrief: '上传已截断。情报中标出了敌方指挥组的撤离平台。「北斗」将加入最后一次突击。',
    mode: 'dom', goal: 35, seconds: 240, allies: 1, enemies: 2, width: 1800,
    terrain: arena([{ x: 570, y: 540, width: 110, height: 60 }, { x: 1120, y: 540, width: 110, height: 60 }]),
    navigation: route([{ x: 150, y: 599.5 }, { x: 410, y: 599.5 }, { x: 625, y: 539.5 }, { x: 900, y: 599.5 }, { x: 1175, y: 539.5 }, { x: 1390, y: 599.5 }, { x: 1650, y: 599.5 }]),
    spawns, objective: { x: 900, y: 599.5 }, palette: { sky: 0x1d2936, wall: 0x42596b, trim: 0x9bc8e5 },
  },
  {
    id: 'extraction', title: '04 / 破晓行动', location: '撤离平台',
    brief: '敌方指挥组的最后防线就在前面。与你的两名队友突破防线，夺回全部资料。\n3对3，率先获得12次击杀。活用高台、蹲伏和换弹间隙，完成撤离。',
    debrief: '资料已回收，小队全员撤离。研究站重新发出了安全信号。行动结束——但你的故事才刚刚开始。',
    mode: 'tdm', goal: 12, seconds: 300, allies: 2, enemies: 3, width: 1800,
    terrain: arena([{ x: 560, y: 572, width: 80, height: 28 }, { x: 790, y: 510, width: 220, height: 90 }, { x: 1160, y: 572, width: 80, height: 28 }]),
    navigation: route([{ x: 150, y: 599.5 }, { x: 450, y: 599.5 }, { x: 600, y: 571.5 }, { x: 840, y: 509.5 }, { x: 960, y: 509.5 }, { x: 1200, y: 571.5 }, { x: 1350, y: 599.5 }, { x: 1650, y: 599.5 }]),
    spawns, objective: { x: 900, y: 509.5 }, palette: { sky: 0x302a36, wall: 0x625968, trim: 0xdfb69d },
  },
];

export function wallFor(mission: Mission) {
  return (x: number, y: number) => mission.terrain.some(t => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height);
}
