import { defaultGrowthLoadoutV3 as current } from '../../src/shared/content/growth-v3/Loadout';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { DEFAULT_GROWTH_V3_PERKS } from '../../src/shared/content/growth-v3/Perks';
/** Archived builds isolate the established card/ability numeric regressions from new class bonuses.
 * Public save validation rejects these; class-perks integration tests exercise current defaults. */
export function defaultGrowthLoadoutV3(classId: GrowthClassId = 'assault') {
  return { ...current(classId), perks: [...DEFAULT_GROWTH_V3_PERKS] };
}
