import type { GrowthClassId } from './Core';
import type { GrowthWeaponId } from './Weapons';

export const GROWTH_V3_ABILITIES = {
  as_roll: { classId: 'assault', name: '战斗翻滚', cast: 0, duration: 12, cooldown: 240, recovery: 0, speed: 1.5, reduction: 0, spread: 1, transfer: 0, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 0, noiseScale: 1, fireLock: 12, gadgetLock: 12, swapLock: true, reloadLock: false, cancellable: false },
  as_reloadrush: { classId: 'assault', name: '突进装填', cast: 3, duration: 18, cooldown: 330, recovery: 0, speed: 1.25, reduction: 0, spread: 1, transfer: 4, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 0, noiseScale: 1, fireLock: 18, gadgetLock: 18, swapLock: true, reloadLock: false, cancellable: false },
  tk_barrier: { classId: 'tank', name: '装甲屏障', cast: 3, duration: 90, cooldown: 360, recovery: 0, speed: .75, reduction: .35, spread: 1, transfer: 0, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 0, noiseScale: 1, fireLock: 0, gadgetLock: 0, swapLock: false, reloadLock: false, cancellable: true },
  tk_shield: { classId: 'tank', name: '定向战术盾', cast: 6, duration: 90, cooldown: 420, recovery: 6, speed: .85, reduction: .65, spread: 1, transfer: 0, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 120, noiseScale: 1, fireLock: 90, gadgetLock: 90, swapLock: true, reloadLock: true, cancellable: true },
  sn_focus: { classId: 'sniper', name: '精准专注', cast: 3, duration: 90, cooldown: 360, recovery: 0, speed: .80, reduction: 0, spread: .35, transfer: 0, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 0, noiseScale: 1, fireLock: 0, gadgetLock: 0, swapLock: false, reloadLock: false, cancellable: true },
  sn_relocate: { classId: 'sniper', name: '战术转移', cast: 0, duration: 45, cooldown: 360, recovery: 0, speed: 1.20, reduction: 0, spread: 1, transfer: 0, radius: 0, heal: 0, selfHeal: 0, pulseInterval: 0, shieldBudget: 0, noiseScale: .5, fireLock: 15, gadgetLock: 15, swapLock: false, reloadLock: false, cancellable: true },
  md_pulse: { classId: 'medic', name: '急救脉冲', cast: 3, duration: 60, cooldown: 420, recovery: 0, speed: .90, reduction: 0, spread: 1, transfer: 0, radius: 180, heal: 25, selfHeal: 25, pulseInterval: 0, shieldBudget: 0, noiseScale: 1, fireLock: 0, gadgetLock: 0, swapLock: false, reloadLock: false, cancellable: true },
  md_link: { classId: 'medic', name: '持续治疗链', cast: 6, duration: 90, cooldown: 420, recovery: 6, speed: .80, reduction: 0, spread: 1, transfer: 0, radius: 240, heal: 5, selfHeal: 3, pulseInterval: 15, shieldBudget: 0, noiseScale: 1, fireLock: 90, gadgetLock: 90, swapLock: true, reloadLock: true, cancellable: true },
} as const;
export type GrowthAbilityId = keyof typeof GROWTH_V3_ABILITIES;
export const GROWTH_V3_OPERATORS = {
  assault: { name: '突击兵', art: 'commando', health: 100, speed: 1, primary: 'm4', abilities: ['as_roll','as_reloadrush'], gadgets: ['as_frag','as_concussion','as_charge'], passive: 'as_sidearm', ultimate: 'as_berserker' },
  tank: { name: '重装兵', art: 'tank', health: 115, speed: .9, primary: 'saw', abilities: ['tk_barrier','tk_shield'], gadgets: ['tk_cover','tk_interceptor','tk_plate'], passive: 'tk_brace', ultimate: 'tk_juggernaut' },
  sniper: { name: '狙击手', art: 'assassin', health: 90, speed: 1, primary: 'scout', abilities: ['sn_focus','sn_relocate'], gadgets: ['sn_beacon','sn_emp','sn_decoy'], passive: 'sn_control', ultimate: 'sn_ghost' },
  medic: { name: '医疗兵', art: 'medic', health: 95, speed: 1, primary: 'famas', abilities: ['md_pulse','md_link'], gadgets: ['md_smoke','md_station','md_ammo'], passive: 'md_selfcare', ultimate: 'md_lifeline' },
} as const satisfies Record<GrowthClassId, { name: string; art: string; health: number; speed: number; primary: GrowthWeaponId;
  abilities: readonly GrowthAbilityId[]; gadgets: readonly string[]; passive: string; ultimate: string }>;

export const GROWTH_V3_PASSIVES = {
  as_sidearm: { name: '副手训练', description: '切到副武器准备时间减少15%。', prepareScale: .85 },
  tk_brace: { name: '稳固姿态', description: '蹲伏静止0.8秒后，受击视觉上跳减少20%，不减少伤害。', stationaryTicks: 24, hitKickScale: .8 },
  sn_control: { name: '精准控制', description: '静止1秒后首发散布减少15%，射击后需要重新稳定。', stationaryTicks: 30, spreadScale: .85 },
  md_selfcare: { name: '自我护理', description: '6秒未受敌方生命伤害后，每秒恢复2生命，最多至半血。', delay: 180, interval: 30, heal: 2, healthCapScale: .5 },
} as const;
export const GROWTH_V3_ULTIMATES = {
  as_berserker: { name: '狂战士', description: '击杀恢复15生命、加速20%持续3秒，冷却5秒。', heal: 15, speed: 1.2, duration: 90, cooldown: 150 },
  tk_juggernaut: { name: '不屈重装', description: '生命低于30%受敌伤时先获得25护甲5秒，冷却20秒。', threshold: .3, armor: 25, duration: 150, cooldown: 600 },
  sn_ghost: { name: '幽灵', description: '爆头击杀后从普通开火雷达隐藏3秒，射击解除；冷却8秒。', duration: 90, cooldown: 240 },
  md_lifeline: { name: '生命支援', description: '实际治疗队友后给15护甲3秒，每目标共享20秒冷却。', armor: 15, duration: 90, cooldown: 600 },
} as const;
export function isAbilityId(value: unknown): value is GrowthAbilityId {
  return typeof value === 'string' && Object.hasOwn(GROWTH_V3_ABILITIES, value);
}
