import { expect,it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_WEAPONS,GROWTH_V3_PRIMARY_POOLS,GROWTH_V3_SIDEARMS,type GrowthWeaponId } from '../../src/shared/content/growth-v3/Weapons';
import { GROWTH_CLASS_IDS } from '../../src/shared/content/growth-v3/Core';

it('uses real M4 shot timing and keeps the source build and account-independent target disposable',()=>{
  const build=defaultGrowthLoadoutV3(),before=structuredClone(build),range=new GrowthRangeSession(build,{distance:180,health:100,armor:0});
  for(let i=0;i<90&&range.killTick===null;i++)range.step({fire:true});
  expect(range.shots).toBe(10);expect(range.damage).toBe(100);expect(range.ttk).toBe(1.2);
  expect(range.battle.player.itemCharges).toBe(2);expect(build).toEqual(before);
  const fresh=new GrowthRangeSession(build,{distance:180,health:115,armor:25});
  expect(fresh.battle.actors[1].life.health).toBe(115);expect(fresh.battle.growthV3!.participant('enemy-0').armor.remaining).toBe(25000);
  expect(fresh.shots).toBe(0);
});
it.each(Object.keys(GROWTH_V3_WEAPONS) as GrowthWeaponId[])('fires the real %s in the full-content range',id=>{
  const secondary=(GROWTH_V3_SIDEARMS as readonly string[]).includes(id);
  const classId=secondary?'assault':GROWTH_CLASS_IDS.find(c=>GROWTH_V3_PRIMARY_POOLS[c].includes(id))!;
  const build=defaultGrowthLoadoutV3(classId);
  if(secondary)build.secondary=id as typeof build.secondary;else build.primary=id;
  const range=new GrowthRangeSession(build,{distance:90,health:115,armor:0},secondary?'secondary':'primary');
  let held=false;
  for(let i=0;i<900&&range.killTick===null;i++) {
    const gun=range.battle.growthV3!.weapons.get('player')!;
    const fire: boolean=GROWTH_V3_WEAPONS[id].mode==='auto'||!held&&gun.readyTick<=range.battle.frame+1;
    range.step({fire});held=fire;
    if(!gun.current.ammo&&!gun.current.reloadUntil)range.battle.reload();
  }
  expect(range.killTick).not.toBeNull();expect(range.shots).toBeGreaterThan(0);expect(range.damage).toBe(115);
});

it('uses real smoke visibility for the target, poses and impact traces, then restores sight on expiry',()=>{
  const range=new GrowthRangeSession(defaultGrowthLoadoutV3('medic'),{distance:180,health:100,armor:0});
  expect(range.presentation().state.actors.some(a=>a.id==='enemy-0')).toBe(true);
  expect(range.battle.useItem(range.aim)).toBe(true);
  for(let i=0;i<32;i++)range.step();
  expect(range.presentation().state.growthWorld!.smoke).toHaveLength(1);
  expect(range.presentation().state.actors.some(a=>a.id==='enemy-0')).toBe(false);
  expect(range.presentation().poses.some(a=>a.id==='enemy-0')).toBe(false);
  range.step({fire:true});
  expect(range.damage).toBeGreaterThan(0);const effects=range.presentation().effects;
  expect(effects).toHaveLength(1);expect(effects[0].trace.hit).toBeNull();expect(effects[0].damage).toBe(0);
  expect(effects[0].trace.end.x).toBeLessThan(range.aim.x);
  expect(range.impacts).toEqual([]);
  for(let i=0;i<151;i++)range.step();
  expect(range.presentation().state.growthWorld!.smoke).toEqual([]);
  expect(range.presentation().state.actors.some(a=>a.id==='enemy-0')).toBe(true);
});

it('presents the actual cover health and active tank shield in the range',()=>{
  const range=new GrowthRangeSession(defaultGrowthLoadoutV3('tank'),{distance:180,health:100,armor:0});
  expect(range.battle.useItem({x:170,y:499.5})).toBe(true);
  for(let i=0;i<14;i++)range.step();
  const entity=range.presentation().state.growthWorld!.entities[0];
  expect(entity).toMatchObject({gadgetId:'tk_cover',health:120,maxHealth:120});
  range.battle.growthV3!.gadgets.damageEntity(entity.id,20,2,range.battle.frame);
  expect(range.presentation().state.growthWorld!.entities[0].health).toBe(100);
  expect(range.battle.useSkill()).toBe(true);
  for(let i=0;i<5;i++)range.step();
  expect(range.presentation().state.actors.find(a=>a.id==='player')!.growthV3!.activeAbility).toBe('tk_barrier');
});


it('reveals growth targets at the enlarged radius but still hides more distant targets',()=>{
  const near=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  const far=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1100,health:100,armor:0});
  far.battle.mission.width = 3000; far.battle.actors[1].movement.reset(2620, 499.5);
  expect(near.presentation().state.actors.some(a=>a.id==='enemy-0')).toBe(true);
  expect(far.presentation().state.actors.some(a=>a.id==='enemy-0')).toBe(false);
  far.step({fire:true});
  expect(far.presentation().effects.length).toBeGreaterThan(0);
  expect(far.presentation().effects[0].trace.hit).toBeNull();
});
