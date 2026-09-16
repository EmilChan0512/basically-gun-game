import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import type { Mission } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import {  changeGrowthAbility, type GrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { GrowthArsenalV3 } from '../../src/shared/simulation/growth-v3/WeaponRules';
import { GadgetSimulation } from '../../src/shared/simulation/growth-v3/GadgetSimulation';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

function fixture(loadouts: GrowthLoadoutV3[] = [defaultGrowthLoadoutV3(), defaultGrowthLoadoutV3()],mode:Mission['mode']='tdm') {
  const mission: Mission = { id: 'v3-test', title: '', location: '', brief: '', debrief: '', mode, goal: 100,
    seconds: 900, debug: true, allies: 0, enemies: loadouts.length - 1, width: 1400, height: 700,
    spawns: [[{ x: 60, y: 600 }], [{ x: 1340, y: 600 }]], objective: { x: 900, y: 600 },
    terrain: [{ x: 0, y: 600, width: 1400, height: 100 }], navigation: [], palette: { sky: 0, wall: 0, trim: 0 } };
  const battle = new Battle(mission, 'normal', 'm4', seededRandom(123), null, 'growth-battle-test');
  battle.enableGrowthV3(Object.fromEntries(battle.actors.map((a, i) => [a.id, loadouts[i]])), 5);
  battle.actors.forEach((a, i) => { a.human = true; a.life.spawnProtectionFrames = 0; a.movement.reset(400 + i * 180, 599.5); });
  return battle;
}
const advance = (battle: Battle, n: number) => { for (let i = 0; i < n; i++) battle.tickPlayers(new Map()); };

it.each([true,false])('sniper AI places its beacon only at a reachable transit junction (reachable=%s)',reachable=>{
  const original=fixture([defaultGrowthLoadoutV3('sniper'),defaultGrowthLoadoutV3()]);advance(original,31);
  const state=original.checkpoint();
  state.mission.navigation=reachable?[
    {x:500,y:599.5,links:[1]},{x:560,y:599.5,links:[0,2]},{x:700,y:599.5,links:[1]},
  ]:[
    {x:600,y:599.5,links:[1]},{x:700,y:599.5,links:[0]},
    {x:560,y:599.5,links:[3,4]},{x:400,y:599.5,links:[2]},{x:300,y:599.5,links:[2]},
  ];
  const b=Battle.restore(state);b.player.movement.reset(600,599.5);b.actors[1].movement.reset(780,599.5);
  const g=b.growthV3!.gadgets;expect(g.canPlace('player',{x:560,y:599.5})).toBe(true);
  b.player.human=false;advance(b,1);const inventory=g.inventory('player');
  if(reachable){expect(inventory.cast!.target).toEqual({x:560,y:599.5});advance(b,12);expect(inventory.charges).toBe(0);expect(g.entities()[0].gadgetId).toBe('sn_beacon');}
  else {expect(inventory.cast).toBeNull();expect(inventory.charges).toBe(1);}
});

it.each([-1,1])('tank AI puts cover on the visible threat side (%s)',direction=>{
  const b=fixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3()]);advance(b,31);
  b.player.movement.reset(600,599.5);b.actors[1].movement.reset(600+direction*180,599.5);
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');expect(inventory.cast).not.toBeNull();
  expect((inventory.cast!.target.x-b.player.movement.x)*direction).toBeGreaterThan(0);
  advance(b,12);const cover=b.growthV3!.gadgets.entities().find(e=>e.gadgetId==='tk_cover')!;
  expect(cover).toBeDefined();expect((cover.position.x-b.player.movement.x)*direction).toBeGreaterThan(0);
  expect(inventory.charges).toBe(0);
});

it('tank AI retains cover when only positions behind it are legal',()=>{
  const original=fixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3()],'dom');advance(original,31);
  const state=original.checkpoint();state.mission.objective={x:550,y:599.5};
  state.mission.terrain.push({x:525,y:585,width:55,height:15});
  const b=Battle.restore(state);b.player.movement.reset(600,599.5);b.actors[1].movement.reset(420,599.5);
  const g=b.growthV3!.gadgets;
  expect(g.canPlace('player',{x:560,y:599.5})).toBe(false);expect(g.canPlace('player',{x:545,y:599.5})).toBe(false);
  expect(g.canPlace('player',{x:640,y:599.5})).toBe(true);
  b.player.human=false;advance(b,1);
  expect(g.inventory('player').cast).toBeNull();expect(g.inventory('player').charges).toBe(1);
});

it('AI respects the evolved roll charge gap even with an available second charge',()=>{
  const b=fixture(),r=b.growthV3!,p=r.participant('player');
  awardGrowthV3(p.progression,p.loadout,1200,0,()=>0);
  for(let i=0;i<3;i++){
    const card=p.progression.offer!.cards.find(c=>c.startsWith('as_A'))!;
    expect(b.growthChoice('player',p.progression.offer!.batch,card)).toBe(true);
  }
  expect(b.growthChoice('player',p.progression.offer!.batch,'as_EV_A')).toBe(true);
  advance(b,360);expect(r.abilities.actorState('player').charges).toBe(2);
  b.useSkill();advance(b,1);expect(r.abilities.actorState('player').useReadyTick).toBe(421);
  advance(b,29);b.player.life.health=39;b.actors[1].movement.reset(b.player.movement.x+180,599.5);
  b.player.human=false;const cursor=b.journal.cursor;advance(b,1);
  expect(b.frame).toBe(391);expect(r.abilities.actorState('player').charges).toBe(1);
  expect(b.journal.since(cursor).filter(e=>e.kind==='error'&&e.actorId==='player')).toEqual([]);
  advance(b,30);expect(b.frame).toBe(421);expect(r.abilities.actorState('player').charges).toBe(0);
  expect(r.abilities.actorState('player').active!.startTick).toBe(421);
});

it('AI starts avoiding a real enemy charge exactly when it becomes armed',()=>{
  const attacker=defaultGrowthLoadoutV3();attacker.gadgetId='as_charge';
  const b=fixture([defaultGrowthLoadoutV3(),attacker]),enemy=b.actors[1];enemy.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);advance(b,13);
  const charge=b.growthV3!.gadgets.entities()[0];b.mission.width=2400;b.mission.terrain[0].width=2400;enemy.movement.reset(2200,599.5);
  while(b.frame<charge.armedTick-2)advance(b,1);
  b.player.movement.reset(480,599.5);b.player.human=false;advance(b,1);
  expect(b.frame).toBe(charge.armedTick-1);expect(b.player.brain.state).not.toBe('evade');
  const x=b.player.movement.x;advance(b,1);
  expect(b.frame).toBe(charge.armedTick);expect(b.player.brain.state).toBe('evade');expect(b.player.movement.x).toBeLessThan(x);
  expect(b.growthV3!.gadgets.entities().some(e=>e.id===charge.id)).toBe(true);
});

it('AI also escapes its own real grenade despite matching its team',()=>{
  const b=fixture();expect(b.useItem({x:700,y:567},b.player)).toBe(true);advance(b,7);
  const g=b.growthV3!.gadgets,flight=g.flying()[0],impact=g.predictFlyingImpact(flight.id)!;
  while(b.frame<flight.detonateTick-18)advance(b,1);
  b.player.movement.reset(impact.x-20,599.5);b.actors[1].movement.reset(1300,599.5);
  b.player.human=false;advance(b,1);expect(b.player.brain.state).toBe('evade');
  while(b.frame<=flight.detonateTick)advance(b,1);
  expect(g.flying()).toHaveLength(0);expect(b.player.life.health).toBe(100);expect(b.player.life.spawnProtectionFrames).toBe(0);
});

