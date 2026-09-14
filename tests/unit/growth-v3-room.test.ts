import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

it('N16 exhausted smoke stays empty through death, reconnect and actual map ammo supply; G1 grants once and a new round starts with two', () => {
  const build=defaultGrowthLoadoutV3('medic');
  build.pool=['md_G1',...build.pool.filter(id=>id!=='md_G1')];
  const room=new Room('smoke-lifecycle','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,build);room.ready('client',true);room.start('client',116);
  const b=room.session!.battle;
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?1500:480,599.5);});
  const step=(n=1)=>{for(let i=0;i<n;i++)room.session!.tick();};
  let sequence=0;
  const send=(fire:boolean,items=false)=>{
    expect(room.command('client',{sequence:sequence++,input:{...idleInput(),fire,aim:{x:480,y:100}},actions:items?['item']:[]})).toBe(true);
    step();
  };
  send(false,true);step(36);send(false,true);step(6);
  expect(b.player.itemCharges).toBe(0);
  b.damage(b.player,9999);step(150);expect(b.player.life.alive).toBe(true);
  room.disconnect('client');room.reconnect('client');expect(b.player.itemCharges).toBe(0);
  b.player.movement.reset(480,599.5);
  send(true);step(12);send(false);
  const gun=b.growthV3!.weapons.get('player')!,before=gun.current.ammo+gun.current.reserve;
  expect(before).toBeLessThan(120);
  const cursor=b.journal.cursor,spawn=b.mission.spawns[0][0];
  b.player.movement.reset(spawn.x,spawn.y);step(301);
  expect(gun.current.ammo+gun.current.reserve).toBe(120);
  expect(b.journal.since(cursor).some(event=>event.kind==='supply'&&event.actorId==='player')).toBe(true);
  expect(b.player.itemCharges).toBe(0);
  const p=b.growthV3!.participant('player');awardGrowthV3(p.progression,p.loadout,200,b.frame,()=>0);
  const batch=p.progression.offer!.batch;expect(p.progression.offer!.cards).toContain('md_G1');
  expect(b.growthChoice('player',batch,'md_G1')).toBe(true);expect(b.player.itemCharges).toBe(1);
  expect(b.growthChoice('player',batch,'md_G1')).toBe(false);expect(b.player.itemCharges).toBe(1);
  room.disconnect('client');room.reconnect('client');expect(b.player.itemCharges).toBe(1);
  b.endMatch(1,'Fixture round boundary');room.returnToLobby('client');room.ready('client',true);room.start('client',117);
  expect(room.session!.battle.player.itemCharges).toBe(2);
});

it('starts a production growth room with the selected exclusive G and preserves inventory on reconnect', () => {
  const room = new Room('v3-room', 'hijack', 'tdm', false, 'growth');
  room.join('client', '医疗兵', undefined, defaultGrowthLoadoutV3('medic'));
  room.equipGrowth('client', changeGrowthAbility(defaultGrowthLoadoutV3('medic'), 'md_link'));
  room.ready('client', true); room.start('client', 17);
  const session = room.session!, battle = session.battle, id = session.actorId('client')!;
  const actor = battle.actors.find(a => a.id === id)!;
  actor.life.spawnProtectionFrames = 0;
  expect(battle.growthV3!.participant(id).loadout.abilityId).toBe('md_link');
  expect(room.command('client', { sequence: 1, input: { ...idleInput(), aim: { x: actor.movement.x + 100, y: actor.movement.y - 100 } }, actions: ['item'] })).toBe(true);
  for (let i = 0; i < 8; i++) session.tick();
  expect(actor.itemCharges).toBe(1);
  expect(battle.grenades).toHaveLength(0);
  expect(battle.growthV3!.worldView().flying.some(g => g.gadgetId === 'md_smoke')).toBe(true);
  room.disconnect('client'); room.reconnect('client');
  expect(actor.itemCharges).toBe(1);
  expect(() => room.equipGrowth('client', defaultGrowthLoadoutV3())).toThrow();
  expect(Battle.restore(battle.checkpoint()).checkpoint()).toEqual(battle.checkpoint());
});

