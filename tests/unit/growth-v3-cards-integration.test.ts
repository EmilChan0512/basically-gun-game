import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import {  changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { legalGrowthCards, type GrowthCardId } from '../../src/shared/content/growth-v3/Cards';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import type { GrowthAbilityId } from '../../src/shared/content/growth-v3/Operators';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import type { GrowthGadgetId } from '../../src/shared/content/growth-v3/Gadgets';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';

function fixture(classId:GrowthClassId,card:GrowthCardId,ability?:GrowthAbilityId,guard=false,blast=false,gadget?:GrowthGadgetId){
  let build=defaultGrowthLoadoutV3(classId);if(ability)build=changeGrowthAbility(build,ability);
  build.pool=[card,...legalGrowthCards(classId,build.abilityId).filter(id=>id!==card)].slice(0,8);
  if(guard)build.perks[2]='pk_reloadguard';
  if(blast)build.perks[2]='pk_blast';
  if(gadget)build.gadgetId=gadget;
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=r.battle;
  const p=b.growthV3!.participant('player'),gun=b.growthV3!.weapons.get('player')!;
  awardGrowthV3(p.progression,p.loadout,200,b.frame,()=>0);
  expect(p.progression.offer!.cards).toContain(card);
  expect(b.growthChoice('player',p.progression.offer!.batch,card)).toBe(true);
  const shootTo=(ammo:number)=>{
    for(let i=0;i<1200&&gun.current.ammo>ammo;i++)r.step({fire:i%2===0,aim:{x:20,y:100}});
    expect(gun.current.ammo).toBe(ammo);
    for(let i=0;i<50;i++)r.step();
  };
  const finishReload=()=>{
    const remaining=gun.current.reloadUntil-b.frame;
    expect(remaining).toBeGreaterThan(0);
    for(let i=0;i<remaining;i++)r.step();expect(gun.current.reloadUntil).toBe(0);
  };
  return {r,b,p,gun,shootTo,finishReload};
}

it.each([
  ['assault','as_C1',29,false,false,28],['assault','as_C1',0,false,false,42],
  ['assault','as_C1',29,false,true,30],
  ['tank','tk_C2',49,true,false,52],['tank','tk_C2',49,false,false,65],['tank','tk_C2',0,true,false,78],
  ['sniper','sn_C4',2,false,false,48],['sniper','sn_C4',1,false,false,36],['sniper','sn_C4',0,false,false,60],
] as const)('%s %s at %s rounds crouch=%s guard=%s reloads in %s ticks', (cls,card,ammo,crouch,guard,duration)=>{
  const f=fixture(cls,card,undefined,guard);f.shootTo(ammo);f.r.step({crouch});
  const total=f.gun.current.ammo+f.gun.current.reserve;
  f.b.reload();f.r.step({crouch});expect(f.gun.current.reloadDuration).toBe(duration);
  const deadline=f.gun.current.reloadUntil;
  // Standing after starting a crouched reload must not change its committed duration.
  for(let i=0;i<duration-1;i++)f.r.step();expect(f.b.frame).toBe(deadline-1);expect(f.gun.current.ammo).toBe(ammo);
  f.r.step();expect(f.gun.current.reloadUntil).toBe(0);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(f.gun.current.ammo).toBeGreaterThan(ammo);
});

it('sn_G2 real decoy emits a 600px sound radius and expires after 120 ticks',()=>{
  const f=fixture('sniper','sn_G2',undefined,false,false,'sn_decoy');f.b.useItem({x:120,y:499.5});
  for(let i=0;i<22;i++)f.r.step();const entity=f.b.growthV3!.gadgets.entities()[0];
  expect(entity.bornTick).toBe(22);expect(entity.expiresTick).toBe(142);
  for(let i=0;i<119;i++)f.r.step();expect(f.b.growthV3!.gadgets.entities()).toHaveLength(1);
  const events=f.b.growthV3!.checkpoint().gadgetEvents.filter(e=>e.kind==='decoy');
  expect(events.map(e=>[e.tick,e.radius,e.expiresTick])).toEqual([[22,600,37],[52,600,67],[82,600,97],[112,600,127]]);
  expect(events.every(e=>e.position?.x===entity.position.x&&e.position.y===entity.position.y)).toBe(true);
  f.r.step();expect(f.b.growthV3!.gadgets.entities()).toHaveLength(0);
});

it('sn_G2 real EMP disables an electronic station 180px away for sixty ticks and resumes its original pulse schedule',()=>{
  const template=fixture('sniper','sn_G2',undefined,false,false,'sn_emp');
  const b=new Battle(template.b.mission,'normal','m4',seededRandom(112));
  const medic=defaultGrowthLoadoutV3('medic');medic.gadgetId='md_station';
  b.enableGrowthV3({player:template.p.loadout,'enemy-0':medic},5);
  b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;});b.player.movement.reset(120,499.5);
  const p=b.growthV3!.participant('player');awardGrowthV3(p.progression,p.loadout,200,0,()=>0);
  expect(b.growthChoice('player',p.progression.offer!.batch,'sn_G2')).toBe(true);
  const aim={x:1000,y:466.5},impact=b.growthV3!.gadgets.predictThrow('player',aim)!;
  const stationX=impact.x+Math.sqrt(180**2-(487.5-impact.y)**2),target=b.actors[1];
  expect(Number.isFinite(stationX)).toBe(true);target.movement.reset(stationX-40,499.5);target.life.health=50;
  expect(b.useItem({x:stationX,y:499.5},target)).toBe(true);expect(b.useItem(aim)).toBe(true);
  for(let i=0;i<31;i++)b.tickPlayers(new Map());const station=b.growthV3!.gadgets.entities()[0];
  expect(Math.hypot(station.position.x-impact.x,station.position.y-impact.y)).toBeCloseTo(180);
  expect(station.stoppedUntil).toBe(91);expect(station.health).toBe(60000);expect(target.life.health).toBe(50);
  for(let i=0;i<86;i++)b.tickPlayers(new Map());expect(b.frame).toBe(117);expect(target.life.health).toBe(50);
  b.tickPlayers(new Map());expect(target.life.health).toBe(53);expect(station.healBudget).toBe(87000);
});

