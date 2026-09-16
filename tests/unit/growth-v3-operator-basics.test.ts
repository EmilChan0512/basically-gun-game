import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { expect,it } from 'vitest';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { Room } from '../../src/shared/simulation/Room';
import {  changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { grantArmor } from '../../src/shared/simulation/growth-v3/DamageRules';

function fixture(classId:GrowthClassId,secondary:'usp'|'revolver'='usp',medicKit?:'link'|'station'){
  const room=new Room('operator-basics','signal','tdm',false,'growth');
  const build=medicKit==='link'?changeGrowthAbility(defaultGrowthLoadoutV3(classId),'md_link'):defaultGrowthLoadoutV3(classId);
  // Isolate awakening kill healing from the optional blood-healing perk.
  if(classId==='assault')build.perks[1]='as_close';
  build.secondary=secondary;if(medicKit==='station')build.gadgetId='md_station';
  room.join('client','Operator',undefined,build);
  for(let i=1;i<8;i++)room.join(`peer-${i}`,`Peer ${i}`,undefined,defaultGrowthLoadoutV3());
  for(const id of room.players.keys())room.ready(id,true);room.start('client',91);
  const b=room.session!.battle;
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?1500:480,599.5);});
  return b;
}
const step=(b:Battle,n=1)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map());};
const awakenedCheckpoints=new Map<string,ReturnType<Battle['checkpoint']>>();
function awakened(classId:GrowthClassId,medicKit?:'link'|'station'){
  const key=`${classId}:${medicKit??'default'}`;
  if(!awakenedCheckpoints.has(key)){
    const b=fixture(classId,'usp',medicKit);step(b,21599);
    expect(b.growthV3!.participant(b.player.id).progression.ultimate).toBe(false);
    step(b);expect(b.growthV3!.participant(b.player.id).progression.ultimate).toBe(true);
    awakenedCheckpoints.set(key,b.checkpoint());
  }
  return Battle.restore(awakenedCheckpoints.get(key)!);
}
const awakenedTank=()=>awakened('tank');

it.each(['link','station'] as const)('medical awakening applies from an actual %s heal but later pulses do not refresh armor',kit=>{
  const b=awakened('medic',kit),a=b.player,r=b.growthV3!,ally=b.actors.find(other=>other!==a&&other.team===a.team)!;
  ally.movement.reset(520,599.5);ally.life.health=50;
  if(kit==='station')expect(b.useItem({x:520,y:599.5},a)).toBe(true);
  else expect(b.useSkill(a)).toBe(true);
  const first=kit==='link'?22:58,interval=kit==='link'?15:30;
  const aim={x:520,y:566.5};
  for(let i=0;i<first;i++)b.tickPlayers(new Map([[a.id,{...idleInput(),aim}]]));
  const p=r.participant(ally.id),until=p.armor.until,cooldown=p.cooldowns.lifeline;
  expect(ally.life.health).toBe(kit==='link'?59:53);expect(p.armor.remaining).toBe(15000);
  expect(until).toBe(b.frame+90);expect(cooldown).toBe(b.frame+600);
  for(let i=0;i<interval;i++)b.tickPlayers(new Map([[a.id,{...idleInput(),aim}]]));
  expect(ally.life.health).toBe(kit==='link'?68:56);
  expect(p.armor.until).toBe(until);expect(p.cooldowns.lifeline).toBe(cooldown);
});

it('awakened medical self-link heals without granting self armor or spending the recipient lifeline cooldown',()=>{
  const b=awakened('medic','link'),a=b.player,r=b.growthV3!,p=r.participant(a.id);
  a.life.health=80;expect(b.useSkill(a)).toBe(true);step(b,22);
  expect(a.life.health).toBe(83);expect(p.armor.remaining).toBe(0);expect(p.cooldowns.lifeline).toBeUndefined();
});

