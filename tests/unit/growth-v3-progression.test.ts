import { expect, it } from 'vitest';
import { defaultGrowthLoadoutV3,changeGrowthAbility,validateGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_OPERATORS } from '../../src/shared/content/growth-v3/Operators';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import type { GrowthCardId } from '../../src/shared/content/growth-v3/Cards';
import { newProgression, awardGrowthV3, chooseGrowthV3, rerollGrowthV3, newContributions, healingCredit, supportCredit, objectiveCredit } from '../../src/shared/simulation/growth-v3/Progression';
import { newContinuousHealTarget, chooseContinuousHeal, commitContinuousHeal, type ContinuousHealSource } from '../../src/shared/simulation/growth-v3/HealingRules';

it('route-first draws cover equal random intervals and every ordered remaining pair without replacement',()=>{
  for(const cls of ['assault','tank','sniper','medic'] as GrowthClassId[])for(const route of [0,1] as const){
    const build=changeGrowthAbility(defaultGrowthLoadoutV3(cls),GROWTH_V3_OPERATORS[cls].abilities[route]);
    const group=route===0?'A':'B',routeCards=build.pool.filter(id=>id.split('_')[1].startsWith(group));
    expect(routeCards).toHaveLength(3);
    const firstCounts=new Map<string,number>(),triples=new Set<string>();
    for(let first=0;first<3;first++)for(let second=0;second<7;second++)for(let third=0;third<6;third++){
      const randoms=[(first+.5)/3,(second+.5)/7,(third+.5)/6];let calls=0;
      const state=newProgression();awardGrowthV3(state,build,200,0,()=>randoms[calls++]);
      const cards=state.offer!.cards;
      expect(calls).toBe(3);expect(cards[0]).toBe(routeCards[first]);
      expect(new Set(cards).size).toBe(3);expect(cards.every(id=>build.pool.includes(id as GrowthCardId))).toBe(true);
      firstCounts.set(cards[0],(firstCounts.get(cards[0])??0)+1);triples.add(cards.join(','));
    }
    expect([...firstCounts.values()]).toEqual([42,42,42]);expect(triples.size).toBe(126);
  }
});

it('all 72 legal custom pools preserve route offers, evolution prerequisites and refresh guarantees',()=>{
  let pools=0,states=0;
  for(const cls of ['assault','tank','sniper','medic'] as GrowthClassId[])for(const route of [0,1] as const){
    const build=changeGrowthAbility(defaultGrowthLoadoutV3(cls),GROWTH_V3_OPERATORS[cls].abilities[route]);
    const prefix={assault:'as',tank:'tk',sniper:'sn',medic:'md'}[cls],group=route===0?'A':'B';
    const allowed=[`${group}1`,`${group}2`,`${group}3`,'C1','C2','C3','C4','G1','G2'].map(suffix=>`${prefix}_${suffix}` as GrowthCardId);
    for(const omitted of allowed){
    build.pool=allowed.filter(id=>id!==omitted);validateGrowthLoadoutV3(build,5);pools++;
    const visit=(selected:GrowthCardId[],from:number)=>{
      states++;
      const state=newProgression();state.selected=[...selected];
      awardGrowthV3(state,build,1200,0,()=>0);
      const cards=state.offer!.cards;
      const eligible=selected.length===3&&selected.includes(`${prefix}_${group}1` as GrowthCardId)&&selected.includes(`${prefix}_${group}2` as GrowthCardId);
      expect(cards.filter(id=>id.includes('_EV_'))).toEqual(eligible?[`${prefix}_EV_${group}`]:[]);
      expect(new Set(cards).size).toBe(cards.length);expect(cards.some(id=>selected.includes(id as GrowthCardId))).toBe(false);
      if(!eligible&&build.pool.some(id=>id.startsWith(`${prefix}_${group}`)&&!selected.includes(id)))
        expect(cards.some(id=>id.startsWith(`${prefix}_${group}`))).toBe(true);
      const old=[...cards];expect(rerollGrowthV3(state,build,state.offer!.batch,1,()=>0)).toBe(true);
      expect(state.offer!.cards.filter(id=>id.includes('_EV_'))).toEqual(eligible?[`${prefix}_EV_${group}`]:[]);
      expect(state.offer!.cards.some(id=>!old.includes(id))).toBe(true);
      if(selected.length<3)for(let i=from;i<build.pool.length;i++)visit([...selected,build.pool[i]],i+1);
    };
    visit([],0);
    }
  }
  expect(pools).toBe(72);expect(states).toBe(6696);
});

