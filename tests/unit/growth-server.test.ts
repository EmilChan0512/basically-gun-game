import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { idleInput, seededRandom } from '../../src/game/campaign/Battle';

it('authority binds choices to owner/round, isolates legacy rewards, and sends only own candidates', async () => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const peers: { socket: WebSocket; messages: any[] }[] = [];
  const send = (index: number, value: object) => peers[index].socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...value }));
  const wait = async (check: () => boolean) => {
    const end = Date.now() + 4000;
    while (!check()) { if (Date.now() > end) throw Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); }
  };
  try {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}`), messages: any[] = [];
      peers.push({ socket, messages }); socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
      await new Promise<void>(resolve => socket.once('open', resolve)); accounts.push(await authorizeSocket(server, socket, `Growth authority ${i}`));
    }
    const before = accounts.map(a => server.accounts.profile(a.profile.id));
    send(0, { type: 'create', rules: 'growth', name: 'A', equipment: { primary: 'invalid-old-loadout' } });
    await wait(() => server.rooms.size === 1); const room = [...server.rooms.values()][0];
    send(1, { type: 'join', code: room.id, name: 'B' }); await wait(() => room.players.size === 2);
    send(0, { type: 'ready', ready: true }); send(1, { type: 'ready', ready: true });
    await wait(() => [...room.players.values()].every(p => p.ready)); send(0, { type: 'start' }); await wait(() => !!room.session);
    const battle = room.session!.battle, actor = battle.player;
    const participant = battle.growthV3!.participant(actor.id), growth = participant.progression;
    awardGrowthV3(growth, participant.loadout, 200, battle.frame, seededRandom(1));
    await wait(() => peers[0].messages.some(m => m.type === 'state' && m.growthV3?.offer));
    await wait(() => peers[1].messages.some(m => m.type === 'state'));
    expect(peers[1].messages.filter(m => m.type === 'state').every(m => !m.growthV3?.offer)).toBe(true);
    expect(JSON.stringify(peers[1].messages)).not.toContain('attackers');
    const offer = growth.offer!, choice = { type: 'growthChoice', roomId: room.id, round: room.round, batch: offer.batch, upgrade: offer.cards[0] };
    send(1, { ...choice, actorId: actor.id }); await wait(() => peers[1].messages.some(m => m.type === 'error'));
    expect(growth.selected).toEqual([]);
    send(0, { ...choice, round: room.round + 1 }); await wait(() => peers[0].messages.some(m => m.type === 'error'));
    expect(growth.selected).toEqual([]);
    send(0, choice); await wait(() => growth.selected.length === 1);
    const errors = peers[0].messages.filter(m => m.type === 'error').length;
    send(0, choice); await wait(() => peers[0].messages.filter(m => m.type === 'error').length > errors);
    expect(growth.selected).toHaveLength(1);
    battle.frame = 1000; battle.endMatch(1, 'fixture'); send(0, { type: 'return' }); await wait(() => !room.session);
    expect(accounts.map(a => server.accounts.profile(a.profile.id))).toEqual(before);
  } finally { for (const peer of peers) peer.socket.terminate(); await server.close(); }
}, 15000);

it('credits a released grenade after its owner leaves, settles that departed account once and preserves classic assets', async () => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const peers: { socket: WebSocket; messages: {type:string; playerId?:string}[] }[] = [];
  const accounts: Awaited<ReturnType<typeof authorizeSocket>>[] = [];
  const send = (i:number,value:object) => peers[i].socket.send(JSON.stringify({protocol:1,content:CONTENT_VERSION,...value}));
  const wait = async (check:()=>boolean) => {
    const end=Date.now()+4000;
    while(!check()){if(Date.now()>end)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,10));}
  };
  try {
    for(let i=0;i<4;i++){
      const socket=new WebSocket(`ws://127.0.0.1:${address.port}`),messages:{type:string;playerId?:string}[]=[];
      peers.push({socket,messages});socket.on('message',raw=>messages.push(JSON.parse(raw.toString())));
      await new Promise<void>(resolve=>socket.once('open',resolve));accounts.push(await authorizeSocket(server,socket,'Departed grenade '+i));
    }
    const before=server.accounts.profile(accounts[0].profile.id);
    send(0,{type:'create',rules:'growth',name:'A'});await wait(()=>server.rooms.size===1);
    const room=[...server.rooms.values()][0];
    for(let i=1;i<4;i++){send(i,{type:'join',code:room.id,name:'Player '+i});await wait(()=>room.players.size===i+1);}
    send(0,{type:'configure',mapId:'signal',mode:'tdm'});await wait(()=>room.mapId==='signal');
    for(let i=0;i<4;i++)send(i,{type:'ready',ready:true});
    await wait(()=>[...room.players.values()].every(p=>p.ready));send(0,{type:'start'});await wait(()=>!!room.session);
    const session=room.session!,b=session.battle,ownerId=room.hostId!,owner=b.actors.find(a=>a.id===session.actorId(ownerId))!;
    for(let sequence=0;sequence<30;sequence++)send(0,{type:'input',roomId:room.id,round:room.round,command:{sequence,input:{...idleInput(),crouch:true},actions:[]}});
    await wait(()=>session.acknowledgements()[ownerId]===29);
    // Run the minimum eligible match time through the actual simulation; no clock reassignment.
    while(b.frame<900)session.tick();
    b.actors.forEach(a=>{a.life.spawnProtectionFrames=0;a.movement.reset(a.team===1?200:1500,599.5);});
    owner.movement.reset(400,599.5);
    const victim=b.actors.find(a=>a.team===2)!;victim.movement.reset(800,599.5);victim.life.health=1;
    send(0,{type:'input',roomId:room.id,round:room.round,command:{sequence:30,input:{...idleInput(),aim:{x:780,y:565}},actions:['item']}});
    await wait(()=>b.growthV3!.gadgets.flying().length===1);
    expect(owner.itemCharges).toBe(1);send(0,{type:'leave'});
    await wait(()=>peers[0].messages.some(m=>m.type==='left'));
    expect(b.growthV3!.participant(owner.id).retired).toBe(true);expect(b.result).toBeNull();
    expect(b.growthV3!.gadgets.flying()).toHaveLength(1);
    await wait(()=>owner.kills===1);
    expect(victim.life.alive).toBe(false);expect(owner.life.alive).toBe(false);
    expect(victim.deathInfo).toMatchObject({cause:'破片雷',sourceName:owner.name});
    expect(b.growthV3!.participant(owner.id).progression.xp).toBe(100);
    expect(b.journal.since(0).some(e=>e.kind==='death'&&e.actorId===owner.id&&e.targetId===victim.id)).toBe(true);
    expect(server.accounts.profile(accounts[0].profile.id)).toEqual(before);
    b.endMatch(1,'in-flight attribution fixture');
    await wait(()=>server.accounts.profile(accounts[0].profile.id).growth!.matches===1);
    const after=server.accounts.profile(accounts[0].profile.id);
    expect(after.growth!.xp-before.growth!.xp).toBe(180);
    expect(after.growth!.mastery.assault-before.growth!.mastery.assault).toBe(180);
    expect(after.growth!.wins).toBe(1);expect({...after,growth:before.growth}).toEqual(before);
    send(1,{type:'return'});await wait(()=>!room.session);
    expect(server.accounts.profile(accounts[0].profile.id)).toEqual(after);
  } finally {for(const peer of peers)peer.socket.terminate();await server.close();}
},15000);