it.each(['as_frag','as_concussion'] as const)('AI escapes the actual %s blast instead of advancing into it',gadget=>{
  const attacker=defaultGrowthLoadoutV3();attacker.gadgetId=gadget;
  const b=fixture([defaultGrowthLoadoutV3(),attacker]),enemy=b.actors[1];
  expect(b.useItem({x:300,y:567},enemy)).toBe(true);advance(b,7);
  const g=b.growthV3!.gadgets,flight=g.flying()[0],impact=g.predictFlyingImpact(flight.id)!;
  while(b.frame<flight.detonateTick-18)advance(b,1);
  const start=impact.x-20;b.player.movement.reset(start,599.5);enemy.movement.reset(1300,599.5);
  b.player.human=false;advance(b,1);
  expect(b.player.brain.state).toBe('evade');expect(b.player.movement.x).toBeLessThan(start);
  const restored=Battle.restore(b.checkpoint());
  while(b.frame<=flight.detonateTick){advance(b,1);advance(restored,1);}
  expect(b.player.life.health).toBe(100);expect(b.player.life.spawnProtectionFrames).toBe(0);
  expect(g.flying()).toHaveLength(0);expect(restored.checkpoint()).toEqual(b.checkpoint());
});

it.each(['friendly','hidden','harmless'] as const)('AI does not evade a %s projectile',kind=>{
  const attacker=defaultGrowthLoadoutV3(kind==='harmless'?'sniper':'assault');
  if(kind==='harmless')attacker.gadgetId='sn_emp';
  const b=fixture([defaultGrowthLoadoutV3(),attacker]),enemy=b.actors[1];
  if(kind==='friendly')enemy.team=b.player.team;
  expect(b.useItem({x:300,y:567},enemy)).toBe(true);advance(b,7);
  const flight=b.growthV3!.gadgets.flying()[0],impact=b.growthV3!.gadgets.predictFlyingImpact(flight.id)!;
  while(b.frame<flight.detonateTick-18)advance(b,1);
  b.player.movement.reset(impact.x-20,599.5);enemy.movement.reset(1300,599.5);
  const checkpoint=b.checkpoint();
  if(kind==='hidden')checkpoint.growthV3!.gadgets.smoke.push({id:'danger-smoke',sourceId:enemy.id,team:2,gadgetId:'md_smoke',position:{...flight.position},radius:150,expiresTick:200});
  const restored=Battle.restore(checkpoint);restored.player.human=false;advance(restored,1);
  expect(restored.player.brain.state).not.toBe('evade');
});

it.each(['wall','ledge'] as const)('AI rejects an escape route through a %s',kind=>{
  const b=fixture(),enemy=b.actors[1];
  expect(b.useItem({x:300,y:567},enemy)).toBe(true);advance(b,7);
  const flight=b.growthV3!.gadgets.flying()[0],impact=b.growthV3!.gadgets.predictFlyingImpact(flight.id)!;
  while(b.frame<flight.detonateTick-18)advance(b,1);
  const start=impact.x-20;b.player.movement.reset(start,599.5);enemy.movement.reset(1300,599.5);
  const checkpoint=b.checkpoint();
  if(kind==='wall')checkpoint.mission.terrain.push({x:start-30,y:500,width:14,height:100});
  else checkpoint.mission.terrain=[{x:start-10,y:600,width:1400-start+10,height:100}];
  const restored=Battle.restore(checkpoint);restored.player.human=false;advance(restored,1);
  expect(restored.player.brain.state).toBe('evade');expect(restored.player.movement.x).toBeGreaterThan(start);
});

it('AI acquires and shoots a visible enemy facility when its owner has left sight',()=>{
  const b=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3('sniper')]),enemy=b.actors[1];
  enemy.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);advance(b,28);
  const entity=b.growthV3!.gadgets.entities()[0];expect(entity.gadgetId).toBe('sn_beacon');
  b.mission.width=2400;b.mission.terrain[0].width=2400;enemy.movement.reset(2200,599.5);b.player.human=false;advance(b,1);
  expect(b.player.brain.target).toBe(entity.id);
  const restored=Battle.restore(b.checkpoint());advance(b,60);advance(restored,60);
  expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(b.growthV3!.gadgets.entities().some(e=>e.id===entity.id)).toBe(false);
  expect(b.journal.since(0).some(e=>e.kind==='deployableDestroyed'&&e.entityId===entity.id)).toBe(true);
  expect(b.growthV3!.participant('player').shots).toBeGreaterThan(0);
});

it('AI prioritizes a visible enemy over a nearer destructible facility',()=>{
  const b=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3('sniper')]),enemy=b.actors[1];
  enemy.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);advance(b,28);
  enemy.movement.reset(700,599.5);b.player.human=false;advance(b,1);
  expect(b.player.brain.target).toBe(enemy.id);
});

it.each(['friendly','smoke'] as const)('AI does not acquire a %s facility',kind=>{
  const b=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3('sniper')]),owner=b.actors[1];
  if(kind==='friendly')owner.team=b.player.team;
  owner.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},owner)).toBe(true);advance(b,28);
  const entity=b.growthV3!.gadgets.entities()[0];owner.movement.reset(1300,599.5);
  const checkpoint=b.checkpoint();
  if(kind==='smoke')checkpoint.growthV3!.gadgets.smoke.push({id:'facility-smoke',sourceId:owner.id,team:2,gadgetId:'md_smoke',position:{x:540,y:550},radius:150,expiresTick:200});
  const restored=Battle.restore(checkpoint);restored.player.human=false;advance(restored,17);
  expect(restored.player.brain.target).not.toBe(entity.id);
  expect(restored.growthV3!.participant('player').shots).toBe(0);
  expect(restored.growthV3!.gadgets.entities().find(e=>e.id===entity.id)!.health).toBe(entity.health);
});