it.each([
  ['as_frag',0,42.5,34,138],['as_frag',138,8.5,34,138],['as_frag',139,0,34,138],
  ['as_concussion',0,8.5,31,115],['as_concussion',110,8.5,31,115],['as_concussion',116,0,31,115],
] as const)('as_G2 real %s at blast distance %s pays damage penalty and uses expanded radius', (gadget,distance,damage,end,radius)=>{
  const f=fixture('assault','as_G2',undefined,false,false,gadget),aim={x:120,y:100};
  const impact=f.b.growthV3!.gadgets.predictThrow('player',aim)!;expect(f.b.useItem(aim)).toBe(true);
  for(let i=0;i<end-1;i++)f.r.step();
  // Only target geometry is controlled; the throw and its final impact remain simulated.
  f.b.actors[1].movement.reset(impact.x+distance,impact.y+33);f.r.step();
  expect(f.b.actors[1].life.health).toBe(100-damage);
  expect(f.b.bursts.at(-1)?.radius).toBeCloseTo(radius);
  if(gadget==='as_concussion')expect(f.b.growthV3!.participant('enemy-0').slowScale).toBe(distance<=115?.2:0);
});

it('as_G2 real remote charge uses expanded radius and reduced person damage',()=>{
  const f=fixture('assault','as_G2',undefined,false,false,'as_charge');f.b.useItem({x:160,y:499.5});
  for(let i=0;i<43;i++)f.r.step();expect(f.b.growthV3!.gadgets.entities()).toHaveLength(1);
  f.b.actors[1].movement.reset(160,499.5);expect(f.b.useItem(f.r.aim)).toBe(true);f.r.step();
  expect(f.b.bursts.at(-1)?.radius).toBeCloseTo(115);
  expect(f.b.actors[1].life.health).toBe(78.639);
  expect(f.b.growthV3!.gadgets.entities()).toHaveLength(0);expect(f.b.player.itemCharges).toBe(0);
});

it.each([['tk_cover',150000,300],['tk_interceptor',55000,240]] as const)('tk_G2 real %s gains health and expires at shortened lifetime', (gadget,hp,duration)=>{
  const f=fixture('tank','tk_G2',undefined,false,false,gadget);f.b.useItem({x:160,y:499.5});
  for(let i=0;i<13;i++)f.r.step();const entity=f.b.growthV3!.gadgets.entities()[0];
  expect(entity.health).toBe(hp);expect(entity.expiresTick).toBe(13+duration);
  for(let i=0;i<duration-1;i++)f.r.step();expect(f.b.growthV3!.gadgets.entities()).toHaveLength(1);
  f.r.step();expect(f.b.growthV3!.gadgets.entities()).toHaveLength(0);
});

it('tk_G2 real plate supplies twenty armor for ninety ticks only',()=>{
  const f=fixture('tank','tk_G2',undefined,false,false,'tk_plate');f.b.useItem(f.r.aim);
  for(let i=0;i<31;i++)f.r.step();expect(f.p.armor.remaining).toBe(20000);
  for(let i=0;i<89;i++)f.r.step();expect(f.p.armor.remaining).toBe(20000);
  f.r.step();expect(f.b.frame).toBe(121);expect(f.p.armor.remaining).toBe(0);
});