it('tank awakening does not consume cooldown under spawn protection, zero damage or self explosion',()=>{
  const b=awakenedTank(),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=30;a.life.spawnProtectionFrames=10;
  b.damage(a,1,enemy);expect(a.life.health).toBe(30);expect(p.cooldowns.juggernaut).toBeUndefined();
  step(b,10);b.damage(a,0,enemy);b.damage(a,1,a,true);
  expect(a.life.health).toBe(29);expect(p.armor.remaining).toBe(0);expect(p.cooldowns.juggernaut).toBeUndefined();
  b.damage(a,1,enemy);expect(p.armor.remaining).toBe(24000);expect(p.cooldowns.juggernaut).toBe(22210);
});

it.each([[50,150],[300,300]] as const)('tank awakening merges an existing capped plate with %s ticks without stacking', (duration,expectedDuration)=>{
  const b=awakenedTank(),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=30;grantArmor(p.armor,25,duration,b.frame,'existing');
  b.damage(a,1,enemy);b.damage(a,1,enemy);
  expect(a.life.health).toBe(30);expect(p.armor.remaining).toBe(23000);
  expect(p.armor.until).toBe(21600+expectedDuration);expect(p.cooldowns.juggernaut).toBe(22200);
  if(duration===300)expect(p.armor.source).toBe('existing');
});

it.each([['assault',7],['medic',8]] as const)('%s sidearm preparation is %s ticks without changing ammunition',(classId,expected)=>{
  const b=fixture(classId,'revolver'),gun=b.growthV3!.weapons.get(b.player.id)!;
  const before=gun.checkpoint().guns.secondary,total=before.ammo+before.reserve;
  b.swap();step(b);expect(gun.readyTick-b.frame).toBe(expected);
  expect(gun.current.ammo+gun.current.reserve).toBe(total);
  step(b,expected);b.swap();step(b);
  expect(gun.readyTick-b.frame).toBe(8);
});

it('sniper first-shot passive waits 30 stationary ticks and re-arms 30 ticks after an actual shot',()=>{
  const early=fixture('sniper'),stable=fixture('sniper');
  const shoot=(b:Battle)=>{
    const aim={x:1400,y:100};b.tickPlayers(new Map([[b.player.id,{...idleInput(),fire:true,aim}]]));
    const trace=b.effects.find(effect=>effect.actorId===b.player.id)!.trace;
    return Math.atan2(trace.end.y-trace.origin.y,trace.end.x-trace.origin.x)-Math.atan2(aim.y-trace.origin.y,aim.x-trace.origin.x);
  };
  step(early,28);step(stable,29);
  const firstEarly=shoot(early),firstStable=shoot(stable);
  expect(Math.abs(firstEarly)).toBeGreaterThan(0);expect(firstStable/firstEarly).toBeCloseTo(.85,7);
  expect(stable.growthV3!.participant(stable.player.id).focusedReady).toBe(false);
  step(early,28);step(stable,29);
  const nextEarly=shoot(early),nextStable=shoot(stable);
  expect(nextStable/nextEarly).toBeCloseTo(.85,7);
});

it('assault awakening heals 15 on a live kill, speeds movement for 90 ticks and cannot bypass its 150 tick cooldown',()=>{
  const b=awakened('assault'),a=b.player,p=b.growthV3!.participant(a.id),enemies=b.actors.filter(other=>other.team!==a.team);
  a.life.health=50;
  b.damage(enemies[0],9999,a);expect(a.life.health).toBe(65);expect(p.cooldowns.berserker).toBe(21750);
  b.damage(enemies[1],9999,a);expect(a.life.health).toBe(65);
  step(b,89);expect(a.movement.speedScale).toBeCloseTo(1.32);
  step(b);expect(a.movement.speedScale).toBe(1.1);
  step(b,59);b.damage(enemies[2],9999,a);expect(a.life.health).toBe(65);
  step(b);b.damage(enemies[3],9999,a);expect(a.life.health).toBe(80);expect(p.cooldowns.berserker).toBe(21900);
});

const headKill=(b:Battle,target:Battle['player'])=>b.applyDamage(target,{kind:'bullet',amount:9999,sourceId:b.player.id,
  origin:{x:b.player.movement.x,y:b.player.movement.y-33},hitPoint:{x:target.movement.x,y:target.movement.y-55},headshot:true});

