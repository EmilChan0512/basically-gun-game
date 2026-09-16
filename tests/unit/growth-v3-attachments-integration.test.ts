import { expect, it } from 'vitest';
import {Battle,idleInput} from '../../src/game/campaign/Battle';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import type { GrowthAttachmentId } from '../../src/shared/content/growth-v3/Attachments';
import type { GrowthWeaponId } from '../../src/shared/content/growth-v3/Weapons';

function fixture(part:GrowthAttachmentId,cls:GrowthClassId='assault',weapon?:GrowthWeaponId){
  const build=defaultGrowthLoadoutV3(cls);build.attachments.primary=[part];
  if(weapon)build.primary=weapon;
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=r.battle;
  return {r,b,gun:b.growthV3!.weapons.get('player')!};
}

const ammoCases=[
  ['A01','assault',24,120,26,32,1],['A02','assault',39,120,41,51,.97],
  ['A03','assault',25,120,30,37,1],['A04','assault',48,120,46,57,.94],
  ['A05','tank',50,160,52,78,.9],['A06','assault',30,120,28,49,1],
] as const;

it.each([['G05','sniper',14],['O05','sniper',15],['A03','assault',8],['A04','assault',10]] as const)('%s applies its preparation modifier when switching back to the primary',(part,cls,ticks)=>{
  const f=fixture(part,cls);
  f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();
  f.b.swap();f.r.step();const started=f.b.frame,ammo=f.gun.current.ammo;
  expect(f.gun.readyTick).toBe(started+ticks);
  for(let i=1;i<ticks;i++){f.r.step({fire:true});expect(f.gun.current.ammo).toBe(ammo);}
  // Release on the ready tick, then request a fresh semi-auto edge next tick.
  f.r.step({fire:false});expect(f.b.frame).toBe(started+ticks);
  f.r.step({fire:true});expect(f.gun.current.ammo).toBe(ammo-1);
});

for(const empty of [false,true])it.each(ammoCases)('%s actual ammunition and reload tradeoffs (empty='+empty+')', (part,cls,capacity,total,loadedTicks,emptyTicks,speed)=>{
  const f=fixture(part,cls);expect([f.gun.current.ammo,f.gun.current.reserve]).toEqual([capacity,total-capacity]);
  for(let i=0;i<(empty?capacity*4:1);i++)f.r.step({fire:true,aim:{x:20,y:100}});
  expect(f.gun.current.ammo).toBe(empty?0:capacity-1);expect(f.b.player.movement.speedScale).toBeCloseTo(speed*(cls==='assault'?1.1:1));
  for(let i=0;i<4;i++)f.r.step();const remainingTotal=f.gun.current.ammo+f.gun.current.reserve;
  f.b.reload();f.r.step();const ticks=empty?emptyTicks:loadedTicks;
  expect(f.gun.current.reloadDuration).toBe(ticks);
  for(let i=0;i<ticks-1;i++)f.r.step();expect(f.gun.current.ammo).toBe(empty?0:capacity-1);
  f.r.step();expect(f.gun.current.ammo).toBe(capacity);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(remainingTotal);
});

it.each([['M05',9.84,450,11],['M06',14.16,382.5,9]] as const)('%s actual seven pellets change fan width and retain range/preparation tradeoffs',(part,fan,range,prepare)=>{
  const f=fixture(part,'assault','shotgun');f.r.step({fire:true});
  const traces=f.b.effects.filter(e=>e.actorId==='player').map(e=>e.trace);expect(traces).toHaveLength(7);
  const angles=traces.map(t=>Math.atan2(t.end.y-t.origin.y,t.end.x-t.origin.x)*180/Math.PI).sort((a,b)=>a-b);
  expect(angles[6]-angles[0]).toBeCloseTo(fan,7);expect(traces.every(t=>t.maxDistance===range)).toBe(true);
  expect(f.gun.current.ammo).toBe(4);for(let i=0;i<24;i++)f.r.step();
  f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();f.b.swap();f.r.step();expect(f.gun.readyTick-f.b.frame).toBe(prepare);
});