it('md_G2 real smoke expands to 180 pixels while lasting only 120 ticks',()=>{
  const f=fixture('medic','md_G2',undefined,false,false,'md_smoke');f.b.useItem({x:120,y:499.5});
  for(let i=0;i<31;i++)f.r.step();const smoke=f.b.growthV3!.gadgets.smoke()[0];
  expect(smoke.radius).toBe(180);expect(smoke.expiresTick).toBe(151);
  const {x,y}=smoke.position;
  expect(f.b.growthV3!.gadgets.smokeBlocks({x:x+170,y:y-10},{x:x+170,y:y+10})).toBe(true);
  for(let i=0;i<119;i++)f.r.step();expect(f.b.growthV3!.gadgets.smoke()).toHaveLength(1);
  f.r.step();expect(f.b.growthV3!.gadgets.smoke()).toHaveLength(0);
});

it('sn_G2 expands continuous beacon sight beyond the base radius',()=>{
  const f=fixture('sniper','sn_G2',undefined,false,false,'sn_beacon');f.b.actors[1].movement.reset(1160,499.5);
  f.b.useItem({x:160,y:499.5});for(let i=0;i<28;i++)f.r.step();
  const ping=f.b.journal.since(0).find(e=>e.kind==='intelPing');expect(ping).toMatchObject({tick:28,expiresTick:52,position:{x:1160,y:466.5}});
  expect(f.b.growthV3!.gadgets.visionCircles(1,f.b.frame)[0].radius).toBe(1100);
  expect(f.b.growthV3!.visibleActors(1).has(f.b.actors[1].id)).toBe(true);
});

it('md_G2 actual station heals beyond the old radius and spends its reduced 72HP budget',()=>{
  const f=fixture('medic','md_G2',undefined,false,false,'md_station'),target=f.b.actors[1];
  target.team=1;target.movement.reset(330,499.5);target.life.health=50;
  f.b.useItem({x:160,y:499.5});for(let i=0;i<13;i++)f.r.step();
  expect(f.b.growthV3!.gadgets.entities()[0].healBudget).toBe(72000);
  for(let i=0;i<45;i++)f.r.step();expect(target.life.health).toBe(53);
  expect(f.b.growthV3!.gadgets.entities()[0].healBudget).toBe(69000);
});

it('md_G2 actual ammo box reaches beyond sixty pixels but supplies only fifteen percent',()=>{
  const f=fixture('medic','md_G2',undefined,false,false,'md_ammo');f.shootTo(0);
  f.b.useItem({x:160,y:499.5});for(let i=0;i<13;i++)f.r.step();f.b.player.movement.reset(245,499.5);
  for(let i=0;i<15;i++)f.r.step();expect(f.gun.current.ammo).toBe(0);expect(f.gun.current.reserve).toBe(114);
  for(let i=0;i<5;i++)f.r.step();expect(f.gun.current.reserve).toBe(114);
});

it.each([[80,117],[81,110]] as const)('as_C3 enemy death at %s pixels supplies once only inside eighty pixels', (distance,total)=>{
  const f=fixture('assault','as_C3');f.shootTo(20);f.b.actors[1].movement.reset(120+distance,499.5);
  f.b.damage(f.b.actors[1],999,f.b.player);f.b.tickPlayers(new Map());
  expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  for(let i=0;i<20;i++)f.b.tickPlayers(new Map());expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(f.p.scavenged).toHaveLength(distance===80?1:0);
});

it.each([[179,117],[180,110]] as const)('as_C3 first visits an enemy death point after %s ticks', (age,total)=>{
  const f=fixture('assault','as_C3');f.shootTo(20);
  f.b.actors[1].movement.reset(500,499.5);f.b.damage(f.b.actors[1],999,f.b.player);
  const deathTick=f.b.frame;
  while(f.b.frame<deathTick+age-1)f.b.tickPlayers(new Map());
  expect(f.gun.current.ammo+f.gun.current.reserve).toBe(110);
  f.b.player.movement.reset(480,499.5);
  const restored=Battle.restore(f.b.checkpoint());f.b.tickPlayers(new Map());restored.tickPlayers(new Map());
  expect(f.b.frame).toBe(deathTick+age);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(restored.checkpoint()).toEqual(f.b.checkpoint());
});

