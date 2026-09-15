import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import {  changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { grantArmor } from '../../src/shared/simulation/growth-v3/DamageRules';

it.each([
  ['tank','tk_shield','shotgun',24,false],
  ['tank','tk_shield','shotgun',24,true],
  ['sniper','sn_relocate','heavy_sniper',45,false],
  ['sniper','sn_relocate','heavy_sniper',45,true],
  ['sniper','sn_focus','heavy_sniper',45,false],
  ['sniper','sn_focus','heavy_sniper',45,true],
] as const)('%s %s cancellation preserves real %s interval %i (swap=%s)', (classId,abilityId,weaponId,interval,swap)=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3(classId),abilityId);build.primary=weaponId;
  const range=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=range.battle;
  const gun=b.growthV3!.weapons.get('player')!;
  range.step({fire:true});expect(range.shots).toBe(1);
  expect(gun.checkpoint().shootReadyTick).toBe(1+interval);
  expect(b.useSkill()).toBe(true);
  for(let i=0;i<7;i++)range.step();
  expect(b.growthV3!.abilities.actorState('player').active).not.toBeNull();
  expect(b.useSkill()).toBe(true);range.step({fire:true});
  expect(b.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(gun.checkpoint().shootReadyTick).toBe(1+interval);
  if(swap){b.swap();range.step();expect(gun.selectedSlot).toBe('secondary');expect(gun.readyTick).toBe(1+interval);}
  // Semi-automatic fire needs fresh edges. Probe repeatedly during the lock,
  // then release on the last locked tick and press exactly on the ready tick.
  while(b.frame<interval){range.step({fire:b.frame+1<interval&&(b.frame+1)%2===0});expect(range.shots).toBe(1);}
  range.step({fire:true});expect(range.shots).toBe(2);
  expect(gun.checkpoint().guns[swap?'secondary':'primary'].lastShotTick).toBe(1+interval);
});

it.each([0,30])('two evolved awakened medics share recipient armor cooldowns with %i tick stagger',delay=>{
  const b=new Battle({id:'shared-medical-armor',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:999,
    seconds:900,debug:true,allies:2,enemies:1,width:1600,height:700,spawns:[[{x:60,y:599.5}],[{x:1540,y:599.5}]],
    objective:{x:1400,y:599.5},terrain:[{x:0,y:600,width:1600,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0}},
    'normal','m4',seededRandom(110));
  b.enableGrowthV3(Object.fromEntries(b.actors.map((a,i)=>[a.id,defaultGrowthLoadoutV3(i===1||i===2?'medic':'assault')])),5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset([400,420,440,1400][i],599.5);});
  const runtime=b.growthV3!,target=runtime.participant(b.player.id),medics=b.actors.slice(1,3);
  for(const actor of medics){
    const p=runtime.participant(actor.id);awardGrowthV3(p.progression,p.loadout,1200,0,()=>0);
    for(let i=0;i<3;i++){
      const offer=p.progression.offer!,card=offer.cards.find(id=>id.startsWith('md_A'))!;
      expect(card).toBeDefined();expect(b.growthChoice(actor.id,offer.batch,card)).toBe(true);
    }
    expect(b.growthChoice(actor.id,p.progression.offer!.batch,'md_EV_A')).toBe(true);
  }
  const step=(n=1)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map());};
  // Advance the actual standard clock; no direct awakening or selected-card writes.
  step(21599);for(const actor of medics)expect(runtime.participant(actor.id).progression.ultimate).toBe(false);
  step();for(const actor of medics)expect(runtime.participant(actor.id).progression.ultimate).toBe(true);
  b.player.life.health=50;
  expect(b.useSkill(medics[0])).toBe(true);
  if(delay)step(delay);
  expect(b.useSkill(medics[1])).toBe(true);step(4);
  expect(b.player.life.health).toBe(80);
  // Both perks trigger on the first heal, but only the stronger 15HP grant survives.
  // The second source cannot refresh its duration or either recipient cooldown.
  expect(target.armor).toMatchObject({remaining:15000,until:21694,source:medics[0].id});
  expect(target.cooldowns).toMatchObject({lifeline:22204,pulseArmor:21904});
  for(const actor of medics)expect(runtime.participant(actor.id).armor.remaining).toBe(0);
  step(21693-b.frame);expect(target.armor.remaining).toBe(15000);
  step();expect(target.armor.remaining).toBe(0);
});

