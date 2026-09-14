import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { Battle, idleInput } from '../../src/game/campaign/Battle';

it('journals exact ability start/end once and preserves event IDs across a restored active cast',()=>{
  const r=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:300,health:100,armor:0}),b=r.battle;
  b.useSkill();r.step();const restored=Battle.restore(b.checkpoint());
  for(let i=0;i<12;i++){b.tickPlayers(new Map());restored.tickPlayers(new Map());}
  expect(restored.checkpoint()).toEqual(b.checkpoint());
  const events=b.journal.since(0);
  expect(events.filter(e=>e.kind==='abilityStart')).toEqual([expect.objectContaining({tick:1,ability:'as_roll',duration:12})]);
  expect(events.filter(e=>e.kind==='abilityEnd')).toEqual([expect.objectContaining({tick:13,ability:'as_roll',cause:'expired'})]);
  expect(new Set(events.map(e=>e.id)).size).toBe(events.length);
  expect(b.journal.since(events.at(-1)!.id)).toEqual([]);
});

it('real smoke has released, started and expired events with a stable entity and frozen location',()=>{
  const r=new GrowthRangeSession(defaultGrowthLoadoutV3('medic'),{distance:300,health:100,armor:0}),b=r.battle;
  b.useItem({x:120,y:499});for(let i=0;i<31;i++)r.step();
  const started=b.journal.since(0).find(e=>e.kind==='smokeStarted')!;
  expect(started).toMatchObject({tick:31,ability:'md_smoke',duration:150});
  expect(r.presentation().events.some(e=>e.kind==='smokeStarted')).toBe(true);
  for(let i=0;i<150;i++)r.step();
  const events=b.journal.since(0);
  expect(events.filter(e=>e.kind==='gadgetReleased')).toHaveLength(1);
  expect(events.filter(e=>e.kind==='smokeEnded')).toEqual([expect.objectContaining({tick:181,entityId:started.entityId,position:started.position})]);
});

it('real bullets produce one damage event per cover hit and one final destruction event',()=>{
  const r=new GrowthRangeSession(defaultGrowthLoadoutV3('tank'),{distance:180,health:100,armor:0}),b=r.battle;
  b.player.movement.reset(400,499.5);b.actors[1].movement.reset(600,499.5);
  b.useItem({x:440,y:499.5});for(let i=0;i<13;i++)r.step();
  const created=b.journal.since(0).find(e=>e.kind==='deployableCreated')!;
  expect(created.ability).toBe('tk_cover');
  for(let i=0;i<100&&b.growthV3!.gadgets.entities().length;i++)
    b.tickPlayers(new Map([['enemy-0',{...idleInput(),fire:true,aim:{x:440,y:470}}]]));
  const damaged=b.journal.since(0).filter(e=>e.kind==='deployableDamaged');
  expect(damaged.length).toBeGreaterThan(0);expect(damaged.reduce((sum,e)=>sum+e.amount!,0)).toBe(120);
  expect(damaged.every(e=>e.entityId===created.entityId)).toBe(true);
  expect(b.journal.since(0).filter(e=>e.kind==='deployableDestroyed')).toEqual([expect.objectContaining({entityId:created.entityId})]);
});

it('six actual self heals journal restored HP, and armor journals grant, depletion and expiry',()=>{
  const r=new GrowthRangeSession(changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link'),{distance:300,health:100,armor:0});
  r.battle.player.life.health=40;r.battle.useSkill();for(let i=0;i<97;i++)r.step();
  const heals=r.battle.journal.since(0).filter(e=>e.kind==='heal');
  expect(heals).toHaveLength(6);expect(heals.every(e=>e.amount===3&&e.ability==='md_link'&&e.targetId==='player')).toBe(true);
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';
  const t=new GrowthRangeSession(build,{distance:300,health:100,armor:0}),b=t.battle;
  b.useItem(t.aim);for(let i=0;i<31;i++)t.step();b.damage(b.player,10,b.actors[1]);
  for(let i=0;i<120;i++)t.step();
  expect(b.journal.since(0).filter(e=>e.kind==='armorChanged').map(e=>[e.cause,e.amount,e.duration])).toEqual([
    ['granted',15,120],['damage',5,120],['expired',0,0],
  ]);
});
