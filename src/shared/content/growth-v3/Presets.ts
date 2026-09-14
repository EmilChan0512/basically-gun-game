export const GROWTH_V3_PRESETS = {
  standard: { name: '15分钟标准', matchTicks:27000, ultimateTick:21600, experimental:false },
  short: { name: '10分钟实验', matchTicks:18000, ultimateTick:12600, experimental:true },
} as const;
export type GrowthPresetId = keyof typeof GROWTH_V3_PRESETS;
export function validateGrowthPreset(value: unknown): GrowthPresetId {
  if(value!=='standard'&&value!=='short')throw Error('Invalid growth preset');return value;
}