it.each([['m4',10,[1,5,9,13,17,21,25,29,33,37]],['famas',13,[1,4,7,10,13,16,19,22,25,28,31,34,37]],
  ['burst_ar',9,[1,4,7,17,20,23,33,36,39]]] as const)('N01-N03 %s kills a real body target at the specified shot ticks', (id,count,ticks)=>{
  const build=defaultGrowthLoadoutV3();build.primary=id;
  const range=new GrowthRangeSession(build,{distance:90,health:100,armor:0}),observed:number[]=[];
  for(let i=0;i<ticks.at(-1)!;i++){
    const before=range.shots;range.step({fire:id==='burst_ar'?i%16===0:true});
    if(range.shots>before)observed.push(range.battle.frame);
    if(i+1<ticks.at(-1)!)expect(range.battle.actors[1].life.alive).toBe(true);
  }
  expect(observed).toEqual(ticks);expect(range.shots).toBe(count);expect(range.killTick).toBe(ticks.at(-1));
  expect(range.ttk).toBe((ticks.at(-1)!-1)/30);
  expect(range.battle.player.kills).toBe(1);expect(range.battle.growthV3!.participant('player').progression.xp).toBe(100);
});

it('N04 uses actual impact travel distance, including the two-pixel collision sampling, for real falloff damage',()=>{
  const range=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:518,health:100,armor:0});range.step({fire:true});
  const effect=range.battle.effects[0],d=Math.hypot(effect.trace.end.x-effect.trace.origin.x,effect.trace.end.y-effect.trace.origin.y);
  expect(effect.trace.hit).toMatchObject({type:'unit',target:'enemy-0',region:'body'});
  expect(d).toBeCloseTo(506,6);
  // 505px is the pure resolver example. A real hit sampled at 506px yields 8.238HP.
  expect(effect.damage).toBe(8.238);expect(range.battle.actors[1].life.health).toBe(91.762);
});

it.each([[100,false,28,true],[100,true,0,false],[115,true,10.6,true]] as const)('N05 heavy sniper at %s HP (head=%s) preserves the correct lethality threshold', (health,head,remaining,alive)=>{
  const build=defaultGrowthLoadoutV3('sniper');build.primary='heavy_sniper';
  const range=new GrowthRangeSession(build,{distance:90,health,armor:0});
  range.step({fire:true,aim:{...range.aim,y:range.aim.y-(head?25:0)}});
  expect(range.battle.effects[0].trace.hit).toMatchObject({type:'unit',region:head?'head':'body'});
  expect(range.battle.actors[1].life.health).toBe(remaining);expect(range.battle.actors[1].life.alive).toBe(alive);
});

it('N06 groups all seven pellets into one real damage event and kills on the second shot at 0.8 seconds',()=>{
  const build=defaultGrowthLoadoutV3();build.primary='shotgun';
  const range=new GrowthRangeSession(build,{distance:60,health:100,armor:0});range.step({fire:true});
  expect(range.hits).toBe(7);expect(range.damage).toBe(70);expect(range.battle.actors[1].life.health).toBe(30);
  expect(range.battle.journal.since(0).filter(e=>e.kind==='damage'&&e.targetId==='enemy-0')).toHaveLength(1);
  for(let i=0;i<23;i++)range.step();expect(range.killTick).toBeNull();range.step({fire:true});
  expect(range.shots).toBe(2);expect(range.ttk).toBe(.8);expect(range.battle.player.kills).toBe(1);
});

