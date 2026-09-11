import { CollisionWorld } from '../../shared/content/CollisionWorld';

import { MAPS } from '../../shared/content/Maps';
import type { MapGeometry } from '../../shared/content/MapTypes';
import type { PvEScenario } from '../../shared/content/PvEScenarios';
export type { Terrain, Waypoint } from '../../shared/content/MapTypes';
export interface Mission extends MapGeometry {
  scenario?: PvEScenario;
  id: string; title: string; location: string; brief: string; debrief: string;
  mode: import('../../shared/simulation/ModeRules').ModeId; goal: number; seconds: number; debug?: boolean; allies: number; enemies: number;
}
const geometry = (id: string) => structuredClone(MAPS.find(map => map.id === id)!.geometry);

/** Original maps, story, limits and team sizes for this short campaign. Not extracted SFH missions. */
export const MISSIONS: readonly Mission[] = [
  {
    id: 'signal', title: '01 / 失联信号', location: '沿岸研究站',
    brief: '研究站的求救信号突然中断。你是先遣队唯一抵达的队员。击退外围守卫，为小队打开入口。\n先拿下4次击杀。阵亡后会在安全区复活，敌人也一样。',
    debrief: '外围已清理。终端记录表明，袭击者正在把研究资料转移到旧铸造厂。你的队友「回声」已经抵达。',
    mode: 'tdm', goal: 4, seconds: 180, allies: 0, enemies: 1,
    ...geometry('signal'),
  },
  {
    id: 'foundry', title: '02 / 炉心回声', location: '废弃铸造厂',
    brief: '和「回声」一起夺回铸造厂。利用中央高台绕过火线，队友的击杀也计入小队分数。\n2对2，率先获得8次击杀。出生区的补给箱每10秒可补充弹药。',
    debrief: '找到的资料只是空壳。真正的数据正经由山顶中继站上传。必须先截断通讯，再追击指挥组。',
    mode: 'tdm', goal: 8, seconds: 240, allies: 1, enemies: 2,
    ...geometry('foundry'),
  },
  {
    id: 'uplink', title: '03 / 静默频段', location: '山顶中继站',
    brief: '占据中继终端，拦截敌方上传。留在光柱附近且没有敌人时，小队每秒获得1点控制分；双方都在时停止计分。\n2对2，先到35分获胜。击杀能清空据点，但不直接加分。',
    debrief: '上传已截断。情报中标出了敌方指挥组的撤离平台。「北斗」将加入最后一次突击。',
    mode: 'dom', goal: 35, seconds: 240, allies: 1, enemies: 2,
    ...geometry('uplink'),
  },
  {
    id: 'extraction', title: '04 / 破晓行动', location: '撤离平台',
    brief: '敌方指挥组的最后防线就在前面。与你的两名队友突破防线，夺回全部资料。\n3对3，率先获得12次击杀。活用高台、蹲伏和换弹间隙，完成撤离。',
    debrief: '资料已回收，小队全员撤离。研究站重新发出了安全信号。行动结束——但你的故事才刚刚开始。',
    mode: 'tdm', goal: 12, seconds: 300, allies: 2, enemies: 3,
    ...geometry('extraction'),
  },
];

export function wallFor(mission: Mission) {
  return new CollisionWorld(mission.terrain, mission.collisionMask).solid;
}
