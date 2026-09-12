export const GROWTH_ATTACHMENTS = {
  none: { name: '标准配置', xp: 0, description: '原始性能，无配件取舍。' },
  heavy: { name: '重枪管', xp: 200, description: '散布减少25%、射程增加15%；移动减速5%、换弹慢15%。' },
  short: { name: '短枪管', xp: 600, description: '移动加速5%；射程减少20%、散布增加15%。' },
  quickmag: { name: '快拆弹匣', xp: 1000, description: '换弹快25%；弹匣容量减少20%，至少保留1发。' },
} as const;
export type GrowthAttachment = keyof typeof GROWTH_ATTACHMENTS;
export const GROWTH_ACHIEVEMENTS = {
  notToday: { name: 'Not Today · 命悬一线', description: '生命不足10%时完成一次击杀。' },
  oneMagazine: { name: 'One Magazine Army · 一匣之军', description: '同一把枪不换弹完成4次击杀。' },
  closeCall: { name: 'Close Call · 绝地副手', description: '主武器弹匣为空时使用手枪完成击杀。' },
  ghost: { name: 'Ghost · 无声猎手', description: '单条生命中连续5次爆头击杀。' },
} as const;
export type GrowthAchievement = keyof typeof GROWTH_ACHIEVEMENTS;
export const GROWTH_TRAITS = {
  runner: { name: 'Runner · 奔袭者', description: '累计10次移动击杀；提前解锁突击兵「机动储备」。' },
  survivor: { name: 'Survivor · 生还者', description: '累计5次低于25%生命击杀；提前解锁重装兵「据守装甲」。' },
  marksman: { name: 'Marksman · 精准射手', description: '累计10次爆头击杀；提前解锁狙击手「猎手恢复」。' },
} as const;
export type GrowthTrait = keyof typeof GROWTH_TRAITS;
export const freshGrowthMetrics = () => ({ healingDone: 0, healingXp: 0, shots: 0, hits: 0, headshots: 0, movingTicks: 0, movingKills: 0,
  lowHealthKills: 0, criticalHealthKills: 0, sidearmKills: 0, headshotKills: 0, bestHeadshotStreak: 0,
  bestKillStreak: 0, bestMagazineKills: 0, tacticalReloads: 0, emptyReloads: 0, switches: 0, hitDistance: 0 });
export type GrowthMetrics = ReturnType<typeof freshGrowthMetrics>;
export const freshWeaponMetrics = () => ({ shots: 0, hits: 0, kills: 0, magazineKills: 0 });
export type GrowthWeaponMetrics = ReturnType<typeof freshWeaponMetrics>;
export function earnedGrowthAchievements(metrics: GrowthMetrics): GrowthAchievement[] {
  return [metrics.criticalHealthKills >= 1 ? 'notToday' : null, metrics.bestMagazineKills >= 4 ? 'oneMagazine' : null,
    metrics.sidearmKills >= 1 ? 'closeCall' : null, metrics.bestHeadshotStreak >= 5 ? 'ghost' : null].filter(Boolean) as GrowthAchievement[];
}
export function earnedGrowthTraits(metrics: GrowthMetrics): GrowthTrait[] {
  return [metrics.movingKills >= 10 ? 'runner' : null, metrics.lowHealthKills >= 5 ? 'survivor' : null,
    metrics.headshotKills >= 10 ? 'marksman' : null].filter(Boolean) as GrowthTrait[];
}
