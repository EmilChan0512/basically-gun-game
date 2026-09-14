import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { defaultGrowthLoadoutV3, type GrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { idleInput, type BattleInput } from '../../src/game/campaign/Battle';
import type { PlayerAction } from '../../src/shared/protocol/Commands';
import { impairedWebSocket } from '../helpers/impaired-websocket';
import { MatchSession } from '../../src/shared/simulation/MatchSession';

const wait = async (check:()=>boolean) => {
  const deadline=Date.now()+4000;
  while(!check()){if(Date.now()>deadline)throw Error('Network boundary timeout');await new Promise(resolve=>setTimeout(resolve,10));}
};

async function networkFixture(builds:GrowthLoadoutV3[], impaired=false,reconnectMs=30000) {
  const server=startServer(0,'127.0.0.1',reconnectMs);
  await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  const proxy=impaired?await impairedWebSocket(`ws://127.0.0.1:${address.port}`):undefined;
  const peers:{socket:WebSocket;messages:any[];account?:Awaited<ReturnType<typeof authorizeSocket>>}[]=[];
  const connect=async()=>{
    const peer={socket:new WebSocket(proxy?.url??`ws://127.0.0.1:${address.port}`),messages:[] as any[]};
    peer.socket.on('message',raw=>peer.messages.push(JSON.parse(raw.toString())));
    await new Promise<void>(resolve=>peer.socket.once('open',resolve));return peer;
  };
  const send=(i:number,message:object)=>peers[i].socket.send(JSON.stringify({protocol:1,content:CONTENT_VERSION,...message}));
  const close=async()=>{for(const p of peers)p.socket.terminate();await proxy?.close();await server.close();};
  try {
    for(let i=0;i<builds.length;i++){
      const peer=await connect();peers.push(peer);peers[i].account=await authorizeSocket(server,peer.socket,`Boundary ${i}`);
    }
    send(0,{type:'create',rules:'growth',name:'Host'});await wait(()=>server.rooms.size===1);
    const room=[...server.rooms.values()][0];
    for(let i=1;i<builds.length;i++){send(i,{type:'join',code:room.id,name:`Peer ${i}`});await wait(()=>room.players.size===i+1);}
    send(0,{type:'configure',mapId:'signal',mode:'tdm'});await wait(()=>room.mapId==='signal');
    for(let i=0;i<builds.length;i++){send(i,{type:'growthEquip',loadout:builds[i]});send(i,{type:'ready',ready:true});}
    await wait(()=>[...room.players.values()].every(p=>p.ready));send(0,{type:'start'});await wait(()=>!!room.session);
    const session=room.session!,b=session.battle;
    // Only the test clock is manual. Inputs, auth/resume and filtered snapshots cross actual WebSockets.
    session.advance=()=>{};
    const ids=peers.map(peer=>peer.messages.find(m=>m.type==='welcome').playerId as string);
    const actors=ids.map(id=>b.actors.find(a=>a.id===session.actorId(id))!);
    actors.forEach((a,i)=>{a.life.spawnProtectionFrames=0;a.movement.reset(480+i*120,599.5);});
    const step=(n=1)=>{for(let i=0;i<n;i++)session.tick();};
    const command=async(i:number,input:Partial<BattleInput>,actions:PlayerAction[]=[])=>{
      const sequence=session.nextSequence(ids[i]);
      send(i,{type:'input',roomId:room.id,round:room.round,command:{sequence,input:{...idleInput(),...input},actions}});
      await wait(()=>session.nextSequence(ids[i])===sequence+1);
    };
    const state=async(i:number,accept:(message:any)=>boolean=()=>true)=>{
      const frame=b.frame,start=peers[i].messages.length;
      await wait(()=>peers[i].messages.slice(start).some(m=>m.type==='state'&&m.state.frame===frame&&accept(m)));
      return peers[i].messages.slice(start).find(m=>m.type==='state'&&m.state.frame===frame&&accept(m));
    };
    const resume=async(i:number)=>{
      const old=peers[i],token=old.messages.find(m=>m.type==='credential').token;
      old.socket.close();await wait(()=>!room.players.get(ids[i])!.connected);
      const peer=await connect();peers[i]={...peer,account:old.account};
      send(i,{type:'resume',token,authToken:old.account!.token});
      await wait(()=>peer.messages.some(m=>m.type==='resumed'));
      expect(room.players.get(ids[i])!.connected).toBe(true);
    };
    return {server,room,b,session,actors,peers,ids,proxy,send,step,command,state,resume,close};
  } catch(error){await close();throw error;}
}

it.each(['pending','deployed'] as const)('real socket timeout cleans %s cover without simulating expiry ticks',async phase=>{
  const f=await networkFixture([defaultGrowthLoadoutV3('tank'),defaultGrowthLoadoutV3('assault')],false,500);
  try {
    await f.command(0,{aim:{x:520,y:599.5}},['item']);f.step(phase==='pending'?1:13);
    const g=f.b.growthV3!.gadgets,id=f.actors[0].id,frame=f.b.frame;
    expect(g.entities()).toHaveLength(phase==='pending'?0:1);
    expect(!!g.inventory(id).cast).toBe(phase==='pending');
    f.peers[0].socket.close();
    await wait(()=>f.room.players.get(f.ids[0])?.connected===false);
    expect(f.b.growthV3!.participant(id).retired).toBe(false);
    expect(g.entities()).toHaveLength(phase==='pending'?0:1);
    // No direct Room.expire call and no fake timer: the server reconnect deadline runs.
    await wait(()=>!f.room.players.has(f.ids[0]));
    expect(f.b.frame).toBe(frame);
    expect(f.b.growthV3!.participant(id).retired).toBe(true);
    expect(g.entities()).toHaveLength(0);
    expect(g.inventory(id)).toMatchObject({cast:null,charges:phase==='pending'?1:0});
    const survivor=await f.state(1);
    expect(survivor.state.growthWorld.entities.some((e:any)=>e.sourceId===id)).toBe(false);
  } finally {await f.close();}
});

it.each(['skill','item','reload'] as const)('delayed repeated %s input replays its receipt without changing committed simulation state',async action=>{
  const f=await networkFixture([defaultGrowthLoadoutV3('tank')],true);
  try {
    // Fire real rounds before reload; keep the simulated clock independent of transport delays.
    if(action==='reload'){
      await f.command(0,{fire:true,aim:{x:1400,y:566.5}});f.step(20);
      expect(f.b.growthV3!.participant(f.actors[0].id).metrics.shots).toBeGreaterThan(0);
    }
    const sequence=f.session.nextSequence(f.ids[0]);
    const message={type:'input',roomId:f.room.id,round:f.room.round,
      command:{sequence,input:{...idleInput(),aim:{x:520,y:599.5}},actions:[action]}};
    f.send(0,message);await wait(()=>f.session.nextSequence(f.ids[0])===sequence+1);
    f.step(action==='item'?13:action==='skill'?4:1);
    if(action==='item')expect(f.b.growthV3!.gadgets.entities()).toHaveLength(1);
    if(action==='skill')expect(f.b.growthV3!.abilities.actorState(f.actors[0].id).active).not.toBeNull();
    if(action==='reload')expect(f.b.growthV3!.weapons.get(f.actors[0].id)!.current.reloadUntil).toBeGreaterThan(f.b.frame);
    const before=f.session.checkpoint(),restored=MatchSession.restore(before);
    await wait(()=>f.peers[0].messages.some(m=>m.type==='inputAccepted'&&m.sequence===sequence));
    const original=f.peers[0].messages.find(m=>m.type==='inputAccepted'&&m.sequence===sequence);
    const baseline=f.peers[0].messages.filter(m=>m.type==='inputAccepted').length;
    // The burst spans a complete impairment cycle, including an ordered TCP stall.
    for(let i=0;i<65;i++){f.send(0,message);await new Promise(resolve=>setTimeout(resolve,80));}
    await wait(()=>f.peers[0].messages.filter(m=>m.type==='inputAccepted').length===baseline+65);
    const receipts=f.peers[0].messages.filter(m=>m.type==='inputAccepted').slice(baseline);
    expect(receipts).toEqual(Array.from({length:65},()=>original));
    expect(f.peers[0].messages.filter(m=>m.type==='rejected')).toHaveLength(0);
    expect(f.proxy!.metrics().stalled).toBeGreaterThan(0);
    expect(f.session.checkpoint()).toEqual(before);
    expect(restored.submit(f.ids[0],message.command)).toBe(true);
    expect(restored.checkpoint()).toEqual(before);
    f.send(0,{...message,command:{...message.command,input:{...message.command.input,fire:true}}});
    await wait(()=>f.peers[0].messages.some(m=>m.type==='rejected'&&m.reason==='sequence-conflict'));
    expect(f.session.checkpoint()).toEqual(before);
    for(let i=0;i<100;i++){f.step();restored.tick();}
    expect(f.session.checkpoint()).toEqual(restored.checkpoint());
  } finally {await f.close();}
},20000);

it('N20 preserves an earned evolution across network refresh, stale requests, death and authenticated reconnect',async()=>{
  const f=await networkFixture([defaultGrowthLoadoutV3(),defaultGrowthLoadoutV3('tank')]);
  try {
    const p=f.b.growthV3!.participant(f.actors[0].id);
    awardGrowthV3(p.progression,p.loadout,1200,f.b.frame,()=>0);
    for(let i=0;i<3;i++){
      const message=await f.state(0,m=>!!m.growthV3.offer&&m.growthV3.selected.length===i),offer=message.growthV3.offer;
      const card=offer.cards.find((id:string)=>id.startsWith('as_A'));
      expect(card).toBeDefined();
      f.send(0,{type:'growthChoice',roomId:f.room.id,round:f.room.round,batch:offer.batch,upgrade:card});
      await wait(()=>p.progression.selected.length===i+1);
    }
    const before=await f.state(0,m=>m.growthV3.selected.length===3),old=before.growthV3.offer;
    expect(old.cards).toContain('as_EV_A');
    expect((await f.state(1)).growthV3.offer).toBeNull();
    const errors=f.peers[0].messages.filter(m=>m.type==='error').length;
    f.send(0,{type:'growthReroll',roomId:f.room.id,round:f.room.round,batch:old.batch});
    f.send(0,{type:'growthChoice',roomId:f.room.id,round:f.room.round,batch:old.batch,upgrade:'as_EV_A'});
    await wait(()=>f.peers[0].messages.filter(m=>m.type==='error').length===errors+1);
    expect(p.progression.selected).toHaveLength(3);
    const refreshed=structuredClone(p.progression.offer!);
    expect(refreshed.batch).toBeGreaterThan(old.batch);expect(refreshed.cards).toContain('as_EV_A');
    f.b.damage(f.actors[0],9999,f.actors[1]);expect(f.actors[0].life.alive).toBe(false);
    await f.resume(0);
    const after=await f.state(0);expect(after.growthV3.offer).toEqual(refreshed);
    f.send(0,{type:'growthChoice',roomId:f.room.id,round:f.room.round,batch:refreshed.batch,upgrade:'as_EV_A'});
    await wait(()=>p.progression.selected.length===4);
    expect(p.progression.selected).toContain('as_EV_A');expect(p.progression.offer).toBeNull();
    const ability=f.b.growthV3!.abilities.actorState(f.actors[0].id);
    expect(ability.maxCharges).toBe(2);expect(ability.charges).toBe(1);
    const snapshot=structuredClone(ability),errorCount=f.peers[0].messages.filter(m=>m.type==='error').length;
    f.send(0,{type:'growthChoice',roomId:f.room.id,round:f.room.round,batch:refreshed.batch,upgrade:'as_EV_A'});
    await wait(()=>f.peers[0].messages.filter(m=>m.type==='error').length===errorCount+1);
    expect(f.b.growthV3!.abilities.actorState(f.actors[0].id)).toEqual(snapshot);
  } finally {await f.close();}
},15000);

it('active beacon sends live enemy positions and shots through smoke, and EMP immediately revokes sight',async()=>{
  const sniper=defaultGrowthLoadoutV3('sniper'),medic=defaultGrowthLoadoutV3('medic');
  const f=await networkFixture([sniper,medic]);
  try {
    f.actors[1].movement.reset(560,599.5);
    await f.command(0,{aim:{x:520,y:599.5}},['item']);f.step(13);
    const beacon=f.b.growthV3!.gadgets.entities()[0];expect(beacon).toBeDefined();
    await f.command(1,{aim:{x:560,y:599.5}},['item']);f.step(31);
    expect(f.b.growthV3!.gadgets.smoke()).toHaveLength(1);
    await f.command(1,{left:true,fire:true,aim:{x:1000,y:566.5}});f.step(3);
    const q={x:f.actors[1].movement.x,y:f.actors[1].movement.y},live=await f.state(0);
    expect(live.state.actors.find((a:any)=>a.id===f.actors[1].id)).toMatchObject(q);
    expect(live.poses.some((a:any)=>a.id===f.actors[1].id)).toBe(true);
    expect(live.effects.some((e:any)=>e.actorId===f.actors[1].id)).toBe(true);
    expect(live.state.growthWorld.entities.find((e:any)=>e.id===beacon.id)).toMatchObject({radius:880,armed:true,stopped:false});
    beacon.stoppedUntil=f.b.frame+2;
    const hidden=await f.state(0);
    expect(hidden.state.actors.some((a:any)=>a.id===f.actors[1].id)).toBe(false);
    expect(hidden.poses.some((a:any)=>a.id===f.actors[1].id)).toBe(false);
    expect(hidden.effects.some((e:any)=>e.actorId===f.actors[1].id)).toBe(false);
    const points:{x:number;y:number}[]=[];
    const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(typeof value.x==='number'&&typeof value.y==='number')points.push(value);for(const child of Object.values(value))visit(child);};
    visit(hidden);expect(points.some(p=>p.x===q.x&&(p.y===q.y||p.y===q.y-33))).toBe(false);
    await f.command(1,{});f.step(2);
    expect((await f.state(0)).state.actors.some((a:any)=>a.id===f.actors[1].id)).toBe(true);
    f.b.growthV3!.gadgets.damageEntity(beacon.id,9999,2,f.b.frame);
    expect((await f.state(0)).state.actors.some((a:any)=>a.id===f.actors[1].id)).toBe(false);
  } finally {await f.close();}
},15000);
