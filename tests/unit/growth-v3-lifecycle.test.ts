import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_GADGETS } from '../../src/shared/content/growth-v3/Gadgets';
import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import { idleInput } from '../../src/game/campaign/Battle';
import {  changeGrowthAbility, type GrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import type { GrowthAbilityId } from '../../src/shared/content/growth-v3/Operators';
import type { GrowthGadgetId } from '../../src/shared/content/growth-v3/Gadgets';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import type { PlayerAction } from '../../src/shared/protocol/Commands';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

it.each([[450,20],[800,22]] as const)('actual healing catch-up at teammate XP %i awards %i but spends 20 base budget',(allyXp,expected)=>{
  const f=fixture(defaultGrowthLoadoutV3('medic'),true),g=f.b.growthV3!;
  const ally=f.b.actors.find(a=>a.id!==f.b.player.id&&a.team===f.b.player.team)!;
  const enemy=f.b.actors.find(a=>a.team!==f.b.player.team)!;
  for(const [actor,xp] of [[ally,allyXp],[enemy,800]] as const){
    const p=g.participant(actor.id);awardGrowthV3(p.progression,p.loadout,xp,0,()=>0);
  }
  // Levels 1/3/4 average 2.667; levels 1/4/4 average exactly 3.
  ally.movement.reset(530,599.5);f.b.damage(ally,40,enemy);
  f.send('skill');f.step(3);
  const source=g.participant('player'),target=g.participant(ally.id);
  expect(source.progression.xp).toBe(expected);
  expect(source.contributions).toMatchObject({healing:20,support:20});
  expect(target.contributions.targetHealing).toBe(20);
});

// Independent specification baselines: id, class, cast, duration, cooldown, cancellable.
it('actual pulse credit survives recipient and healer death, reconnect and checkpoint recovery',()=>{
  const f=fixture(defaultGrowthLoadoutV3('medic'),true),g=f.b.growthV3!;
  const ally=f.b.actors.find(a=>a.id!==f.b.player.id&&a.team===f.b.player.team)!;
  const enemy=f.b.actors.find(a=>a.team!==f.b.player.team)!;
  expect(ally).toBeDefined();expect(enemy).toBeDefined();
  ally.movement.reset(530,599.5);ally.life.spawnProtectionFrames=0;
  f.b.damage(ally,40,enemy);
  f.send('skill');f.step(3);
  const source=g.participant('player'),target=g.participant(ally.id);
  expect(source.contributions.healing).toBe(20);
  expect(source.contributions.support).toBe(20);
  expect(target.contributions.targetHealing).toBe(20);
  expect(target.contributions.healingRemainders.player).toBe(0);
  f.b.damage(ally,9999);f.b.damage(f.b.player,9999);
  expect(ally.life.alive).toBe(false);expect(f.b.player.life.alive).toBe(false);
  f.room.disconnect('owner');f.room.reconnect('owner');
  const restored=MatchSession.restore(f.room.session!.checkpoint());
  f.step(150);for(let i=0;i<150;i++)restored.tick();
  expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());
  expect(ally.life.alive).toBe(true);expect(f.b.player.life.alive).toBe(true);
  expect(source.contributions).toMatchObject({healing:20,support:20,healable:0});
  expect(target.contributions).toMatchObject({targetHealing:20,healable:0});
  f.room.disconnect('teammate');f.room.reconnect('teammate');
  expect(target.contributions.targetHealing).toBe(20);
});

