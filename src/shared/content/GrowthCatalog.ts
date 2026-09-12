import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, type GrowthAttachment, type GrowthAchievement } from './GrowthRecords';
import { M4, USP, type WeaponConfig } from '../../game/combat/Combat';
/** Independent PvP rules. Never derive combat power from account/campaign levels. */
export const GROWTH_WEAPONS = {
  m4: { ...M4 }, usp: { ...USP },
  famas: { ...M4, id: 'famas', damage: 8, magazineSize: 24, shootDelayFrames: 3, reloadFrames: 55, recoil: 5, rangeUnits: 65 },
  mp5: { ...M4, id: 'mp5', damage: 8, rangeUnits: 48, recoil: 5, shootDelayFrames: 3, xOff: 6, yOff: 0 },
  shotgun: { ...M4, id: 'shotgun', damage: 10, magazineSize: 5, rangeUnits: 34, recoil: 8, automatic: false, shootDelayFrames: 18, reloadFrames: 42, yOff: 0 },
  scout: { ...M4, id: 'scout', damage: 52, magazineSize: 4, rangeUnits: 180, recoil: 1, automatic: false, shootDelayFrames: 25, reloadFrames: 48, xOff: 15 },
  saw: { ...M4, id: 'saw', damage: 9, magazineSize: 50, rangeUnits: 56, recoil: 6, shootDelayFrames: 4, reloadFrames: 65, yOff: 10 },
} satisfies Record<string, WeaponConfig>;
export type GrowthWeaponId = keyof typeof GROWTH_WEAPONS;
export type GrowthClassId = 'assault' | 'tank' | 'sniper' | 'medic';
export interface GrowthLoadout { classId: GrowthClassId; primary: GrowthWeaponId; perks?: GrowthPerkId[]; pool?: GrowthUpgradeId[]; attachment?: GrowthAttachment; title?: GrowthAchievement | 'none'; evolutions?: boolean }
export const GROWTH_CLASSES = {
  medic: { name: 'Medic', art: 'medic', health: 95, speed: 1, aim: .7, primary: 'famas', weapons: ['famas', 'mp5', 'shotgun'], ability: '急救脉冲', duration: 60, cooldown: 420, description: 'E：治疗180像素内可见队友与自己25生命；治疗后2秒移动减速10%，冷却14秒。满血不消耗技能。' },
  assault: { name: 'Assault', art: 'commando', health: 100, speed: 1, aim: .7, primary: 'm4', weapons: ['m4', 'mp5', 'shotgun'], ability: '战斗翻滚', duration: 12, cooldown: 240, description: 'E：0.4秒加速50%，期间不能开火；冷却8秒。' },
  tank: { name: 'Tank', art: 'tank', health: 115, speed: .9, aim: .7, primary: 'saw', weapons: ['saw', 'shotgun', 'mp5'], ability: '装甲屏障', duration: 90, cooldown: 360, description: 'E：3秒减伤35%，期间移动减速25%；冷却12秒。' },
  sniper: { name: 'Sniper', art: 'assassin', health: 90, speed: 1, aim: .8, primary: 'scout', weapons: ['scout', 'mp5', 'm4'], ability: '精准专注', duration: 90, cooldown: 360, description: 'E：3秒散布减少65%，期间移动减速20%；冷却12秒。' },
} as const;
export function defaultGrowthLoadout(classId: GrowthClassId = 'assault'): GrowthLoadout { return { classId, primary: GROWTH_CLASSES[classId].primary, perks: [...STARTER_GROWTH_PERKS], pool: [...GROWTH_POOLS[classId]], attachment: 'none', title: 'none', evolutions: false };  }
export function validateGrowthLoadout(value: unknown): GrowthLoadout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('无效成长配装');
  const v = value as GrowthLoadout;
  if (!Object.hasOwn(GROWTH_CLASSES, v.classId) || !(GROWTH_CLASSES[v.classId].weapons as readonly string[]).includes(v.primary)) throw Error('成长职业与武器不匹配');
  const perks = v.perks ?? STARTER_GROWTH_PERKS, pool = v.pool ?? GROWTH_POOLS[v.classId];
  if (!Array.isArray(perks) || perks.length !== 3 || new Set(perks).size !== 3 || perks.some(id => !Object.hasOwn(GROWTH_PERKS, id))) throw Error('请选择三个不同Perk');
  const allowed = [...GROWTH_POOLS[v.classId], ...GROWTH_ALTERNATIVES[v.classId]];
  if (!Array.isArray(pool) || pool.length !== 8 || new Set(pool).size !== 8 || pool.some(id => !allowed.includes(id))) throw Error('请选择本职业八个不同升级');
  const attachment = v.attachment ?? 'none', title = v.title ?? 'none';
  if (!Object.hasOwn(GROWTH_ATTACHMENTS, attachment) || title !== 'none' && !Object.hasOwn(GROWTH_ACHIEVEMENTS, title) || v.evolutions !== undefined && typeof v.evolutions !== 'boolean') throw Error('无效成长配件或外观');
  return { attachment, title, evolutions: v.evolutions ?? false, classId: v.classId, primary: v.primary, perks: [...perks], pool: [...pool] };
}
export const GROWTH_RULES = {
  version: 2, id: 'growth' as const, seconds: 900, ultimateTick: 720 * 30,
  xpThresholds: [0, 200, 450, 800, 1200], killXp: 100, assistXp: 60,
  health: 100, aim: .7, ammo: .9, rollTicks: 12, rollCooldown: 240,
};
export const GROWTH_UPGRADES = {
  triage: { name: 'Triage · 紧急分诊', tag: 'Ability', description: '急救对低于30%生命目标额外恢复10生命；不超过最大生命。' },
  widePulse: { name: 'Wide Pulse · 广域救援', tag: 'Ability', description: '急救半径扩大到260像素，但每人治疗量减少5；仍需要视线。' },
  rapidAid: { name: 'Rapid Aid · 快速急救', tag: 'Ability', description: '急救冷却缩短20%，每人治疗量减少5。' },
  rescueSprint: { name: 'Rescue Sprint · 救援奔袭', tag: 'Mobility', description: '急救实际治疗队友后，自身加速20%持续3秒；死亡清除。' },
  sharedSupplies: { name: 'Shared Supplies · 救援弹药', tag: 'Utility', description: '急救实际治疗队友时，为其当前枪补充4发备弹，不超过容量。' },
  clinicalGrip: { name: 'Clinical Grip · 稳健持枪', tag: 'Weapon', description: '急救技能持续期间，自身射击散布减少30%。' },
  aidReload: { name: 'Aid Reload · 救援整备', tag: 'Weapon', description: '急救技能持续期间，手动换弹耗时减少25%。' },
  selfCare: { name: 'Self Care · 随队自保', tag: 'Defense', description: '急救对自己额外恢复8生命；自疗不产生治疗经验。' },
  mobileClinic: { name: 'Mobile Clinic · 流动诊疗', tag: 'Ability', description: '急救后不再减速，但技能冷却增加10%。' },
  protectiveAid: { name: 'Protective Aid · 护送急救', tag: 'Defense', description: '实际治疗队友时为其提供10点临时护甲，持续2秒；取最大值，不累加。' },
  momentum: { name: 'Momentum · 乘胜追击', tag: 'Mobility', description: '击杀后移动速度提高20%，持续3秒；再次击杀刷新，不叠加。' },
  tacticalReload: { name: 'Tactical Reload · 战术换弹', tag: 'Weapon', description: '非空仓手动换弹耗时减少20%；空仓不生效。' },
  scavenger: { name: 'Scavenger · 拾荒者', tag: 'Utility', description: '经过敌人尸体80像素内，补充当前枪半个弹匣的备弹；每具尸体每人一次。' },
  grenadePouch: { name: 'Grenade Pouch · 手雷袋', tag: 'Utility', description: '立即获得一枚手雷；死亡不补充。' },
  controlledBurst: { name: 'Controlled Burst · 稳定射击', tag: 'Weapon', description: '蹲伏且静止时，射击散布减少35%。' },
  quickHands: { name: 'Quick Hands · 移动换弹', tag: 'Weapon', description: '移动期间每3帧额外推进1帧换弹；鼓励边移动边补弹。' },
  lastStand: { name: 'Last Stand · 背水一战', tag: 'Defense', description: '生命低于25%时射击散布减少40%；恢复生命后失效。' },
  slideReload: { name: 'Slide Reload · 翻滚装填', tag: 'Ability', description: '发动战斗翻滚时，从备弹向当前弹匣装填最多3发；不生成弹药。' },
  momentumII: { name: 'Momentum II · 强化追击', tag: 'Mobility', description: '需要乘胜追击；击杀后加速提高至25%，仍持续3秒，不另行叠加。' },
  killingSpree: { name: 'Killing Spree · 连杀奔袭', tag: 'Mobility', description: '需要强化追击及当局连杀2人；击杀加速按连杀增长，最高35%；死亡清除连杀。' },
  combatRecovery: { name: 'Combat Recovery · 战术喘息', tag: 'Ability', description: '翻滚发动时恢复6生命，鼓励受伤后转移。' },
  rollingReserve: { name: 'Rolling Reserve · 机动储备', tag: 'Utility', description: '翻滚发动时补充当前枪6发备弹，不超过上限。' },
  coolant: { name: 'Coolant · 装甲冷却', tag: 'Ability', description: '屏障期间受到有效攻击，技能冷却减少1秒，每秒最多一次。' },
  anchorArmor: { name: 'Anchor Armor · 据守装甲', tag: 'Defense', description: '静止2秒获得10护甲，持续3秒，冷却15秒。' },
  hunterRecovery: { name: 'Hunter Recovery · 猎手恢复', tag: 'Defense', description: '爆头造成实际伤害恢复5生命，冷却3秒。' },
  focusReserve: { name: 'Focus Reserve · 专注储备', tag: 'Utility', description: '发动专注获得2发当前枪备弹，不超过上限。' },
  brace: { name: 'Brace · 稳固支撑', tag: 'Defense', description: '蹲伏静止时，受到的非环境伤害减少15%。' },
  blastPadding: { name: 'Blast Padding · 防爆衬垫', tag: 'Defense', description: '脚踏地面时，爆炸伤害减少30%。' },
  mobileCover: { name: 'Mobile Cover · 移动掩护', tag: 'Ability', description: '装甲屏障期间移动只减速5%，适合带盾推进。' },
  emergencyPlate: { name: 'Emergency Plate · 应急装甲', tag: 'Defense', description: '低于25%生命受击时获得15点临时护甲，持续3秒；冷却20秒。' },
  fieldRepair: { name: 'Field Repair · 阵地修复', tag: 'Utility', description: '6秒未受伤且静止时，每秒额外恢复3生命。' },
  guardReload: { name: 'Guard Reload · 掩护换弹', tag: 'Weapon', description: '蹲伏开始手动换弹时耗时减少20%。' },
  suppressiveGrip: { name: 'Suppressive Grip · 压制握持', tag: 'Weapon', description: '站定射击时，散布减少35%。' },
  reserveDrill: { name: 'Reserve Drill · 战地回收', tag: 'Utility', description: '击杀补充当前枪10发备弹，不超过携弹上限。' },
  steadyAim: { name: 'Steady Aim · 稳定瞄准', tag: 'Weapon', description: '静止至少1秒后，散布减少40%；移动解除。' },
  relocate: { name: 'Relocate · 转移阵地', tag: 'Mobility', description: '击杀后加速20%持续3秒；死亡清除。' },
  firstShot: { name: 'First Shot · 首发精准', tag: 'Weapon', description: '满弹匣的第一枪散布减少50%，鼓励保留开火时机。' },
  quickScope: { name: 'Quick Scope · 快速专注', tag: 'Ability', description: '专注冷却缩短20%，持续时间也缩短为2秒。' },
  sidearmReady: { name: 'Sidearm Ready · 副手应战', tag: 'Weapon', description: '移动中使用手枪时散布减少35%。' },
  precisionCycle: { name: 'Precision Cycle · 精准循环', tag: 'Ability', description: '爆头造成实际伤害后缩短技能冷却2秒，每秒最多一次。' },
  evasiveReload: { name: 'Evasive Reload · 机动换弹', tag: 'Mobility', description: '换弹期间移动速度提高15%；换弹结束解除。' },
  measuredReload: { name: 'Measured Reload · 计划换弹', tag: 'Weapon', description: '弹匣非空且不足一半时，手动换弹耗时减少25%。' },
} as const;
export type GrowthUpgradeId = keyof typeof GROWTH_UPGRADES;
export const ASSAULT_POOL: GrowthUpgradeId[] = ['momentum', 'tacticalReload', 'scavenger', 'grenadePouch', 'controlledBurst', 'quickHands', 'lastStand', 'slideReload'];
export const GROWTH_POOLS: Record<GrowthClassId, GrowthUpgradeId[]> = {
  medic: ['triage', 'widePulse', 'rapidAid', 'rescueSprint', 'sharedSupplies', 'clinicalGrip', 'aidReload', 'selfCare'],
  assault: ASSAULT_POOL,
  tank: ['brace', 'blastPadding', 'mobileCover', 'emergencyPlate', 'fieldRepair', 'guardReload', 'suppressiveGrip', 'reserveDrill'],
  sniper: ['steadyAim', 'relocate', 'firstShot', 'quickScope', 'sidearmReady', 'precisionCycle', 'evasiveReload', 'measuredReload'],
};
export const GROWTH_ULTIMATE = { name: 'Berserker · 狂战士', description: '第12分钟开放：击杀恢复15生命，移动速度提高20%持续3秒；触发冷却5秒，与乘胜追击取最大值。' };