it.each([[30,190],[48,200]] as const)('tk_C4 actual kill replenishes ten main reserve rounds with capacity cap (ammo=%s)', (ammo,total)=>{
  const f=fixture('tank','tk_C4');f.shootTo(ammo);
  f.b.damage(f.b.actors[1],999,f.b.player);
  expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);expect(f.gun.current.ammo).toBe(ammo);
  expect(f.p.cooldowns.reclaim).toBe(f.b.frame+150);
  f.b.damage(f.b.actors[1],999,f.b.player);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
});

it('as_C4 and pk_sidefeed share a two-round transfer and both cooldowns after the main gun really empties',()=>{
  const f=fixture('assault','as_C4');f.b.swap();f.r.step();f.shootTo(9);
  f.b.swap();f.r.step();f.shootTo(0);
  const wait=Math.max(0,f.p.cooldowns.sidefeed-f.b.frame);for(let i=0;i<wait;i++)f.r.step();
  const secondary=f.gun.checkpoint().guns.secondary,total=secondary.ammo+secondary.reserve;
  expect(secondary.ammo).toBe(9);f.b.swap();f.r.step();
  expect(f.gun.current.ammo).toBe(11);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(f.p.cooldowns.sidecard).toBe(f.b.frame+240);expect(f.p.cooldowns.sidefeed).toBe(f.b.frame+240);
  f.b.swap();f.r.step();f.b.swap();f.r.step();expect(f.gun.current.ammo).toBe(11);
});

it.each([
  ['assault','as_G1','as_frag',2,6],['assault','as_G1','as_concussion',2,6],['assault','as_G1','as_charge',1,12],
  ['tank','tk_G1','tk_cover',1,12],['tank','tk_G1','tk_interceptor',1,12],['tank','tk_G1','tk_plate',2,30],
  ['sniper','sn_G1','sn_beacon',1,12],['sniper','sn_G1','sn_emp',2,6],['sniper','sn_G1','sn_decoy',2,6],
  ['medic','md_G1','md_smoke',2,6],['medic','md_G1','md_station',1,12],['medic','md_G1','md_ammo',1,12],
] as const)('%s %s grants exactly one usable extra %s inventory', (cls,card,gadget,initial,cast)=>{
  const f=fixture(cls,card,undefined,false,false,gadget);
  expect(f.b.player.itemCharges).toBe(initial+1);
  expect(f.b.growthChoice('player',f.p.progression.serial,card)).toBe(false);
  expect(f.b.player.itemCharges).toBe(initial+1);
  expect(f.b.useItem({x:160,y:499.5})).toBe(true);
  for(let i=0;i<cast;i++)f.r.step();expect(f.b.player.itemCharges).toBe(initial+1);
  f.r.step();expect(f.b.player.itemCharges).toBe(initial);
  const kind=gadget==='tk_plate'?'armorChanged':cast===12?'deployableCreated':'gadgetReleased';
  expect(f.b.journal.since(0).filter(e=>e.kind===kind)).toHaveLength(1);
});

it('tk_A2 refunds actual prevented damage at most once per thirty ticks and sixty per cast',()=>{
  const f=fixture('tank','tk_A2');f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  const state=()=>f.b.growthV3!.abilities.actorState('player');expect(state().queue).toEqual([364]);
  f.b.damage(f.b.player,10,f.b.actors[1]);expect(f.b.player.life.health).toBe(108.5);expect(state().queue).toEqual([334]);
  f.b.damage(f.b.player,10,f.b.actors[1]);expect(state().queue).toEqual([334]);
  for(let i=0;i<29;i++)f.r.step();f.b.damage(f.b.player,10,f.b.actors[1]);expect(state().queue).toEqual([334]);
  f.r.step();f.b.damage(f.b.player,10,f.b.actors[1]);expect(state().queue).toEqual([304]);
  for(let i=0;i<30;i++)f.r.step();f.b.damage(f.b.player,10,f.b.actors[1]);expect(state().queue).toEqual([304]);
});

it.each([[false,false,0],[true,false,10000],[true,true,0]] as const)('tk_A3 grants armor only after absorption and natural expiry (hit=%s cancel=%s)',(hit,cancel,armor)=>{
  const f=fixture('tank','tk_A3');f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  if(hit)f.b.damage(f.b.player,10,f.b.actors[1]);
  if(cancel)f.b.useSkill();
  for(let i=0;i<90;i++)f.r.step();expect(f.p.armor.remaining).toBe(armor);
  if(armor){for(let i=0;i<59;i++)f.r.step();expect(f.p.armor.remaining).toBe(10000);f.r.step();expect(f.p.armor.remaining).toBe(0);}
});