it('N20 queues four choices, pins eligible evolution, refreshes a real alternative, and rejects stale batches',()=>{
  const loadout=defaultGrowthLoadoutV3(), state=newProgression();
  awardGrowthV3(state,loadout,1200,0,()=>0);
  expect(state.level).toBe(5); expect(state.selected).toEqual([]);
  expect(chooseGrowthV3(state,loadout,state.offer!.batch,'as_A1',1,()=>0)).toBe(true);
  expect(chooseGrowthV3(state,loadout,state.offer!.batch,'as_A2',2,()=>0)).toBe(true);
  expect(chooseGrowthV3(state,loadout,state.offer!.batch,'as_C1',3,()=>0)).toBe(true);
  expect(state.offer!.cards).toContain('as_EV_A');
  const old=structuredClone(state.offer!);
  expect(rerollGrowthV3(state,loadout,old.batch,4,()=>0)).toBe(true);
  expect(state.offer!.cards).toContain('as_EV_A');expect(state.offer!.cards.some(id=>!old.cards.includes(id))).toBe(true);
  expect(chooseGrowthV3(state,loadout,old.batch,'as_EV_A',5,()=>0)).toBe(false);
  expect(rerollGrowthV3(state,loadout,state.offer!.batch,6,()=>0)).toBe(false);
  expect(chooseGrowthV3(state,loadout,state.offer!.batch,'as_EV_A',7,()=>0)).toBe(true);
  expect(state.selected).toHaveLength(4);expect(state.offer).toBeNull();
  expect(chooseGrowthV3(state,loadout,state.serial,'as_EV_A',8,()=>0)).toBe(false);
});

it('N14-N15/N23 keeps the strongest continuous source active even between its scheduled pulses',()=>{
  const target=newContinuousHealTarget(), sources:ContinuousHealSource[]=[
    {id:'a',ownerId:'medic-a',targetId:'patient',amount:5000,interval:15,firstPulseTick:15,lastPulseTick:90,eligible:true},
    {id:'b',ownerId:'medic-b',targetId:'patient',amount:5000,interval:15,firstPulseTick:20,lastPulseTick:95,eligible:true},
    {id:'station',ownerId:'medic-c',targetId:'patient',amount:3000,interval:30,firstPulseTick:30,lastPulseTick:300,eligible:true},
  ];
  const healed:{tick:number;id:string;amount:number}[]=[];
  for(let tick=0;tick<=90;tick++) {
    const winner=chooseContinuousHeal(target,'patient',sources,tick);
    if(winner){healed.push({tick,id:winner.id,amount:winner.amount});commitContinuousHeal(target,tick,winner.amount);}
  }
  expect(healed.map(h=>h.tick)).toEqual([15,30,45,60,75,90]);
  expect(healed.every(h=>h.id==='a')).toBe(true);expect(healed.reduce((sum,h)=>sum+h.amount,0)).toBe(30000);
  expect(chooseContinuousHeal(target,'patient',sources,95)).toBeNull();
  expect(chooseContinuousHeal(target,'patient',sources,120)?.id).toBe('station');
});

it('continuous source death/visibility/pause removes it from arbitration without catching up lost ticks',()=>{
  const target=newContinuousHealTarget();
  const source:ContinuousHealSource={id:'a',ownerId:'medic',targetId:'patient',amount:5000,interval:15,firstPulseTick:15,lastPulseTick:90,eligible:false};
  expect(chooseContinuousHeal(target,'patient',[source],15)).toBeNull();
  source.eligible=true;
  expect(chooseContinuousHeal(target,'patient',[source],16)).toBeNull();
  expect(chooseContinuousHeal(target,'patient',[source],30)).toBe(source);
  commitContinuousHeal(target,30,0);expect(target.lastHealTick).toBeLessThan(0);
});