it('sniper awakening requires a headshot kill, ends at 90 ticks and retains its 240 tick cooldown',()=>{
  const b=awakened('sniper'),a=b.player,r=b.growthV3!,p=r.participant(a.id),enemies=b.actors.filter(other=>other.team!==a.team);
  b.damage(enemies[0],9999,a);expect(r.actorView(a.id).ghost).toBe(false);
  headKill(b,enemies[1]);expect(r.actorView(a.id).ghost).toBe(true);expect(p.cooldowns.ghost).toBe(21840);
  step(b,89);expect(r.actorView(a.id).ghost).toBe(true);
  step(b);expect(r.actorView(a.id).ghost).toBe(false);
  step(b,149);headKill(b,enemies[2]);expect(r.actorView(a.id).ghost).toBe(false);
  step(b);headKill(b,enemies[3]);expect(r.actorView(a.id).ghost).toBe(true);expect(p.cooldowns.ghost).toBe(22080);
});

it('sniper next actual gunshot clears ghost without resetting its cooldown',()=>{
  const b=awakened('sniper'),a=b.player,r=b.growthV3!,enemy=b.actors.find(other=>other.team!==a.team)!;
  headKill(b,enemy);expect(r.actorView(a.id).ghost).toBe(true);
  b.tickPlayers(new Map([[a.id,{...idleInput(),fire:true,aim:{x:900,y:100}}]]));
  expect(r.participant(a.id).metrics.shots).toBe(1);
  expect(r.actorView(a.id).ghost).toBe(false);expect(r.participant(a.id).cooldowns.ghost).toBe(21840);
});

it('an awakened assault gets kill credit for a posthumous explosion without healing or starting berserker',()=>{
  const b=awakened('assault'),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  b.damage(a,9999);b.damage(enemy,9999,a,true);
  expect(a.kills).toBe(1);expect(a.life.alive).toBe(false);expect(a.life.health).toBe(0);
  expect(p.cooldowns.berserker).toBeUndefined();expect(p.buffs.berserker).toBeUndefined();
  step(b,150);expect(a.life.alive).toBe(true);expect(p.progression.ultimate).toBe(true);
});

it('sniper death clears temporary ghost while preserving awakening and its cooldown',()=>{
  const b=awakened('sniper'),a=b.player,r=b.growthV3!,p=r.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  headKill(b,enemy);b.damage(a,9999);
  expect(r.actorView(a.id).ghost).toBe(false);expect(p.cooldowns.ghost).toBe(21840);
  step(b,150);expect(a.life.alive).toBe(true);expect(p.progression.ultimate).toBe(true);
  expect(p.cooldowns.ghost).toBe(21840);
});

it.each(['environment','self'] as const)('medic passive does not restart its enemy-hit delay after %s damage',cause=>{
  const b=fixture('medic'),a=b.player;a.life.health=44;step(b,179);
  b.damage(a,1,cause==='self'?a:undefined,cause==='self');expect(a.life.health).toBe(43);
  step(b);expect(a.life.health).toBe(45);
});

it.each([[34.5,false],[34.499,true]] as const)('tank awakening checks strict pre-hit HP %s before absorbing damage',(health,triggers)=>{
  const b=awakenedTank(),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=health;b.damage(a,1,enemy);
  expect(a.life.health).toBe(triggers?health:health-1);
  expect(p.armor.remaining).toBe(triggers?24000:0);
  expect(p.cooldowns.juggernaut).toBe(triggers?22200:undefined);
});

it('tank awakening ignores environmental damage, expires at 150 ticks and re-arms at exactly 600 ticks',()=>{
  const b=awakenedTank(),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=30;b.damage(a,1);expect(p.armor.remaining).toBe(0);expect(p.cooldowns.juggernaut).toBeUndefined();
  b.damage(a,1,enemy);expect(p.armor.remaining).toBe(24000);expect(a.life.health).toBe(29);
  step(b,149);expect(p.armor.remaining).toBe(24000);
  step(b);expect(p.armor.remaining).toBe(0);
  step(b,449);b.damage(a,1,enemy);expect(p.armor.remaining).toBe(0);expect(a.life.health).toBe(28);
  step(b);b.damage(a,1,enemy);expect(p.armor.remaining).toBe(24000);expect(a.life.health).toBe(28);
  expect(p.cooldowns.juggernaut).toBe(22800);
});