const abilities: [GrowthAbilityId,GrowthClassId,number,number,number,boolean][] = [
  ['as_roll','assault',0,12,240,false],['as_reloadrush','assault',3,18,330,false],
  ['tk_barrier','tank',3,90,360,true],['tk_shield','tank',6,90,420,true],
  ['sn_focus','sniper',3,90,360,true],['sn_relocate','sniper',0,45,360,true],
  ['md_pulse','medic',3,60,420,true],['md_link','medic',6,90,420,true],
];
// id, class, cast, initial inventory, deployment (versus throw/self).
const gadgets: [GrowthGadgetId,GrowthClassId,number,number,boolean][] = [
  ['as_frag','assault',6,2,false],['as_concussion','assault',6,2,false],['as_charge','assault',12,1,true],
  ['tk_cover','tank',12,1,true],['tk_interceptor','tank',12,1,true],['tk_plate','tank',30,2,false],
  ['sn_beacon','sniper',12,1,true],['sn_emp','sniper',6,2,false],['sn_decoy','sniper',6,2,false],
  ['md_smoke','medic',6,2,false],['md_station','medic',12,1,true],['md_ammo','medic',12,1,true],
];
function fixture(build:GrowthLoadoutV3,withSurvivor=false) {
  const room=new Room('lifecycle','signal','tdm',false,'growth');room.join('owner','Owner',undefined,build);
  if(withSurvivor)for(const id of ['survivor','teammate']){room.join(id,id,undefined,defaultGrowthLoadoutV3('assault'));room.ready(id,true);}
  room.ready('owner',true);room.start('owner',77);
  const b=room.session!.battle;
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?1500:480,599.5);});
  b.player.life.health=40;
  let sequence=0;
  return {room,b,step:(n=1)=>{for(let i=0;i<n;i++)room.session!.tick();},
    fire:()=>{
      expect(room.command('owner',{sequence:sequence++,input:{...idleInput(),fire:true,aim:{x:800,y:400}},actions:[]})).toBe(true);
      room.session!.tick();
    },
    send:(action:PlayerAction,deploy=false)=>{
      expect(room.command('owner',{sequence:sequence++,input:{...idleInput(),aim:deploy?{x:520,y:599.5}:{x:800,y:567}},actions:[action]})).toBe(true);
      room.session!.tick();
    }};
}

it.each(['tk_shield','md_link'] as const)('%s natural expiry enforces six recovery ticks before actual gunfire',id=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3(id==='tk_shield'?'tank':'medic'),id);build.primary='mp5';
  const f=fixture(build),gun=f.b.growthV3!.weapons.get('player')!;
  f.send('skill');f.step(6);const end=f.b.growthV3!.abilities.actorState('player').active!.endTick;
  while(f.b.frame<end+5){f.fire();expect(gun.current.ammo).toBe(30);}
  f.fire();expect(f.b.frame).toBe(end+6);expect(gun.current.ammo).toBe(29);
});

it.each(['tk_shield','md_link'] as const)('%s cancellation enforces six recovery ticks without refunding cooldown',id=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3(id==='tk_shield'?'tank':'medic'),id);build.primary='mp5';
  const f=fixture(build),gun=f.b.growthV3!.weapons.get('player')!;
  f.send('skill');f.step(6);f.send('skill');const stopped=f.b.frame;
  expect(f.b.growthV3!.abilities.actorState('player')).toMatchObject({active:null,queue:[427]});
  for(let i=0;i<5;i++){f.fire();expect(gun.current.ammo).toBe(30);}
  f.fire();expect(f.b.frame).toBe(stopped+6);expect(gun.current.ammo).toBe(29);
});

it.each([false,true])('relocate forbids gunfire through elapsed tick 14 even after swap (swap=%s)',swap=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('sniper'),'sn_relocate');build.primary='mp5';
  const f=fixture(build),gun=f.b.growthV3!.weapons.get('player')!;
  f.send('skill');
  if(swap)f.send('swap');
  const ammo=gun.current.ammo;
  while(f.b.frame<15){f.fire();expect(gun.current.ammo).toBe(ammo);}
  // Switching back at tick16 adds MP5's six-tick preparation after E unlocks.
  if(swap){f.send('swap');while(f.b.frame<21){f.fire();expect(gun.current.ammo).toBe(30);}f.fire();expect(f.b.frame).toBe(22);expect(gun.current.ammo).toBe(29);}
  else {f.fire();expect(f.b.frame).toBe(16);expect(gun.current.ammo).toBe(29);}
});

it.each(abilities)('%s commits, expires and recharges on specification ticks through checkpoint and reconnect', (id,cls,cast,duration,cd)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));f.send('skill');
  const state=()=>f.b.growthV3!.abilities.actorState('player');
  f.room.disconnect('owner');f.room.reconnect('owner');
  if(cast){expect(state().pending).not.toBeNull();expect(state().charges).toBe(1);f.step(cast-1);expect(state().active).toBeNull();}
  const restored=MatchSession.restore(f.room.session!.checkpoint());
  if(cast){f.step();restored.tick();}
  expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());
  expect(state().active).toMatchObject({startTick:1+cast,endTick:1+cast+duration});
  expect(state().charges).toBe(0);expect(state().queue).toEqual([1+cast+cd]);
  f.room.disconnect('owner');f.room.reconnect('owner');
  expect(state().charges).toBe(0);expect(state().active).not.toBeNull();
  f.step(duration-1);expect(state().active).not.toBeNull();f.step();expect(state().active).toBeNull();
  f.step(1+cast+cd-1-f.b.frame);expect(state().charges).toBe(0);
  f.step();expect(state().charges).toBe(1);expect(state().queue).toEqual([]);
});