it('N10 applies three equipped parts and a legally chosen reload card through actual shooting and reload completion',()=>{
  const build=defaultGrowthLoadoutV3();build.attachments.primary=['B01','A01','M02'];
  const range=new GrowthRangeSession(build,{distance:90,health:100,armor:0}),b=range.battle;
  const p=b.growthV3!.participant('player'),gun=b.growthV3!.weapons.get('player')!;
  expect([gun.current.ammo,gun.current.reserve]).toEqual([24,96]);
  awardGrowthV3(p.progression,p.loadout,200,0,()=>0);
  expect(p.progression.offer!.cards).toContain('as_C1');expect(b.growthChoice('player',p.progression.offer!.batch,'as_C1')).toBe(true);
  range.step({fire:true});expect(range.damage).toBe(10);expect([gun.current.ammo,gun.current.reserve]).toEqual([23,96]);
  for(let i=0;i<3;i++)range.step(); // Finish the existing four-tick shot interval before R.
  b.reload();range.step();expect(gun.current.reloadDuration).toBe(24);expect(gun.current.reloadUntil).toBe(29);
  for(let i=0;i<23;i++)range.step();expect(gun.current.ammo).toBe(23);
  range.step();expect([gun.current.ammo,gun.current.reserve]).toEqual([24,95]);
});

it('N25 three real card selections produce a 240px, 15HP pulse with 378tick cooldown and no movement penalty',()=>{
  const range=new GrowthRangeSession(defaultGrowthLoadoutV3('medic'),{distance:220,health:100,armor:0}),b=range.battle;
  b.actors[1].team=1;b.actors[1].life.health=60;
  const p=b.growthV3!.participant('player');awardGrowthV3(p.progression,p.loadout,800,0,()=>0);
  for(let i=0;i<3;i++){
    const offer=p.progression.offer!,card=offer.cards.find(id=>id.startsWith('md_A'))!;
    expect(card).toBeDefined();expect(b.growthChoice('player',offer.batch,card)).toBe(true);
  }
  expect([...p.progression.selected].sort()).toEqual(['md_A1','md_A2','md_A3']);
  expect(b.useSkill()).toBe(true);for(let i=0;i<4;i++)range.step();
  expect(b.actors[1].life.health).toBe(75);expect(b.player.movement.speedScale).toBe(1);
  expect(b.growthV3!.abilities.actorState('player').queue).toEqual([382]);
});

function healingBattle(gadget:'md_station'|'md_ammo'='md_station') {
  const b=new Battle({id:'healing-numeric',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:999,
    seconds:900,debug:true,allies:2,enemies:1,width:1600,height:700,spawns:[[{x:60,y:599.5}],[{x:1540,y:599.5}]],
    objective:{x:1200,y:599.5},terrain:[{x:0,y:600,width:1600,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0}},
    'normal','m4',seededRandom(123));
  const medic=changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link');medic.gadgetId=gadget;
  b.enableGrowthV3(Object.fromEntries(b.actors.map((a,i)=>[a.id,i<2?medic:defaultGrowthLoadoutV3()])),5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset([400,420,500,1400][i],599.5);});
  const target=b.actors[2];target.life.health=20;
  const step=(n=1)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map(b.actors.map(a=>[a.id,{...idleInput(),aim:{x:target.movement.x,y:target.movement.y-33}}])));};
  return {b,target,step};
}

it('N15 real station pulses remain suppressed throughout a stronger treatment chain and resume after the chain expires',()=>{
  const {b,target,step}=healingBattle();
  expect(b.useItem({x:440,y:599.5})).toBe(true);step(13);
  expect(b.useSkill()).toBe(true);step(7); // Chain commits at tick20; pulses 35..110.
  const station=b.growthV3!.gadgets.entities()[0];expect(station.healBudget).toBe(90000);
  step(38);expect(b.frame).toBe(58);expect(target.life.health).toBe(30);
  expect(b.growthV3!.gadgets.entities()[0].healBudget).toBe(90000);
  step(52);expect(b.frame).toBe(110);expect(target.life.health).toBe(50);
  expect(b.growthV3!.gadgets.entities()[0].healBudget).toBe(90000);
  step(8);expect(target.life.health).toBe(50); // 118-110 < station interval30: this pulse is discarded.
  step(30);expect(target.life.health).toBe(53);expect(b.growthV3!.gadgets.entities()[0].healBudget).toBe(87000);
});

