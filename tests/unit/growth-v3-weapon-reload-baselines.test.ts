import {expect,it} from 'vitest';
import {GrowthArsenalV3} from '../../src/shared/simulation/growth-v3/WeaponRules';
import {defaultGrowthLoadoutV3} from '../../src/shared/content/growth-v3/Loadout';
import type {GrowthWeaponId} from '../../src/shared/content/growth-v3/Weapons';
import type {GrowthClassId} from '../../src/shared/content/growth-v3/Core';

// Development specification §5: ID, permitted class, magazine, total, loaded/empty ticks.
const rows:[GrowthWeaponId,GrowthClassId,number,number,number,number][]=[
  ['m4','assault',30,120,34,42],['famas','assault',24,120,45,55],['burst_ar','assault',27,108,42,51],
  ['mp5','assault',30,150,32,40],['vector','assault',24,144,38,48],['ump','assault',24,120,36,45],
  ['shotgun','tank',5,30,48,60],['auto_sg','tank',8,40,54,66],['slug_sg','tank',6,30,45,57],
  ['scout','sniper',4,24,48,60],['dmr','sniper',12,60,45,57],['heavy_sniper','sniper',3,18,66,81],
  ['saw','tank',50,200,65,78],['heavy_lmg','tank',60,180,90,108],['compact_lmg','tank',40,160,60,72],
  ['usp','assault',12,60,28,36],['revolver','assault',6,30,48,60],['burst_pistol','assault',15,75,36,45],
];
const pose={moving:false,crouching:false,airborne:false,stationaryTicks:0};
for(const empty of [false,true])it.each(rows)(`%s ${empty?'empty':'loaded'} reload freezes its deadline and transfers only on completion`,(id,cls,magazine,total,loadedTicks,emptyTicks)=>{
  const loadout=defaultGrowthLoadoutV3(cls),side=['usp','revolver','burst_pistol'].includes(id);
  if(id==='usp'||id==='revolver'||id==='burst_pistol')loadout.secondary=id;else loadout.primary=id;
  const gun=new GrowthArsenalV3(loadout);let tick=0;
  if(side){gun.swap(0);while(tick<=gun.readyTick)gun.step(tick++,false,pose,()=>.5);}
  expect(gun.current.ammo).toBe(magazine);expect(gun.current.reserve).toBe(total-magazine);
  gun.current.ammo=empty?0:1;const before=gun.current.ammo,reserve=gun.current.reserve,start=tick;
  const duration=empty?emptyTicks:loadedTicks;
  expect(gun.reload(start)).toBe(true);expect(gun.current.reloadUntil).toBe(start+duration);
  const restored=GrowthArsenalV3.restore(gun.checkpoint());
  while(tick<start+duration){
    expect(gun.reload(tick,[.5],[2])).toBe(false);
    gun.step(tick,false,pose,()=>.5);restored.step(tick++,false,pose,()=>.5);
    expect(gun.current.ammo).toBe(before);expect(gun.current.reserve).toBe(reserve);
    expect(gun.current.reloadUntil).toBe(start+duration);expect(gun.checkpoint()).toEqual(restored.checkpoint());
  }
  gun.step(tick,false,pose,()=>.5);restored.step(tick,false,pose,()=>.5);
  expect(gun.current.ammo).toBe(magazine);expect(gun.current.reserve).toBe(reserve-(magazine-before));
  expect(gun.current.reloadUntil).toBe(0);expect(gun.checkpoint()).toEqual(restored.checkpoint());
});
