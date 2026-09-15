import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { Battle } from '../../src/game/campaign/Battle';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
function fixture() {
  const room=new Room('cases','atrium','ctf',false,'growth');
  for(const id of ['a','b','c','d']){room.join(id,id,undefined,defaultGrowthLoadoutV3());room.ready(id,true);}
  room.start('a',77);const b=room.session!.battle;
  for(const a of b.actors){a.human=true;a.life.spawnProtectionFrames=0;}
  return {room,b,step:()=>b.tickPlayers(new Map())};
}
it('takes both fourth-floor cases, locks growth sidearms, and scores only at ground-floor spawns',()=>{
  const {b,step}=fixture(),bases=b.mission.deliveryBases!,zones=b.mission.deliveryZones!;
  expect(bases.every(p=>p.y===431.5)).toBe(true);expect(zones.every(p=>p.y===1439.5)).toBe(true);
  const a=b.actors.find(a=>a.team===1)!,enemy=b.actors.find(a=>a.team===2)!;
  a.movement.reset(bases[1].x,bases[1].y);enemy.movement.reset(bases[0].x,bases[0].y);step();
  const gun=b.growthV3!.weapons.get(a.id)!;
  expect(gun.selectedSlot).toBe('secondary');b.swap(a);step();expect(gun.selectedSlot).toBe('secondary');
  expect(b.snapshot().deliveryTargets!.map(t=>t.carrierId)).toEqual([enemy.id,a.id]);
  const restored=Battle.restore(b.checkpoint());restored.swap(restored.player);restored.tickPlayers(new Map());
  expect(restored.growthV3!.weapons.get(a.id)!.selectedSlot).toBe('secondary');
  a.movement.reset(bases[0].x,bases[0].y);step();expect(b.scores).toEqual([0,0]);
  a.movement.reset(zones[0].x,zones[0].y);step();expect(b.scores).toEqual([1,0]);
  expect(b.snapshot().deliveryTargets![1].carrierId).toBeNull();
  step();expect(b.scores).toEqual([1,0]);b.swap(a);step();expect(gun.selectedSlot).toBe('primary');
});
it('keeps one case per team during contested pickup, death, and departure',()=>{
  const {b,room,step}=fixture(),base=b.mission.deliveryBases![1],allies=b.actors.filter(a=>a.team===1);
  for(const a of allies)a.movement.reset(base.x,base.y);step();
  const first=b.snapshot().deliveryTargets![1].carrierId!;
  expect(b.snapshot().deliveryTargets).toHaveLength(2);
  expect(allies.filter(a=>a.deliveryPreviousWeapon!==undefined)).toHaveLength(1);
  for(const a of allies)if(a.id!==first)a.movement.reset(200,1439.5);
  b.damage(b.actors.find(a=>a.id===first)!,9999);step();expect(b.snapshot().deliveryTargets![1].carrierId).toBeNull();
  const next=allies.find(a=>a.id!==first)!;next.movement.reset(base.x,base.y);step();
  const player=[...room.players.keys()].find(id=>room.session!.actorId(id)===next.id)!;
  room.disconnect(player);room.expire(player);
  expect(b.snapshot().deliveryTargets![1].carrierId).toBeNull();expect(b.snapshot().deliveryTargets).toHaveLength(2);
});
it('finishes a growth match after three deliveries without kill scoring',()=>{
  const {b,step}=fixture(),enemy=b.mission.deliveryBases![1],home=b.mission.deliveryZones![0];
  b.damage(b.actors.find(a=>a.team===2)!,9999,b.player);expect(b.scores).toEqual([0,0]);
  for(let i=0;i<3;i++){b.player.movement.reset(enemy.x,enemy.y);step();b.player.movement.reset(home.x,home.y);step();}
  expect(b.scores).toEqual([3,0]);expect(b.result?.winner).toBe(1);
});