it.each([[false,false],[true,false],[true,true]] as const)('tk_B3 gives nearest ally armor or self fallback only on natural expiry (ally=%s cancel=%s)',(ally,cancel)=>{
  const f=fixture('tank','tk_B3','tk_shield'),target=f.b.actors[1];
  if(ally){target.team=1;target.movement.reset(220,499.5);}
  f.b.useSkill();for(let i=0;i<7;i++)f.r.step();if(cancel)f.b.useSkill();
  for(let i=0;i<90;i++)f.r.step();
  expect(f.p.armor.remaining).toBe(!cancel&&!ally?10000:0);
  expect(f.b.growthV3!.participant(target.id).armor.remaining).toBe(!cancel&&ally?10000:0);
});

it.each(['boundary','outside','nearest','tie','hidden'] as const)('tk_B3 shield exhaustion selects a legal recipient (%s)',scenario=>{
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('tank'),'tk_shield');
  build.pool=['tk_B3' as const,...legalGrowthCards('tank','tk_shield').filter(id=>id!=='tk_B3')].slice(0,8);
  const mission={...new GrowthRangeSession(build,{distance:1800,health:100,armor:0}).battle.mission,enemies:3};
  let b=new Battle(mission,'normal','m4',seededRandom(92311));
  b.enableGrowthV3(Object.fromEntries(b.actors.map(a=>[a.id,a.id==='player'?build:defaultGrowthLoadoutV3()])),5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?500+i*100:120,499.5);});
  b.actors[1].team=1;b.actors[2].team=1;
  const positions={boundary:[240,1000],outside:[241,1000],nearest:[220,180],tie:[220,20],hidden:[200,20]}[scenario];
  b.actors[1].movement.reset(positions[0],499.5);b.actors[2].movement.reset(positions[1],499.5);
  const p=b.growthV3!.participant('player');awardGrowthV3(p.progression,p.loadout,200,0,()=>0);
  expect(b.growthChoice('player',p.progression.offer!.batch,'tk_B3')).toBe(true);
  if(scenario==='hidden'){
    const state=b.checkpoint();state.growthV3!.gadgets.smoke.push({id:'relay-smoke',sourceId:'enemy-2',team:2,gadgetId:'md_smoke',position:{x:200,y:466.5},radius:20,expiresTick:100});
    b=Battle.restore(state);
  }
  b.player.aim={x:1000,y:466.5};b.useSkill();for(let i=0;i<7;i++)b.tickPlayers(new Map());
  b.damage(b.player,100,b.actors[3]);b.damage(b.player,100,b.actors[3]);b.tickPlayers(new Map());
  expect(b.player.life.alive).toBe(true);expect(b.growthV3!.abilities.actorState('player').active).toBeNull();
  const recipient=scenario==='outside'?'player':scenario==='nearest'||scenario==='hidden'?'enemy-1':'enemy-0';
  for(const actor of b.actors)expect(b.growthV3!.participant(actor.id).armor.remaining).toBe(actor.id===recipient?10000:0);
});

it('md_B2 pauses damaged real chain until fifteen damage-free ticks and never catches up skipped pulses',()=>{
  const f=fixture('medic','md_B2','md_link');f.b.damage(f.b.player,50,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<20;i++)f.r.step();
  f.b.damage(f.b.player,1,f.b.actors[1]);expect(f.b.growthV3!.abilities.actorState('player').active).not.toBeNull();
  for(let i=0;i<77;i++)f.r.step();
  expect(f.b.player.life.health).toBe(59);
  expect(f.b.journal.since(0).filter(e=>e.kind==='heal').map(e=>e.tick)).toEqual([37,52,67,82,97]);
  expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
});

it.each([[37,[52,67,82,97],54],[38,[67,82,97],51]] as const)('md_B2 repeated damage last at tick %s resets the quiet interval without delaying expiry', (lastHit,pulses,health)=>{
  const f=fixture('medic','md_B2','md_link');f.b.damage(f.b.player,50,f.b.actors[1]);
  f.b.useSkill();
  for(const tick of [20,30,lastHit]){
    while(f.b.frame<tick)f.b.tickPlayers(new Map());
    f.b.damage(f.b.player,1,f.b.actors[1]);
    expect(f.b.growthV3!.abilities.actorState('player').active!.pauseUntil).toBe(tick+15);
  }
  expect(f.b.journal.since(0).filter(e=>e.kind==='heal')).toEqual([]);
  const restored=Battle.restore(f.b.checkpoint());
  while(f.b.frame<97){f.b.tickPlayers(new Map());restored.tickPlayers(new Map());}
  expect(f.b.journal.since(0).filter(e=>e.kind==='heal').map(e=>e.tick)).toEqual(pulses);
  expect(f.b.player.life.health).toBe(health);
  expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(restored.checkpoint()).toEqual(f.b.checkpoint());
});

