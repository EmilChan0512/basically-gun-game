import { M4, USP } from '../../game/combat/Combat';
/** Independent PvP rules. Never derive combat power from account/campaign levels. */
export const GROWTH_WEAPONS = { m4: { ...M4 }, usp: { ...USP } };
export const GROWTH_RULES = {
  version: 1, id: 'growth' as const, seconds: 900, ultimateTick: 720 * 30,
  xpThresholds: [0, 200, 450, 800, 1200], killXp: 100, assistXp: 60,
  health: 100, aim: .7, ammo: .9, rollTicks: 12, rollCooldown: 240,
};
export const GROWTH_UPGRADES = {
  momentum: { name: 'Momentum · 乘胜追击', tag: 'Mobility', description: '击杀后移动速度提高20%，持续3秒；再次击杀刷新，不叠加。' },
  tacticalReload: { name: 'Tactical Reload · 战术换弹', tag: 'Weapon', description: '非空仓手动换弹耗时减少20%；空仓不生效。' },
  scavenger: { name: 'Scavenger · 拾荒者', tag: 'Utility', description: '经过敌人尸体80像素内，补充当前枪半个弹匣的备弹；每具尸体每人一次。' },
  grenadePouch: { name: 'Grenade Pouch · 手雷袋', tag: 'Utility', description: '立即获得一枚手雷；死亡不补充。' },
  controlledBurst: { name: 'Controlled Burst · 稳定射击', tag: 'Weapon', description: '蹲伏且静止时，射击散布减少35%。' },
  quickHands: { name: 'Quick Hands · 移动换弹', tag: 'Weapon', description: '移动期间每3帧额外推进1帧换弹；鼓励边移动边补弹。' },
  lastStand: { name: 'Last Stand · 背水一战', tag: 'Defense', description: '生命低于25%时射击散布减少40%；恢复生命后失效。' },
  slideReload: { name: 'Slide Reload · 翻滚装填', tag: 'Ability', description: '发动战斗翻滚时，从备弹向当前弹匣装填最多3发；不生成弹药。' },
} as const;
export type GrowthUpgradeId = keyof typeof GROWTH_UPGRADES;
export const ASSAULT_POOL = Object.keys(GROWTH_UPGRADES) as GrowthUpgradeId[];
export const GROWTH_ULTIMATE = { name: 'Berserker · 狂战士', description: '第12分钟开放：击杀恢复15生命，移动速度提高20%持续3秒；触发冷却5秒，与乘胜追击取最大值。' };
