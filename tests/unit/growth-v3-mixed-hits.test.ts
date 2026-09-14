import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';

const builds=[
  {name:'M4',build:defaultGrowthLoadoutV3(),damage:10,head:1.45,near:360,far:650,min:.65},
  {name:'M4 heavy barrel/extended/red dot',build:{...defaultGrowthLoadoutV3(),attachments:{primary:['B01','A02','O02'] as const,secondary:[]}},damage:10,head:1.45,near:403.2,far:728,min:.65},
  {name:'heavy sniper',build:{...defaultGrowthLoadoutV3('sniper'),primary:'heavy_sniper' as const},damage:72,head:1.45,near:1000,far:1600,min:.85},
];

for(const entry of builds)for(const health of [90,95,100,115] as const)for(const armor of [0,15,25] as const)
it.each([90,518,800])(`${entry.name}: mixed head/body at ${health} HP + ${armor} armor, distance %s`,distance=>{
  const build={...entry.build,attachments:{primary:[...entry.build.attachments.primary],secondary:[...entry.build.attachments.secondary]}};
  const r=new GrowthRangeSession(build,{distance,health,armor}),b=r.battle,gun=b.growthV3!.weapons.get('player')!;
  let life=health*1000,plate=armor*1000,heads=0,bodies=0,shots=0;
  // Accuracy is simulated: observed hit geometry feeds an independent numerical oracle.
  // Damage/HP output is never used to calculate its own expected value.
  for(let attempt=0;attempt<60&&life>0;attempt++){
    if(gun.current.ammo===0){b.reload();for(let i=0;i<120;i++)r.step();}
    const aim={...r.aim,y:r.aim.y-(attempt%2?25:0)};r.step({fire:true,aim});shots++;
    const effect=b.effects.find(e=>e.frame===b.frame&&e.actorId==='player');expect(effect).toBeDefined();
    const hit=effect!.trace.hit;
    if(hit?.type==='unit'){
      expect(hit.target).toBe('enemy-0');const head=hit.region==='head';if(head)heads++;else bodies++;
      const {origin,end}=effect!.trace,d=Math.hypot(end.x-origin.x,end.y-origin.y);
      const scale=d<=entry.near?1:d>=entry.far?entry.min:1-(1-entry.min)*(d-entry.near)/(entry.far-entry.near);
      const damage=Math.round(entry.damage*scale*(head?entry.head:1)*1000),blocked=Math.min(plate,damage);
      plate-=blocked;life=Math.max(0,life-(damage-blocked));
    }
    expect(b.actors[1].life.health).toBe(life/1000);expect(b.growthV3!.participant('enemy-0').armor.remaining).toBe(plate);
    expect(b.actors[1].life.alive).toBe(life>0);
    if(life>0)for(let i=0;i<59;i++)r.step();
  }
  expect(life).toBe(0);expect(heads).toBeGreaterThan(0);expect(bodies).toBeGreaterThan(0);
  expect(r.shots).toBe(shots);expect(b.player.kills).toBe(1);expect(r.killTick).toBe(b.frame);
  if(distance===90){
    const m4Shots={90:[8,9,10],95:[8,10,10],100:[9,10,11],115:[10,11,12]};
    expect(shots).toBe(entry.damage===72?2:m4Shots[health][[0,15,25].indexOf(armor)]);
  }
});