it.each(['tk_barrier','tk_shield'] as const)('%s AI does not suppress its attack with an unusable protected skill',ability=>{
  const tank=changeGrowthAbility(defaultGrowthLoadoutV3('tank'),ability);
  const b=fixture([tank,defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  b.player.life.spawnProtectionFrames=75;b.player.human=false;
  advance(b,17);
  expect(b.journal.since(0).filter(e=>e.kind==='error'&&e.actorId==='player')).toEqual([]);
  expect(b.player.life.spawnProtectionFrames).toBe(0);
  expect(b.growthV3!.abilities.actorState('player').charges).toBe(1);
  expect(b.growthV3!.gadgets.inventory('player').charges).toBe(1);
  advance(b,14);
  expect(b.growthV3!.abilities.actorState('player').pending).not.toBeNull();
});

it('AI waits thirty ticks between tactical evaluations when conditions become newly valid',()=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';
  const b=fixture([build,defaultGrowthLoadoutV3()]);b.actors[1].movement.reset(1300,599.5);
  advance(b,31);b.player.human=false;advance(b,1);
  const p=b.growthV3!.participant('player'),inventory=b.growthV3!.gadgets.inventory('player');
  expect(p.cooldowns.aiEval).toBe(62);expect(inventory.cast).toBeNull();
  b.player.life.health=69;
  for(let i=0;i<29;i++){advance(b,1);expect(inventory.cast).toBeNull();expect(inventory.charges).toBe(2);}
  expect(b.frame).toBe(61);advance(b,1);
  expect(b.frame).toBe(62);expect(inventory.cast).not.toBeNull();expect(p.cooldowns.aiEval).toBe(92);
});

it.each(['as_frag','as_concussion'] as const)('%s AI chooses a predicted blast more than 80px from itself',gadget=>{
  const build=defaultGrowthLoadoutV3();build.gadgetId=gadget;
  const b=fixture([build,defaultGrowthLoadoutV3()]);advance(b,31);
  b.actors[1].movement.reset(600,599.5);b.player.human=false;advance(b,1);
  const g=b.growthV3!.gadgets,inventory=g.inventory('player');
  expect(inventory.cast).not.toBeNull();
  const impact=g.predictThrow('player',inventory.cast!.target)!;
  expect(impact).not.toBeNull();
  expect(Math.hypot(impact.x-b.player.movement.x,impact.y-(b.player.movement.y-33))).toBeGreaterThan(80);
  expect(Math.hypot(impact.x-600,impact.y-(b.actors[1].movement.y-33))).toBeLessThanOrEqual(80);
  expect(inventory.charges).toBe(2);advance(b,6);expect(inventory.charges).toBe(1);
  expect(g.flying()).toHaveLength(1);
});

it.each(['none','friendly','enemy'] as const)('interceptor AI reacts only to visible hostile throws (%s)',kind=>{
  const tank=defaultGrowthLoadoutV3('tank');tank.gadgetId='tk_interceptor';
  const b=fixture([tank,defaultGrowthLoadoutV3()]),thrower=b.actors[1];
  advance(b,31);thrower.movement.reset(560,599.5);
  if(kind==='friendly')thrower.team=b.player.team;
  if(kind!=='none'){expect(b.useItem({x:400,y:567},thrower)).toBe(true);advance(b,7);
    expect(b.growthV3!.gadgets.flying()).toHaveLength(1);}
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(kind==='enemy');expect(inventory.charges).toBe(1);
  if(kind==='enemy'){advance(b,12);expect(inventory.charges).toBe(0);
    expect(b.growthV3!.gadgets.entities()[0].gadgetId).toBe('tk_interceptor');}
});

it('EMP AI cannot acquire a smoke-hidden electronic facility',()=>{
  const sniper=defaultGrowthLoadoutV3('sniper');sniper.gadgetId='sn_emp';
  const b=fixture([sniper,defaultGrowthLoadoutV3('sniper')]);
  const enemy=b.actors[1];enemy.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);advance(b,28);
  const checkpoint=b.checkpoint();
  checkpoint.growthV3!.gadgets.smoke.push({id:'ai-visibility-smoke',sourceId:enemy.id,team:2,gadgetId:'md_smoke',position:{x:540,y:550},radius:150,expiresTick:200});
  const hidden=Battle.restore(checkpoint);hidden.player.human=false;
  const visible=Battle.restore(b.checkpoint());visible.player.human=false;
  advance(hidden,1);advance(visible,1);
  expect(hidden.growthV3!.gadgets.inventory('player').cast).toBeNull();
  expect(visible.growthV3!.gadgets.inventory('player').cast).not.toBeNull();
  expect(hidden.growthV3!.gadgets.inventory('player').charges).toBe(2);
});

it.each(['none','tk_cover','sn_beacon'] as const)('sniper EMP AI requires an enemy electronic structure (%s)',kind=>{
  const sniper=defaultGrowthLoadoutV3('sniper');sniper.gadgetId='sn_emp';
  const opponent=defaultGrowthLoadoutV3(kind==='sn_beacon'?'sniper':'tank');
  if(kind!=='none')opponent.gadgetId=kind;
  const b=fixture([sniper,opponent]),enemy=b.actors[1];
  enemy.movement.reset(520,599.5);
  if(kind!=='none'){expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);advance(b,28);}
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(kind==='sn_beacon');expect(inventory.charges).toBe(2);
  if(kind==='sn_beacon'){
    advance(b,6);expect(inventory.charges).toBe(1);
    advance(b,24);expect(b.growthV3!.gadgets.entities()[0].stoppedUntil).toBeGreaterThan(b.frame);
  }
});

