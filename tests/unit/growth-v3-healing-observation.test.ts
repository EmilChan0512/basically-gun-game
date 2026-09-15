import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect,it } from 'vitest';
import { Battle,idleInput,seededRandom } from '../../src/game/campaign/Battle';
import { changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { grantArmor } from '../../src/shared/simulation/growth-v3/DamageRules';

function fixture(ability:'md_pulse'|'md_link',wall=false,enemySmoke=false,allies=1){
  const b=new Battle({id:'healing-observation',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:100,
    seconds:900,debug:true,allies,enemies:1,width:1400,height:700,
    spawns:[[{x:60,y:600}],[{x:1340,y:600}]],objective:{x:900,y:600},navigation:[],
    terrain:[{x:0,y:600,width:1400,height:100},...(wall?[{x:500,y:420,width:20,height:180}]:[])],
    palette:{sky:0,wall:0,trim:0}},'normal','m4',seededRandom(119));
  b.enableGrowthV3(Object.fromEntries(b.actors.map((a,i)=>[a.id,i===0?changeGrowthAbility(defaultGrowthLoadoutV3('medic'),ability):defaultGrowthLoadoutV3(enemySmoke&&a.team!==b.player.team?'medic':'assault')])),5);
  b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(1200,599.5);});
  const medic=b.player,ally=b.actors.find(a=>a!==medic&&a.team===medic.team)!;
  medic.movement.reset(450,599.5);ally.movement.reset(550,599.5);ally.life.health=50;
  const tick=(n=1,aim?:{x:number;y:number})=>{for(let i=0;i<n;i++)b.tickPlayers(new Map([[medic.id,{...idleInput(),aim:aim??{x:ally.movement.x,y:ally.movement.y-33}}]]));};
  return {b,medic,ally,tick,r:b.growthV3!};
}

it.each(['md_pulse','md_link'] as const)('%s respects actual solid wall geometry without spending cooldown',ability=>{
  const f=fixture(ability,true);expect(f.r.gadgets.clearRay({x:450,y:566.5},{x:550,y:566.5},true)).toBe(false);
  expect(f.b.useSkill()).toBe(true);f.tick(8);
  expect(f.ally.life.health).toBe(50);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({charges:1,queue:[],active:null,pending:null});
});

it.each([48,49])('link cursor selection checks the inclusive 48px boundary: %ipx',offset=>{
  const f=fixture('md_link');f.b.useSkill();f.tick(22,{x:550+offset,y:566.5});
  expect(f.ally.life.health).toBe(offset===48?55:50);
  expect(f.r.abilities.actorState(f.medic.id).charges).toBe(offset===48?0:1);
});

it.each([false,true])('link chooses the nearest cursor candidate then actorId for ties (tie=%s)',tie=>{
  const f=fixture('md_link',false,false,2);
  const candidates=f.b.actors.filter(a=>a!==f.medic&&a.team===f.medic.team).sort((a,b)=>a.id<b.id?-1:1);
  const [first,second]=candidates;
  first.movement.reset(530,599.5);second.movement.reset(tie?570:560,599.5);
  first.life.health=50;second.life.health=50;
  f.b.useSkill();f.tick(22,{x:550,y:566.5});
  expect(first.life.health).toBe(tie?55:50);
  expect(second.life.health).toBe(tie?50:55);
});

it.each([false,true])('link self fallback only applies without an eligible ally (eligible=%s)',eligible=>{
  const f=fixture('md_link');f.medic.life.health=50;
  f.b.useSkill();f.tick(22,{x:eligible?550:650,y:566.5});
  expect(f.medic.life.health).toBe(eligible?50:53);
  expect(f.ally.life.health).toBe(eligible?55:50);
});

it.each(['windup','active'] as const)('link never retargets an eligible alternative after target loss during %s',phase=>{
  const f=fixture('md_link',false,false,2);
  const other=f.b.actors.find(a=>a!==f.medic&&a!==f.ally&&a.team===f.medic.team)!;
  other.movement.reset(570,599.5);other.life.health=50;
  f.b.useSkill();f.tick(phase==='windup'?1:22);
  f.ally.movement.reset(750,599.5);
  f.tick(30,{x:570,y:566.5});
  expect(other.life.health).toBe(50);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,pending:null,charges:phase==='windup'?1:0,queue:phase==='windup'?[]:[427]});
});