it.each([
  ['assault','as_A1','as_roll',20,23,0],
  ['assault','as_B1','as_reloadrush',20,26,3],
  ['sniper','sn_A3','sn_focus',1,2,3],
] as const)('%s %s transfers only reserve rounds at actual %s commit', (cls,card,ability,ammo,after,cast)=>{
  const f=fixture(cls,card,ability);f.shootTo(ammo);
  const total=f.gun.current.ammo+f.gun.current.reserve;
  f.b.useSkill();f.r.step();
  if(cast){expect(f.gun.current.ammo).toBe(ammo);for(let i=0;i<cast-1;i++)f.r.step();expect(f.gun.current.ammo).toBe(ammo);f.r.step();}
  expect(f.gun.current.ammo).toBe(after);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total);
  expect(f.b.growthV3!.abilities.actorState('player').active?.startTick).toBe(f.b.frame);
});

it.each([
  ['assault','as_A2','as_roll',0,12,210,1.35],
  ['assault','as_B2','as_reloadrush',3,24,360,1.25],
  ['tank','tk_A1','tk_barrier',3,90,390,.81],
  ['tank','tk_B1','tk_shield',6,90,420,.72],
  ['tank','tk_B2','tk_shield',3,75,420,.765],
  ['sniper','sn_A1','sn_focus',3,60,300,.8],
  ['sniper','sn_B1','sn_relocate',0,60,390,1.2],
  ['sniper','sn_B3','sn_relocate',0,45,360,1.15],
] as const)('%s %s real cast changes lifetime, cooldown and movement together', (cls,card,ability,cast,duration,cd,speed)=>{
  const f=fixture(cls,card,ability),start=f.b.frame+1+cast;
  f.b.useSkill();for(let i=0;i<=cast;i++)f.r.step();
  const state=()=>f.b.growthV3!.abilities.actorState('player');
  expect(state().active).toMatchObject({startTick:start,endTick:start+duration});
  expect(state().queue).toEqual([start+cd]);expect(f.b.player.movement.speedScale).toBeCloseTo(speed);
  if(card==='tk_B1')expect(state().active?.shieldBudget).toBe(150000);
  for(let i=0;i<duration-1;i++)f.r.step();expect(state().active).not.toBeNull();
  f.r.step();expect(state().active).toBeNull();expect(f.b.player.movement.speedScale).toBe(cls==='tank'?.9:1);
  const until=state().queue[0]-f.b.frame;
  for(let i=0;i<until-1;i++)f.r.step();expect(state().charges).toBe(0);
  f.r.step();expect(state().charges).toBe(1);expect(state().queue).toEqual([]);
});

it('md_B3 actual self chain produces six pulses ten ticks apart and ends with its final heal',()=>{
  const f=fixture('medic','md_B3','md_link');f.b.damage(f.b.player,50,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<66;i++)f.r.step();
  expect(f.b.player.life.health).toBe(60);expect(f.b.growthV3!.abilities.actorState('player').active).not.toBeNull();
  f.r.step();expect(f.b.player.life.health).toBe(63);expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(f.b.journal.since(0).filter(e=>e.kind==='heal').map(e=>[e.tick,e.amount])).toEqual([[17,3],[27,3],[37,3],[47,3],[57,3],[67,3]]);
});

it.each([
  ['md_C1','md_pulse',20,55,4],['md_C1','md_pulse',28.5,53.5,4],
  ['md_C4','md_pulse',60,90,4],['md_C4','md_link',40,64,97],
  ['md_C1','md_link',20,41,97],['md_C1','md_link',28.5,46.5,97],
] as const)('%s with %s heals self from %s to %s through real pulses', (card,ability,initial,expected,ticks)=>{
  const f=fixture('medic',card,ability);f.b.damage(f.b.player,95-initial,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<ticks;i++)f.r.step();
  expect(f.b.player.life.health).toBe(expected);
  expect(f.p.progression.xp).toBe(200);
  const heals=f.b.journal.since(0).filter(e=>e.kind==='heal'&&e.actorId==='player');
  expect(heals).toHaveLength(ability==='md_link'?6:1);
  expect(heals.reduce((sum,e)=>sum+(e.amount??0),0)).toBe(expected-initial);
});