it.each([[34,30,true],[35,30,false],[34,31,false]] as const)('medic smoke AI requires low teammate HP %i and recent damage age %i',(hp,age,expected)=>{
  const b=fixture([defaultGrowthLoadoutV3('medic'),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1],enemy=b.actors[2];ally.team=1;
  ally.movement.reset(500,599.5);enemy.movement.reset(1300,599.5);
  b.player.life.health=70;b.useSkill();advance(b,64);
  b.damage(ally,100-hp,enemy);advance(b,age-1);
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(expected);expect(inventory.charges).toBe(2);
  if(expected){advance(b,6);expect(inventory.charges).toBe(1);
    expect(b.growthV3!.gadgets.flying()).toHaveLength(1);}
});

it.each([[0,false],[24,false],[25,true]] as const)('injured medic does not add its own deficit to station deployment (ally missing %i)',(missing,expected)=>{
  const build=defaultGrowthLoadoutV3('medic');build.gadgetId='md_station';
  const b=fixture([build,defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1];ally.team=1;ally.movement.reset(440,599.5);b.actors[2].movement.reset(1300,599.5);
  b.player.life.health=70;b.useSkill();advance(b,64);
  expect(b.growthV3!.abilities.actorState('player').charges).toBe(0);
  b.damage(b.player,30,b.actors[2]);ally.life.health=100-missing;
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(expected);expect(inventory.charges).toBe(1);
  expect(b.player.life.health).toBe(65);
});

it.each([[75,false],[40,false],[39,true]] as const)('medic AI self pulse uses the dedicated below-40 threshold at HP %i',(hp,expected)=>{
  const b=fixture([defaultGrowthLoadoutV3('medic'),defaultGrowthLoadoutV3()]);
  b.actors[1].movement.reset(1300,599.5);b.player.life.health=hp;b.player.human=false;
  advance(b,1);expect(!!b.growthV3!.abilities.actorState('player').pending).toBe(expected);
});

it.each([[9,false],[10,true]] as const)('medic pulse AI sums nearby teammate deficits 10 + %i',(secondMissing,expected)=>{
  const b=fixture([defaultGrowthLoadoutV3('medic'),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const first=b.actors[1],second=b.actors[2];first.team=second.team=b.player.team;
  first.movement.reset(460,599.5);second.movement.reset(500,599.5);
  first.life.health=90;second.life.health=100-secondMissing;b.actors[3].movement.reset(1300,599.5);
  b.player.human=false;advance(b,1);
  const state=b.growthV3!.abilities.actorState('player');
  expect(!!state.pending).toBe(expected);expect(state.charges).toBe(1);
  if(expected){advance(b,3);expect(first.life.health).toBe(100);expect(second.life.health).toBe(100);expect(state.charges).toBe(0);}
});

it.each([[24,false],[25,true]] as const)('medic station AI deploys at total nearby teammate deficit %i',(missing,expected)=>{
  const build=defaultGrowthLoadoutV3('medic');build.gadgetId='md_station';
  const b=fixture([build,defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1];ally.team=1;ally.movement.reset(440,599.5);
  b.actors[2].movement.reset(1300,599.5);
  // Spend E through its real cast so the G decision is not pre-empted by healing.
  b.player.life.health=70;b.useSkill();advance(b,64);
  expect(b.player.life.health).toBe(95);
  expect(b.growthV3!.abilities.actorState('player').charges).toBe(0);
  ally.life.health=100-missing;b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(expected);expect(inventory.charges).toBe(1);
  if(expected){advance(b,12);expect(inventory.charges).toBe(0);
    expect(b.growthV3!.gadgets.entities()[0].gadgetId).toBe('md_station');}
});

it.each([[35,true],[36,false],[120,false]] as const)('medic ammo-box AI requires strictly less than 30 percent total ammunition (%i)',(total,expected)=>{
  const build=defaultGrowthLoadoutV3('medic');build.gadgetId='md_ammo';
  const b=fixture([build,defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1];ally.team=1;ally.movement.reset(440,599.5);
  b.actors[2].movement.reset(1300,599.5);
  const gun=b.growthV3!.weapons.get(ally.id)!;
  gun.current.ammo=30;gun.current.reserve=total-30;
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(expected);expect(inventory.charges).toBe(1);
  if(expected){advance(b,12);expect(inventory.charges).toBe(0);
    expect(b.growthV3!.gadgets.entities()[0].gadgetId).toBe('md_ammo');}
});

it.each([[69,0,31,true],[70,0,31,false],[69,15000,31,false],[69,0,30,false]] as const)('plate AI checks HP %i armor %i last-damage age %i',(hp,armor,age,expected)=>{
  const build=defaultGrowthLoadoutV3('tank');build.gadgetId='tk_plate';
  const b=fixture([build,defaultGrowthLoadoutV3()]),p=b.growthV3!.participant('player');
  b.actors[1].movement.reset(1300,599.5);advance(b,31);
  b.damage(b.player,1,b.actors[1]);advance(b,age-1);
  b.player.life.health=hp;p.armor={remaining:armor,until:b.frame+200,source:'player'};
  b.player.human=false;advance(b,1);
  const inventory=b.growthV3!.gadgets.inventory('player');
  expect(!!inventory.cast).toBe(expected);expect(inventory.charges).toBe(2);
  if(expected){advance(b,30);expect(inventory.charges).toBe(1);expect(p.armor.remaining).toBe(15000);}
});

it.each([[240,'enemy-1'],[241,'enemy-0']] as const)('medic AI selects the lowest-health reachable teammate (critical distance %i)',(range,targetId)=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link');
  const b=fixture([build,defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const near=b.actors[1],critical=b.actors[2];near.team=critical.team=b.player.team;
  near.movement.reset(500,599.5);near.life.health=70;
  critical.movement.reset(400+range,599.5);critical.life.health=30;
  b.actors[3].movement.reset(1000,599.5);b.player.human=false;
  advance(b,1);const state=b.growthV3!.abilities.actorState('player');
  expect(state.pending?.targetId).toBe(targetId);
  advance(b,6);expect(state.active?.targetId).toBe(targetId);
  advance(b,15);
  expect((targetId===near.id?near:critical).life.health).toBe(targetId===near.id?75:35);
});

it.each([[3,false,false],[4,false,true],[4,true,false]] as const)('rush AI requires four missing rounds and reserve (missing %i empty reserve %s)',(missing,empty,expected)=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('assault'),'as_reloadrush');
  const b=fixture([build,defaultGrowthLoadoutV3()]),gun=b.growthV3!.weapons.get('player')!;
  for(let i=0;i<(missing-1)*4+1;i++)b.tickPlayers(new Map([['player',{...idleInput(),fire:true,aim:{x:400,y:100}}]]));
  advance(b,4);expect(gun.current.ammo).toBe(30-missing);
  if(empty)gun.current.reserve=0; // Exhausted-reserve initial condition; missing rounds came from actual shots.
  b.player.human=false;advance(b,1);
  const state=b.growthV3!.abilities.actorState('player');expect(!!state.pending).toBe(expected);
  if(expected){
    const total=gun.current.ammo+gun.current.reserve;advance(b,3);
    expect(gun.current.ammo).toBe(30);expect(gun.current.ammo+gun.current.reserve).toBe(total);
    expect(state.charges).toBe(0);
  }
});

it.each(['tk_barrier','tk_shield'] as const)('%s bot requires recent damage or two visible enemies',ability=>{
  for(const [enemies,damageAge,expected] of [[1,30,true],[1,31,false],[2,31,true]] as const){
    const build=changeGrowthAbility(defaultGrowthLoadoutV3('tank'),ability);
    const b=fixture([build,...Array.from({length:enemies},()=>defaultGrowthLoadoutV3())]);
    b.actors.slice(1).forEach((a,i)=>a.movement.reset(600+i*100,599.5));
    advance(b,31);b.damage(b.player,1,b.actors[1]);
    advance(b,damageAge-1);b.player.human=false;advance(b,1);
    const state=b.growthV3!.abilities.actorState('player');
    expect(!!state.pending,`${ability} enemies=${enemies} age=${damageAge}`).toBe(expected);
    expect(state.charges).toBe(1);
  }
});

it.each([[299,30,false],[300,29,false],[300,30,true]] as const)('sniper AI focus distance %i stationary %i starts %s',(range,stable,expected)=>{
  const b=fixture([defaultGrowthLoadoutV3('sniper'),defaultGrowthLoadoutV3()]);
  b.actors[1].movement.reset(400+range,599.5);advance(b,stable);
  expect(b.growthV3!.participant('player').stationary).toBe(stable);
  b.player.human=false;advance(b,1);
  const state=b.growthV3!.abilities.actorState('player');
  expect(!!state.pending).toBe(expected);
  expect(state.charges).toBe(1);
});

it.each([[179,90,true],[180,90,false],[300,34,true],[300,35,false]] as const)('sniper bot relocation at distance %i HP %i is %s',(range,hp,expected)=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('sniper'),'sn_relocate');
  const b=fixture([build,defaultGrowthLoadoutV3()]);advance(b,31);
  b.player.movement.reset(400,599.5);b.actors[1].movement.reset(400+range,599.5);
  b.player.life.health=hp;b.player.human=false;advance(b,1);
  expect(!!b.growthV3!.abilities.actorState('player').active).toBe(expected);
});

it.each([[39,300,true],[40,300,false],[39,401,false]] as const)('assault bot roll at HP %i distance %i is %s',(hp,range,expected)=>{
  const b=fixture();advance(b,31);
  b.player.movement.reset(400,599.5);b.actors[1].movement.reset(400+range,599.5);
  b.player.life.health=hp;b.player.human=false;advance(b,1);
  expect(!!b.growthV3!.abilities.actorState('player').active).toBe(expected);
});

it('actual enemy throw intercepted in Battle awards 10 XP exactly once and survives recovery',()=>{
  const tank=defaultGrowthLoadoutV3('tank');tank.gadgetId='tk_interceptor';
  const b=fixture([tank,defaultGrowthLoadoutV3()]),enemy=b.actors[1];
  b.useItem({x:440,y:599.5});advance(b,28);
  const interceptor=b.growthV3!.gadgets.entities()[0];
  expect(interceptor.interceptions).toBe(2);
  expect(b.useItem({x:400,y:567},enemy)).toBe(true);advance(b,7);
  expect(interceptor.interceptions).toBe(1);
  expect(b.growthV3!.gadgets.flying()).toHaveLength(0);
  const p=b.growthV3!.participant(b.player.id);
  expect(p.progression.xp).toBe(10);expect(p.contributions.support).toBe(10);
  expect(Object.keys(p.contributions.creditedEvents).filter(id=>id.startsWith('intercept:'))).toHaveLength(1);
  const restored=Battle.restore(b.checkpoint());advance(b,30);advance(restored,30);
  expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(p.progression.xp).toBe(10);expect(p.contributions.support).toBe(10);
});

it.each([[240,false,60],[241,false,0],[240,true,100]] as const)('damage assist age %i and own kill %s awards %i once',(age,ownKill,xp)=>{
  const b=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1],victim=b.actors[2];ally.team=b.player.team;
  b.damage(victim,1,b.player);advance(b,age);
  b.damage(victim,9999,ownKill?b.player:ally);
  const p=b.growthV3!.participant(b.player.id);
  expect(p.progression.xp).toBe(xp);
  expect(p.contributions.support).toBe(0);
  b.damage(victim,9999,b.player);expect(p.progression.xp).toBe(xp);
  expect(b.growthV3!.participant(victim.id).attackers).toEqual({});
});

it('armor-only damage does not establish damage-assist eligibility',()=>{
  const b=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3('tank')]);
  const ally=b.actors[1],victim=b.actors[2];ally.team=b.player.team;
  // Legal temporary armor isolates whether the hit reached life damage.
  b.growthV3!.participant(victim.id).armor={remaining:15000,until:120,source:victim.id};
  b.damage(victim,1,b.player);expect(victim.life.health).toBe(115);
  b.damage(victim,9999,ally);
  expect(b.growthV3!.participant(b.player.id).progression.xp).toBe(0);
});