it.each(abilities)('%s respects active cancellation and keeps committed cooldown after death and respawn', (id,cls,cast,_duration,cd,cancellable)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));f.send('skill');f.step(cast);
  f.send('skill');expect(!!f.b.growthV3!.abilities.actorState('player').active).toBe(!cancellable);
  expect(f.b.growthV3!.abilities.actorState('player').queue).toEqual([1+cast+cd]);
  f.b.damage(f.b.player,9999);expect(f.b.player.life.alive).toBe(false);
  expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
  f.send('skill');expect(f.b.growthV3!.abilities.actorState('player').charges).toBe(0);
  f.step(148);expect(f.b.player.life.alive).toBe(false);f.step();expect(f.b.player.life.alive).toBe(true);
  expect(f.b.growthV3!.abilities.actorState('player').queue).toEqual([1+cast+cd]);
});

it.each(abilities.filter(row=>row[2]>0))('%s does not spend a charge when killed in its cast', (id,cls,cast)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));f.send('skill');
  expect(f.b.growthV3!.abilities.actorState('player').pending).not.toBeNull();
  f.step(cast-1); // Last tick before the commit boundary.
  f.b.damage(f.b.player,9999);f.step(cast);
  expect(f.b.growthV3!.abilities.actorState('player')).toMatchObject({pending:null,active:null,charges:1,queue:[]});
});

it.each(abilities)('%s applies its active reload permission through the authoritative command path',(id,cls,cast)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));
  const gun=f.b.growthV3!.weapons.get('player')!;
  gun.current.ammo=0;
  f.send('skill');f.step(cast);const before=gun.current.ammo;
  f.send('reload');
  // Full-rush already filled the magazine; reload has no work to do.
  const locked=id==='tk_shield'||id==='md_link'||id==='as_reloadrush';
  expect(gun.current.reloadUntil>f.b.frame).toBe(!locked);
  expect(gun.current.ammo).toBe(before);
  expect(f.b.growthV3!.abilities.actorState('player').active).not.toBeNull();
});

it.each(abilities)('%s enforces active G permissions and commits exactly one item once permitted',(id,cls,cast,duration)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));
  const g=f.b.growthV3!.gadgets,initial=g.inventory('player').charges;
  const deploy=cls==='tank'||cls==='sniper',gCast=deploy?12:6;
  f.send('skill');f.step(cast);
  const lock=['as_roll','as_reloadrush','tk_shield','md_link'].includes(id)?duration:id==='sn_relocate'?15:0;
  const unlock=1+cast+lock;
  if(lock){
    while(f.b.frame<unlock-1){f.send('item',deploy);expect(g.inventory('player').cast).toBeNull();expect(g.inventory('player').charges).toBe(initial);}
  }
  f.send('item',deploy);expect(g.inventory('player').cast).not.toBeNull();
  expect(g.inventory('player').charges).toBe(initial);
  f.step(gCast);expect(g.inventory('player').charges).toBe(initial-1);
});

it.each(abilities.filter(row=>row[2]>0))('%s windup rejects G without starting a gadget cast',(id,cls)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id)),g=f.b.growthV3!.gadgets;
  const initial=g.inventory('player').charges;
  f.send('skill');f.send('item',cls==='tank'||cls==='sniper');
  expect(f.b.growthV3!.abilities.actorState('player').pending).not.toBeNull();
  expect(g.inventory('player')).toMatchObject({cast:null,charges:initial});
});

it.each(abilities)('%s applies its active swap permission through the authoritative command path',(id,cls,cast)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));
  f.send('skill');f.step(cast);f.send('swap');
  const locked=['as_roll','as_reloadrush','tk_shield','md_link'].includes(id);
  expect(f.b.growthV3!.weapons.get('player')!.selectedSlot).toBe(locked?'primary':'secondary');
  expect(f.b.growthV3!.abilities.actorState('player').active).not.toBeNull();
});

it.each(abilities.filter(row=>row[2]>0))('%s interrupts an existing reload and rejects reload/swap during windup',(id,cls)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));
  const gun=f.b.growthV3!.weapons.get('player')!;gun.current.ammo=0;
  f.send('reload');expect(gun.current.reloadUntil).toBeGreaterThan(f.b.frame);
  const reserve=gun.current.reserve;
  f.send('skill');expect(gun.current.reloadUntil).toBe(0);
  f.send('reload');f.send('swap');
  expect(gun.current.reloadUntil).toBe(0);expect(gun.selectedSlot).toBe('primary');
  expect(gun.current.ammo).toBe(0);expect(gun.current.reserve).toBe(reserve);
});