it.each([[440,true],[460,false]] as const)('M03 actual shot heard at %s pixels=%s and range/radar costs remain', (distance,heard)=>{
  const f=fixture('M03');f.b.actors[1].movement.reset(120+distance,499.5);f.r.step({fire:true,aim:{x:1200,y:100}});
  const recipients=f.b.journal.since(0).flatMap(e=>e.soundRecipients??[]).filter(s=>s.id==='enemy-0'&&s.cue==='shot');
  expect(recipients.length>0).toBe(heard);expect(f.b.effects[0].trace.maxDistance).toBe(792);
  const radar=f.b.growthV3!.checkpoint().radar.filter(r=>r.kind==='shot');expect(radar).toHaveLength(heard?1:0);
  if(heard)expect(radar[0].expiresTick).toBe(43);
});

it('M04 actual shot keeps sound range while shortening radar exposure and reducing public muzzle flash',()=>{
  const f=fixture('M04');f.b.actors[1].movement.reset(620,499.5);f.r.step({fire:true,aim:{x:1200,y:100}});
  expect(f.b.journal.since(0).flatMap(e=>e.soundRecipients??[]).some(s=>s.id==='enemy-0'&&s.cue==='shot')).toBe(true);
  expect(f.b.growthV3!.checkpoint().radar.find(r=>r.kind==='shot')?.expiresTick).toBe(52);
  expect(f.b.snapshot().actors.find(a=>a.id==='player')?.growthV3?.flashScale).toBe(.5);
});

it.each([['M01',.2125,2,.2],['M04',.27,2,.2],['B06',.25,1.7,.16],['G01',.2125,2,.2],['G02',.275,2,.2]] as const)('%s actual sustained fire reaches its bloom cap and recovers at the specified rate',(part,increment,cap,recovery)=>{
  const f=fixture(part);f.r.step({fire:true});expect(f.gun.current.bloom).toBeCloseTo(increment);
  for(let i=0;i<39;i++)f.r.step({fire:true});expect(f.r.shots).toBe(10);expect(f.gun.current.bloom).toBeCloseTo(cap);
  for(let i=0;i<2;i++)f.r.step();expect(f.gun.current.bloom).toBeCloseTo(cap);
  f.r.step();expect(f.b.frame).toBe(43);expect(f.gun.current.bloom).toBeCloseTo(cap-recovery);
});

it.each([['G05',23,true,1],['G05',24,true,.75],['G05',24,false,1],['O05',29,false,1],['O05',30,false,.7]] as const)('%s actual stance trigger at tick %s crouch=%s changes spread by %s',(part,tick,crouch,ratio)=>{
  const f=fixture(part,'sniper'),z=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  for(let i=1;i<tick;i++){f.r.step({crouch});z.step({crouch});}
  f.r.step({crouch,fire:true});z.step({crouch,fire:true});expect(Math.abs(offset(z))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(z)).toBeCloseTo(ratio,7);
  for(let i=0;i<25;i++){f.r.step({right:true});z.step({right:true});}
  f.r.step({right:true,fire:true});z.step({right:true,fire:true});
  expect(offset(f.r)/offset(z)).toBeCloseTo(part==='O05'?1.2:1,7);
});

function offset(r:GrowthRangeSession){
  const effect=r.battle.effects.find(e=>e.frame===r.battle.frame&&e.actorId==='player');expect(effect).toBeDefined();
  const {origin,end}=effect!.trace,aim=r.battle.player.aim;
  return Math.atan2(end.y-origin.y,end.x-origin.x)-Math.atan2(aim.y-origin.y,aim.x-origin.x);
}

it.each([1,23,24])('G05 counts only consecutive crouched stationary ticks after standing (crouch=%s)',ticks=>{
  const f=fixture('G05','sniper'),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  for(let i=0;i<30;i++){f.r.step();baseline.step();}
  for(let i=1;i<ticks;i++){f.r.step({crouch:true});baseline.step({crouch:true});}
  f.r.step({crouch:true,fire:true});baseline.step({crouch:true,fire:true});
  expect(offset(f.r)/offset(baseline)).toBeCloseTo(ticks===24?.75:1,7);
});