it.each([[800,100],[1200,110]] as const)('v3 catch-up includes self in the match average for an opponent with %i XP', (opponentXp,reward)=>{
  const b=fixture(),r=b.growthV3!,p=r.participant('player'),enemy=b.actors[1],other=r.participant(enemy.id);
  awardGrowthV3(other.progression,other.loadout,opponentXp,0,()=>0);
  expect(p.progression.level).toBe(1);expect(other.progression.level).toBe(opponentXp===800?4:5);
  b.damage(enemy,9999,b.player);
  expect(p.progression.xp).toBe(reward);expect(b.player.kills).toBe(1);
  expect(p.contributions.support).toBe(0);
});

it('real domination grants 2 XP per 30 held ticks, stops on contest/death and preserves its budget',()=>{
  const b=fixture(undefined,'dom'),p=b.growthV3!.participant(b.player.id),enemy=b.actors[1];
  b.player.movement.reset(900,599.5);enemy.movement.reset(1200,599.5);
  advance(b,29);expect(p.progression.xp).toBe(0);
  advance(b,1);expect(p.progression.xp).toBe(2);expect(p.contributions.objective).toBe(2);
  enemy.movement.reset(930,599.5);advance(b,30);
  expect(b.objective).toBe('contested');expect(p.progression.xp).toBe(2);expect(p.objectiveTicks).toBe(0);
  enemy.movement.reset(1200,599.5);advance(b,29);expect(p.progression.xp).toBe(2);
  advance(b,1);expect(p.progression.xp).toBe(4);
  b.damage(b.player,9999);advance(b,30);
  expect(p.progression.xp).toBe(4);expect(p.contributions.objective).toBe(4);
  const restored=Battle.restore(b.checkpoint());advance(b,120);advance(restored,120);
  expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(b.player.life.alive).toBe(true);expect(p.contributions.objective).toBe(4);
});

it.each([
  [90,false,false,20],[91,false,false,0],[90,true,false,60],[90,false,true,100],
] as const)('beacon assist at age %i, prior damage %s, own kill %s awards exactly %i XP',(age,damaged,ownKill,xp)=>{
  const b=fixture([defaultGrowthLoadoutV3('sniper'),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1],enemy=b.actors[2];ally.team=b.player.team;
  ally.movement.reset(300,599.5);enemy.movement.reset(540,599.5);
  b.useItem({x:440,y:599.5});advance(b,28);
  const ping=b.journal.since(0).find(e=>e.kind==='intelPing'&&e.targetId===enemy.id);
  expect(ping).toBeDefined();
  // Leave beacon range to prevent subsequent scans from refreshing the evidence.
  enemy.movement.reset(1600,599.5);
  if(damaged)b.damage(enemy,1,b.player);
  advance(b,ping!.tick+age-b.frame);
  b.damage(enemy,9999,ownKill?b.player:ally);
  expect(enemy.life.alive).toBe(false);
  const p=b.growthV3!.participant(b.player.id);
  expect(p.progression.xp).toBe(xp);
  expect(p.contributions.support).toBe(xp===20?20:0);
});

it('tank brace requires 24 consecutive crouched grounded ticks, excluding prior standing time',()=>{
  const b=fixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3()]),r=b.growthV3!,a=b.player;
  const tick=(extra:Partial<ReturnType<typeof idleInput>>={})=>b.tickPlayers(new Map([[a.id,{...idleInput(),crouch:true,...extra}]]));
  advance(b,30);
  for(let i=0;i<23;i++)tick();
  expect(r.actorView(a.id).hitKickScale).toBe(1);expect(r.participant(a.id).braceTicks).toBe(23);
  const restored=Battle.restore(b.checkpoint());
  tick();restored.tickPlayers(new Map([[a.id,{...idleInput(),crouch:true}]]));
  expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(r.actorView(a.id).hitKickScale).toBe(.8);
  b.damage(a,1,b.actors[1]);expect(r.participant(a.id).recoil.hit).toBe(1200);
  tick({crouch:false});expect(r.participant(a.id).braceTicks).toBe(0);
  tick();expect(r.actorView(a.id).hitKickScale).toBe(1);
  for(let i=0;i<23;i++)tick();expect(r.actorView(a.id).hitKickScale).toBe(.8);
  tick({right:true});expect(r.participant(a.id).braceTicks).toBe(0);
  for(let i=0;i<40;i++)tick();expect(r.actorView(a.id).hitKickScale).toBe(.8);
  tick({crouch:false});tick({jump:true});expect(a.movement.jumping).toBe(true);
  expect(r.participant(a.id).braceTicks).toBe(0);expect(r.actorView(a.id).hitKickScale).toBe(1);
});

it('a decoy bot waits for its deployment reservation to expire before spending the next charge',()=>{
  const build=defaultGrowthLoadoutV3('sniper');build.gadgetId='sn_decoy';
  const b=fixture([build,defaultGrowthLoadoutV3()]),r=b.growthV3!,a=b.player,enemy=b.actors[1];
  expect(b.useItem({x:240,y:566.5},a)).toBe(true);advance(b,7);
  expect(r.gadgets.flying()).toHaveLength(1);expect(r.gadgets.hasDeploymentReservation(a.id)).toBe(true);
  a.human=false;a.brain.target=enemy.id;a.brain.acquired=100000;
  const e=r.abilities.actorState(a.id);e.charges=0;e.queue=[100000];
  const cursor=b.journal.cursor;
  advance(b,15);
  const entity=r.gadgets.entities().find(g=>g.sourceId===a.id)!;
  expect(entity).toBeDefined();expect(a.itemCharges).toBe(1);
  advance(b,entity.expiresTick-b.frame-1);
  expect(r.gadgets.hasDeploymentReservation(a.id)).toBe(true);
  expect(a.itemCharges).toBe(1);
  expect(b.journal.since(cursor).filter(event=>event.actorId===a.id&&event.cause==='existing_deployable')).toHaveLength(0);
  advance(b,40);
  expect(a.itemCharges).toBe(0);
  expect(r.gadgets.hasDeploymentReservation(a.id)).toBe(true);
});

it('installs the entire four-operator roster atomically and refuses cross-class G', () => {
  const battle = fixture(['assault', 'tank', 'sniper', 'medic'].map(c => defaultGrowthLoadoutV3(c as 'assault')));
  expect(battle.actors.map(a => a.life.maxHealth)).toEqual([100, 115, 90, 95]);
  expect(battle.actors.map(a => a.itemCharges)).toEqual([2, 1, 1, 2]);
  expect(battle.actors.every(a => !a.growth && a.kit === null)).toBe(true);
  const mission = { ...battle.mission, enemies: 1 }, other = new Battle(mission);
  const before = other.player.life;
  expect(() => other.enableGrowthV3({ player: defaultGrowthLoadoutV3(), 'enemy-0': { ...defaultGrowthLoadoutV3(), gadgetId: 'md_smoke' } })).toThrow('not_owner_class');
  expect(other.player.life).toBe(before); expect(other.growthV3).toBeUndefined();
});
it('uses attachment recoil while keeping ballistic aim independent and restoring visual accumulators', () => {
  const build=defaultGrowthLoadoutV3();build.attachments.primary=['M02'];
  const a=fixture([build,defaultGrowthLoadoutV3()]), b=Battle.restore(a.checkpoint());
  b.growthV3!.participant('player').recoil.shot=8000;
  const input=new Map([['player',{...idleInput(),fire:true,aim:{x:1100,y:200}}]]);
  a.tickPlayers(input);b.tickPlayers(input);
  expect(a.effects).toEqual(b.effects);expect(a.player.aim).toEqual(b.player.aim);
  expect(a.growthV3!.actorView('player').recoilDegrees).toBe(.96);
  expect(b.growthV3!.actorView('player').recoilDegrees).toBe(8);
  advance(a,1);expect(a.growthV3!.actorView('player').recoilDegrees).toBe(.56);
  const restored=Battle.restore(a.checkpoint());advance(a,5);advance(restored,5);
  expect(restored.checkpoint()).toEqual(a.checkpoint());
  for(let i=0;i<4;i++)a.damage(a.player,1,a.actors[1]);
  expect(a.growthV3!.participant('player').recoil.hit).toBe(3000);
});

