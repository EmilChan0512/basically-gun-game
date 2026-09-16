import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import {  changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_EVOLUTIONS, type GrowthEvolutionId } from '../../src/shared/content/growth-v3/Cards';
import { GROWTH_V3_OPERATORS } from '../../src/shared/content/growth-v3/Operators';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { Battle } from '../../src/game/campaign/Battle';

function fixture(id:GrowthEvolutionId,evolve=true){
  const evo=GROWTH_V3_EVOLUTIONS[id],ability=GROWTH_V3_OPERATORS[evo.classId].abilities[evo.group==='A'?0:1];
  const build=changeGrowthAbility(defaultGrowthLoadoutV3(evo.classId),ability);
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=r.battle,p=b.growthV3!.participant('player');
  awardGrowthV3(p.progression,p.loadout,1200,0,()=>0);
  for(let i=0;i<3;i++){
    const card=p.progression.offer!.cards.find(card=>card.startsWith(id.slice(0,2)+'_'+evo.group))!;
    expect(card).toBeDefined();expect(b.growthChoice('player',p.progression.offer!.batch,card)).toBe(true);
  }
  expect(p.progression.offer!.cards).toContain(id);
  if(evolve){expect(b.growthChoice('player',p.progression.offer!.batch,id)).toBe(true);
    expect(p.progression.selected).toContain(id);expect(p.progression.offer).toBeNull();}
  return {r,b,p,gun:b.growthV3!.weapons.get('player')!,state:()=>b.growthV3!.abilities.actorState('player')};
}

it.each(Object.keys(GROWTH_V3_EVOLUTIONS) as GrowthEvolutionId[])('%s is earned through three actual prerequisite route choices',id=>{
  const f=fixture(id);expect(f.p.progression.selected).toHaveLength(4);
  expect(f.b.growthChoice('player',f.p.progression.serial,id)).toBe(false);
});

it('as_EV_A real charges regenerate sequentially and reject the second use before its sixty tick gap',()=>{
  const f=fixture('as_EV_A');expect(f.state().charges).toBe(1);expect(f.state().queue).toEqual([360]);
  for(let i=0;i<360;i++)f.r.step();expect(f.state().charges).toBe(2);
  f.b.useSkill();f.r.step();expect(f.state().charges).toBe(1);expect(f.state().queue).toEqual([721]);
  expect(f.b.player.movement.speedScale).toBeCloseTo(1.485);
  for(let i=0;i<58;i++)f.r.step();f.b.useSkill();f.r.step();expect(f.b.frame).toBe(420);
  expect(f.state().charges).toBe(1);expect(f.state().active).toBeNull();
  f.b.useSkill();f.r.step();expect(f.state().charges).toBe(0);expect(f.state().queue).toEqual([721,1081]);
  for(let i=0;i<299;i++)f.r.step();expect(f.state().charges).toBe(0);
  f.r.step();expect(f.state().charges).toBe(1);expect(f.state().queue).toEqual([1081]);
  for(let i=0;i<360;i++)f.r.step();expect(f.state().charges).toBe(2);expect(f.state().queue).toEqual([]);
});

it('roll evolution selected during cooldown retains its first deadline through actual death and revival',()=>{
  const f=fixture('as_EV_A',false);f.b.useSkill();f.r.step();
  const active=structuredClone(f.state().active);
  expect(f.state().queue).toEqual([211]);expect(f.state().charges).toBe(0);
  expect(f.b.growthChoice('player',f.p.progression.offer!.batch,'as_EV_A')).toBe(true);
  expect(f.state().active).toEqual(active);expect(f.state().charges).toBe(0);
  expect(f.state().queue).toEqual([211,571]);
  f.b.damage(f.b.player,9999);expect(f.state().queue).toEqual([211,571]);
  const restored=Battle.restore(f.b.checkpoint());
  const step=()=>{f.b.tickPlayers(new Map());restored.tickPlayers(new Map());};
  while(f.b.frame<151)step();expect(f.b.player.life.alive).toBe(true);
  expect(f.state().charges).toBe(0);expect(f.state().queue).toEqual([211,571]);
  while(f.b.frame<210)step();expect(f.state().charges).toBe(0);
  step();expect(f.state().charges).toBe(1);expect(f.state().queue).toEqual([571]);
  while(f.b.frame<570)step();expect(f.state().charges).toBe(1);
  step();expect(f.state().charges).toBe(2);expect(f.state().queue).toEqual([]);
  expect(restored.growthV3!.abilities.actorState('player')).toEqual(f.state());
});

