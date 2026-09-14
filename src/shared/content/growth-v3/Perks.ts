export const GROWTH_V3_PERKS = {
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