it('tank awakening cooldown survives death and revival while its temporary armor is cleared',()=>{
  const b=awakenedTank(),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=30;b.damage(a,1,enemy);b.damage(a,9999,enemy);
  expect(a.life.alive).toBe(false);expect(p.armor.remaining).toBe(0);
  step(b,150);expect(a.life.alive).toBe(true);expect(p.progression.ultimate).toBe(true);
  expect(p.cooldowns.juggernaut).toBe(22200);
  a.life.spawnProtectionFrames=0;a.life.health=30;b.damage(a,1,enemy);
  expect(a.life.health).toBe(29);expect(p.armor.remaining).toBe(0);
});

it('medic selfcare starts at 180 ticks, pulses every 30 ticks and clamps to 47.5 HP without XP',()=>{
  const b=fixture('medic'),a=b.player,p=b.growthV3!.participant(a.id),enemy=b.actors.find(other=>other.team!==a.team)!;
  a.life.health=44;step(b,179);expect(a.life.health).toBe(44);
  step(b);expect(a.life.health).toBe(46);step(b,29);expect(a.life.health).toBe(46);
  step(b);expect(a.life.health).toBe(47.5);step(b,60);expect(a.life.health).toBe(47.5);
  expect(p.metrics.healingXp).toBe(0);expect(p.metrics.healingDone).toBe(0);
  b.damage(a,10,enemy);const wounded=a.life.health;step(b,179);expect(a.life.health).toBe(wounded);
  step(b);expect(a.life.health).toBe(wounded+2);
});

it('destroying a real enemy beacon with bullets does not trigger assault awakening or kill credit',()=>{
  const room=new Room('awakening-facility','signal','tdm',false,'growth');
  room.join('client','Assault',undefined,defaultGrowthLoadoutV3('assault'));
  room.join('peer','Sniper',undefined,defaultGrowthLoadoutV3('sniper'));
  for(const id of room.players.keys())room.ready(id,true);room.start('client',91);
  const b=room.session!.battle,a=b.player,enemy=b.actors.find(other=>other.team!==a.team)!;
  for(const actor of b.actors){actor.human=true;actor.life.spawnProtectionFrames=0;actor.movement.reset(actor===a?480:1500,599.5);}
  step(b,21600);
  const p=b.growthV3!.participant(a.id);expect(p.progression.ultimate).toBe(true);
  a.life.health=50;enemy.movement.reset(520,599.5);
  expect(b.useItem({x:540,y:599.5},enemy)).toBe(true);step(b,28);
  const entity=b.growthV3!.gadgets.entities()[0];expect(entity.gadgetId).toBe('sn_beacon');
  enemy.movement.reset(1500,599.5);
  for(let i=0;i<40;i++)b.tickPlayers(new Map([[a.id,{...idleInput(),fire:true,aim:{x:540,y:587.5}}]]));
  expect(b.journal.since(0).some(e=>e.kind==='deployableDestroyed'&&e.entityId===entity.id)).toBe(true);
  expect(p.metrics.shots).toBeGreaterThan(0);expect(a.kills).toBe(0);expect(a.life.health).toBe(50);
  expect(p.cooldowns.berserker).toBeUndefined();expect(p.buffs.berserker).toBeUndefined();
});

it('medical revival restarts the passive delay even when subsequent damage is environmental',()=>{
  const b=fixture('medic'),a=b.player,p=b.growthV3!.participant(a.id);
  step(b,200);b.damage(a,9999);step(b,150);
  expect(a.life.alive).toBe(true);expect(p.lastDamage).toBe(b.frame);
  step(b,75);b.damage(a,55);expect(a.life.health).toBe(40);
  const restored=Battle.restore(b.checkpoint());step(b,104);step(restored,104);
  expect(a.life.health).toBe(40);expect(restored.checkpoint()).toEqual(b.checkpoint());
  step(b);step(restored);expect(a.life.health).toBe(42);
  expect(restored.checkpoint()).toEqual(b.checkpoint());expect(p.metrics.healingXp).toBe(0);
});