it.each(gadgets)('%s commits inventory only at the boundary and survives owner death/reconnect without refund', (id,cls,cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);
  f.send('item',deploy);expect(f.b.player.itemCharges).toBe(charges);expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  f.room.disconnect('owner');f.room.reconnect('owner');
  f.step(cast-1);expect(f.b.player.itemCharges).toBe(charges);
  const restored=MatchSession.restore(f.room.session!.checkpoint());f.step();restored.tick();
  expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());
  expect(f.b.player.itemCharges).toBe(charges-1);
  const g=f.b.growthV3!.gadgets;
  if(deploy)expect(g.entities()).toHaveLength(1);
  else if(id!=='tk_plate')expect(g.flying()).toHaveLength(1);
  else expect(f.b.growthV3!.participant('player').armor.remaining).toBe(15000);
  f.room.disconnect('owner');f.room.reconnect('owner');expect(f.b.player.itemCharges).toBe(charges-1);
  f.b.damage(f.b.player,9999);
  if(deploy)expect(g.entities()).toHaveLength(1);else if(id!=='tk_plate')expect(g.flying()).toHaveLength(1);
  f.step(150);expect(f.b.player.life.alive).toBe(true);expect(f.b.player.itemCharges).toBe(charges-1);
});

it.each(gadgets)('%s does not consume inventory on death during cast', (id,cls,cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);
  f.send('item',deploy);expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();f.step(cast-1);f.b.damage(f.b.player,9999);f.step(cast);
  const g=f.b.growthV3!.gadgets;
  expect(g.inventory('player').cast).toBeNull();expect(f.b.player.itemCharges).toBe(charges);
  expect(g.entities()).toEqual([]);expect(g.flying()).toEqual([]);expect(g.smoke()).toEqual([]);
});

it.each(gadgets.filter(row=>row[4]||row[0]==='sn_decoy'))('%s survives temporary disconnect but is cleaned when the seat expires',(id,cls,cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;
  const f=fixture(build,true);f.send('item',deploy);f.step(cast+(id==='sn_decoy'?15:0));
  const g=f.b.growthV3!.gadgets;
  expect(g.entities()).toHaveLength(1);
  f.room.disconnect('owner');expect(g.entities()).toHaveLength(1);
  f.room.expire('owner');
  expect(g.entities()).toHaveLength(0);expect(g.inventory('player').charges).toBe(charges-1);
  expect(f.b.growthV3!.participant('player').retired).toBe(true);
  expect(f.room.players.has('owner')).toBe(false);
  const restored=MatchSession.restore(f.room.session!.checkpoint()),frame=f.b.frame;
  f.step(151);for(let i=0;i<151;i++)restored.tick();
  expect(f.b.frame).toBe(frame+151);
  expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());
  expect(f.b.player.life.alive).toBe(false);expect(g.entities()).toHaveLength(0);
});

it.each(gadgets)('%s uncommitted cast is cancelled without consumption when the seat expires',(id,cls,_cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;
  const f=fixture(build,true);f.send('item',deploy);
  expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  f.room.disconnect('owner');f.room.expire('owner');f.step(35);
  expect(f.b.frame).toBe(36);
  const g=f.b.growthV3!.gadgets;
  expect(g.inventory('player')).toMatchObject({cast:null,charges});
  expect(g.entities()).toHaveLength(0);expect(g.flying()).toHaveLength(0);expect(g.smoke()).toHaveLength(0);
});

it.each(['sn_decoy','md_smoke'] as const)('%s released before departure resolves with its original source and expires after checkpoint recovery',id=>{
  const build=defaultGrowthLoadoutV3(id==='sn_decoy'?'sniper':'medic');build.gadgetId=id;
  const f=fixture(build,true);f.send('item');f.step(6);
  const g=f.b.growthV3!.gadgets;
  expect(g.flying()).toHaveLength(1);expect(g.flying()[0].sourceId).toBe('player');
  f.room.disconnect('owner');f.room.expire('owner');
  expect(g.flying()).toHaveLength(1);expect(g.inventory('player').charges).toBe(1);
  const restored=MatchSession.restore(f.room.session!.checkpoint());
  const advance=(n:number)=>{const frame=f.b.frame;f.step(n);for(let i=0;i<n;i++)restored.tick();expect(f.b.frame).toBe(frame+n);expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());};
  advance(id==='sn_decoy'?15:24);
  expect(g.flying()).toHaveLength(0);
  const effect=id==='sn_decoy'?g.entities()[0]:g.smoke()[0];
  expect(effect).toMatchObject({sourceId:'player',gadgetId:id});
  advance(effect.expiresTick-1-f.b.frame);
  expect(id==='sn_decoy'?g.entities():g.smoke()).toHaveLength(1);
  advance(1);expect(g.entities()).toHaveLength(0);expect(g.smoke()).toHaveLength(0);
  expect(g.hasDeploymentReservation('player')).toBe(false);
  expect(g.inventory('player').charges).toBe(1);expect(f.b.player.life.alive).toBe(false);
});