it.each([[false,0,6],[false,60,12],[true,0,12]] as const)('tk_EV_B counter preparation is conditional and single-use (cancel=%s wait=%s)',(cancel,wait,prepare)=>{
  const f=fixture('tk_EV_B');f.b.useSkill();for(let i=0;i<4;i++)f.r.step();if(cancel)f.b.useSkill();
  for(let i=0;i<75+wait;i++)f.r.step();expect(f.state().active).toBeNull();
  f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();f.b.swap();f.r.step();
  expect(f.gun.readyTick-f.b.frame).toBe(prepare);
  for(let i=0;i<prepare;i++)f.r.step();f.b.swap();f.r.step();for(let i=0;i<6;i++)f.r.step();
  f.b.swap();f.r.step();expect(f.gun.readyTick-f.b.frame).toBe(12);
});

function offset(r:GrowthRangeSession){
  const effect=r.battle.effects.find(e=>e.frame===r.battle.frame&&e.actorId==='player');expect(effect).toBeDefined();
  const {origin,end}=effect!.trace,aim=r.battle.player.aim;
  return Math.atan2(end.y-origin.y,end.x-origin.x)-Math.atan2(aim.y-origin.y,aim.x-origin.x);
}

it.each([false,true])('sn_EV_A changes actual focus spread only while stationary (moving=%s)',moving=>{
  const f=fixture('sn_EV_A'),z=fixture('sn_EV_A',false);f.b.useSkill();z.b.useSkill();
  for(let i=0;i<4;i++){f.r.step({right:moving});z.r.step({right:moving});}
  f.r.step({fire:true,right:moving});z.r.step({fire:true,right:moving});
  expect(Math.abs(offset(z.r))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(z.r)).toBeCloseTo(moving?1:.25/.35,7);
  expect(f.state().queue).toEqual([304]);
});

it.each([false,true])('sn_EV_B preserves fifteen tick fire lock and only improves moving shots (moving=%s)',moving=>{
  const f=fixture('sn_EV_B'),z=fixture('sn_EV_B',false);f.b.useSkill();z.b.useSkill();
  for(let i=1;i<=15;i++){const input={right:moving,fire:i%2===0};f.r.step(input);z.r.step(input);expect(f.r.shots).toBe(0);}
  f.r.step({right:moving,fire:true});z.r.step({right:moving,fire:true});expect(f.r.shots).toBe(1);
  expect(Math.abs(offset(z.r))).toBeGreaterThan(.000001);expect(offset(f.r)/offset(z.r)).toBeCloseTo(moving?.7:1,7);
  expect(f.state().queue).toEqual([421]);expect(z.state().queue).toEqual([391]);
});

it('as_EV_B real rush transfers eight reserve rounds and retains twenty-four tick duration and 390tick CD',()=>{
  const f=fixture('as_EV_B');for(let i=0;i<37;i++)f.r.step({fire:true,aim:{x:20,y:100}});
  for(let i=0;i<4;i++)f.r.step();expect(f.gun.current.ammo).toBe(20);
  const total=f.gun.current.ammo+f.gun.current.reserve,start=f.b.frame+4;
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(f.gun.current.ammo).toBe(28);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(f.state().active).toMatchObject({startTick:start,endTick:start+24});expect(f.state().queue).toEqual([start+390]);
});

