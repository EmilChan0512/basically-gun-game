import {expect,it} from 'vitest';
import {GrowthArsenalV3} from '../../src/shared/simulation/growth-v3/WeaponRules';
import {defaultGrowthLoadoutV3} from '../../src/shared/content/growth-v3/Loadout';
const pose={moving:false,crouching:false,airborne:false,stationaryTicks:0};
const rows=[['burst_ar',3,10],['burst_pistol',2,12]] as const;
function fixture(id:typeof rows[number][0]){
  const loadout=defaultGrowthLoadoutV3();
  if(id==='burst_ar')loadout.primary=id;else loadout.secondary=id;
  const gun=new GrowthArsenalV3(loadout);let tick=0;
  if(id==='burst_pistol'){gun.swap(0);while(tick<6)gun.step(tick++,false,pose,()=>.5);}
  return {gun,start:tick,step:(held=false)=>gun.step(tick++,held,pose,()=>.5)};
}
for(const count of [1,2])it.each(rows)(`%s with ${count} rounds keeps its full post-burst delay`,(id,interval,gap)=>{
  const f=fixture(id);f.gun.current.ammo=count;const reserve=f.gun.current.reserve,shots:number[]=[];
  for(let elapsed=0;elapsed<=interval*(count-1);elapsed++){
    const shot=f.step(elapsed===0);if(shot)shots.push(shot.tick);
  }
  expect(shots).toEqual(Array.from({length:count},(_,i)=>f.start+i*interval));
  expect(f.gun.current.ammo).toBe(0);expect(f.gun.current.reserve).toBe(reserve);
  expect(f.gun.readyTick).toBe(shots.at(-1)!+gap);
  f.gun.transfer(3);
  for(let t=shots.at(-1)!+1;t<f.gun.readyTick;t++)expect(f.step(false)).toBeNull();
  expect(f.step(true)?.tick).toBe(shots.at(-1)!+gap);
});
for(const fired of [1,2])it.each(rows)(`%s interruption after ${fired} shots cancels queued rounds without refund or shortened delay`,(id,interval,gap)=>{
  const f=fixture(id),ammo=f.gun.current.ammo,reserve=f.gun.current.reserve;
  for(let elapsed=0;elapsed<=interval*(fired-1);elapsed++)f.step(elapsed===0);
  const last=f.start+interval*(fired-1);f.gun.interrupt();
  expect(f.gun.current.ammo).toBe(ammo-fired);expect(f.gun.current.reserve).toBe(reserve);
  expect(f.gun.readyTick).toBe(last+gap);
  const restored=GrowthArsenalV3.restore(f.gun.checkpoint());
  for(let t=last+1;t<last+gap;t++){
    expect(f.step(false)).toBeNull();expect(restored.step(t,false,pose,()=>.5)).toBeNull();
    expect(f.gun.checkpoint()).toEqual(restored.checkpoint());
  }
  expect(f.step(true)?.tick).toBe(last+gap);
});
it.each(rows)('%s holding the trigger produces only one complete group',(id,interval,gap)=>{
  const f=fixture(id),shots:number[]=[];
  for(let i=0;i<2*interval+gap*3;i++){const shot=f.step(true);if(shot)shots.push(shot.tick);}
  expect(shots).toEqual([f.start,f.start+interval,f.start+2*interval]);
});
