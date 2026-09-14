import type { GrowthClassId } from './Core';
import { GROWTH_V3_OPERATORS, type GrowthAbilityId } from './Operators';

export const GROWTH_V3_CARDS = {
  "as_C1": {
    "classId": "assault",
    "name": "战术换弹",
    "description": "非空仓手动换弹耗时×.80，空仓无效",
    "group": "C"
  },
  "as_C2": {
    "classId": "assault",
    "name": "稳定短点",
    "description": "静止15tick后前3次扳机中心散布×.80；移动清次数，重新静止15tick重新获得",
    "group": "C"
  },
  "as_C3": {
    "classId": "assault",
    "name": "战地拾取",
    "description": "距敌死亡点≤80px，补当前枪floor(基础M×.25)备弹至少1，每参与者每死亡事件一次；死亡点存180tick",
    "group": "C"
  },
  "as_C4": {
    "classId": "assault",
    "name": "副手预备",
    "description": "主枪空仓切副枪时从副枪备弹转2发，CD240tick，不提前结束切枪准备",
    "group": "C"
  },
  "as_A1": {
    "classId": "assault",
    "name": "翻滚装填",
    "description": "翻滚生效时从当前枪备弹转3发至弹匣",
    "group": "A"
  },
  "as_A2": {
    "classId": "assault",
    "name": "轻装翻滚",
    "description": "翻滚基础CD240→210tick，加速50%→35%",
    "group": "A"
  },
  "as_A3": {
    "classId": "assault",
    "name": "滚后稳定",
    "description": "翻滚结束后30tick内下一次扳机散布×.75，死亡或使用即清",
    "group": "A"
  },
  "as_B1": {
    "classId": "assault",
    "name": "增量装填",
    "description": "突进装填转移4→6发，不生成弹药",
    "group": "B"
  },
  "as_B2": {
    "classId": "assault",
    "name": "延长突进",
    "description": "持续18→24tick，但CD330→360tick",
    "group": "B"
  },
  "as_B3": {
    "classId": "assault",
    "name": "突进整备",
    "description": "技能结束后90tick内下一次手动换弹耗时×.85",
    "group": "B"
  },
  "as_G1": {
    "classId": "assault",
    "name": "爆破储备",
    "description": "选择后当前突击专属G库存+1，仅当次选卡发放、每局一次",
    "group": "G"
  },
  "as_G2": {
    "classId": "assault",
    "name": "扩域破阵",
    "description": "三种G爆炸半径×1.15；对人最大/最小伤害×.85，对部署物伤害不变",
    "group": "G"
  },
  "tk_C1": {
    "classId": "tank",
    "name": "稳固支撑",
    "description": "地面蹲伏静止时个人减伤15%，与屏障等取最高",
    "group": "C"
  },
  "tk_C2": {
    "classId": "tank",
    "name": "掩护换弹",
    "description": "蹲伏开始非空仓手动换弹耗时×.80，开始锁定",
    "group": "C"
  },
  "tk_C3": {
    "classId": "tank",
    "name": "防爆衬垫",
    "description": "对爆炸个人减伤25%，与其他个人减伤取最高",
    "group": "C"
  },
  "tk_C4": {
    "classId": "tank",
    "name": "战地回收",
    "description": "击杀敌人补当前主武器10发备弹，CD150tick，容量封顶",
    "group": "C"
  },
  "tk_A1": {
    "classId": "tank",
    "name": "移动屏障",
    "description": "屏障移速惩罚25%→10%，CD360→390tick",
    "group": "A"
  },
  "tk_A2": {
    "classId": "tank",
    "name": "屏障冷却",
    "description": "屏障期间实际阻止>0敌方伤害后CD减30tick，每30tick一次；每次E最多60tick",
    "group": "A"
  },
  "tk_A3": {
    "classId": "tank",
    "name": "应急衬板",
    "description": "屏障自然结束且本次吸收过伤害，获10护甲60tick；主动取消不触发",
    "group": "A"
  },
  "tk_B1": {
    "classId": "tank",
    "name": "加固盾面",
    "description": "盾吸收预算120→150HP，技能移速惩罚15%→20%",
    "group": "B"
  },
  "tk_B2": {
    "classId": "tank",
    "name": "快速收盾",
    "description": "前摇6→3tick，结束后摇6→3tick；盾持续90→75tick",
    "group": "B"
  },
  "tk_B3": {
    "classId": "tank",
    "name": "守护接力",
    "description": "盾自然结束或耗尽预算后120px内最近可见队友获10护甲60tick，无队友则自己；主动取消无效",
    "group": "B"
  },
  "tk_G1": {
    "classId": "tank",
    "name": "防御储备",
    "description": "当前重装专属G库存+1，每局一次",
    "group": "G"
  },
  "tk_G2": {
    "classId": "tank",
    "name": "精工防护",
    "description": "掩体HP120→150、寿命360→300；拦截器HP40→55、寿命300→240；装甲包额度15→20、持续120→90tick",
    "group": "G"
  },
  "sn_C1": {
    "classId": "sniper",
    "name": "稳定瞄准",
    "description": "地面静止30tick后散布×.75，移动解除",
    "group": "C"
  },
  "sn_C2": {
    "classId": "sniper",
    "name": "首发精准",
    "description": "满弹匣第一扳机散布×.70，不与更强收益相乘",
    "group": "C"
  },
  "sn_C3": {
    "classId": "sniper",
    "name": "副手应战",
    "description": "移动时副枪散布×.75",
    "group": "C"
  },
  "sn_C4": {
    "classId": "sniper",
    "name": "计划换弹",
    "description": "非空且当前弹匣少于容量一半时手动换弹×.75",
    "group": "C"
  },
  "sn_A1": {
    "classId": "sniper",
    "name": "快速专注",
    "description": "CD360→300tick，持续90→60tick",
    "group": "A"
  },
  "sn_A2": {
    "classId": "sniper",
    "name": "精准循环",
    "description": "专注期间爆头造成>0生命伤害后CD减30tick；每30tick一次，每次E最多60tick",
    "group": "A"
  },
  "sn_A3": {
    "classId": "sniper",
    "name": "专注备弹",
    "description": "发动专注从备弹转1发到当前枪弹匣，满匣/无备弹不转",
    "group": "A"
  },
  "sn_B1": {
    "classId": "sniper",
    "name": "延长转移",
    "description": "持续45→60tick，CD360→390tick；前15tick禁火不变",
    "group": "B"
  },
  "sn_B2": {
    "classId": "sniper",
    "name": "转移整备",
    "description": "转移期间开始手动换弹耗时×.80",
    "group": "B"
  },
  "sn_B3": {
    "classId": "sniper",
    "name": "转移掩声",
    "description": "转移脚步半径倍率.50→.25，但加速20%→15%",
    "group": "B"
  },
  "sn_G1": {
    "classId": "sniper",
    "name": "侦察储备",
    "description": "当前狙击专属G库存+1，每局一次",
    "group": "G"
  },
  "sn_G2": {
    "classId": "sniper",
    "name": "广域侦察",
    "description": "信标半径180→220、标记30→24tick；EMP半径160→190、停机90→60tick；诱饵声半径480→600、寿命150→120tick",
    "group": "G"
  },
  "md_C1": {
    "classId": "medic",
    "name": "紧急分诊",
    "description": "E对低于30%最大HP的目标：脉冲额外+10HP；治疗链每跳额外+1HP（自用同样+1），按实际治疗时判断",
    "group": "C"
  },
  "md_C2": {
    "classId": "medic",
    "name": "救援奔袭",
    "description": "E实际治疗其他队友后自己加速15%持续60tick，CD180tick",
    "group": "C"
  },
  "md_C3": {
    "classId": "medic",
    "name": "救援整备",
    "description": "E第一次有效治疗后60tick内下一次手动换弹×.80；每次施放只授予一次",
    "group": "C"
  },
  "md_C4": {
    "classId": "medic",
    "name": "自疗训练",
    "description": "脉冲对自己额外+5HP；治疗链自用每跳3→4HP；不增治疗XP",
    "group": "C"
  },
  "md_A1": {
    "classId": "medic",
    "name": "广域脉冲",
    "description": "半径180→240px，每目标基础治疗25→20HP",
    "group": "A"
  },
  "md_A2": {
    "classId": "medic",
    "name": "快速急救",
    "description": "基础CD420→336tick，每目标基础治疗再−5HP",
    "group": "A"
  },
  "md_A3": {
    "classId": "medic",
    "name": "流动诊疗",
    "description": "移除脉冲成功后的10%减速，但CD倍率额外+10%",
    "group": "A"
  },
  "md_B1": {
    "classId": "medic",
    "name": "延伸治疗",
    "description": "链距离240→300px，每跳治疗基础−1HP（队友和自用均生效）",
    "group": "B"
  },
  "md_B2": {
    "classId": "medic",
    "name": "稳定连接",
    "description": "施法者受到敌方生命伤害时不立即中断，改为连续15tick没有新伤害后恢复治疗；受伤暂停期间不治疗，90tick寿命继续",
    "group": "B"
  },
  "md_B3": {
    "classId": "medic",
    "name": "加速输注",
    "description": "治疗总持续90→60tick、间隔15→10tick，仍6跳；按新治疗速率参与§7.3有效来源仲裁",
    "group": "B"
  },
  "md_G1": {
    "classId": "medic",
    "name": "医疗储备",
    "description": "当前医疗专属G库存+1，每局一次",
    "group": "G"
  },
  "md_G2": {
    "classId": "medic",
    "name": "扩域支援",
    "description": "烟雾半径150→180、持续150→120；急救站半径140→180、预算90→72HP；弹药箱领取半径60→100、每人补给比例20%→15%",
    "group": "G"
  }
} as const;
export type GrowthCardId = keyof typeof GROWTH_V3_CARDS;
export const GROWTH_V3_EVOLUTIONS = {
  "as_EV_A": {
    "classId": "assault",
    "name": "双段机动",
    "description": "变2充能、逐个恢复360tick、两次最少60tick；选中时仅1充能，另一开始恢复；加速保持A2的35%，装填保持3发；替代A2的210CD",
    "group": "A",
    "requires": [
      "as_A1",
      "as_A2"
    ]
  },
  "as_EV_B": {
    "classId": "assault",
    "name": "流动火力",
    "description": "每次转移6→8发，CD按B2基础360再+30=390tick；持续24不变",
    "group": "B",
    "requires": [
      "as_B1",
      "as_B2"
    ]
  },
  "tk_EV_A": {
    "classId": "tank",
    "name": "移动堡垒",
    "description": "屏障期间移速惩罚10%→0，减伤35%→30%；A1的390CD和A2返还保留",
    "group": "A",
    "requires": [
      "tk_A1",
      "tk_A2"
    ]
  },
  "tk_EV_B": {
    "classId": "tank",
    "name": "反攻窗口",
    "description": "自然结束/耗尽预算后，60tick内主枪下一次切入准备时间×.50；主动取消不触发，不能绕过现有shootReadyTick",
    "group": "B",
    "requires": [
      "tk_B1",
      "tk_B2"
    ]
  },
  "sn_EV_A": {
    "classId": "sniper",
    "name": "定点狙击",
    "description": "专注期间地面静止散布倍率.35→.25；发生移动则恢复.35；CD300、持续60与返还规则保留",
    "group": "A",
    "requires": [
      "sn_A1",
      "sn_A2"
    ]
  },
  "sn_EV_B": {
    "classId": "sniper",
    "name": "游击射手",
    "description": "前15tick禁火不变；其后转移剩余时间内移动散布×.70，CD按B1的390再+30=420tick",
    "group": "B",
    "requires": [
      "sn_B1",
      "sn_B2"
    ]
  },
  "md_EV_A": {
    "classId": "medic",
    "name": "救援脉冲",
    "description": "对其他队友实际治疗后额外给10护甲60tick；每目标300tick共享CD；与觉醒同次触发时只取觉醒15/90，两类CD均开始",
    "group": "A",
    "requires": [
      "md_A1",
      "md_A2"
    ]
  },
  "md_EV_B": {
    "classId": "medic",
    "name": "医疗伴随",
    "description": "链成功结束（满持续且至少一跳有效）后目标获10护甲90tick；被打断/主动取消不触发；与其他护甲同槽",
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