it('G05 retains its exact 23-tick crouch buildup through a real battle checkpoint',()=>{
  const f=fixture('G05','sniper');for(let i=0;i<23;i++)f.r.step({crouch:true});
  expect(f.b.growthV3!.participant('player').braceTicks).toBe(23);
  const restored=Battle.restore(f.b.checkpoint());
  f.r.step({crouch:true,fire:true});
  restored.tickPlayers(new Map([['player',{...idleInput(),crouch:true,fire:true,aim:{...f.b.player.aim}}]]));
  expect(restored.checkpoint()).toEqual(f.b.checkpoint());
  expect(restored.growthV3!.participant('player').braceTicks).toBe(24);
});

it.each(['stand','move'] as const)('G05 loses a charged bipod after %s and must crouch for another 24 ticks',change=>{
  const f=fixture('G05','sniper'),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  const step=(input:Parameters<GrowthRangeSession['step']>[0]={})=>{f.r.step(input);baseline.step(input);};
  for(let i=0;i<24;i++)step({crouch:true});
  expect(f.b.growthV3!.participant('player').braceTicks).toBe(24);
  step(change==='stand'?{}:{crouch:true,right:true});
  expect(f.b.growthV3!.participant('player').braceTicks).toBe(0);
  // Let movement stop while standing, then begin a fresh crouch period.
  for(let i=0;i<5;i++)step();
  for(let i=0;i<22;i++)step({crouch:true});
  step({crouch:true,fire:true});
  expect(f.b.growthV3!.participant('player').braceTicks).toBe(23);
  expect(offset(f.r)/offset(baseline)).toBeCloseTo(1,7);
});

it.each([
  ['B03','assault',1.2],['G03','assault',1],['G04','assault',.88],['G05','sniper',1],
  ['S03','assault',1.15],['O01','assault',1],['O03','assault',.88],['O04','assault',1.15],['O05','sniper',1.2],
] as const)('%s actual jump removes stationary benefits and uses airborne movement conditions',(part,cls,ratio)=>{
  const f=fixture(part,cls),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3(cls),{distance:1800,health:100,armor:0});
  for(let i=0;i<30;i++){f.r.step();baseline.step();}
  f.r.step({jump:true,fire:true});baseline.step({jump:true,fire:true});
  expect(f.b.player.movement.jumping).toBe(true);expect(f.b.player.movement.vy).toBeLessThan(0);
  expect(Math.abs(offset(baseline))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(baseline)).toBeCloseTo(ratio,7);
});

it('the actual airborne first shot uses 1.4 spread relative to the same grounded shot',()=>{
  const airborne=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  const ground=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  airborne.step({jump:true,fire:true});ground.step({fire:true});
  expect(airborne.battle.player.movement.jumping).toBe(true);
  expect(offset(airborne)/offset(ground)).toBeCloseTo(1.4,7);
});

it.each([['M01',false,1.1],['B01',false,.8],['B02',false,1.12],['G01',true,1.1],['S06',false,1.18]] as const)('%s actual first-shot spread includes its independent benefit or cost',(part,moving,ratio)=>{
  const f=fixture(part),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  f.r.step({right:moving,fire:true});baseline.step({right:moving,fire:true});
  expect(Math.abs(offset(baseline))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(baseline)).toBeCloseTo(ratio,7);
});

it.each([['G02',7,34,1],['G03',8,34,.98],['G06',8,37,1],['O01',8,34,1],['O02',9,34,1],['O03',9,34,1],['O04',9,34,1],['O06',9,34,1]] as const)('%s handling costs remain present alongside conditional accuracy',(part,prepare,reload,speed)=>{
  const f=fixture(part);f.r.step({fire:true});expect(f.b.player.movement.speedScale).toBeCloseTo(speed*1.1);
  for(let i=0;i<4;i++)f.r.step();f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(reload);
  for(let i=0;i<reload;i++)f.r.step();f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();
  f.b.swap();f.r.step();expect(f.gun.readyTick-f.b.frame).toBe(prepare);
});

it('B04 lightweight barrel increases actual bloom per shot by fifteen percent',()=>{
  const f=fixture('B04');f.r.step({fire:true});expect(f.gun.current.bloom).toBeCloseTo(.2875,8);
});

const conditionalSpread=[
  ['B03',.75,1.2,1,1.2],['G03',.85,1,.85,1],['G04',1.1,.88,1.1,.88],['G06',.9,.9,1,1],
  ['S03',.8,1.15,1,1.15],['O01',1.08,1,1,1],['O02',.9,.9,1,1],['O03',1,.88,1,1],
  ['O04',.82,1.15,.82,1.15],['O06',.92,.92,1,1],
] as const;

