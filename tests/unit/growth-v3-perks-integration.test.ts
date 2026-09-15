import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import type { GrowthPerkId } from '../../src/shared/content/growth-v3/Perks';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';

function fixture(mobility:GrowthPerkId='pk_landing',handling:GrowthPerkId='pk_sidefeed',survival:GrowthPerkId='pk_dressing') {
  const build=defaultGrowthLoadoutV3();build.perks=[mobility,handling,survival];
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0});
  return {r,b:r.battle,gun:r.battle.growthV3!.weapons.get('player')!};
}

it('pk_crouch boosts grounded crouch walking but never the takeoff tick or airborne movement',()=>{
  const boosted=fixture('pk_crouch'),baseline=fixture();
  for(let i=0;i<6;i++){boosted.r.step({right:true,crouch:true});baseline.r.step({right:true,crouch:true});}
  expect(boosted.b.player.movement.vx).toBeCloseTo(4.32);expect(baseline.b.player.movement.vx).toBe(4);
  // Release crouch before requesting jump and crouch simultaneously from standing.
  boosted.r.step();baseline.r.step();
  boosted.b.player.movement.reset(120,499.5);baseline.b.player.movement.reset(120,499.5);
  for(let i=0;i<5;i++){
    const input={right:true,crouch:true,jump:i===0};boosted.r.step(input);baseline.r.step(input);
    expect(boosted.b.player.movement.jumping).toBe(true);
    expect(boosted.b.player.movement.checkpoint()).toEqual(baseline.b.player.movement.checkpoint());
  }
});

it('pk_resilience shortens an actual enemy concussion to twenty-four ticks without weakening its slow',()=>{
  const mission=fixture().b.mission,b=new Battle(mission,'normal','m4',seededRandom(43191));
  const attacker=defaultGrowthLoadoutV3();attacker.gadgetId='as_concussion';
  const victim=defaultGrowthLoadoutV3();victim.perks[2]='pk_resilience';
  b.enableGrowthV3({player:attacker,'enemy-0':victim},5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(120+i*300,499.5);});
  const p=b.growthV3!.participant('enemy-0'),aim={x:420,y:466.5};
  expect(b.useItem(aim)).toBe(true);
  const step=()=>b.tickPlayers(new Map([['player',{...idleInput(),aim}]]));
  for(let i=0;i<31;i++)step();expect(p.slowScale).toBe(.2);expect(p.slowUntil).toBe(55);
  expect(b.actors[1].life.health).toBe(90);
  const restored=Battle.restore(b.checkpoint());
  for(let i=0;i<23;i++){step();restored.tickPlayers(new Map([['player',{...idleInput(),aim}]]));}
  expect(p.slowScale).toBe(.2);step();restored.tickPlayers(new Map([['player',{...idleInput(),aim}]]));
  expect(b.frame).toBe(55);expect(p.slowScale).toBe(0);expect(p.slowResistUntil).toBe(100);
  expect(restored.checkpoint()).toEqual(b.checkpoint());
});

it.each([['assault',7,8],['tank',8,11],['sniper',8,11]] as const)('pk_quickswap uses the strongest preparation benefit for %s', (classId,toSide,toPrimary)=>{
  const build=defaultGrowthLoadoutV3(classId as GrowthClassId);build.secondary='revolver';build.perks[1]='pk_quickswap';
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=r.battle,gun=b.growthV3!.weapons.get('player')!;
  b.swap();r.step();expect(gun.readyTick-b.frame).toBe(toSide);
  for(let i=0;i<toSide;i++)r.step();b.swap();r.step();expect(gun.readyTick-b.frame).toBe(toPrimary);
});

it('pk_supplyrun requires actual map ammunition and respects expiry and the longer shared cooldown',()=>{
  const {r,b,gun}=fixture('pk_supplyrun'),p=b.growthV3!.participant('player');
  b.player.movement.reset(20,499.5);r.step();expect(p.buffs.supplyrun).toBeUndefined();
  b.player.movement.reset(120,499.5);r.step({fire:true,aim:{x:1200,y:100}});
  expect(gun.current.ammo+gun.current.reserve).toBe(119);
  for(let i=0;i<298;i++)r.step();expect(b.frame).toBe(300);
  b.player.movement.reset(20,499.5);r.step();expect(gun.current.ammo+gun.current.reserve).toBe(120);
  expect(p.buffs.supplyrun).toBe(361);expect(p.cooldowns.supplyrun).toBe(661);
  r.step();expect(b.player.movement.speedScale).toBe(1.1);
  for(let i=0;i<59;i++)r.step();expect(b.frame).toBe(361);expect(b.player.movement.speedScale).toBe(1);
  b.player.movement.reset(120,499.5);r.step({fire:true,aim:{x:1200,y:100}});
  for(let i=0;i<238;i++)r.step();expect(b.frame).toBe(600);
  b.player.movement.reset(20,499.5);r.step();expect(gun.current.ammo+gun.current.reserve).toBe(120);
  expect(p.cooldowns.supplyrun).toBe(661);r.step();expect(b.player.movement.speedScale).toBe(1);
});

