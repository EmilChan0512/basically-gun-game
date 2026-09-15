import type { GrowthClassId } from './Core';
import type { GrowthAbilityId } from './Operators';
export const GROWTH_V3_PERKS = {
  as_ambush: { classId: 'assault', group: 'mobility', name: '翻滚突袭', description: '翻滚结束后3秒内首发伤害+40%，换弹耗时-40%。', abilityId: 'as_roll' },
  as_fullrush: { classId: 'assault', group: 'mobility', name: '满膛突进', description: '突进从备弹补满当前弹匣，结束后射速+25%，持续3秒。', abilityId: 'as_reloadrush' },
  as_blood: { classId: 'assault', group: 'handling', name: '嗜血前锋', description: '击杀恢复25生命，获得20临时护甲4秒。', abilityId: null },
  as_close: { classId: 'assault', group: 'handling', name: '近战压制', description: '180距离内武器伤害+20%，命中减速15%持续0.8秒。', abilityId: null },
  as_reset: { classId: 'assault', group: 'survival', name: '杀戮复位', description: '技能结束后4秒内击杀返还60%基础冷却，每次施放限一次。', abilityId: null },
  as_dual: { classId: 'assault', group: 'survival', name: '双枪狂热', description: '主武器打空切副手准备时间-70%，副手伤害+35%持续3秒。', abilityId: null },
  tk_fortress: { classId: 'tank', group: 'mobility', name: '移动堡垒', description: '屏障减伤增加20个百分点至55%，取消技能移速惩罚。', abilityId: 'tk_barrier' },
  tk_siege: { classId: 'tank', group: 'mobility', name: '攻城盾牌', description: '定向盾预算+120，收盾后获得40临时护甲4秒。', abilityId: 'tk_shield' },
  tk_platform: { classId: 'tank', group: 'handling', name: '重火力平台', description: '持续射击0.8秒后射速+25%、后坐力-40%，停火0.5秒后消失。', abilityId: null },
  tk_steel: { classId: 'tank', group: 'handling', name: '钢铁躯壳', description: '最大生命+35；低于半血时换弹耗时-30%。', abilityId: null },
  tk_recycle: { classId: 'tank', group: 'survival', name: '以战养盾', description: '技能期间实际承受或挡下100敌伤，结束后返还50%基础冷却。', abilityId: null },
  tk_revenge: { classId: 'tank', group: 'survival', name: '报复火力', description: '每减免或挡下100敌伤蓄满反击；技能结束后4秒内前5发伤害最高+40%。', abilityId: null },
  sn_execute: { classId: 'sniper', group: 'mobility', name: '处决专注', description: '专注首发伤害+45%；爆头命中恢复首发奖励，每次技能限一次。', abilityId: 'sn_focus' },
  sn_hunt: { classId: 'sniper', group: 'mobility', name: '游猎转移', description: '转移加速提高20个百分点至40%，结束后3秒内首发伤害+35%。', abilityId: 'sn_relocate' },
  sn_mark: { classId: 'sniper', group: 'handling', name: '猎杀标记', description: '武器命中后标记4秒，自身后续武器伤害+25%；不提供穿墙视野。', abilityId: null },
  sn_pierce: { classId: 'sniper', group: 'handling', name: '穿甲重弹', description: '子弹绕过60%临时护甲，对部署物伤害+100%。', abilityId: null },
  sn_perfect: { classId: 'sniper', group: 'survival', name: '完美猎杀', description: '爆头击杀返还70%基础冷却，从备弹装入1发，冷却4秒。', abilityId: null },
  sn_escape: { classId: 'sniper', group: 'survival', name: '猎手脱身', description: '击杀获得30%移速与30临时护甲3秒，冷却6秒。', abilityId: null },
  md_emergency: { classId: 'medic', group: 'mobility', name: '强效急救', description: '脉冲治疗+25至50；有效治疗的溢出部分转为最多30护甲5秒。', abilityId: 'md_pulse' },
  md_transfusion: { classId: 'medic', group: 'mobility', name: '战地输血', description: '治疗链每跳队友治疗+4至9；有效连接期间双方减伤20%。', abilityId: 'md_link' },
  md_adrenaline: { classId: 'medic', group: 'handling', name: '肾上腺素', description: '有效治疗队友后双方射速+20%、移速+15%，持续4秒。', abilityId: null },
  md_armed: { classId: 'medic', group: 'handling', name: '武装医护', description: '每有效治疗队友40点获得25护甲5秒，当前弹匣接下来8发伤害+25%。', abilityId: null },
  md_cycle: { classId: 'medic', group: 'survival', name: '救援回路', description: '每有效治疗队友40点返还20%基础冷却，单次施放最多60%。', abilityId: null },
  md_together: { classId: 'medic', group: 'survival', name: '共同进攻', description: '治疗过的队友5秒内击杀，双方恢复20生命，每名医疗兵共享4秒冷却。', abilityId: null },

  pk_landing: { group: 'mobility', name: '落地稳枪', description: '落地后0.6秒散布减少15%。', duration: 18, spreadScale: .85 },
  pk_supplyrun: { group: 'mobility', name: '补给奔袭', description: '实际领取地图或医疗弹药补给后加速10%两秒，冷却12秒。', duration: 60, cooldown: 360, speed: 1.10 },
  pk_sidewalk: { group: 'mobility', name: '副手步法', description: '持副武器移动速度提高3%。', speed: 1.03 },
  pk_crouch: { group: 'mobility', name: '蹲行训练', description: '蹲行速度提高8%。', speed: 1.08 },
  pk_sidefeed: { group: 'handling', name: '预备副手', description: '切至副手从其备弹装入2发，冷却8秒；不与副手预备卡重复装填。', transfer: 2, cooldown: 240 },
  pk_emptyreload: { group: 'handling', name: '空仓管理', description: '空仓手动换弹耗时减少8%。', reloadScale: .92 },
  pk_firstshot: { group: 'handling', name: '首发控制', description: '停火1秒后的首发散布减少10%。', spreadScale: .90 },
  pk_quickswap: { group: 'handling', name: '快速切枪', description: '切枪准备时间减少10%，与突击被动取最强值。', prepareScale: .90 },
  pk_dressing: { group: 'survival', name: '战地包扎', description: '击杀时生命不足一半恢复5，冷却10秒。', heal: 5, threshold: .5, cooldown: 300 },
  pk_blast: { group: 'survival', name: '防爆装备', description: '受到爆炸伤害减少10%，个人减伤取最高。', reduction: .10 },
  pk_resilience: { group: 'survival', name: '防震护具', description: '受到减速的持续时间减少20%，不影响电子设施停机。', durationScale: .80 },
  pk_reloadguard: { group: 'survival', name: '谨慎换弹', description: '换弹期间减伤10%，手动换弹时间增加10%。', reduction: .10, reloadScale: 1.10 },
} as const;
export type GrowthPerkId = keyof typeof GROWTH_V3_PERKS;
export type PerkGroup = 'mobility' | 'handling' | 'survival';
export const GROWTH_V3_PERK_GROUPS = ['mobility','handling','survival'] as const;
export const DEFAULT_GROWTH_V3_PERKS: readonly GrowthPerkId[] = ['pk_landing','pk_sidefeed','pk_dressing'];
export function validateGrowthPerks(value: unknown): GrowthPerkId[] {
  if (!Array.isArray(value) || value.length !== 3) throw Error('Choose three perk groups');
  const result: GrowthPerkId[] = [];
  for (const group of GROWTH_V3_PERK_GROUPS) {
    const ids = value.filter(id => typeof id === 'string' && Object.hasOwn(GROWTH_V3_PERKS, id)
      && GROWTH_V3_PERKS[id as GrowthPerkId].group === group);
    if (ids.length !== 1) throw Error('Choose one perk per group');
    result.push(ids[0]);
  }
  return result;
}

export function legalGrowthPerks(classId: GrowthClassId, abilityId: GrowthAbilityId): GrowthPerkId[] {
  return (Object.keys(GROWTH_V3_PERKS) as GrowthPerkId[]).filter(id => {
    const perk = GROWTH_V3_PERKS[id];
    return 'classId' in perk && perk.classId === classId && (!perk.abilityId || perk.abilityId === abilityId);
  });
}
export function defaultClassPerks(classId: GrowthClassId, abilityId: GrowthAbilityId): GrowthPerkId[] {
  const legal = legalGrowthPerks(classId, abilityId);
  return GROWTH_V3_PERK_GROUPS.map(group => legal.find(id => GROWTH_V3_PERKS[id].group === group)!);
}
export function validateClassPerks(value: unknown, classId: GrowthClassId, abilityId: GrowthAbilityId) {
  const perks = validateGrowthPerks(value), legal = legalGrowthPerks(classId, abilityId);
  if (perks.some(id => !legal.includes(id))) throw Error('Invalid class perk');
  return perks;
}