for(const elapsed of [29,30])for(const swap of [false,true])it.each([
  ['B03','assault',false,.75],['S03','assault',false,.8],['G06','assault',false,.9],
  ['O01','assault',false,1.08],['O02','assault',false,.9],['O03','assault',true,.88],
  ['O05','sniper',false,.7],['O06','assault',false,.92],
] as const)('%s first-shot clock at '+elapsed+' ticks survives swap='+swap,(part,cls,moving,ratio)=>{
  const f=fixture(part,cls),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3(cls),{distance:1800,health:100,armor:0});
  const step=(fire=false)=>{f.r.step({right:moving,fire});baseline.step({right:moving,fire});};
  step(true);expect(f.gun.current.lastShotTick).toBe(1);
  if(swap){
    f.b.swap();baseline.battle.swap();step();for(let i=0;i<6;i++)step();
    f.b.swap();baseline.battle.swap();step();
    expect(f.gun.current.lastShotTick).toBe(1);
  }
  while(f.b.frame<elapsed)step();
  step(true);expect(f.b.frame).toBe(1+elapsed);
  expect(f.gun.current.lastShotTick).toBe(1+elapsed);
  expect(Math.abs(offset(baseline))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(baseline)).toBeCloseTo(elapsed===30?ratio:1,7);
});
for(const moving of [false,true])it.each(conditionalSpread)('%s conditional actual first and second shot spread (moving='+moving+')',(part,standingFirst,movingFirst,standingNext,movingNext)=>{
  const f=fixture(part),z=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  const input={right:moving,fire:true};f.r.step(input);z.step(input);
  expect(Math.abs(offset(z))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(z)).toBeCloseTo(moving?movingFirst:standingFirst,7);
  for(let i=0;i<3;i++){f.r.step({right:moving});z.step({right:moving});}
  f.r.step(input);z.step(input);
  // The second M4 shot includes its unchanged 0.25-degree bloom from the first shot.
  const multiplier=moving?movingNext:standingNext;
  expect(offset(f.r)/offset(z)).toBeCloseTo((1.2*multiplier+.25)/1.45,7);
});

it.each([
  ['M02',960,1500,1,9,34],['S01',1380,1500,1.03,8,34],['S02',900,1500,.97,9,34],
  ['S04',1344,1500,1,7,34],['S05',1200,1125,1,8,38],
] as const)('%s actual recoil changes remain independent of ballistics and preserve handling costs', (part,shot,hit,speed,prepare,reload)=>{
  const f=fixture(part),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  f.r.step({fire:true});baseline.step({fire:true});
  const recoil=f.b.growthV3!.participant('player').recoil;
  expect(recoil.shot).toBe(shot);expect(f.b.effects[0].trace).toEqual(baseline.battle.effects[0].trace);
  expect(f.b.player.movement.speedScale).toBeCloseTo(speed*1.1);
  f.b.damage(f.b.player,10,f.b.actors[1]);expect(recoil.hit).toBe(hit);expect(f.b.player.life.health).toBe(90);
  for(let i=0;i<4;i++)f.r.step();f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(reload);
  for(let i=0;i<reload;i++)f.r.step();f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();
  f.b.swap();f.r.step();expect(f.gun.readyTick-f.b.frame).toBe(prepare);
});

it.each([
  ['B01',1008,.96,8,39],['B02',738,1.04,8,34],['B04',900,1.03,8,34],
  ['B05',1062,.97,10,34],['S06',900,1.04,8,34],
] as const)('%s actual range, movement and handling apply both benefits and costs', (part,range,speed,prepare,reload)=>{
  const f=fixture(part);f.r.step({fire:true});const trace=f.b.effects[0].trace;
  expect(trace.hit).toBeNull();expect(Math.hypot(trace.end.x-trace.origin.x,trace.end.y-trace.origin.y)).toBeCloseTo(range);
  expect(f.b.player.movement.speedScale).toBeCloseTo(speed*1.1);
  for(let i=0;i<4;i++)f.r.step();f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(reload);
  for(let i=0;i<reload;i++)f.r.step();f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();
  f.b.swap();f.r.step();expect(f.gun.readyTick-f.b.frame).toBe(prepare);
});