it.each([false,true])('md_C2 speed requires healing another teammate (other=%s)',other=>{
  const f=fixture('medic','md_C2');
  const target=other?f.b.actors[1]:f.b.player;
  if(other){target.team=1;target.movement.reset(220,499.5);}
  // Initial wounded fixture; the actual E must heal before the reward exists.
  target.life.health=target.life.maxHealth-20;
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(target.life.health).toBe(target.life.maxHealth);
  expect(f.p.cooldowns.medRun).toBe(other?184:undefined);
  f.r.step();expect(f.b.player.movement.speedScale).toBeCloseTo(other?1.035:.9);
  for(let i=0;i<59;i++)f.r.step();expect(f.b.frame).toBe(64);expect(f.b.player.movement.speedScale).toBe(1);
});

it.each([
  ['tk_C1',true,false,false,false,8.5],['tk_C1',false,false,false,false,10],
  ['tk_C1',true,false,true,false,5],
  ['tk_C3',false,true,false,false,7.5],['tk_C3',false,false,false,false,10],
  ['tk_C3',false,true,false,true,6.5],['tk_C3',false,true,true,true,3.5],
] as const)('%s crouch=%s explosion=%s barrier=%s blastPerk=%s adds personal defense with a 65 percent cap', (card,crouch,explosion,barrier,blast,damage)=>{
  const f=fixture('tank',card,undefined,false,blast);
  if(barrier){f.b.useSkill();for(let i=0;i<4;i++)f.r.step({crouch});}
  else f.r.step({crouch});
  f.b.damage(f.b.player,10,f.b.actors[1],explosion);
  expect(f.b.player.life.health).toBe(115-damage);
});

it.each([0,45])('sn_B2 only speeds manual reload while real relocation remains active (wait=%s)',wait=>{
  const f=fixture('sniper','sn_B2','sn_relocate');f.shootTo(3);
  f.b.useSkill();f.r.step();for(let i=0;i<wait;i++)f.r.step();
  expect(!!f.b.growthV3!.abilities.actorState('player').active).toBe(wait===0);
  f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(wait===0?39:48);
  f.finishReload();expect(f.gun.current.ammo).toBe(4);
});

function offset(r:GrowthRangeSession){
  const effect=r.battle.effects.find(e=>e.frame===r.battle.frame&&e.actorId==='player');expect(effect).toBeDefined();
  const {origin,end}=effect!.trace,aim=r.battle.player.aim;
  return Math.atan2(end.y-origin.y,end.x-origin.x)-Math.atan2(aim.y-origin.y,aim.x-origin.x);
}

it.each([0,30])('as_A3 real post-roll shot benefit is single use and expires after thirty ticks (wait=%s)',wait=>{
  const f=fixture('assault','as_A3'),z=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  f.b.useSkill();z.battle.useSkill();for(let i=0;i<13+wait;i++){f.r.step();z.step();}
  f.r.step({fire:true});z.step({fire:true});expect(offset(f.r)/offset(z)).toBeCloseTo(wait===0?.75:1,7);
  for(let i=0;i<4;i++){f.r.step();z.step();}
  f.r.step({fire:true});z.step({fire:true});expect(offset(f.r)/offset(z)).toBeCloseTo(1,7);
});

it.each([false,true])('sn_A2 actual focused hit refunds cooldown only for head damage (head=%s)',head=>{
  const f=fixture('sniper','sn_A2');f.b.actors[1].movement.reset(210,499.5);
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  f.r.step({fire:true,aim:{...f.r.aim,y:f.r.aim.y-(head?25:0)}});
  expect(f.b.effects.at(-1)?.trace.hit).toMatchObject({type:'unit',region:head?'head':'body'});
  expect(f.b.actors[1].life.health).toBeLessThan(100);
  expect(f.b.growthV3!.abilities.actorState('player').queue).toEqual([head?334:364]);
});

it.each([
  ['md_A1',220,20,420,.9],['md_A2',100,20,336,.9],['md_A3',100,25,462,1],
] as const)('%s actual teammate pulse includes its range, healing, cooldown and speed tradeoff', (card,distance,healed,cd,speed)=>{
  const f=fixture('medic',card),target=f.b.actors[1];target.team=1;target.movement.reset(120+distance,499.5);target.life.health=50;
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(target.life.health).toBe(50+healed);expect(f.b.player.movement.speedScale).toBe(speed);
  expect(f.b.growthV3!.abilities.actorState('player').queue).toEqual([4+cd]);
});

it.each([false,true])('md_B1 extended chain pays one HP per pulse on self=%s',self=>{
  const f=fixture('medic','md_B1','md_link'),target=self?f.b.player:f.b.actors[1];
  if(!self){target.team=1;target.movement.reset(400,499.5);}target.life.health=45;
  f.b.useSkill();for(let i=0;i<97;i++)f.r.step();
  expect(target.life.health).toBe(self?57:69);
  expect(f.b.journal.since(0).filter(e=>e.kind==='heal')).toHaveLength(6);
});