export const GROWTH_ULTIMATES = {
  medic: { name: 'Lifeline · 生命支援', description: '第12分钟开放：实际治疗队友时为其提供15点护甲，持续3秒；每个目标冷却20秒，与护送急救取最大值。' },
  assault: GROWTH_ULTIMATE,
  tank: { name: 'Juggernaut · 不屈重装', description: '低于30%生命受击时获得25护甲，持续5秒，冷却20秒；与应急装甲取最大值。' },
  sniper: { name: 'Ghost · 幽灵', description: '爆头击杀后从敌方雷达隐藏3秒，冷却8秒；射击解除，仍可在场景中看到并击中。' },
};

export const GROWTH_ALTERNATIVES: Record<GrowthClassId, GrowthUpgradeId[]> = {
  medic: ['mobileClinic', 'protectiveAid'],
  assault: ['combatRecovery', 'rollingReserve'], tank: ['coolant', 'anchorArmor'], sniper: ['hunterRecovery', 'focusReserve'],
};
export const GROWTH_PERKS = {
  fieldDressing: { name: '战地包扎', description: '击杀时若生命不足一半，恢复5生命；冷却10秒。', level: 1 },
  preparedSidearm: { name: '预备副手', description: '切至手枪时从备弹装入最多2发，冷却5秒。', level: 1 },
  steadyLanding: { name: '落地稳枪', description: '落地后1秒内散布减少20%。', level: 1 },
  resourceful: { name: '补给整备', description: '补给箱实际补弹时缩短技能冷却1秒。', level: 3 },
  cautiousReload: { name: '谨慎换弹', description: '换弹期间减伤10%，但手动换弹时间增加10%。', level: 5 },
  supplyRunner: { name: '补给奔袭', description: '补给箱实际补弹后加速20%持续2秒；死亡清除。', level: 7 },
} as const;
export type GrowthPerkId = keyof typeof GROWTH_PERKS;
export const STARTER_GROWTH_PERKS: GrowthPerkId[] = ['fieldDressing', 'preparedSidearm', 'steadyLanding'];

export function growthWeaponConfigs(loadout: GrowthLoadout) {
  const configs = structuredClone(GROWTH_WEAPONS), gun = configs[loadout.primary];
  if (loadout.attachment === 'heavy') { gun.recoil *= .75; gun.rangeUnits *= 1.15; gun.reloadFrames = Math.ceil(gun.reloadFrames * 1.15); }
  if (loadout.attachment === 'short') { gun.recoil *= 1.15; gun.rangeUnits *= .8; }
  if (loadout.attachment === 'quickmag') { gun.magazineSize = Math.max(1, Math.floor(gun.magazineSize * .8)); gun.reloadFrames = Math.ceil(gun.reloadFrames * .75); }
  return configs;
}