it('rejects another operator gadget before changing a production lobby build', () => {
  const room = new Room('v3-invalid', 'hijack', 'tdm', false, 'growth');
  room.join('client', '突击兵');
  const before = structuredClone(room.players.get('client')!.growthLoadout);
  expect(() => room.equipGrowth('client', { ...defaultGrowthLoadoutV3(), gadgetId: 'md_smoke' })).toThrow();
  expect(room.players.get('client')!.growthLoadout).toEqual(before);
});

it('retires an expired production participant without later respawn', () => {
  const room = new Room('v3-expire', 'hijack', 'tdm', false, 'growth');
  room.join('client', '突击兵'); room.ready('client', true); room.start('client', 18);
  const session = room.session!, id = session.actorId('client')!;
  room.disconnect('client'); room.expire('client');
  for (let i = 0; i < 160; i++) session.tick();
  expect(session.battle.growthV3!.participant(id).retired).toBe(true);
  expect(session.battle.snapshot().actors.some(a => a.id === id)).toBe(false);
  expect(session.battle.actors.find(a => a.id === id)!.life.alive).toBe(false);
});
it('keeps the default standard and validates the independent short experiment atomically',()=>{
  const room=new Room('presets','hijack','tdm',false,'growth');room.join('host','房主');room.join('other','队友');
  expect(room.growthPreset).toBe('standard');
  room.ready('other',true);const before=structuredClone(room.lobby());
  expect(()=>room.configure('other','signal','tdm','short')).toThrow();expect(room.lobby()).toEqual(before);
  expect(()=>room.configure('host','signal','tdm','invalid')).toThrow();expect(room.lobby()).toEqual(before);
  room.configure('host','signal','tdm','short');expect(room.lobby().growthPreset).toBe('short');
  room.configure('host','hijack','tdm');expect(room.growthPreset).toBe('short');
  const classic=new Room('classic');classic.join('host','房主');const classicBefore=structuredClone(classic.lobby());
  expect(()=>classic.configure('host','signal','tdm','short')).toThrow();expect(classic.lobby()).toEqual(classicBefore);
});
it('ends the real short room at tick18000 and awakens at tick12600 with checkpoint parity',()=>{
  const room=new Room('short','signal','tdm',false,'growth');room.join('host','房主');
  room.configure('host','signal','tdm','short');room.ready('host',true);room.start('host',46);
  const b=room.session!.battle;b.actors.forEach(a=>{a.human=true;});
  expect(b.mission.seconds).toBe(600);expect(b.growthV3!.privateView('player').ultimateTick).toBe(12600);
  for(let i=0;i<12599;i++)b.tickPlayers(new Map());
  expect(b.growthV3!.participant('player').progression.ultimate).toBe(false);
  b.tickPlayers(new Map());expect(b.growthV3!.participant('player').progression.ultimate).toBe(true);
  const restored=Battle.restore(b.checkpoint());
  while(b.frame<17999){b.tickPlayers(new Map());restored.tickPlayers(new Map());}
  expect(b.result).toBeNull();b.tickPlayers(new Map());restored.tickPlayers(new Map());
  expect(b.frame).toBe(18000);expect(b.result).not.toBeNull();expect(restored.checkpoint()).toEqual(b.checkpoint());
  expect(()=>room.configure('host','signal','tdm','standard')).toThrow();
});
it('starts an unchanged standard room with the original fifteen-minute and twelve-minute clocks',()=>{
  const room=new Room('standard','signal','tdm',false,'growth');room.join('host','房主');room.ready('host',true);room.start('host',45);
  expect(room.session!.battle.mission.seconds).toBe(900);expect(room.session!.battle.growthV3!.privateView('player').ultimateTick).toBe(21600);
});
