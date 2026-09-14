import { expect, it } from 'vitest';
import { AbilitySimulation, type AbilityPort } from '../../src/shared/simulation/growth-v3/AbilitySimulation';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { newArmor } from '../../src/shared/simulation/growth-v3/DamageRules';
import type { GadgetActor } from '../../src/shared/simulation/growth-v3/GadgetSimulation';
import { chooseContinuousHeal, commitContinuousHeal, newContinuousHealTarget } from '../../src/shared/simulation/growth-v3/HealingRules';

function fixture(){
  const actors:GadgetActor[]=[
    {id:'medic',team:1,position:{x:300,y:567},feet:{x:300,y:600},alive:true,protected:false,hp:95000,maxHp:95000,armor:newArmor(),currentBaseTotalAmmo:120},
    {id:'ally',team:1,position:{x:380,y:567},feet:{x:380,y:600},alive:true,protected:false,hp:40000,maxHp:100000,armor:newArmor(),currentBaseTotalAmmo:120},
  ];
  const heals:number[]=[],finishes:{reason:string;effective:boolean}[]=[], transfers:number[]=[],errors:string[]=[];
  let sight=true;
  const port:AbilityPort={actors:()=>actors,canUse:()=>true,visible:()=>sight,interruptWeapon:()=>{},recoverUntil:()=>{},
    transfer:(_id,count)=>{transfers.push(count);return count;},
    heal:(_id,targetId,amount)=>{const target=actors.find(a=>a.id===targetId)!;const done=Math.min(target.maxHp-target.hp,amount);target.hp+=done;heals.push(done);return done;},
    started:()=>{},finished:(_id,cast,reason)=>finishes.push({reason,effective:cast.effectiveHealing}),error:(_id,reason)=>errors.push(reason)};
  return{actors,port,heals,finishes,transfers,errors,setSight:(visible:boolean)=>{sight=visible;}};
}
it('medic pulse validates both request and commit; no-effect never spends cooldown',()=>{
  const f=fixture(),sim=new AbilitySimulation(f.port);sim.register('medic',defaultGrowthLoadoutV3('medic'));
  expect(sim.use('medic',f.actors[1].position,0)).toBe(true);f.actors[1].hp=100000;
  for(let t=0;t<=3;t++)sim.step(t);
  expect(sim.actorState('medic').charges).toBe(1);expect(sim.actorState('medic').queue).toEqual([]);expect(f.errors).toContain('no_effect');
  expect(sim.use('medic',f.actors[1].position,4)).toBe(false);
  f.actors[1].hp=40000;expect(sim.use('medic',f.actors[1].position,4)).toBe(true);
  for(let t=4;t<=7;t++)sim.step(t);
  expect(f.heals).toEqual([25000]);expect(sim.actorState('medic').queue).toEqual([427]);
});
it('N14 includes the sixth treatment pulse and notifies finish after it, not before',()=>{
  const f=fixture(),sim=new AbilitySimulation(f.port),loadout=changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link');
  sim.register('medic',loadout);sim.use('medic',f.actors[1].position,0);
  const target=newContinuousHealTarget(),ticks:number[]=[];
  for(let t=0;t<=96;t++){
    sim.step(t);const source=chooseContinuousHeal(target,'ally',sim.healingSources(t),t);
    if(source){f.port.heal(source.ownerId,source.targetId,source.amount,source.id);commitContinuousHeal(target,t,source.amount);sim.markHealing(source.id,source.amount);ticks.push(t);}
    sim.finishHealingPhase(t);
  }
  expect(ticks).toEqual([21,36,51,66,81,96]);expect(f.actors[1].hp).toBe(70000);
  expect(f.finishes).toEqual([{reason:'expired',effective:true}]);
  sim.finishHealingPhase(96);expect(f.finishes).toHaveLength(1);
});
it('link damage cancellation preserves cooldown; stabilized link pauses without refilling missed pulses',()=>{
  const f=fixture(),sim=new AbilitySimulation(f.port),loadout=changeGrowthAbility(defaultGrowthLoadoutV3('medic'),'md_link');
  sim.register('medic',loadout);sim.use('medic',f.actors[1].position,0);
  for(let t=0;t<=6;t++)sim.step(t);
  sim.onLifeDamage('medic',7);expect(sim.actorState('medic').active).toBeNull();expect(sim.actorState('medic').queue).toEqual([426]);
  const another=new AbilitySimulation(f.port);another.register('medic',loadout);another.updateBuild('medic',['md_B2'],0);another.use('medic',f.actors[1].position,0);
  for(let t=0;t<=6;t++)another.step(t);
  another.onLifeDamage('medic',10);expect(another.actorState('medic').active!.pauseUntil).toBe(25);
  expect(another.healingSources(21)[0].eligible).toBe(false);expect(another.healingSources(36)[0].eligible).toBe(true);
});
it('roll evolution preserves existing cooldown and sequential recharge across death and checkpoint',()=>{
  const f=fixture(),sim=new AbilitySimulation(f.port);sim.register('medic',defaultGrowthLoadoutV3('assault'));
  sim.updateBuild('medic',['as_A1','as_A2'],0);sim.use('medic',{x:400,y:567},0);
  for(let t=0;t<=20;t++)sim.step(t);
  expect(sim.actorState('medic').queue).toEqual([210]);
  sim.updateBuild('medic',['as_A1','as_A2','as_EV_A'],20);
  expect(sim.actorState('medic').charges).toBe(0);expect(sim.actorState('medic').queue).toEqual([210,570]);
  sim.onDeath('medic',20);const restored=AbilitySimulation.restore(f.port,sim.checkpoint());
  for(let t=21;t<=210;t++)restored.step(t);
  expect(restored.actorState('medic').charges).toBe(1);expect(restored.actorState('medic').queue).toEqual([570]);
  restored.use('medic',{x:400,y:567},211);restored.step(211);
  expect(restored.actorState('medic').queue).toEqual([570,930]);expect(f.transfers).toEqual([3,3]);
});
it('shield locks shooting and early cancellation never refunds a committed charge',()=>{
  const f=fixture(),sim=new AbilitySimulation(f.port);sim.register('medic',changeGrowthAbility(defaultGrowthLoadoutV3('tank'),'tk_shield'));
  sim.use('medic',{x:400,y:567},0);
  expect(sim.locks('medic',0)).toMatchObject({fire:true,gadget:true,swap:true,reload:true,moveScale:.75});
  for(let t=0;t<=6;t++)sim.step(t);
  expect(sim.locks('medic',6)).toMatchObject({fire:true,swap:true,moveScale:.85});
  expect(sim.use('medic',{x:400,y:567},7)).toBe(true);
  expect(sim.actorState('medic').active).toBeNull();expect(sim.actorState('medic').queue).toEqual([426]);
  expect(f.finishes).toEqual([{reason:'cancelled',effective:false}]);
});