function shotOffset(r:GrowthRangeSession){
  const effect=r.battle.effects.find(e=>e.frame===r.battle.frame&&e.actorId==='player')!;
  expect(effect).toBeDefined();
  const {origin,end}=effect.trace,aim=r.battle.player.aim;
  return Math.atan2(end.y-origin.y,end.x-origin.x)-Math.atan2(aim.y-origin.y,aim.x-origin.x);
}

it('pk_supplyrun activates from a real allied medical ammo box only when ammunition is received',()=>{
  const mission=fixture().b.mission,b=new Battle(mission,'normal','m4',seededRandom(43191));
  const recipient=defaultGrowthLoadoutV3();recipient.perks[0]='pk_supplyrun';
  const medic=defaultGrowthLoadoutV3('medic');medic.gadgetId='md_ammo';
  b.enableGrowthV3({player:recipient,'enemy-0':medic},5);
  b.actors.forEach((a,i)=>{a.human=true;a.team=1;a.life.spawnProtectionFrames=0;a.movement.reset(200+i*40,499.5);});
  const owner=b.actors[1],p=b.growthV3!.participant('player'),gun=b.growthV3!.weapons.get('player')!;
  expect(b.useItem({x:220,y:499.5},owner)).toBe(true);
  for(let i=0;i<28;i++)b.tickPlayers(new Map());
  const box=b.growthV3!.gadgets.entities()[0];expect(box.gadgetId).toBe('md_ammo');
  expect(box.recipients).not.toContain('player');expect(p.buffs.supplyrun).toBeUndefined();
  b.tickPlayers(new Map([['player',{...idleInput(),fire:true,aim:{x:1200,y:100}}]]));
  expect(gun.current.ammo+gun.current.reserve).toBe(119);
  b.tickPlayers(new Map());expect(gun.current.ammo+gun.current.reserve).toBe(120);
  expect(box.recipients).toContain('player');expect(p.buffs.supplyrun).toBe(b.frame+60);
  expect(p.cooldowns.supplyrun).toBe(b.frame+360);
  expect(b.player.itemCharges).toBe(2);expect(owner.itemCharges).toBe(0);
});

it('pk_firstshot reduces actual shot angle by ten percent only after thirty ticks without firing',()=>{
  const a=fixture('pk_sidewalk','pk_firstshot'),z=fixture('pk_sidewalk','pk_sidefeed');
  for(let tick=1;tick<=35;tick++){
    const fire=[1,5,35].includes(tick);a.r.step({fire});z.r.step({fire});
    if(fire){expect(Math.abs(shotOffset(z.r))).toBeGreaterThan(.000001);expect(shotOffset(a.r)/shotOffset(z.r)).toBeCloseTo(tick===5?1:.9,7);}
  }
});

it.each([0,18])('pk_landing actual jump/landing gives spread benefit at landing+%s only within eighteen ticks',delay=>{
  const a=fixture('pk_landing'),z=fixture('pk_sidewalk');a.r.step({jump:true});z.r.step({jump:true});
  for(let i=0;i<80&&a.b.player.movement.jumping;i++){a.r.step();z.r.step();}
  expect(a.b.player.movement.jumping).toBe(false);
  const landed=a.b.frame;expect(a.b.journal.since(0).some(e=>e.kind==='land'&&e.tick===landed)).toBe(true);
  for(let i=0;i<delay;i++){a.r.step();z.r.step();}
  a.r.step({fire:true});z.r.step({fire:true});
  expect(Math.abs(shotOffset(z.r))).toBeGreaterThan(.000001);
  expect(shotOffset(a.r)/shotOffset(z.r)).toBeCloseTo(delay===0?.85:1,7);
});

