import { expect, it } from 'vitest';
import { Battle } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';
it('removes hidden actor coordinates from poses, hits, effects and projectiles without mutating the authority', () => {
  const battle = new Battle(customMatch('hijack')), source = battle.player.id, hidden = battle.actors[4].id;
  const trace = { origin: { x: 20, y: 20 }, end: { x: 30, y: 30 }, maxDistance: 100, steps: 1,
    preSteps: 0, initialHit: null, headMarked: false, hit: { type: 'unit' as const, target: hidden, region: 'body' as const } };
  const message: StateMessage = { type: 'state', roomId: 'test', round: 1, actorId: source, mapId: 'hijack', mode: 'tdm',
    state: battle.snapshot(), result: null, ack: 5,
    poses: battle.actors.map(a => ({ id: a.id, name: a.name, aim: { x: a.movement.x, y: a.movement.y } })),
    effects: [{ frame: 0, actorId: source, team: 1, damage: 10, killed: false, trace }],
    bursts: [{ x: 99999, y: 99999, frame: 0, radius: 10, color: 1 }], grenades: [{ x: 99999, y: 99999 }],
    events: [{ id: 1, tick: 0, kind: 'damage', actorId: source, targetId: hidden }, { id: 2, tick: 0, kind: 'result' }] };
  const filtered = visibleState(message, new Set([source]), 1, () => true);
  expect(filtered.state.actors.map(a => a.id)).toEqual([source]);
  expect(filtered.poses.map(p => p.id)).toEqual([source]);
  expect(filtered.effects).toEqual([]); expect(filtered.bursts).toEqual([]); expect(filtered.grenades).toEqual([]);
  expect(filtered.events.map(e => e.id)).toEqual([2]); expect(filtered.ack).toBe(5);
  expect(message.state.actors).toHaveLength(8); expect(message.effects).toHaveLength(1);
});

it('publishes visible world effects and team-authorized frozen intel without revealing hidden source identities',()=>{
  const battle=new Battle(customMatch('signal')),source=battle.player.id,hidden=battle.actors[4].id;
  battle.player.movement.reset(480,599.5);
  const message:StateMessage={type:'state',roomId:'events',round:1,actorId:source,mapId:'signal',mode:'tdm',state:battle.snapshot(),
    result:null,ack:0,poses:[],effects:[],bursts:[],grenades:[],events:[
      {id:1,tick:0,kind:'smokeStarted',actorId:hidden,entityId:'smoke',position:{x:520,y:566}},
      {id:2,tick:0,kind:'deployableDamaged',actorId:hidden,entityId:'cover',position:{x:520,y:566},amount:10},
      {id:3,tick:0,kind:'intelPing',actorId:source,targetId:hidden,team:1,expiresTick:30,position:{x:900,y:566}},
      {id:4,tick:0,kind:'intelPing',actorId:hidden,targetId:source,team:2,position:{x:480,y:566}},
      {id:5,tick:0,kind:'smokeEnded',actorId:hidden,position:{x:9999,y:9999}},
    ]};
  const visible=new Set([source]);
  const fogged=visibleState(message,visible,1,()=>false,()=>true);
  expect(fogged.events.map(e=>e.id)).toEqual([1,3]);
  expect(fogged.events[0].actorId).toBeUndefined();expect(fogged.events[1].targetId).toBeUndefined();
  expect(fogged.events[1].position).toEqual({x:900,y:566});
  expect(Object.keys(fogged.events[1]).sort()).toEqual(['expiresTick','id','kind','position','team','tick']);
  const clear=visibleState(message,visible,1,()=>false,()=>false);
  expect(clear.events.map(e=>e.id)).toEqual([1,2,3]);expect(clear.events[1].actorId).toBeUndefined();
  expect(message.events[0].actorId).toBe(hidden);
});
