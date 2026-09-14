import { expect,it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { observeGrowthCastRequests } from '../../tools/qa/growth-cast-observer';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

it('records protected rejection context separately from authoritative error reasons without changing state',()=>{
  const room=new Room('protected-observer','signal','tdm',false,'growth');
  room.join('client','Tank',undefined,defaultGrowthLoadoutV3('tank'));room.ready('client',true);room.start('client',72);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;});
  a.life.spawnProtectionFrames=75;
  const observer=observeGrowthCastRequests(b),before=r.abilities.checkpoint();
  expect(r.abilities.use(a.id,{x:500,y:500},0)).toBe(false);
  expect(r.gadgets.use(a.id,{x:500,y:500},0)).toBe(false);
  expect(r.abilities.checkpoint()).toEqual(before);
  for(const c of Object.values(observer.report()[a.id]))expect(c).toMatchObject({rejected:1,rejectedWhileProtected:1,rejectionReasons:{busy:1}});
  a.life.spawnProtectionFrames=0;
  expect(r.abilities.use(a.id,{x:NaN,y:500},0)).toBe(false);
  expect(observer.report()[a.id].E).toMatchObject({rejected:2,rejectedWhileProtected:1,rejectionReasons:{busy:1,invalid_target:1}});
  observer.detach();
});