it('N23 staggered real chains select one fixed effective source instead of alternating to double the healing rate',()=>{
  const {b,target,step}=healingBattle();
  expect(b.useSkill()).toBe(true);step(5);
  expect(b.useSkill(b.actors[1])).toBe(true);step(7);
  expect(b.growthV3!.actorView('player').linkTargetId).toBe(target.id);
  expect(b.growthV3!.actorView(b.actors[1].id).linkTargetId).toBe(target.id);
  step(79);expect(b.frame).toBe(91);expect(target.life.health).toBe(45);
  step(6);expect(target.life.health).toBe(50); // First chain's sixth and final pulse.
  step(5);expect(target.life.health).toBe(50); // 102-97 < interval15: the second chain's last pulse is discarded.
  expect(b.growthV3!.abilities.actorState(b.actors[1].id).active).toBeNull();
});

it('N24 an actual six-pulse chain restores enemy-caused damage and credits 15XP against the shared target budget',()=>{
  const {b,target,step}=healingBattle();target.life.health=100;
  b.damage(target,60,b.actors[3]);expect(target.life.health).toBe(40);
  expect(b.useSkill()).toBe(true);step(97);
  expect(target.life.health).toBe(70);
  expect(b.growthV3!.participant('player').progression.xp).toBe(15);
  expect(b.growthV3!.participant('player').metrics.healingDone).toBe(30);
  expect(b.growthV3!.participant('player').metrics.healingXp).toBe(15);
  // A second healer draws from that same target's remaining five XP, rather than a fresh budget.
  expect(b.useSkill(b.actors[1])).toBe(true);step(97);
  expect(target.life.health).toBe(100);expect(b.growthV3!.participant(b.actors[1].id).progression.xp).toBe(5);
});

it('halves the second real concussion slow during the 45tick resistance window without shortening its duration',()=>{
  const build=defaultGrowthLoadoutV3();build.gadgetId='as_concussion';
  const range=new GrowthRangeSession(build,{distance:300,health:100,armor:0}),b=range.battle;
  const target=b.growthV3!.participant('enemy-0');
  expect(b.useItem(range.aim)).toBe(true);for(let i=0;i<31;i++)range.step();
  expect(target.slowScale).toBe(.2);expect(target.slowUntil).toBe(61);
  for(let i=0;i<6;i++)range.step();expect(b.useItem(range.aim)).toBe(true);
  while(b.frame<60)range.step();expect(target.slowScale).toBe(.2);
  range.step();expect(target.slowScale).toBe(0);expect(target.slowResistUntil).toBe(106);
  while(b.frame<68)range.step();expect(target.slowScale).toBe(.1);expect(target.slowUntil).toBe(98);
  expect(b.actors[1].life.health).toBe(80);
  while(b.frame<97)range.step();expect(target.slowScale).toBe(.1);
  range.step();expect(target.slowScale).toBe(0);
});

it('N11 rejects an actual plate request against existing 20 armor without consuming or extending it',()=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';
  const range=new GrowthRangeSession(build,{distance:180,health:100,armor:0}),b=range.battle;
  const armor=b.growthV3!.participant('player').armor;grantArmor(armor,20,90,0,'existing-armor');
  b.useItem(range.aim);range.step();
  expect(b.growthV3!.gadgets.inventory('player').cast).toBeNull();expect(b.player.itemCharges).toBe(2);
  expect(armor).toMatchObject({remaining:20000,until:90});
  expect(b.journal.since(0).some(e=>e.kind==='error'&&e.cause==='no_effect')).toBe(true);
});