it('an active link breaks on a real wall without refunding cooldown or continuing later healing',()=>{
  const f=fixture('md_link',true);f.ally.movement.reset(470,599.5);
  f.b.useSkill();f.tick(22);expect(f.ally.life.health).toBe(55);
  f.ally.movement.reset(550,599.5);f.tick();
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,queue:[427]});
  f.ally.movement.reset(470,599.5);f.tick(30);expect(f.ally.life.health).toBe(55);
});

it('smoke thrown by another actor interrupts an existing link and preserves its committed cooldown',()=>{
  const f=fixture('md_link',false,true),enemy=f.b.actors.find(a=>a.team!==f.medic.team)!;
  f.b.useSkill();f.tick(7);expect(f.r.abilities.actorState(f.medic.id).active).not.toBeNull();
  enemy.movement.reset(450,599.5);
  expect(f.b.useItem({x:450,y:599.5},enemy)).toBe(true);f.tick(32);
  expect(f.r.gadgets.smoke()).toHaveLength(1);
  expect(f.r.gadgets.smokeBlocks({x:450,y:566.5},{x:550,y:566.5})).toBe(true);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,queue:[427]});
  const health=f.ally.life.health;f.tick(30);expect(f.ally.life.health).toBe(health);
});

it('only caster enemy life damage breaks a link, not absorbed damage or injury to the linked ally',()=>{
  const f=fixture('md_link'),enemy=f.b.actors.find(a=>a.team!==f.medic.team)!;
  f.b.useSkill();f.tick(7);
  grantArmor(f.r.participant(f.medic.id).armor,10,90,f.b.frame,'fixture');
  f.b.damage(f.medic,1,enemy);expect(f.medic.life.health).toBe(95);
  expect(f.r.abilities.actorState(f.medic.id).active).not.toBeNull();
  f.b.damage(f.ally,1,enemy);expect(f.ally.life.health).toBe(49);
  expect(f.r.abilities.actorState(f.medic.id).active).not.toBeNull();
  f.b.damage(f.medic,10,enemy);expect(f.medic.life.health).toBe(94);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,queue:[427]});
});

it.each(['dead','full','range'] as const)('link commit rejects a target becoming %s during windup without charging cooldown',change=>{
  const f=fixture('md_link');f.b.useSkill();f.tick();
  expect(f.r.abilities.actorState(f.medic.id).pending).not.toBeNull();
  if(change==='dead')f.b.damage(f.ally,9999);
  else if(change==='full')f.ally.life.health=f.ally.life.maxHealth;
  else f.ally.movement.reset(750,599.5);
  f.tick(7);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,pending:null,charges:1,queue:[]});
});

it('an active link heals at exactly 240px and breaks at 241px without resuming on return',()=>{
  const f=fixture('md_link');f.b.useSkill();f.tick(7);
  f.ally.movement.reset(690,599.5);f.tick(15);expect(f.ally.life.health).toBe(55);
  f.ally.movement.reset(691,599.5);f.tick();
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({active:null,queue:[427]});
  f.ally.movement.reset(550,599.5);f.tick(30);expect(f.ally.life.health).toBe(55);
});

it.each(['md_pulse','md_link'] as const)('%s revalidates a target moving behind a wall during windup',ability=>{
  const f=fixture(ability,true);f.ally.movement.reset(470,599.5);
  f.b.useSkill();f.tick();expect(f.r.abilities.actorState(f.medic.id).pending).not.toBeNull();
  f.ally.movement.reset(550,599.5);f.tick(7);
  expect(f.ally.life.health).toBe(50);
  expect(f.r.abilities.actorState(f.medic.id)).toMatchObject({charges:1,queue:[],active:null,pending:null});
});

it.each(['md_pulse','md_link'] as const)('real smoke permits area pulse but prevents sight-dependent %s targeting',ability=>{
  const f=fixture(ability);
  expect(f.b.useItem({x:600,y:599.5})).toBe(true);f.tick(31);
  const smoke=f.r.gadgets.smoke()[0];expect(smoke).toBeDefined();
  f.medic.movement.reset(smoke.position.x-30,599.5);f.ally.movement.reset(smoke.position.x+30,599.5);
  expect(f.r.gadgets.smokeBlocks({x:f.medic.movement.x,y:566.5},{x:f.ally.movement.x,y:566.5})).toBe(true);
  f.b.useSkill();f.tick(8);
  expect(f.ally.life.health).toBe(ability==='md_pulse'?75:50);
  expect(f.r.abilities.actorState(f.medic.id).charges).toBe(ability==='md_pulse'?0:1);
});
