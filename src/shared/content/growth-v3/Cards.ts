import type { GrowthClassId } from './Core';
import { GROWTH_V3_OPERATORS, type GrowthAbilityId } from './Operators';

export const GROWTH_V3_CARDS = {
  "as_C1": {
    "classId": "assault",
    "name": "战术换弹",
    "description": "手动换弹耗时减少40%，空仓同样生效。",
    "group": "C"
  },
  "as_C2": {
    "classId": "assault",
    "name": "稳定短点",
    "description": "静止0.5秒后前3发伤害+20%、中心散布减少50%；移动后重新蓄势。",
    "group": "C"
  },
  "as_C3": {
    "classId": "assault",
    "name": "战地拾取",
    "description": "240距离内拾取敌人死亡补给，恢复10生命并补充一整基础弹匣的备弹；每个死亡点限一次。",
    "group": "C"
  },
  "as_C4": {
    "classId": "assault",
    "name": "副手预备",
    "description": "主枪空仓切副枪时从备弹补满副枪，副枪伤害+30%持续3秒，冷却3秒；可叠加双枪狂热。",
    "group": "C"
  },
  "as_A1": {
    "classId": "assault",
    "name": "翻滚装填",
    "description": "翻滚时从备弹补满当前弹匣。",
    "group": "A"
  },
  "as_A2": {
    "classId": "assault",
    "name": "轻装翻滚",
    "description": "翻滚冷却缩短40%至4.8秒，加速提高至80%。",
    "group": "A"
  },
  "as_A3": {
    "classId": "assault",
    "name": "滚后稳定",
    "description": "翻滚结束后3秒内下一发伤害+30%、中心散布减少50%；与翻滚突袭增伤加算。",
    "group": "A"
  },
  "as_B1": {
    "classId": "assault",
    "name": "突进杀阵",
    "description": "突进从备弹补满弹匣，结束后伤害+25%持续4秒；与满膛突进的射速联动。",
    "group": "B"
  },
  "as_B2": {
    "classId": "assault",
    "name": "延长突进",
    "description": "突进持续1秒、加速60%，不增加冷却。",
    "group": "B"
  },
  "as_B3": {
    "classId": "assault",
    "name": "突进整备",
    "description": "突进结束获得30护甲4秒，4秒内下一次手动换弹耗时减少40%。",
    "group": "B"
  },
  "as_G1": {
    "classId": "assault",
    "name": "爆破储备",
    "description": "立即增加1次专属道具库存，后续道具恢复时间减半；当前剩余恢复时间也减半，每局仅授予一次库存。",
    "group": "G"
  },
  "as_G2": {
    "classId": "assault",
    "name": "扩域破阵",
    "description": "突击道具爆炸半径+40%、对人伤害+30%、对部署物伤害+50%。",
    "group": "G"
  },
  "tk_C1": {
    "classId": "tank",
    "name": "稳固支撑",
    "description": "地面蹲伏静止时减伤30%，与屏障叠加，合成减伤最高65%。",
    "group": "C"
  },
  "tk_C2": {
    "classId": "tank",
    "name": "掩护换弹",
    "description": "手动换弹耗时减少40%，换弹期间减伤20%；空仓和站立也生效。",
    "group": "C"
  },
  "tk_C3": {
    "classId": "tank",
    "name": "防爆衬垫",
    "description": "受到爆炸伤害减少50%，可叠加其他减伤至65%。",
    "group": "C"
  },
  "tk_C4": {
    "classId": "tank",
    "name": "战地回收",
    "description": "击杀恢复20生命，主枪补充一整基础弹匣的备弹，冷却2秒。",
    "group": "C"
  },
  "tk_A1": {
    "classId": "tank",
    "name": "移动屏障",
    "description": "屏障期间移动速度提高15%，不增加冷却，可与移动堡垒联动。",
    "group": "A"
  },
  "tk_A2": {
    "classId": "tank",
    "name": "屏障冷却",
    "description": "屏障实际减免敌伤后返还2秒冷却，每0.5秒一次，每次施放最多返还6秒；总返还仍有上限。",
    "group": "A"
  },
  "tk_A3": {
    "classId": "tank",
    "name": "应急衬板",
    "description": "屏障自然结束且减免过敌伤，获得40护甲6秒。",
    "group": "A"
  },
  "tk_B1": {
    "classId": "tank",
    "name": "加固盾面",
    "description": "定向盾基础预算提高至300，叠加攻城盾牌达到420；不降低移速。",
    "group": "B"
  },
  "tk_B2": {
    "classId": "tank",
    "name": "快速收盾",
    "description": "举盾与收盾无前后摇，盾持续延长至4秒。",
    "group": "B"
  },
  "tk_B3": {
    "classId": "tank",
    "name": "守护接力",
    "description": "盾自然结束或耗尽后，240距离内最近可见队友获得40护甲6秒，无队友则给自己。",
    "group": "B"
  },
  "tk_G1": {
    "classId": "tank",
    "name": "防御储备",
    "description": "立即增加1次专属道具库存，后续道具恢复时间减半；当前剩余恢复时间也减半，每局仅授予一次库存。",
    "group": "G"
  },
  "tk_G2": {
    "classId": "tank",
    "name": "精工防护",
    "description": "掩体300耐久/24秒；拦截器100耐久/20秒/6次拦截；装甲包40护甲8秒。",
    "group": "G"
  },
  "sn_C1": {
    "classId": "sniper",
    "name": "稳定瞄准",
    "description": "地面静止0.5秒后伤害+20%、中心散布减少60%，移动解除。",
    "group": "C"
  },
  "sn_C2": {
    "classId": "sniper",
    "name": "首发精准",
    "description": "满弹匣首发伤害+35%、中心散布减少60%，与专注和Perk增伤加算。",
    "group": "C"
  },
  "sn_C3": {
    "classId": "sniper",
    "name": "副手应战",
    "description": "移动时副枪伤害+30%、中心散布减少50%。",
    "group": "C"
  },
  "sn_C4": {
    "classId": "sniper",
    "name": "计划换弹",
    "description": "弹匣不足一半时手动换弹耗时减少40%，空仓同样生效。",
    "group": "C"
  },
  "sn_A1": {
    "classId": "sniper",
    "name": "快速专注",
    "description": "专注冷却缩短40%至7.2秒，持续延长至4秒。",
    "group": "A"
  },
  "sn_A2": {
    "classId": "sniper",
    "name": "精准循环",
    "description": "专注期间爆头造成生命伤害后返还2秒冷却，每0.5秒一次，每次施放最多6秒；可联动完美猎杀。",
    "group": "A"
  },
  "sn_A3": {
    "classId": "sniper",
    "name": "专注备弹",
    "description": "专注开始从备弹补满当前弹匣，专注期间前2发伤害+20%。",
    "group": "A"
  },
  "sn_B1": {
    "classId": "sniper",
    "name": "延长转移",
    "description": "转移持续延长至3秒，冷却缩短20%至9.6秒。",
    "group": "B"
  },
  "sn_B2": {
    "classId": "sniper",
    "name": "转移整备",
    "description": "转移开始从备弹补满弹匣，期间手动换弹耗时减少40%。",
    "group": "B"
  },
  "sn_B3": {
    "classId": "sniper",
    "name": "转移掩声",
    "description": "转移脚步半径减少90%，加速提高至40%，叠加游猎转移达到60%。",
    "group": "B"
  },
  "sn_G1": {
    "classId": "sniper",
    "name": "侦察储备",
    "description": "立即增加1次专属道具库存，后续道具恢复时间减半；当前剩余恢复时间也减半，每局仅授予一次库存。",
    "group": "G"
  },
  "sn_G2": {
    "classId": "sniper",
    "name": "广域侦察",
    "description": "信标视野1320/标记2秒/寿命120秒；EMP半径240/停机6秒；诱饵声半径900/耐久40/寿命10秒。",
    "group": "G"
  },
  "md_C1": {
    "classId": "medic",
    "name": "紧急分诊",
    "description": "E治疗生命低于50%的目标时，脉冲额外恢复30生命，治疗链每跳额外恢复4生命。",
    "group": "C"
  },
  "md_C2": {
    "classId": "medic",
    "name": "救援奔袭",
    "description": "E实际治疗队友后双方加速30%持续4秒，冷却3秒；同类移速取最高。",
    "group": "C"
  },
  "md_C3": {
    "classId": "medic",
    "name": "救援整备",
    "description": "每次E首次有效治疗后，4秒内下一次换弹耗时减少40%；恢复敌伤还使自身伤害+20%持续4秒。",
    "group": "C"
  },
  "md_C4": {
    "classId": "medic",
    "name": "自疗训练",
    "description": "脉冲对自己额外恢复25生命，治疗链自疗每跳额外恢复4生命。",
    "group": "C"
  },
  "md_A1": {
    "classId": "medic",
    "name": "广域脉冲",
    "description": "脉冲半径扩大至300，每目标治疗额外+15；叠加强效急救达到65生命。",
    "group": "A"
  },
  "md_A2": {
    "classId": "medic",
    "name": "快速急救",
    "description": "脉冲冷却缩短40%至8.4秒，不降低治疗量。",
    "group": "A"
  },
  "md_A3": {
    "classId": "medic",
    "name": "流动诊疗",
    "description": "脉冲期间加速20%；有效恢复敌伤时给目标25护甲4秒，不增加冷却。",
    "group": "A"
  },
  "md_B1": {
    "classId": "medic",
    "name": "延伸治疗",
    "description": "治疗链距离提高至420，队友每跳治疗+3、自疗+2；叠加战地输血队友每跳12生命。",
    "group": "B"
  },
  "md_B2": {
    "classId": "medic",
    "name": "稳定连接",
    "description": "治疗链不因受伤中断或暂停，持续延长至4秒；距离、遮挡和死亡仍会断链。",
    "group": "B"
  },
  "md_B3": {
    "classId": "medic",
    "name": "加速输注",
    "description": "治疗链间隔缩短至0.2秒，基础持续3秒共15跳；可叠加稳定连接延长至20跳。",
    "group": "B"
  },
  "md_G1": {
    "classId": "medic",
    "name": "医疗储备",
    "description": "立即增加1次专属道具库存，后续道具恢复时间减半；当前剩余恢复时间也减半，每局仅授予一次库存。",
    "group": "G"
  },
  "md_G2": {
    "classId": "medic",
    "name": "扩域支援",
    "description": "烟雾半径220/8秒；急救站半径240/每秒8治疗/预算240/20秒；弹药箱半径140/每人补50%/20秒。",
    "group": "G"
  }
} as const;
export type GrowthCardId = keyof typeof GROWTH_V3_CARDS;
export const GROWTH_V3_EVOLUTIONS = {
  "as_EV_A": {
    "classId": "assault",
    "name": "双段机动",
    "description": "双充能翻滚，每充能6秒恢复、两次间隔0.5秒；每次滚后恢复20生命并获得20护甲3秒，保留满膛和高速。",
    "group": "A",
    "requires": [
      "as_A1",
      "as_A2"
    ]
  },
  "as_EV_B": {
    "classId": "assault",
    "name": "流动火力",
    "description": "突进冷却缩短至6.6秒，结束后5秒伤害+40%、射速+30%；可叠加突进杀阵和满膛突进。",
    "group": "B",
    "requires": [
      "as_B1",
      "as_B2"
    ]
  },
  "tk_EV_A": {
    "classId": "tank",
    "name": "战争堡垒",
    "description": "屏障持续6秒、加速20%、射速+35%；基础减伤45%，叠加移动堡垒达到65%，保留受击返还。",
    "group": "A",
    "requires": [
      "tk_A1",
      "tk_A2"
    ]
  },
  "tk_EV_B": {
    "classId": "tank",
    "name": "反攻窗口",
    "description": "盾自然结束或耗尽后从备弹补满主枪，5秒伤害+40%、射速+35%，保留快速切主枪与攻城盾护甲。",
    "group": "B",
    "requires": [
      "tk_B1",
      "tk_B2"
    ]
  },
  "sn_EV_A": {
    "classId": "sniper",
    "name": "定点狙击",
    "description": "专注持续6秒，所有射击伤害+35%，静止中心散布倍率降至15%；与强化首发加算。",
    "group": "A",
    "requires": [
      "sn_A1",
      "sn_A2"
    ]
  },
  "sn_EV_B": {
    "classId": "sniper",
    "name": "游击射手",
    "description": "转移全程可以开火，移动中心散布减少50%、转移期间伤害+25%；保留转移补满弹匣。",
    "group": "B",
    "requires": [
      "sn_B1",
      "sn_B2"
    ]
  },
  "md_EV_A": {
    "classId": "medic",
    "name": "救援脉冲",
    "description": "实际恢复队友敌伤后给35护甲6秒，双方伤害+25%持续4秒；每目标5秒冷却。",
    "group": "A",
    "requires": [
      "md_A1",
      "md_A2"
    ]
  },
  "md_EV_B": {
    "classId": "medic",
    "name": "医疗伴随",
    "description": "治疗链期间可开火、切枪和换弹；完整结束且有有效治疗后，双方获得40护甲6秒。",
    "group": "B",
    "requires": [
      "md_B1",
      "md_B2"
    ]
  }
} as const;
export type GrowthEvolutionId = keyof typeof GROWTH_V3_EVOLUTIONS;
export type GrowthUpgradeId = GrowthCardId | GrowthEvolutionId;
export function legalGrowthCards(classId: GrowthClassId, abilityId: GrowthAbilityId): GrowthCardId[] {
  const operator = GROWTH_V3_OPERATORS[classId];
  if (!(operator.abilities as readonly string[]).includes(abilityId)) throw Error('not_owner_class');
  const route = operator.abilities[0] === abilityId ? 'A' : 'B';
  return (Object.keys(GROWTH_V3_CARDS) as GrowthCardId[]).filter(id => {
    const card = GROWTH_V3_CARDS[id];
    return card.classId === classId && (card.group === 'C' || card.group === 'G' || card.group === route);
  });
}
export function defaultGrowthCards(classId: GrowthClassId, abilityId: GrowthAbilityId): GrowthCardId[] {
  return legalGrowthCards(classId, abilityId).filter(id => !id.endsWith('_G2'));
}
export function isGrowthUpgrade(value: unknown): value is GrowthUpgradeId {
  return typeof value === 'string' && (Object.hasOwn(GROWTH_V3_CARDS, value) || Object.hasOwn(GROWTH_V3_EVOLUTIONS, value));
}