it.each([
  ['center',0,false,false,50], ['edge',120,false,false,10], ['outside',121,false,false,0],
  ['wall',120,true,false,0], ['self',0,false,true,25],
] as const)('N12 actual frag flight and explosion applies %s geometry correctly',(_label,offset,wall,self,damage)=>{
  const template=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:300,health:100,armor:0});
  const mission=structuredClone(template.battle.mission);
  if(wall)mission.terrain.push({x:180,y:80,width:10,height:320});
  const b=new Battle(mission,'normal','m4',seededRandom(112));
  b.enableGrowthV3({player:defaultGrowthLoadoutV3(),'enemy-0':defaultGrowthLoadoutV3()},5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?420:120,499.5);});
  const aim={x:120,y:100},impact=b.growthV3!.gadgets.predictThrow('player',aim)!;
  b.useItem(aim);
  for(let i=0;i<33;i++)b.tickPlayers(new Map());
  expect(b.growthV3!.gadgets.flying()).toHaveLength(1);
  expect(b.growthV3!.gadgets.flying()[0].detonateTick).toBe(34);
  // A controlled airborne pose on the last flight tick isolates exact blast geometry.
  // No grenade state, impact coordinates or damage amounts are injected.
  const target=self?b.player:b.actors[1];
  target.movement.reset(impact.x+offset,impact.y+33);
  b.tickPlayers(new Map());
  expect(b.bursts.at(-1)).toMatchObject({x:impact.x,y:impact.y,frame:34,radius:120});
  expect(Math.hypot(target.movement.x-impact.x,target.movement.y-33-impact.y)).toBe(offset);
  expect(target.life.health).toBe(100-damage);
  expect(b.player.itemCharges).toBe(1);
  expect(b.growthV3!.gadgets.flying()).toHaveLength(0);
});

it.each([false,true])('N13 real EMP flight enters interceptor range on its fuse tick; prior EMP stopped=%s',stopped=>{
  const b=new Battle({id:'interception-numeric',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:999,
    seconds:900,debug:true,allies:1,enemies:1,width:1600,height:700,spawns:[[{x:60,y:599.5}],[{x:1540,y:599.5}]],
    objective:{x:1400,y:599.5},terrain:[{x:0,y:600,width:1600,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0}},
    'normal','m4',seededRandom(113));
  const tank=defaultGrowthLoadoutV3('tank');tank.gadgetId='tk_interceptor';
  const medic=defaultGrowthLoadoutV3('medic');medic.gadgetId='md_station';
  const sniper=defaultGrowthLoadoutV3('sniper');sniper.gadgetId='sn_emp';
  b.enableGrowthV3(Object.fromEntries(b.actors.map((a,i)=>[a.id,[tank,medic,sniper][i]])),5);
  b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;});
  const enemy=b.actors[2];enemy.movement.reset(400,599.5);
  const aim={x:1000,y:566.5},runtime=b.growthV3!,impact=runtime.gadgets.predictThrow(enemy.id,aim)!;
  // Select legal deployment geometry so the unmodified projectile first crosses 140px at fuse expiry.
  const interceptorX=impact.x+Math.sqrt(139**2-(589.5-impact.y)**2);
  b.player.movement.reset(interceptorX+40,599.5);b.actors[1].movement.reset(interceptorX-70,599.5);
  b.useItem({x:interceptorX,y:599.5});b.useItem({x:interceptorX-30,y:599.5},b.actors[1]);
  const firstAim=stopped?{x:1000,y:500}:aim;
  if(stopped){
    const firstImpact=runtime.gadgets.predictThrow(enemy.id,firstAim)!;
    const gap=Math.hypot(firstImpact.x-interceptorX,firstImpact.y-589.5);
    expect(gap).toBeGreaterThan(140);expect(gap).toBeLessThan(160);
  }
  b.useItem(firstAim,enemy);
  const step=(n=1)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map());};
  step(30);
  const interceptor=runtime.gadgets.entities().find(e=>e.gadgetId==='tk_interceptor')!;
  const station=runtime.gadgets.entities().find(e=>e.gadgetId==='md_station')!;
  expect(interceptor.interceptions).toBe(2);expect(runtime.gadgets.flying()).toHaveLength(1);
  expect(runtime.gadgets.flying()[0].detonateTick).toBe(31);
  if(stopped){
    step();expect(interceptor.interceptions).toBe(2);expect(interceptor.stoppedUntil).toBe(121);
    expect(station.stoppedUntil).toBe(121);step(6);
    b.useItem(aim,enemy);step(30);
    expect(runtime.gadgets.flying()).toHaveLength(1);expect(runtime.gadgets.flying()[0].detonateTick).toBe(68);
  }
  const restored=Battle.restore(b.checkpoint());
  step();restored.tickPlayers(new Map());expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(runtime.gadgets.flying()).toHaveLength(0);
  if(stopped){
    expect(interceptor.interceptions).toBe(2);expect(interceptor.stoppedUntil).toBe(158);
    expect(station.stoppedUntil).toBe(158);
    expect(runtime.participant('player').progression.xp).toBe(0);
  }else{
    expect(interceptor.interceptions).toBe(1);expect(interceptor.stoppedUntil).toBe(0);expect(station.stoppedUntil).toBe(0);
    expect(runtime.participant('player').progression.xp).toBe(10);
    expect(runtime.checkpoint().gadgetEvents.some(e=>e.kind==='emp-burst')).toBe(false);
    expect(runtime.checkpoint().gadgetEvents.find(e=>e.kind==='intercept')?.tick).toBe(31);
  }
});