it('selecting rush evolution during an active cast preserves that cast and applies only on the next activation',()=>{
  const f=fixture('as_EV_B',false);
  for(let i=0;i<37;i++)f.r.step({fire:true,aim:{x:20,y:100}});
  for(let i=0;i<4;i++)f.r.step();expect(f.gun.current.ammo).toBe(20);
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(f.gun.current.ammo).toBe(26);
  const active=structuredClone(f.state().active),queue=[...f.state().queue];
  expect(f.b.growthChoice('player',f.p.progression.offer!.batch,'as_EV_B')).toBe(true);
  expect(f.state().active).toEqual(active);expect(f.state().queue).toEqual(queue);
  expect(f.gun.current.ammo).toBe(26);
  while(f.b.frame<queue[0])f.r.step();
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(f.state().active!.definition.transfer).toBe(8);
  expect(f.state().queue).toEqual([f.state().active!.startTick+390]);
  expect(f.gun.current.ammo).toBe(30); // Only four missing rounds can be transferred.
});

it.each(['tk_EV_A','tk_EV_B','sn_EV_A','sn_EV_B','md_EV_A','md_EV_B'] as const)('%s selected during E preserves current cast and enters the next cast snapshot',id=>{
  const f=fixture(id,false);
  if(id.startsWith('md'))f.b.damage(f.b.player,50,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<8;i++)f.r.step();
  expect(f.state().active).not.toBeNull();
  const active=structuredClone(f.state().active),queue=[...f.state().queue];
  expect(f.b.growthChoice('player',f.p.progression.offer!.batch,id)).toBe(true);
  expect(f.state().active).toEqual(active);expect(f.state().queue).toEqual(queue);
  expect(f.state().active!.selected).not.toContain(id);
  while(f.b.frame<queue[0])f.r.step();
  if(id.startsWith('md'))f.b.damage(f.b.player,20,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<8;i++)f.r.step();
  expect(f.state().active).not.toBeNull();expect(f.state().active!.selected).toContain(id);
});

it('tk_EV_A actual moving barrier trades reduction for mobility and retains absorbed-damage cooldown refund',()=>{
  const f=fixture('tk_EV_A');f.b.useSkill();for(let i=0;i<4;i++)f.r.step({right:true});
  expect(f.b.player.movement.speedScale).toBe(.9);expect(f.state().queue).toEqual([394]);
  f.b.damage(f.b.player,10,f.b.actors[1]);expect(f.b.player.life.health).toBe(108);expect(f.state().queue).toEqual([364]);
});

it('md_EV_A actual teammate pulse adds ten armor for sixty ticks and starts recipient cooldown',()=>{
  const f=fixture('md_EV_A'),target=f.b.actors[1];target.team=1;target.movement.reset(220,499.5);target.life.health=50;
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  const targetState=f.b.growthV3!.participant(target.id);
  expect(target.life.health).toBe(65);expect(targetState.armor.remaining).toBe(10000);expect(targetState.cooldowns.pulseArmor).toBe(304);
  expect(f.p.armor.remaining).toBe(0);for(let i=0;i<59;i++)f.r.step();expect(targetState.armor.remaining).toBe(10000);
  f.r.step();expect(targetState.armor.remaining).toBe(0);
});

it.each([false,true])('md_EV_B actual chain with B3 only grants armor after successful full duration (cancel=%s)',cancel=>{
  const f=fixture('md_EV_B');f.b.damage(f.b.player,50,f.b.actors[1]);f.b.useSkill();
  for(let i=0;i<17;i++)f.r.step();expect(f.b.player.life.health).toBe(47);if(cancel)f.b.useSkill();
  for(let i=0;i<50;i++)f.r.step();expect(f.p.armor.remaining).toBe(cancel?0:10000);
  expect(f.b.player.life.health).toBe(cancel?47:57);expect(f.state().active).toBeNull();
  if(!cancel){for(let i=0;i<89;i++)f.r.step();expect(f.p.armor.remaining).toBe(10000);f.r.step();expect(f.p.armor.remaining).toBe(0);}
});