it('N24 gives the full 15XP for a valid 30HP chain while sharing recipient and healer budgets',()=>{
  const a=newContributions(), b=newContributions(), target=newContributions();target.healable=80000;
  let xp=0;for(let tick=15;tick<=90;tick+=15)xp+=healingCredit(a,target,'a',5000,tick,false);
  expect(xp).toBe(15);expect(target.targetHealing).toBe(15);expect(a.support).toBe(15);
  expect(healingCredit(b,target,'b',20000,100,false)).toBe(5);expect(target.targetHealing).toBe(20);
  expect(healingCredit(a,target,'a',10000,110,false)).toBe(0);
  expect(target.healable).toBe(20000);
  expect(healingCredit(a,target,'a',10000,900,false)).toBe(5);expect(target.targetHealing).toBe(5);
});

it('self heal, over-heal, spent damage credits and replayed support events cannot farm XP',()=>{
  const a=newContributions(), target=newContributions();target.healable=10000;
  expect(healingCredit(a,target,'a',6000,0,true)).toBe(0);expect(target.healable).toBe(4000);
  expect(healingCredit(a,target,'a',6000,1,false)).toBe(2);
  expect(healingCredit(a,target,'a',6000,2,false)).toBe(0);
  expect(supportCredit(a,10,'intercept:1',3,500)).toBe(10);
  expect(supportCredit(a,10,'intercept:1',4,500)).toBe(0);
  for(let i=0;i<8;i++)supportCredit(a,10,`intercept:${i+2}`,5,500);
  expect(a.support).toBe(60);
  for(let i=0;i<40;i++)objectiveCredit(a,30+i);
  expect(a.objective).toBe(60);expect(a.support).toBe(60);
});

it('limits one healer to 40 healing XP across targets while sharing the 60 support budget',()=>{
  const healer=newContributions();
  const targets=Array.from({length:3},()=>({...newContributions(),healable:60000}));
  expect(healingCredit(healer,targets[0],'medic',40000,100,false)).toBe(20);
  expect(healingCredit(healer,targets[1],'medic',40000,100,false)).toBe(20);
  expect(healingCredit(healer,targets[2],'medic',40000,100,false)).toBe(0);
  expect(healer.healing).toBe(40);expect(healer.support).toBe(40);
  expect(supportCredit(healer,30,'intercept:test',101,1800)).toBe(20);
  expect(healer.support).toBe(60);
  // The next window does not pay for the 40HP already restored without XP.
  expect(healingCredit(healer,targets[2],'medic',0,900,false)).toBe(0);
  expect(healingCredit(healer,targets[2],'medic',20000,901,false)).toBe(10);
  expect(targets[2].healable).toBe(0);
});

it('healing consumes only remaining shared support capacity and target capacity atomically',()=>{
  const healer=newContributions(),other=newContributions(),target={...newContributions(),healable:80000};
  expect(supportCredit(healer,57,'cover:test',10,1800)).toBe(57);
  expect(healingCredit(healer,target,'a',20000,11,false)).toBe(3);
  expect(healer.healing).toBe(3);expect(healer.support).toBe(60);expect(target.targetHealing).toBe(3);
  expect(healingCredit(other,target,'b',40000,12,false)).toBe(17);
  expect(target.targetHealing).toBe(20);expect(other.healing).toBe(17);
  expect(healingCredit(other,target,'b',20000,13,false)).toBe(0);
  expect(target.healable).toBe(0);
});

it('keeps sub-2HP credit separate per healer and target and clears it at the fixed window boundary',()=>{
  const a=newContributions(),b=newContributions();
  const x={...newContributions(),healable:20000},y={...newContributions(),healable:20000};
  expect(healingCredit(a,x,'a',1999,898,false)).toBe(0);
  expect(healingCredit(b,x,'b',1,898,false)).toBe(0);
  expect(healingCredit(a,y,'a',1,898,false)).toBe(0);
  expect(healingCredit(a,x,'a',1,899,false)).toBe(1);
  expect(healingCredit(a,x,'a',1999,899,false)).toBe(0);
  expect(healingCredit(a,x,'a',1,900,false)).toBe(0);
  expect(x.healingRemainders).toEqual({a:1});
  expect(healingCredit(a,x,'a',1999,901,false)).toBe(1);
  expect(healingCredit(a,y,'a',1999,901,false)).toBe(0);
  expect(a.healing).toBe(1);expect(x.targetHealing).toBe(1);
});