it.each([['item', 'skill'], ['skill', 'item']] as const)('enforces E before G in real MatchSession for action order %j', (...actions) => {
  const battle = fixture(), session = new MatchSession(battle);
  session.bind('client', 'player');
  expect(session.submit('client', { sequence: 0, input: { ...idleInput(), right: true, aim: { x: 800, y: 550 } }, actions: [...actions] })).toBe(true);
  session.tick();
  const runtime = battle.growthV3!;
  expect(runtime.abilities.actorState('player').active?.definition.id).toBe('as_roll');
  expect(battle.player.movement.speedScale).toBeCloseTo(1.65);
  expect(runtime.gadgets.inventory('player').cast).toBeNull(); expect(battle.player.itemCharges).toBe(2);
  expect(battle.journal.since(0).some(e => e.kind === 'error' && e.cause === 'busy')).toBe(true);
  expect(session.submit('client', { sequence: 0, input: idleInput(), actions: ['item'] })).toBe(false);
});

it('spawns a tank cover instead of the old shared grenade and bullets hit the real structure', () => {
  const battle = fixture([defaultGrowthLoadoutV3('tank'), defaultGrowthLoadoutV3()]);
  expect(battle.useItem({ x: 440, y: 599.5 })).toBe(true); advance(battle, 13);
  const runtime = battle.growthV3!, cover = runtime.gadgets.entities()[0];
  expect(cover.gadgetId).toBe('tk_cover'); expect(battle.grenades).toHaveLength(0); expect(battle.player.itemCharges).toBe(0);
  const hp = battle.player.life.health;
  for (let i = 0; i < 5; i++) battle.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 566 } }]]));
  expect(cover.health).toBeLessThan(120000); expect(battle.player.life.health).toBe(hp);
});

it('resolves simultaneous lethal shots and awards both kills without healing a dead attacker', () => {
  const battle = fixture(); battle.actors.forEach(a => { a.life.health = 10; });
  battle.tickPlayers(new Map(battle.actors.map(a => [a.id, { ...idleInput(), fire: true,
    aim: { x: a.id === 'player' ? 580 : 400, y: 567 } }])));
  expect(battle.actors.map(a => a.life.alive)).toEqual([false, false]);
  expect(battle.actors.map(a => a.kills)).toEqual([1, 1]); expect(battle.scores).toEqual([1, 1]);
  expect([...battle.growthV3!.participants.values()].map(p => p.progression.xp)).toEqual([100, 100]);
});

it('same-tick combat outcomes and event order ignore input, participant and non-player actor insertion order',()=>{
  const original=fixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  original.actors.forEach((a,i)=>{a.life.health=10;a.movement.reset(400+i*180,599.5);});
  const reordered=Battle.restore(original.checkpoint());
  // Keep Battle.player at index zero; only reorder the other actors and map insertion order.
  reordered.actors.splice(1,2,...reordered.actors.slice(1).reverse());
  const participants=[...reordered.growthV3!.participants.entries()].reverse();
  reordered.growthV3!.participants.clear();for(const [id,p]of participants)reordered.growthV3!.participants.set(id,p);
  const inputs=original.actors.map(a=>[a.id,{...idleInput(),fire:true,aim:{x:a.id==='player'?580:400,y:567}}] as const);
  original.tickPlayers(new Map(inputs));reordered.tickPlayers(new Map([...inputs].reverse()));
  const result=(b:Battle)=>b.actors.map(a=>({id:a.id,alive:a.life.alive,hp:a.life.health,kills:a.kills,
    xp:b.growthV3!.participant(a.id).progression.xp,shots:b.growthV3!.participant(a.id).metrics.shots})).sort((a,b)=>a.id.localeCompare(b.id));
  expect(result(reordered)).toEqual(result(original));expect(reordered.scores).toEqual(original.scores);
  expect(reordered.journal.since(0)).toEqual(original.journal.since(0));
  expect(original.actors.filter(a=>!a.life.alive)).toHaveLength(2);
  expect(original.actors.every(a=>original.growthV3!.participant(a.id).metrics.shots===1)).toBe(true);
});

it('uses M4 independent damage/clock: 10 body hits at ticks 1..37', () => {
  const battle = fixture();
  const input = new Map([['player', { ...idleInput(), fire: true, aim: { x: 580, y: 567 } }]]);
  for (let i = 0; i < 36; i++) battle.tickPlayers(input);
  expect(battle.actors[1].life.health).toBe(10);
  battle.tickPlayers(input);
  expect(battle.actors[1].life.alive).toBe(false); expect(battle.growthV3!.weapons.get('player')!.shotCount).toBe(10);
});

it('disables implicit regeneration and respawns on exactly the 150th dead tick without refilling G or E', () => {
  const battle = fixture(); battle.player.life.health = 40; advance(battle, 200);
  expect(battle.player.life.health).toBe(40);
  battle.useItem({ x: 850, y: 450 }); advance(battle, 7);
  expect(battle.player.itemCharges).toBe(1);
  battle.useSkill(); advance(battle, 1);
  const ready = battle.growthV3!.abilities.actorState('player').queue[0];
  battle.damage(battle.player, 1000); expect(battle.player.life.alive).toBe(false);
  advance(battle, 149); expect(battle.player.life.alive).toBe(false);
  advance(battle, 1); expect(battle.player.life.alive).toBe(true); expect(battle.player.life.spawnProtectionFrames).toBe(75);
  expect(battle.player.itemCharges).toBe(1); expect(battle.growthV3!.abilities.actorState('player').queue[0]).toBe(ready);
});

it('serializes and restores a real pending cast, finite inventory, progression and input queue deterministically', () => {
  const battle = fixture([defaultGrowthLoadoutV3('medic'), defaultGrowthLoadoutV3()]), session = new MatchSession(battle);
  session.bind('client', 'player');
  session.submit('client', { sequence: 0, input: { ...idleInput(), aim: { x: 650, y: 470 } }, actions: ['item'] }); session.tick();
  session.submit('client', { sequence: 1, input: { ...idleInput(), right: true }, actions: [] });
  const restored = MatchSession.restore(session.checkpoint());
  for (let i = 0; i < 60; i++) { session.tick(); restored.tick(); }
  expect(restored.checkpoint()).toEqual(session.checkpoint());
  expect(battle.player.itemCharges).toBe(1); expect(battle.growthV3!.gadgets.smoke()).toHaveLength(1);
});

it('queues pulse after same-tick damage, with no healing of a killed target and no XP for environment damage', () => {
  const battle = fixture([defaultGrowthLoadoutV3('medic'), defaultGrowthLoadoutV3()]);
  battle.player.life.health = 20; battle.useSkill(); advance(battle, 3);
  battle.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  expect(battle.player.life.health).toBe(35);
  expect(battle.growthV3!.participant('player').progression.xp).toBe(0);
  const doomed = fixture([defaultGrowthLoadoutV3('medic'), defaultGrowthLoadoutV3()]);
  doomed.player.life.health = 10; doomed.useSkill(); advance(doomed, 3);
  doomed.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  expect(doomed.player.life.alive).toBe(false); expect(doomed.player.life.health).toBe(0);
});

