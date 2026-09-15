import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { legalGrowthCards } from '../../src/shared/content/growth-v3/Cards';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

function fixture(tank=false) {
  const build=defaultGrowthLoadoutV3(tank?'tank':'assault');
  if(tank)build.pool=['tk_C4' as const,...legalGrowthCards('tank',build.abilityId).filter(id=>id!=='tk_C4')].slice(0,8);
  const mission={...new GrowthRangeSession(build,{distance:1800,health:100,armor:0}).battle.mission,enemies:3};
  const b=new Battle(mission,'normal','m4',seededRandom(9361));
  b.enableGrowthV3(Object.fromEntries(b.actors.map(a=>[a.id,a.id==='player'?build:defaultGrowthLoadoutV3()])),5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(400+i*400,499.5);});
  const p=b.growthV3!.participant('player'),gun=b.growthV3!.weapons.get('player')!;
  if(tank){awardGrowthV3(p.progression,p.loadout,200,0,()=>0);expect(b.growthChoice('player',p.progression.offer!.batch,'tk_C4')).toBe(true);}
  const until=(tick:number)=>{while(b.frame<tick)b.tickPlayers(new Map());};
  return {b,p,gun,until};
}

it('tk_C4 grants ten primary reserve rounds on different victims only at the 150 tick deadline',()=>{
  const {b,p,gun,until}=fixture(true);
  for(let i=0;i<200&&gun.current.ammo>20;i++)b.tickPlayers(new Map([['player',{...idleInput(),fire:true,aim:{x:20,y:100}}]]));
  expect(gun.current.ammo).toBe(20);const total=gun.current.ammo+gun.current.reserve,first=b.frame;
  b.damage(b.actors[1],999,b.player);expect(gun.current.ammo+gun.current.reserve).toBe(total+10);
  until(first+149);b.damage(b.actors[2],999,b.player);
  expect(gun.current.ammo+gun.current.reserve).toBe(total+10);expect(p.cooldowns.reclaim).toBe(first+150);
  until(first+150);b.damage(b.actors[3],999,b.player);
  expect(gun.current.ammo+gun.current.reserve).toBe(total+20);expect(gun.current.ammo).toBe(20);
  expect(p.cooldowns.reclaim).toBe(first+300);
});

it('pk_dressing retains its 300 tick cooldown through real death and revival',()=>{
  const {b,p,until}=fixture();
  b.damage(b.player,70,b.actors[3]);b.damage(b.actors[1],999,b.player);
  expect(b.player.life.health).toBe(35);expect(p.cooldowns.dressing).toBe(300);
  b.damage(b.player,999,b.actors[3]);until(150);
  expect(b.player.life.alive).toBe(true);expect(p.cooldowns.dressing).toBe(300);
  until(299);expect(b.player.life.spawnProtectionFrames).toBe(0);
  b.damage(b.player,70,b.actors[3]);b.damage(b.actors[2],999,b.player);
  expect(b.player.life.health).toBe(30);expect(p.cooldowns.dressing).toBe(300);
  until(300);b.damage(b.actors[3],999,b.player);
  expect(b.player.life.health).toBe(35);expect(p.cooldowns.dressing).toBe(600);
});
