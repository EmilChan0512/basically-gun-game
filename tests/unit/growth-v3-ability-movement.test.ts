import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import {expect,it} from 'vitest';
import {Battle,idleInput,seededRandom} from '../../src/game/campaign/Battle';
import {changeGrowthAbility} from '../../src/shared/content/growth-v3/Loadout';
import type {GrowthAbilityId} from '../../src/shared/content/growth-v3/Operators';
import type {GrowthClassId} from '../../src/shared/content/growth-v3/Core';

// Independent specification values: class, E, windup, active horizontal multiplier.
const cases:[GrowthClassId,GrowthAbilityId,number,number][]=[
  ['assault','as_roll',0,1.5],['assault','as_reloadrush',3,1.25],
  ['tank','tk_barrier',3,.75],['tank','tk_shield',6,.85],
  ['sniper','sn_focus',3,.8],['sniper','sn_relocate',0,1.2],
  ['medic','md_pulse',3,.9],['medic','md_link',6,.8],
];
function fixture(cls:GrowthClassId,id:GrowthAbilityId,wall=false){
  const b=new Battle({id:'ability-movement',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:100,
    seconds:900,debug:true,allies:0,enemies:1,width:1400,height:700,
    spawns:[[{x:60,y:600}],[{x:1340,y:600}]],objective:{x:900,y:600},navigation:[],
    terrain:[{x:0,y:600,width:1400,height:100},...(wall?[{x:500,y:300,width:20,height:300}]:[])],
    palette:{sky:0,wall:0,trim:0}},'normal','m4',seededRandom(932));
  b.enableGrowthV3(Object.fromEntries(b.actors.map(a=>[a.id,a===b.player?changeGrowthAbility(defaultGrowthLoadoutV3(cls),id):defaultGrowthLoadoutV3('assault')])),5);
  b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(a===b.player?350:1200,599.5);});
  b.player.life.health=30;
  const step=(n=1,right=false)=>{for(let i=0;i<n;i++)b.tickPlayers(new Map([[b.player.id,{...idleInput(),right,aim:{x:800,y:566.5}}]]));};
  return {b,step,m:b.player.movement};
}

it.each(cases)('%s %s applies active acceleration and terminal speed to actual movement',(cls,id,cast,speed)=>{
  const f=fixture(cls,id);f.b.useSkill();f.step(1+cast);
  const scale=(cls==='tank'?.9:cls==='assault'?1.1:1)*speed,start=f.m.x;
  f.step(1,true);expect(f.m.vx).toBeCloseTo(1.8*scale,8);expect(f.m.x-start).toBeCloseTo(1.8*scale,8);
  f.step(5,true);expect(f.m.vx).toBeCloseTo(9.5*scale,8);
  expect(f.b.growthV3!.abilities.actorState(f.b.player.id).active).not.toBeNull();
});

it.each(cases.filter(row=>row[2]>0))('%s %s applies 0.75 windup movement before the active modifier',(cls,id)=>{
  const f=fixture(cls,id);f.b.useSkill();f.step(1,true);
  expect(f.b.growthV3!.abilities.actorState(f.b.player.id).pending).not.toBeNull();
  expect(f.m.vx).toBeCloseTo(1.8*(cls==='tank'?.9:cls==='assault'?1.1:1)*.75,8);
});

it.each(['as_roll','as_reloadrush'] as const)('%s cannot cross an actual tall solid wall',id=>{
  const f=fixture('assault',id,true);f.m.reset(470,599.5);f.b.useSkill();
  f.step(30,true);
  expect(f.m.x).toBeGreaterThan(470);expect(f.m.x).toBeLessThan(484);
  expect(f.m.y).toBe(599.5);expect(f.b.player.life.alive).toBe(true);
});