it('enforces spawn protection attack preparation and does not regenerate G through spawn supplies', () => {
  const battle = fixture(); battle.player.life.spawnProtectionFrames = 75;
  battle.useSkill(); battle.tickPlayers(new Map());
  expect(battle.growthV3!.abilities.actorState('player').charges).toBe(1);
  const fire = new Map([['player', { ...idleInput(), fire: true, aim: { x: 580, y: 567 } }]]);
  battle.tickPlayers(fire); expect(battle.player.life.spawnProtectionFrames).toBe(0); expect(battle.player.arsenal.shots).toBe(0);
  for (let i = 0; i < 7; i++) battle.tickPlayers(fire);
  expect(battle.player.arsenal.shots).toBe(0); battle.tickPlayers(fire); expect(battle.player.arsenal.shots).toBe(1);
});

it('keeps all six link pulses through the real healing and finish phases', () => {
  const medic = changeGrowthAbility(defaultGrowthLoadoutV3('medic'), 'md_link'), battle = fixture([medic, defaultGrowthLoadoutV3()]);
  battle.actors[1].team = 1; battle.actors[1].life.health = 50;
  const input = new Map([['player', { ...idleInput(), aim: { x: 580, y: 566.5 } }]]);
  battle.useSkill(); for (let i = 0; i < 97; i++) battle.tickPlayers(input);
  expect(battle.actors[1].life.health).toBe(80); expect(battle.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(() => Battle.restore(battle.checkpoint())).not.toThrow();
});

it('preserves sidearm reserve conservation when card and perk both transfer and keeps current cooldown on swap', () => {
  const battle = fixture(), runtime = battle.growthV3!, p = runtime.participant('player');
  p.progression.selected = ['as_C4'];
  const cp = runtime.weapons.get('player')!.checkpoint(); cp.guns.primary.ammo = 0; cp.guns.secondary.ammo = 5; cp.shootReadyTick = 40;
  runtime.weapons.set('player', GrowthArsenalV3.restore(cp));
  battle.swap(); advance(battle, 1);
  const gun = runtime.weapons.get('player')!;
  expect(gun.current.ammo).toBe(7); expect(gun.current.reserve).toBe(46); expect(gun.readyTick).toBe(40);
  expect(p.cooldowns.sidefeed).toBe(241); expect(p.cooldowns.sidecard).toBe(241);
});

it('validates completed versus in-progress gadget checkpoint phases', () => {
  const battle = fixture(), saved = battle.growthV3!.gadgets.checkpoint();
  // The actual restore port is not used until after metadata validation.
  expect(() => GadgetSimulation.restore({} as never, { ...saved, finishedTick: saved.lastTick + 1 })).toThrow('Invalid gadget checkpoint');
});
it('rejects forged gadget IDs and unknown command fields before acknowledging or changing the real match', () => {
  const battle = fixture(), session = new MatchSession(battle); session.bind('client', 'player');
  const forged = { sequence: 0, input: idleInput(), actions: ['item'] as const, gadgetId: 'md_smoke' };
  const before = session.checkpoint();
  expect(session.submit('client', { ...forged, actions: [...forged.actions] })).toBe(false);
  expect(session.checkpoint()).toEqual(before);
  expect(session.submit('client', { sequence: 0, input: idleInput(), actions: ['item'] })).toBe(true);
});

it('applies roll-end spread before firing on the exact end tick, and consumes it once', () => {
  const base = fixture(), upgraded = fixture(), runtime = upgraded.growthV3!;
  runtime.participant('player').progression.selected = ['as_A3']; runtime.abilities.updateBuild('player', ['as_A3'], 0);
  for (const battle of [base, upgraded]) {
    battle.useSkill(); advance(battle, 12);
    battle.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { x: 1000, y: 200 } }]]));
  }
  const spread = (b: Battle) => {
    const trace = b.effects.find(e => e.actorId === 'player')!.trace;
    return Math.atan2(trace.end.y - trace.origin.y, trace.end.x - trace.origin.x) - Math.atan2(200 - trace.origin.y, 1000 - trace.origin.x);
  };
  expect(Math.abs(spread(upgraded) / spread(base))).toBeCloseTo(.75, 8);
  expect(runtime.participant('player').buffs.rollSpread).toBeUndefined();
});