it('an actual ammo-box grant stays consumed across reconnect, weapon swap and session recovery',()=>{
  const build=defaultGrowthLoadoutV3('medic');build.gadgetId='md_ammo';
  const f=fixture(build),g=f.b.growthV3!.gadgets,gun=f.b.growthV3!.weapons.get('player')!;
  f.send('item',true);f.step(28);
  expect(g.entities()[0].recipients).toEqual([]);
  f.fire();f.step();
  expect(gun.current.ammo+gun.current.reserve).toBe(120);
  expect(g.entities()[0].recipients).toEqual(['player']);
  f.room.disconnect('owner');f.room.reconnect('owner');
  f.send('swap');f.step(6);f.fire();f.step();
  expect(gun.selectedSlot).toBe('secondary');
  expect(gun.current.ammo+gun.current.reserve).toBe(59);
  const restored=MatchSession.restore(f.room.session!.checkpoint());
  f.step(10);for(let i=0;i<10;i++)restored.tick();
  expect(restored.checkpoint()).toEqual(f.room.session!.checkpoint());
  expect(gun.current.ammo+gun.current.reserve).toBe(59);
  expect(g.entities()[0].recipients).toEqual(['player']);
  expect(f.b.growthV3!.participant('player').progression.xp).toBe(0);
  expect(f.b.growthV3!.participant('player').contributions.support).toBe(0);
});

it('ammo-box replenishment for another teammate grants neither supplier nor recipient XP',()=>{
  const build=defaultGrowthLoadoutV3('medic');build.gadgetId='md_ammo';
  const f=fixture(build,true),runtime=f.b.growthV3!;
  const ally=f.b.actors.find(a=>a.id!==f.b.player.id&&a.team===f.b.player.team)!;
  expect(f.room.session!.actorId('teammate')).toBe(ally.id);
  ally.movement.reset(520,599.5);
  f.send('item',true);f.step(28);
  expect(runtime.gadgets.entities()[0].recipients).toEqual([]);
  expect(f.room.command('teammate',{sequence:0,input:{...idleInput(),fire:true,aim:{x:700,y:100}},actions:[]})).toBe(true);
  f.step();
  const gun=runtime.weapons.get(ally.id)!;
  expect(gun.current.ammo).toBe(29);expect(gun.current.reserve).toBe(90);
  f.step();
  expect(gun.current.ammo).toBe(29);expect(gun.current.reserve).toBe(91);
  expect(runtime.gadgets.entities()[0].recipients).toEqual([ally.id]);
  for(const id of ['player',ally.id]){
    expect(runtime.participant(id).progression.xp).toBe(0);
    expect(runtime.participant(id).contributions.support).toBe(0);
  }
  f.room.disconnect('teammate');f.room.reconnect('teammate');f.step(30);
  expect(runtime.gadgets.entities()[0].recipients).toEqual([ally.id]);
  for(const id of ['player',ally.id])expect(runtime.participant(id).progression.xp).toBe(0);
});

it('Q cannot cancel or switch during the plate self-use cast, while an enemy life hit interrupts without spending inventory',()=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';const f=fixture(build);
  f.send('item');f.send('swap');
  expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  expect(f.b.growthV3!.weapons.get('player')!.selectedSlot).toBe('primary');
  f.b.damage(f.b.player,1,f.b.actors[1]);f.step(31);
  expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();
  expect(f.b.player.itemCharges).toBe(2);expect(f.b.growthV3!.participant('player').armor.remaining).toBe(0);
});

it.each(['environment','self'] as const)('nonlethal %s damage does not interrupt the plate reserved for enemy-hit interruption',cause=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';const f=fixture(build);
  f.send('item');
  const before=f.b.player.life.health;
  f.b.damage(f.b.player,1,cause==='self'?f.b.player:undefined,cause==='self');
  expect(f.b.player.life.health).toBeLessThan(before);
  expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  f.step(30);
  expect(f.b.player.itemCharges).toBe(1);
  expect(f.b.growthV3!.participant('player').armor.remaining).toBe(15000);
});