it.each([[29,1],[30,.75/.85]] as const)('sn_C1 stationary threshold at shot tick %s changes real angle by %s', (tick,ratio)=>{
  const f=fixture('sniper','sn_C1'),z=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  for(let i=1;i<tick;i++){f.r.step();z.step();}
  f.r.step({fire:true});z.step({fire:true});expect(Math.abs(offset(z))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(z)).toBeCloseTo(ratio,7);
  for(let i=0;i<25;i++){f.r.step({right:true});z.step({right:true});}
  f.r.step({fire:true,right:true});z.step({fire:true,right:true});expect(offset(f.r)/offset(z)).toBeCloseTo(1,7);
});

it.each([false,true])('sn_C2 full magazine first trigger takes strongest benefit against focus=%s',focus=>{
  const f=fixture('sniper','sn_C2'),z=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  if(focus){f.b.useSkill();z.battle.useSkill();for(let i=0;i<4;i++){f.r.step();z.step();}}
  f.r.step({fire:true});z.step({fire:true});expect(Math.abs(offset(z))).toBeGreaterThan(.000001);
  expect(offset(f.r)/offset(z)).toBeCloseTo(focus?1:.7,7);
  for(let i=0;i<25;i++){f.r.step();z.step();}
  f.r.step({fire:true});z.step({fire:true});expect(offset(f.r)/offset(z)).toBeCloseTo(1,7);
});

it.each([[false,true,1],[true,false,1],[true,true,.75]] as const)('sn_C3 requires secondary=%s and moving=%s for actual spread benefit', (secondary,moving,ratio)=>{
  const f=fixture('sniper','sn_C3'),z=new GrowthRangeSession(defaultGrowthLoadoutV3('sniper'),{distance:1800,health:100,armor:0});
  if(secondary){f.b.swap();z.battle.swap();}
  for(let i=0;i<10;i++){f.r.step({right:moving});z.step({right:moving});}
  f.r.step({fire:true,right:moving});z.step({fire:true,right:moving});
  expect(Math.abs(offset(z))).toBeGreaterThan(.000001);expect(offset(f.r)/offset(z)).toBeCloseTo(ratio,7);
});

it('as_C2 changes only the first three real stationary triggers and replenishes after movement and fifteen still ticks',()=>{
  const f=fixture('assault','as_C2'),baseline=new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:1800,health:100,armor:0});
  const step=(fire=false,right=false)=>{const input={fire,right,aim:{x:20,y:100}};f.r.step(input);baseline.step(input);};
  for(let i=0;i<15;i++)step();
  for(let shot=0;shot<4;shot++){
    step(true);expect(Math.abs(offset(baseline))).toBeGreaterThan(.000001);
    expect(offset(f.r)/offset(baseline)).toBeCloseTo(shot<3?.8:1,7);
    for(let i=0;i<3;i++)step();
  }
  step(false,true);expect(f.p.stillShots).toBe(0);
  for(let i=0;i<20;i++)step();expect(f.p.stationary).toBeGreaterThanOrEqual(15);
  step(true);expect(offset(f.r)/offset(baseline)).toBeCloseTo(.8,7);
});

it.each([false,true])('md_C3 requires an effective heal and grants only one next reload benefit (hurt=%s)',hurt=>{
  const f=fixture('medic','md_C3');f.shootTo(23);
  if(hurt)f.b.damage(f.b.player,20,f.b.actors[1]);
  f.b.useSkill();for(let i=0;i<4;i++)f.r.step();
  expect(f.b.player.life.health).toBe(95);
  expect(f.p.buffs.medReload!==undefined).toBe(hurt);
  f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(hurt?36:45);f.finishReload();
  f.shootTo(23);f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(45);
});

it.each([0,90])('as_B3 next reload benefit after natural rush end expires after ninety ticks (wait=%s)',wait=>{
  const f=fixture('assault','as_B3','as_reloadrush');f.shootTo(20);
  const before=f.gun.current.ammo+f.gun.current.reserve;
  f.b.useSkill();for(let i=0;i<22;i++)f.r.step();
  expect(f.gun.current.ammo).toBe(24);expect(f.gun.current.ammo+f.gun.current.reserve).toBe(before);
  expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
  expect(f.p.buffs.rushReload).toBe(f.b.frame+90);
  for(let i=0;i<wait;i++)f.r.step();f.b.reload();f.r.step();
  expect(f.gun.current.reloadDuration).toBe(wait===0?29:34);
  f.finishReload();f.shootTo(29);f.b.reload();f.r.step();expect(f.gun.current.reloadDuration).toBe(34);
});