it('gives cover support XP only when the blocked bullet would have hit another recently sheltered teammate', () => {
  const battle = fixture([defaultGrowthLoadoutV3('tank'), defaultGrowthLoadoutV3(), defaultGrowthLoadoutV3()]);
  battle.actors[1].team = 1; battle.actors[1].movement.x = 410; battle.actors[2].movement.x = 580;
  battle.useItem({ x: 440, y: 599.5 }); advance(battle, 13); battle.player.movement.x = 300;
  for (let i = 0; i < 29; i++) battle.tickPlayers(new Map([['enemy-1', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  expect(battle.growthV3!.participant('player').progression.xp).toBe(10);
  expect(battle.actors[1].life.health).toBe(100);
  const solo = fixture([defaultGrowthLoadoutV3('tank'), defaultGrowthLoadoutV3()]);
  solo.useItem({ x: 440, y: 599.5 }); advance(solo, 13);
  for (let i = 0; i < 29; i++) solo.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  expect(solo.growthV3!.participant('player').progression.xp).toBe(0);
});

it.each([[90,true],[91,false]] as const)('cover protection history expires after 90 ticks (age %i)',(age,eligible)=>{
  const b=fixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1],enemy=b.actors[2];ally.team=1;
  ally.movement.reset(410,599.5);enemy.movement.reset(580,599.5);
  b.useItem({x:440,y:599.5});advance(b,13);b.player.movement.reset(200,599.5);
  const cover=b.growthV3!.gadgets.entities()[0];
  const last=b.growthV3!.checkpoint().coverSupport[cover.id].nearby[ally.id];
  expect(last).toBe(b.frame);
  // Stay on the incoming ray, but outside the 80px proximity radius.
  ally.movement.reset(300,599.5);
  advance(b,last+age-1-b.frame);
  b.tickPlayers(new Map([[enemy.id,{...idleInput(),fire:true,aim:{x:300,y:567}}]]));
  expect(b.frame-last).toBe(age);expect(cover.health).toBeLessThan(120000);
  const ledger=b.growthV3!.checkpoint().coverSupport[cover.id];
  expect(ledger.blocked>0).toBe(eligible);expect(ally.life.health).toBe(100);
});

it.each([[79.999,true],[80.001,false]] as const)('cover records chest proximity at distance %f only inside 80px',(radius,eligible)=>{
  const b=fixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3()]);
  const ally=b.actors[1],enemy=b.actors[2];ally.team=1;
  ally.movement.reset(250,599.5);enemy.movement.reset(580,599.5);
  b.useItem({x:440,y:599.5});advance(b,13);b.player.movement.reset(200,599.5);
  const cover=b.growthV3!.gadgets.entities()[0];
  const dy=ally.movement.y-33-cover.position.y;
  ally.movement.x=cover.position.x-Math.sqrt(radius*radius-dy*dy);
  b.tickPlayers(new Map([[enemy.id,{...idleInput(),fire:true,aim:{x:ally.movement.x,y:ally.movement.y-33}}]]));
  expect(Math.hypot(ally.movement.x-cover.position.x,ally.movement.y-33-cover.position.y)).toBeCloseTo(radius,6);
  const ledger=b.growthV3!.checkpoint().coverSupport[cover.id];
  expect(ledger.nearby[ally.id]!==undefined).toBe(eligible);
  expect(cover.health).toBeLessThan(120000);expect(ledger.blocked>0).toBe(eligible);
});

it('deducts one station healing budget across two targets in real Battle', () => {
  const medic = { ...defaultGrowthLoadoutV3('medic'), gadgetId: 'md_station' as const };
  const battle = fixture([medic, defaultGrowthLoadoutV3(), defaultGrowthLoadoutV3()]);
  battle.actors[1].team = battle.actors[2].team = 1;
  battle.actors[1].movement.x = 410; battle.actors[2].movement.x = 420;
  battle.actors[1].life.health = battle.actors[2].life.health = 20;
  battle.useItem({ x: 455, y: 599.5 }); advance(battle, 57);
  const cp = battle.checkpoint(); expect(cp.growthV3!.gadgets.entities).toHaveLength(1);
  cp.growthV3!.gadgets.entities[0].healBudget = 5000;
  const restored = Battle.restore(cp); advance(restored, 1);
  expect(restored.actors.slice(1).map(a => a.life.health)).toEqual([23, 22]);
  expect(restored.growthV3!.gadgets.entities()).toHaveLength(0);
});

function message(battle: Battle): StateMessage {
  return { type: 'state', roomId: 'test', round: 1, actorId: 'player', mapId: 'v3-test', mode: 'tdm',
    state: battle.snapshot(), result: battle.result, ack: 0, poses: battle.actors.map(a => ({ id: a.id, name: a.name, aim: a.aim })),
    effects: battle.effects, bursts: battle.bursts, grenades: [], events: battle.journal.since(0) };
}
it('shows an active treatment link only to recipients who can see its target', () => {
  const build = changeGrowthAbility(defaultGrowthLoadoutV3('medic'), 'md_link');
  const battle = fixture([build, defaultGrowthLoadoutV3()]);
  const target = battle.actors[1]; target.team = 1; target.life.health = 40;
  battle.player.aim = { x: target.movement.x, y: target.movement.y - 33 };
  battle.useSkill(); advance(battle, 7);
  expect(battle.growthV3!.actorView('player')).toMatchObject({ activeAbility: 'md_link', linkTargetId: target.id });
  const filtered = visibleState(message(battle), new Set(['player']), 2, battle.wall);
  expect(filtered.state.actors[0].growthV3!.linkTargetId).toBeUndefined();
  expect(battle.growthV3!.actorView('player').linkTargetId).toBe(target.id);
});
it('smoke filters real actor/effect/pose coordinates; audible shots reveal only a frozen radar point to in-range teams', () => {
  const battle = fixture(), cp = battle.checkpoint();
  cp.growthV3!.gadgets.smoke.push({ id: 'smoke-fixture', sourceId: 'player', team: 1, gadgetId: 'md_smoke', position: { x: 490, y: 560 }, radius: 80, expiresTick: 100 });
  const restored = Battle.restore(cp), runtime = restored.growthV3!;
  restored.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  restored.actors[1].movement.x = 650; advance(restored, 1);
  const filtered = visibleState(message(restored), runtime.visibleActors(1), 1, restored.wall, (a, b) => runtime.gadgets.smokeBlocks(a, b));
  expect(filtered.state.actors.map(a => a.id)).toEqual(['player']); expect(filtered.poses.map(a => a.id)).toEqual(['player']);
  expect(filtered.effects).toHaveLength(0);
  const mark = filtered.state.growthWorld!.radar[0];
  expect(mark.position.x).toBe(580); expect(mark.sourceId).toBeUndefined(); expect(mark.id).not.toContain('enemy');
  const receivedDamage = filtered.events.find(e => e.kind === 'damage');
  expect(receivedDamage?.actorId).toBeUndefined(); expect(receivedDamage?.position).toBeUndefined();
  const distant = fixture(); distant.actors[1].movement.x = 1100;
  distant.tickPlayers(new Map([['enemy-0', { ...idleInput(), fire: true, aim: { x: 400, y: 567 } }]]));
  expect(distant.growthV3!.worldView().radar).toHaveLength(0);
});

it('bots make the same decisions when an unobserved enemy moves behind smoke', () => {
  const battle = fixture(); battle.player.human = false;
  const cp = battle.checkpoint();
  cp.growthV3!.gadgets.smoke.push({ id: 'smoke-fixture', sourceId: 'player', team: 1, gadgetId: 'md_smoke', position: { x: 600, y: 550 }, radius: 550, expiresTick: 200 });
  const left = Battle.restore(cp), right = Battle.restore(cp); right.actors[1].movement.x = 1000;
  advance(left, 60); advance(right, 60);
  expect(left.player.brain.target).toBeNull(); expect(right.player.brain.target).toBeNull();
  expect(left.player.movement.checkpoint()).toEqual(right.player.movement.checkpoint());
  expect(left.player.aim).toEqual(right.player.aim); expect(left.player.itemCharges).toBe(2);
});

it('repeated real R input on the reload completion tick does not restart its timer', () => {
  const battle = fixture(), gun = battle.growthV3!.weapons.get('player')!;
  battle.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { x: 400, y: 100 } }]]));
  advance(battle, 4); battle.reload(); advance(battle, 1);
  const deadline = gun.current.reloadUntil;
  expect(deadline).toBeGreaterThan(battle.frame);
  while (battle.frame < deadline) { battle.reload(); advance(battle, 1); }
  expect(gun.current.reloadUntil).toBe(0);
  expect([gun.current.ammo, gun.current.reserve]).toEqual([30, 89]);
  expect(battle.growthV3!.participant('player').metrics.tacticalReloads).toBe(1);
});

it.each(['shield', 'plate', 'cover'] as const)('bots finish %s without repeated busy reload requests, then reload their actually depleted gun', kind => {
  const build = changeGrowthAbility(defaultGrowthLoadoutV3('tank'), 'tk_shield');
  build.primary = 'mp5'; build.gadgetId = kind === 'plate' ? 'tk_plate' : 'tk_cover';
  const battle = fixture([build, defaultGrowthLoadoutV3()]);
  battle.actors[1].team = battle.player.team;
  battle.actors[1].movement.reset(1250, 599.5);
  const runtime = battle.growthV3!, gun = runtime.weapons.get('player')!;
  while (gun.current.ammo > 9 && battle.frame < 150)
    battle.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { x: 400, y: 100 } }]]));
  expect(gun.current.ammo).toBe(9);
  advance(battle, 5);
  runtime.participant('player').cooldowns.aiEval = battle.frame + 1000;
  // These are real queued commands; maintenance also must not race the first cast tick.
  if (kind === 'shield') battle.useSkill();
  else battle.useItem({ x: 440, y: 599.5 });
  const cursor = battle.journal.cursor;
  battle.player.human = false;
  const restored = Battle.restore(battle.checkpoint());
  advance(battle, 150); advance(restored, 150);
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(battle.journal.since(cursor).filter(event => event.kind === 'error' && event.actorId === 'player')).toEqual([]);
  expect(runtime.participant('player').metrics.tacticalReloads).toBe(1);
  expect(gun.current.ammo).toBe(30);
  if (kind === 'shield') expect(battle.journal.since(cursor).some(event => event.kind === 'skill')).toBe(true);
  else expect(battle.player.itemCharges).toBe(kind === 'plate' ? 1 : 0);
});

it('runs a deterministic 4v4 bot skirmish with four exclusive kits and restores it without desynchronization', () => {
  const classes = ['assault', 'tank', 'sniper', 'medic'] as const;
  const battle = fixture([...classes, ...classes].map(c => defaultGrowthLoadoutV3(c)));
  battle.actors.forEach((a, i) => { a.human = false; a.team = i < 4 ? 1 : 2; a.movement.reset(i < 4 ? 300 + i * 40 : 800 + (i - 4) * 40, 599.5); });
  advance(battle, 180);
  const restored = Battle.restore(battle.checkpoint());
  advance(battle, 420); advance(restored, 420);
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(battle.scores[0] + battle.scores[1]).toBeGreaterThan(0);
  expect(battle.actors.every(a => a.itemCharges >= 0)).toBe(true);
});