it.each(gadgets.filter(row=>row[0]!=='tk_plate'))('%s permits Q to cancel an uncommitted throw/deployment without spending inventory', (id,cls,cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);
  f.send('item',deploy);expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  f.send('swap');f.step(cast);
  expect(f.b.growthV3!.weapons.get('player')!.selectedSlot).toBe('secondary');
  expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();expect(f.b.player.itemCharges).toBe(charges);
  expect(f.b.growthV3!.gadgets.entities()).toEqual([]);expect(f.b.growthV3!.gadgets.flying()).toEqual([]);
});

it.each(gadgets)('%s rejects use in spawn protection without reserving resources', (id,cls,_cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);f.b.player.life.spawnProtectionFrames=75;
  f.send('item',deploy);
  expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();expect(f.b.player.itemCharges).toBe(charges);
  expect(f.b.player.life.spawnProtectionFrames).toBeGreaterThan(0);
});

it.each(abilities)('%s rejects use in spawn protection without starting cooldown', (id,cls)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));f.b.player.life.spawnProtectionFrames=75;
  f.send('skill');expect(f.b.growthV3!.abilities.actorState('player')).toMatchObject({charges:1,queue:[],pending:null,active:null});
  expect(f.b.player.life.spawnProtectionFrames).toBeGreaterThan(0);
});

it.each(gadgets)('%s exhausts its inventory before recharge and cannot spend nonexistent charges', (id,cls,cast,charges,deploy)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);f.b.player.life.health=f.b.player.life.maxHealth;
  for(let used=0;used<charges;used++){
    f.send('item',deploy);f.step(cast);expect(f.b.player.itemCharges).toBe(charges-used-1);
    f.step(Math.max(500,GROWTH_V3_GADGETS[id].duration+60));expect(f.b.player.itemCharges).toBe(charges-used-1);
  }
  f.send('item',deploy);f.step(cast);
  expect(f.b.player.itemCharges).toBe(0);expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();
  expect(f.b.growthV3!.gadgets.entities()).toEqual([]);expect(f.b.growthV3!.gadgets.flying()).toEqual([]);
});

it.each(gadgets)('%s rejects an out-of-map aim before reserving inventory or a deployment slot', (id,cls,_cast,charges)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);
  expect(f.room.command('owner',{sequence:0,input:{...idleInput(),aim:{x:-1,y:599.5}},actions:['item']})).toBe(true);f.step();
  expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();expect(f.b.player.itemCharges).toBe(charges);
  expect(f.b.growthV3!.gadgets.entities()).toEqual([]);expect(f.b.growthV3!.gadgets.flying()).toEqual([]);
});

it.each(gadgets.filter(row=>row[4]))('%s revalidates placement at commit and releases an invalid reservation without consumption', (id,cls,cast,charges)=>{
  const build=defaultGrowthLoadoutV3(cls);build.gadgetId=id;const f=fixture(build);
  f.send('item',true);expect(f.b.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  f.b.player.movement.reset(850,599.5);f.step(cast);
  expect(f.b.growthV3!.gadgets.inventory('player').cast).toBeNull();expect(f.b.player.itemCharges).toBe(charges);
  expect(f.b.growthV3!.gadgets.entities()).toEqual([]);
  f.b.player.movement.reset(480,599.5);f.send('item',true);f.step(cast);
  expect(f.b.player.itemCharges).toBe(charges-1);expect(f.b.growthV3!.gadgets.entities()).toHaveLength(1);
});

it.each(abilities)('%s clears its still-active effect on death but retains the committed recharge deadline', (id,cls,cast,_duration,cd)=>{
  const f=fixture(changeGrowthAbility(defaultGrowthLoadoutV3(cls),id));f.send('skill');f.step(cast);
  expect(f.b.growthV3!.abilities.actorState('player').active).not.toBeNull();
  f.b.damage(f.b.player,9999);
  expect(f.b.growthV3!.abilities.actorState('player')).toMatchObject({active:null,pending:null,charges:0,queue:[1+cast+cd]});
  f.step(150);expect(f.b.player.life.alive).toBe(true);
  expect(f.b.growthV3!.abilities.actorState('player')).toMatchObject({active:null,pending:null,charges:0,queue:[1+cast+cd]});
});