it('attributes synchronous rejection reasons to E and G separately without recording unrelated errors',()=>{
  const room=new Room('reason-observer','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,defaultGrowthLoadoutV3('medic'));room.ready('client',true);room.start('client',71);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  const observer=observeGrowthCastRequests(b);
  expect(r.abilities.use(a.id,{x:500,y:500},0)).toBe(false);
  expect(r.gadgets.use(a.id,{x:NaN,y:500},0)).toBe(false);
  b.journal.emit({tick:0,kind:'error',actorId:a.id,cause:'busy'});
  const report=observer.report()[a.id];
  expect(report.E.rejectionReasons).toEqual({no_effect:1});
  expect(report.G.rejectionReasons).toEqual({invalid_target:1});
  report.E.rejectionReasons.no_effect=99;
  expect(observer.report()[a.id].E.rejectionReasons.no_effect).toBe(1);
  for(const counter of Object.values(observer.report()[a.id]))expect(Object.values(counter.rejectionReasons).reduce((a,b)=>a+b,0)).toBe(counter.rejected);
  observer.detach();
});

it('preserves depletion at a commit tick even when a legal G1 choice refills the same tick',()=>{
  const build=defaultGrowthLoadoutV3('tank');build.pool=['tk_G1' as const,...build.pool.filter(id=>id!=='tk_G1')].slice(0,8);
  const room=new Room('charge-ledger','signal','tdm',false,'growth');
  room.join('client','Tank',undefined,build);room.ready('client',true);room.start('client',77);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.movement.reset(480,599.5);const observer=observeGrowthCastRequests(b);
  expect(r.gadgets.use(a.id,{x:520,y:599.5},0)).toBe(true);
  for(let i=0;i<12;i++)b.tickPlayers(new Map());
  expect(r.gadgets.inventory(a.id).charges).toBe(0);
  const p=r.participant(a.id);awardGrowthV3(p.progression,p.loadout,200,b.frame,()=>0);
  expect(p.progression.offer!.cards).toContain('tk_G1');
  expect(r.choice(a.id,p.progression.offer!.batch,'tk_G1')).toBe(true);
  expect(b.frame).toBe(12);expect(r.gadgets.inventory(a.id).charges).toBe(1);
  const first=observer.report()[a.id].G;
  expect(first).toMatchObject({spentCharges:1,exhaustionTicks:[12]});
  first.exhaustionTicks.push(999);expect(observer.report()[a.id].G.exhaustionTicks).toEqual([12]);
  while(b.frame<372)b.tickPlayers(new Map());
  expect(r.gadgets.use(a.id,{x:520,y:599.5},b.frame)).toBe(true);
  for(let i=0;i<12;i++)b.tickPlayers(new Map());
  expect(observer.report()[a.id].G).toMatchObject({spentCharges:2,exhaustionTicks:[12,384]});observer.detach();
});

it('partitions queued E/G requests including coalescing, arbitration and a dead owner',()=>{
  const room=new Room('queue-observer','signal','tdm',false,'growth');
  room.join('client','Tank',undefined,defaultGrowthLoadoutV3('tank'));room.ready('client',true);room.start('client',76);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.movement.reset(480,599.5);const observer=observeGrowthCastRequests(b);
  expect(r.enqueue(a.id,'skill')).toBe(true);expect(r.enqueue(a.id,'skill')).toBe(true);
  expect(r.enqueue(a.id,'item',{x:520,y:599.5})).toBe(true);
  b.tickPlayers(new Map());
  expect(observer.report()[a.id].E).toMatchObject({submitted:2,coalesced:1,queued:1,evaluatedFromQueue:1,queuedPending:0});
  expect(observer.report()[a.id].G).toMatchObject({submitted:1,queued:1,attempts:0,arbitrationSkipped:1});
  expect(r.enqueue(a.id,'item',{x:NaN,y:0})).toBe(false);
  expect(r.enqueue(a.id,'item',{x:520,y:599.5})).toBe(true);
  b.damage(a,9999);b.tickPlayers(new Map());
  expect(observer.report()[a.id].G).toMatchObject({submitted:3,enqueueRejected:1,queued:2,ownerUnavailable:1,queuedPending:0});
  observer.detach();
});

it('separates rejected requests, accepted windups and explicit cancels without changing simulation',()=>{
  const room=new Room('cast-observer','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,defaultGrowthLoadoutV3('medic'));
  room.ready('client',true);room.start('client',71);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.movement.reset(480,599.5);
  const checkpoint=b.checkpoint(),observer=observeGrowthCastRequests(b);
  expect(b.checkpoint()).toEqual(checkpoint);
  expect(r.abilities.use(a.id,{x:480,y:566.5},b.frame)).toBe(false);
  a.life.health-=30;
  expect(r.abilities.use(a.id,{x:480,y:566.5},b.frame)).toBe(true);
  // Accepted windup is not a committed skill; there is no active effect yet.
  expect(r.abilities.actorState(a.id).active).toBeNull();
  for(let i=0;i<3;i++)b.tickPlayers(new Map());
  expect(r.abilities.actorState(a.id).active).not.toBeNull();
  expect(r.abilities.use(a.id,{x:480,y:566.5},b.frame)).toBe(true);
  expect(r.gadgets.use(a.id,{x:-1,y:0},b.frame)).toBe(false);
  expect(r.gadgets.use(a.id,{x:480,y:100},b.frame)).toBe(true);
  const report=observer.report()[a.id];
  expect(report.E).toMatchObject({attempts:3,rejected:1,acceptedCasts:1,acceptedCancel:1,invalidRequestRate:1/3});
  expect(report.E).toMatchObject({committed:1,pendingCasts:0,activeEndReasons:{cancelled:1},activeCancelRate:1});
  expect(report.G).toMatchObject({committed:0,pendingCasts:1});
  expect(report.G).toMatchObject({attempts:2,rejected:1,acceptedCasts:1,acceptedDetonation:0,invalidRequestRate:.5});
  b.tickPlayers(new Map());
  const beforeReport=b.checkpoint();observer.report();observer.detach();
  expect(b.checkpoint()).toEqual(beforeReport);
});

it.each(['revalidation','death'] as const)('records E windup %s once, without treating it as a successful effect',reason=>{
  const room=new Room('cast-terminal','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,defaultGrowthLoadoutV3('medic'));room.ready('client',true);room.start('client',73);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.life.health-=30;const observer=observeGrowthCastRequests(b);
  expect(r.abilities.use(a.id,a.aim,b.frame)).toBe(true);
  if(reason==='death')b.damage(a,9999);else a.life.health=a.life.maxHealth;
  for(let i=0;i<5;i++)b.tickPlayers(new Map());
  expect(observer.report()[a.id].E).toMatchObject({acceptedCasts:1,committed:0,pendingCasts:0,
    revalidationFailed:reason==='revalidation'?1:0,deathInterrupted:reason==='death'?1:0,precommitFailureRate:1});
  observer.detach();
});

it.each(['damage','cancel','death'] as const)('records G windup %s without spending or double-counting it',reason=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';
  const room=new Room('gadget-terminal','signal','tdm',false,'growth');
  room.join('client','Tank',undefined,build);room.ready('client',true);room.start('client',74);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  const observer=observeGrowthCastRequests(b);
  expect(r.gadgets.use(a.id,{x:a.movement.x,y:a.movement.y-33},b.frame)).toBe(true);
  if(reason==='death')b.damage(a,9999);
  else if(reason==='damage')b.damage(a,1,b.actors.find(other=>other.team!==a.team)!);
  else r.gadgets.cancelCast(a.id);
  for(let i=0;i<35;i++)b.tickPlayers(new Map());
  expect(observer.report()[a.id].G).toMatchObject({acceptedCasts:1,committed:0,pendingCasts:0,
    damageInterrupted:reason==='damage'?1:0,cancelledBeforeCommit:reason==='cancel'?1:0,
    deathInterrupted:reason==='death'?1:0,precommitFailureRate:1});
  expect(r.gadgets.inventory(a.id).charges).toBe(2);observer.detach();
});

it('counts zero-stock C4 detonation as an entity action rather than a second cast',()=>{
  const build=defaultGrowthLoadoutV3('assault');build.gadgetId='as_charge';
  const room=new Room('cast-observer-charge','signal','tdm',false,'growth');
  room.join('client','Assault',undefined,build);room.ready('client',true);room.start('client',72);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.movement.reset(480,599.5);
  const observer=observeGrowthCastRequests(b);
  expect(r.gadgets.use(a.id,{x:520,y:599.5},b.frame)).toBe(true);
  for(let i=0;i<42;i++)b.tickPlayers(new Map());
  expect(r.gadgets.inventory(a.id).charges).toBe(0);
  expect(r.gadgets.use(a.id,{x:520,y:599.5},b.frame)).toBe(true);
  expect(observer.report()[a.id].G).toMatchObject({attempts:2,rejected:0,acceptedCasts:1,acceptedDetonation:1,committed:1,pendingCasts:0});
  expect(observer.report()[a.id].E.invalidRequestRate).toBeNull();
  observer.detach();
});

it.each([false,true])('records deployment commit with moved-away=%s using actual consumption',movedAway=>{
  const room=new Room('deploy-terminal','signal','tdm',false,'growth');
  room.join('client','Tank',undefined,defaultGrowthLoadoutV3('tank'));room.ready('client',true);room.start('client',75);
  const b=room.session!.battle,r=b.growthV3!,a=b.player;
  b.actors.forEach(actor=>{actor.human=true;actor.life.spawnProtectionFrames=0;});
  a.movement.reset(480,599.5);const observer=observeGrowthCastRequests(b);
  expect(r.gadgets.use(a.id,{x:520,y:599.5},b.frame)).toBe(true);
  if(movedAway)a.movement.reset(800,599.5);
  for(let i=0;i<13;i++)b.tickPlayers(new Map());
  expect(observer.report()[a.id].G).toMatchObject({acceptedCasts:1,committed:movedAway?0:1,
    revalidationFailed:movedAway?1:0,pendingCasts:0});
  expect(r.gadgets.inventory(a.id).charges).toBe(movedAway?1:0);observer.detach();
});