it('legal shield, crouched support card and self-applied armor resolve front, rear and exhausted-budget damage in Battle',()=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('tank'),'tk_shield');build.gadgetId='tk_plate';
  build.pool=['tk_C1',...build.pool.filter(id=>id!=='tk_C1')];
  const range=new GrowthRangeSession(build,{distance:180,health:100,armor:0}),b=range.battle,p=b.growthV3!.participant('player');
  awardGrowthV3(p.progression,p.loadout,200,0,()=>0);
  expect(p.progression.offer!.cards).toContain('tk_C1');expect(b.growthChoice('player',p.progression.offer!.batch,'tk_C1')).toBe(true);
  b.useItem(range.aim);for(let i=0;i<31;i++)range.step();expect(p.armor.remaining).toBe(15000);
  b.useSkill();for(let i=0;i<7;i++)range.step({crouch:true});
  const shield=b.growthV3!.abilities.actorState('player').active!;
  expect(shield.definition.id).toBe('tk_shield');expect(shield.shieldBudget).toBe(120000);
  b.damage(b.player,100,b.actors[1]);
  expect(shield.shieldBudget).toBe(55000);expect(p.armor.remaining).toBe(0);expect(b.player.life.health).toBe(95);
  b.actors[1].movement.reset(40,499.5);b.damage(b.player,20,b.actors[1]);
  expect(shield.shieldBudget).toBe(55000);expect(b.player.life.health).toBe(78);
  b.actors[1].movement.reset(300,499.5);b.damage(b.player,100,b.actors[1]);
  expect(shield.shieldBudget).toBe(0);expect(b.player.life.health).toBe(39.75);
  expect(b.growthV3!.abilities.actorState('player').active).toBeNull();
});

it('N09 stronger upgraded self-plate rejects later real medical evolution armor without extending its expiry',()=>{
  const b=new Battle({id:'armor-numeric',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:999,
    seconds:900,debug:true,allies:1,enemies:1,width:1600,height:700,spawns:[[{x:60,y:599.5}],[{x:1540,y:599.5}]],
    objective:{x:1400,y:599.5},terrain:[{x:0,y:600,width:1600,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0}},
    'normal','m4',seededRandom(109));
  const tank=defaultGrowthLoadoutV3('tank');tank.gadgetId='tk_plate';tank.pool=['tk_G2',...tank.pool.filter(id=>id!=='tk_G1')];
  b.enableGrowthV3(Object.fromEntries(b.actors.map((a,i)=>[a.id,i===0?tank:i===1?defaultGrowthLoadoutV3('medic'):defaultGrowthLoadoutV3()])),5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset([400,420,1400][i],599.5);});
  b.player.life.health=50;
  const runtime=b.growthV3!,p=runtime.participant('player'),medic=runtime.participant(b.actors[1].id);
  awardGrowthV3(p.progression,p.loadout,200,0,()=>0);
  expect(p.progression.offer!.cards).toContain('tk_G2');expect(b.growthChoice('player',p.progression.offer!.batch,'tk_G2')).toBe(true);
  awardGrowthV3(medic.progression,medic.loadout,1200,0,()=>0);
  for(let i=0;i<3;i++){
    const offer=medic.progression.offer!,card=offer.cards.find(id=>id.startsWith('md_A'))!;
    expect(card).toBeDefined();expect(b.growthChoice(medic.id,offer.batch,card)).toBe(true);
  }
  expect(medic.progression.offer!.cards).toContain('md_EV_A');
  expect(b.growthChoice(medic.id,medic.progression.offer!.batch,'md_EV_A')).toBe(true);
  const step=(n=1)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map());};
  b.useItem({x:400,y:566.5});step(31);
  expect(p.armor).toMatchObject({remaining:20000,until:121,source:'player'});
  step(29);b.useSkill(b.actors[1]);step(4);
  expect(b.player.life.health).toBe(65);
  expect(p.cooldowns.pulseArmor).toBe(364); // The real weaker grant was attempted on tick64.
  expect(p.armor).toMatchObject({remaining:20000,until:121,source:'player'});
  step(56);expect(p.armor.remaining).toBe(20000);step();expect(p.armor.remaining).toBe(0);expect(p.armor.until).toBe(0);
});