it('pk_sidefeed transfers two real reserve rounds only after its shared cooldown expires',()=>{
  const {r,b,gun}=fixture();b.swap();r.step();
  const p=b.growthV3!.participant('player'),ready=p.cooldowns.sidefeed;
  expect(ready).toBe(b.frame+240);expect([gun.current.ammo,gun.current.reserve]).toEqual([12,48]);
  for(let i=0;i<3;i++){
    for(let n=0;n<8;n++)r.step();r.step({fire:true,aim:{x:1200,y:100}});r.step();
  }
  expect([gun.current.ammo,gun.current.reserve]).toEqual([9,48]);
  b.swap();r.step();b.swap();r.step();expect([gun.current.ammo,gun.current.reserve]).toEqual([9,48]);
  expect(p.cooldowns.sidefeed).toBe(ready);
  const remaining=ready-b.frame;for(let i=0;i<remaining;i++)r.step();
  b.swap();r.step();b.swap();r.step();
  expect([gun.current.ammo,gun.current.reserve]).toEqual([11,46]);
  expect(p.cooldowns.sidefeed).toBe(b.frame+240);
});

it.each([[false,10],[true,9]] as const)('pk_blast incoming explosion=%s loses exactly %s HP', (explosive,damage)=>{
  const {b}=fixture('pk_landing','pk_sidefeed','pk_blast');
  b.damage(b.player,10,b.actors[1],explosive);expect(b.player.life.health).toBe(100-damage);
});

it.each([[false,38],[true,43]] as const)('pk_reloadguard preserves its time penalty with empty benefit=%s and stops protection at completion', (empty,duration)=>{
  const {r,b,gun}=fixture('pk_landing',empty?'pk_emptyreload':'pk_sidefeed','pk_reloadguard');
  for(let i=0;i<(empty?120:1);i++)r.step({fire:true,aim:{x:1200,y:100}});
  for(let i=0;i<4;i++)r.step();b.reload();r.step();
  expect(gun.current.reloadDuration).toBe(duration);
  b.damage(b.player,10,b.actors[1]);expect(b.player.life.health).toBe(91);
  const restored=Battle.restore(b.checkpoint());
  for(let i=0;i<duration;i++){r.step();restored.tickPlayers(new Map([['player',{...idleInput(),aim:r.aim}]]));}
  expect(restored.checkpoint()).toEqual(b.checkpoint());expect(gun.current.reloadUntil).toBe(0);
  b.damage(b.player,10,b.actors[1]);expect(b.player.life.health).toBe(81);
});

it.each([[49,54,true],[50,50,false],[75,75,false]] as const)('pk_dressing at %s HP heals to %s only below half health', (initial,expected,triggered)=>{
  const {b}=fixture();b.damage(b.player,100-initial,b.actors[1]);
  b.damage(b.actors[1],999,b.player);
  expect(b.player.kills).toBe(1);expect(b.player.life.health).toBe(expected);
  const p=b.growthV3!.participant('player');expect(p.cooldowns.dressing).toBe(triggered?300:undefined);
  expect(b.journal.since(0).filter(e=>e.kind==='heal'&&e.actorId==='player').map(e=>e.amount)).toEqual(triggered?[5]:[]);
});

it('pk_sidewalk applies exactly three percent only while the secondary is held',()=>{
  const {r,b}=fixture('pk_sidewalk');r.step({right:true});expect(b.player.movement.speedScale).toBe(1);
  b.swap();r.step({right:true});expect(b.player.movement.speedScale).toBe(1.03);
  for(let i=0;i<8;i++)r.step({right:true});expect(b.player.movement.vx).toBeCloseTo(9.785);
  b.swap();r.step({right:true});expect(b.player.movement.speedScale).toBe(1);expect(b.player.movement.vx).toBe(9.5);
});

it.each([[false,34],[true,39]] as const)('pk_emptyreload real manual reload (empty=%s) takes %s ticks', (empty,duration)=>{
  const {r,b,gun}=fixture('pk_landing','pk_emptyreload');
  const aim={x:1200,y:100};
  for(let i=0;i<(empty?120:1);i++)r.step({fire:true,aim});
  expect(gun.current.ammo).toBe(empty?0:29);
  for(let i=0;i<4;i++)r.step();
  const total=gun.current.ammo+gun.current.reserve;
  b.reload();r.step();expect(gun.current.reloadDuration).toBe(duration);
  const deadline=gun.current.reloadUntil;
  for(let i=0;i<duration-1;i++)r.step();expect(b.frame).toBe(deadline-1);expect(gun.current.ammo).toBe(empty?0:29);
  r.step();expect(gun.current.ammo).toBe(30);expect(gun.current.ammo+gun.current.reserve).toBe(total);
});
