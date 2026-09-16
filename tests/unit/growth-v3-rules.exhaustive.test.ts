import { expect, it } from 'vitest';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId } from '../../src/shared/content/growth-v3/Weapons';
import { GROWTH_V3_ATTACHMENTS, resolveGrowthWeapon, type GrowthAttachmentId } from '../../src/shared/content/growth-v3/Attachments';

// Enumerate the same complete build space once, then give each weapon an independent test.
const legalWeaponBuilds = (Object.keys(GROWTH_V3_WEAPONS) as GrowthWeaponId[]).map(id => {
  const base=GROWTH_V3_WEAPONS[id], parts=(Object.keys(GROWTH_V3_ATTACHMENTS) as GrowthAttachmentId[]).filter(key=>GROWTH_V3_ATTACHMENTS[key].weapons.includes(id));
  const maximum=base.family==='SIDE'?1:3;
  const builds: GrowthAttachmentId[][] = [];
  const visit=(chosen:GrowthAttachmentId[], start:number) => {
    builds.push(chosen);
    if(chosen.length===maximum)return;
    for(let i=start;i<parts.length;i++) if(!chosen.some(key=>GROWTH_V3_ATTACHMENTS[key].slot===GROWTH_V3_ATTACHMENTS[parts[i]].slot)) visit([...chosen,parts[i]],i+1);
  };
  visit([],0);
  return { id, builds };
});

it('covers more than 10000 legal builds across all 18 weapons', () => {
  expect(legalWeaponBuilds).toHaveLength(18);
  expect(legalWeaponBuilds.reduce((total, weapon) => total + weapon.builds.length, 0)).toBeGreaterThan(10000);
});

it.each(legalWeaponBuilds)('exhaustively preserves damage/fire rate/ammo bounds for $id legal builds', ({ id, builds }) => {
  const base=GROWTH_V3_WEAPONS[id];
  for(const chosen of builds) {
    const resolved=resolveGrowthWeapon(id,chosen);
    expect(resolved.damage).toBe(base.damage); expect(resolved.interval).toBe(base.interval); expect(resolved.headMultiplier).toBe(base.headMultiplier);
    expect(resolved.totalAmmo).toBeLessThanOrEqual(base.totalAmmo); expect(resolved.magazine).toBeLessThanOrEqual(resolved.totalAmmo);
    expect(resolved.speedScale).toBeGreaterThanOrEqual(.9*(id==='heavy_sniper'?.85:1)); expect(resolved.speedScale).toBeLessThanOrEqual(1.06*(id==='heavy_sniper'?.85:1));
    expect(resolved.falloffStart).toBeLessThan(resolved.falloffEnd); expect(resolved.falloffEnd).toBeLessThan(resolved.maxRange);
  }
});