it('N14 a real self-targeted six-pulse link restores exactly 18HP and grants no healing XP',()=>{
  const range=new GrowthRangeSession(changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link'),{distance:180,health:100,armor:0}),b=range.battle;
  b.player.life.health=40;b.useSkill();for(let i=0;i<96;i++)range.step();
  expect(b.player.life.health).toBe(55);range.step();expect(b.player.life.health).toBe(58);
  expect(b.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(b.growthV3!.participant('player').progression.xp).toBe(0);
});

it('N19 a full magazine after real shooting and reload stays full with 88 reserve during reload rush',()=>{
  const range=new GrowthRangeSession(changeGrowthAbility(defaultGrowthLoadoutV3(),'as_reloadrush'),{distance:180,health:100,armor:0}),b=range.battle;
  const gun=b.growthV3!.weapons.get('player')!;
  for(let i=0;i<8;i++)range.step({fire:i===0||i===4});
  expect(gun.current.ammo).toBe(28);b.reload();range.step();
  while(b.frame<43)range.step();expect([gun.current.ammo,gun.current.reserve]).toEqual([30,88]);
  b.useSkill();for(let i=0;i<4;i++)range.step();
  expect([gun.current.ammo,gun.current.reserve]).toEqual([30,88]);
  expect(b.growthV3!.abilities.actorState('player')).toMatchObject({charges:0,queue:[377]});
  expect(b.player.movement.speedScale).toBe(1.25);
});

it('N21 full ammo does not claim the box; a partial refill claims once and death cannot reset that ledger',()=>{
  const {b,target,step}=healingBattle('md_ammo');target.movement.reset(480,599.5);
  b.useItem({x:440,y:599.5});step(28);
  const box=b.growthV3!.gadgets.entities()[0];expect(box.recipients).toEqual([]);
  b.tickPlayers(new Map([[target.id,{...idleInput(),fire:true,aim:{x:800,y:100}}]]));step();
  const gun=b.growthV3!.weapons.get(target.id)!;
  expect([gun.current.ammo,gun.current.reserve]).toEqual([29,91]);expect(box.recipients).toEqual([target.id]);
  b.damage(target,9999);step(150);expect(target.life.alive).toBe(true);
  target.movement.reset(800,599.5);
  for(let i=0;i<9;i++)b.tickPlayers(new Map([[target.id,{...idleInput(),fire:true,aim:{x:800,y:100}}]]));
  const respawnGun=b.growthV3!.weapons.get(target.id)!;
  expect([respawnGun.current.ammo,respawnGun.current.reserve]).toEqual([29,90]);
  target.movement.reset(480,599.5);step();
  expect([respawnGun.current.ammo,respawnGun.current.reserve]).toEqual([29,90]);
  expect(b.growthV3!.gadgets.entities()[0].recipients).toEqual([target.id]);
});
