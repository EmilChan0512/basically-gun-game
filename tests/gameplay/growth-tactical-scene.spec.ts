import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import type { StateMessage } from '../../src/shared/protocol/State';

for(const observerClass of ['tank','assault'] as const)test(`five deployment models and ${observerClass} HUD show arming and expiry states`,async({page})=>{
  const server=startServer(0);await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  let latest:StateMessage|undefined;const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',frame=>{const m=JSON.parse(frame.payload.toString());if(m.type==='state')latest=m;}));
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Deployment observer');await page.locator('#create-growth').click();
    const room=[...server.rooms.values()][0],hostId=room.hostId;if(!hostId)throw Error('Missing host');
    room.configure(hostId,'signal','tdm');const hostBuild=defaultGrowthLoadoutV3(observerClass);
    if(observerClass==='assault')hostBuild.gadgetId='as_charge';room.equipGrowth(hostId,hostBuild);
    for(const [id,classId,gadgetId] of [
      ['charge',observerClass==='tank'?'assault':'tank',observerClass==='tank'?'as_charge':'tk_cover'],['station','medic','md_station'],
      ['decoy','sniper','sn_decoy'],['ammo','medic','md_ammo'],
    ] as const){
      const loadout=defaultGrowthLoadoutV3(classId);loadout.gadgetId=gadgetId;
      room.join(id,id,undefined,loadout);room.ready(id,true);
    }
    await page.locator('#online-ready').click();await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click();await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    const session=room.session!,b=session.battle;session.advance=()=>{};
    const actor=(id:string)=>b.actors.find(a=>a.id===session.actorId(id))!;
    const users=[hostId,'charge','station','decoy','ammo'];
    const step=(n:number)=>{for(let i=0;i<n;i++)session.tick();};
    const sync=async()=>{await expect.poll(()=>latest?.state.frame).toBe(b.frame);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));};
    for(const [i,id] of users.entries()){
      // customMatch adds a fourth spawn at x=380; deployment must be >=120px away.
      const a=actor(id),x=500+20*i;a.life.spawnProtectionFrames=0;a.movement.reset(x,599.5);
      if(id!=='decoy')expect(b.growthV3!.gadgets.canPlace(a.id,{x,y:599.5})).toBe(true);
      expect(b.useItem({x,y:599.5},a)).toBe(true);
    }
    step(13);
    expect(b.growthV3!.gadgets.entities().map(e=>e.gadgetId),JSON.stringify({spawns:b.mission.spawns,actors:b.actors.map(a=>({id:a.id,x:a.movement.x,y:a.movement.y})),errors:b.journal.since(0).filter(e=>e.kind==='error')})).toContain('as_charge');
    // Move the fixture actors away after successful commits so they do not cover the device art.
    for(const [i,id] of users.entries())actor(id).movement.reset(i?700+40*i:350,599.5);
    step(1);await sync();
    const world=()=>latest!.state.growthWorld!;
    await expect(page.locator(`.hud-gadget-icon [data-growth-icon="${hostBuild.gadgetId}"]`)).toBeVisible();
    await expect(page.locator('[data-hud="ability"]')).toContainText(observerClass==='tank'?'秒后恢复':'武装中');
    expect(world().entities.find(e=>e.gadgetId==='as_charge')?.armed).toBe(false);
    expect(world().entities.find(e=>e.gadgetId==='md_station')?.armed).toBe(false);
    await page.screenshot({path:`artifacts/qa/growth-deployments-${observerClass}-arming.png`});
    step(30);await sync();
    expect(world().entities.map(e=>e.gadgetId).sort()).toEqual(['tk_cover','as_charge','md_station','sn_decoy','md_ammo'].sort());
    expect(world().entities.every(e=>e.armed&&!e.stopped&&e.health===e.maxHealth)).toBe(true);
    const charge=world().entities.find(e=>e.gadgetId==='as_charge')!;
    const decoy=world().entities.find(e=>e.gadgetId==='sn_decoy')!;
    if(observerClass==='assault'){
      await expect(page.locator('[data-hud="ability"]')).toContainText('×0 · 按 G 引爆');
      await expect(page.locator('[data-hud="ability"]')).not.toContainText('本局已用尽');
    }
    await page.screenshot({path:`artifacts/qa/growth-deployments-${observerClass}-active.png`});
    step(decoy.expiresTick-b.frame);await sync();
    expect(world().entities.some(e=>e.gadgetId==='sn_decoy')).toBe(false);
    expect(world().entities.some(e=>e.id===charge.id)).toBe(true);
    const lastExpiry=Math.max(...world().entities.map(e=>e.expiresTick));
    step(lastExpiry-b.frame);await sync();expect(world().entities).toHaveLength(0);
    await expect(page.locator('[data-hud="ability"]')).toContainText('秒后恢复');
    expect(b.journal.since(0).filter(e=>e.kind==='deployableDestroyed')).toHaveLength(5);
    expect(errors).toEqual([]);
  }finally{await server.close();}
});

test('hidden growth grenade killer has a private death recap that survives reconnect and exact respawn',async({page})=>{
  const server=startServer(0);await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  let latest:StateMessage|undefined;const errors:string[]=[];const receivedEvents:StateMessage['events']=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',frame=>{const m=JSON.parse(frame.payload.toString());if(m.type==='state'){latest=m;receivedEvents.push(...m.events);}}));
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Recap observer');await page.locator('#create-growth').click();
    const room=[...server.rooms.values()][0],hostId=room.hostId;if(!hostId)throw Error('Missing host');
    room.configure(hostId,'signal','tdm');room.equipGrowth(hostId,defaultGrowthLoadoutV3('medic'));
    room.join('recap-attacker','Smoke attacker',undefined,defaultGrowthLoadoutV3('assault'));
    room.join('recap-ally','Observer ally',undefined,defaultGrowthLoadoutV3('tank'));
    room.ready('recap-attacker',true);room.ready('recap-ally',true);
    await page.locator('#online-ready').click();await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click();await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    const session=room.session!,b=session.battle;session.advance=()=>{};
    const actor=(id:string)=>b.actors.find(a=>a.id===session.actorId(id))!;
    const host=actor(hostId),enemy=actor('recap-attacker'),ally=actor('recap-ally');
    for(const [a,x] of [[host,400],[enemy,430],[ally,1000]] as const){a.life.spawnProtectionFrames=0;a.movement.reset(x,599.5);}
    const step=(n:number)=>{for(let i=0;i<n;i++)session.tick();};
    const sync=async()=>{await expect.poll(()=>latest?.state.frame).toBe(b.frame);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));};
    await sync();expect(b.useItem({x:400,y:599.5},host)).toBe(true);step(31);await sync();
    expect(latest!.state.actors.some(a=>a.id===enemy.id)).toBe(false);
    host.life.health=10;expect(b.useItem({x:430,y:599.5},enemy)).toBe(true);step(34);await sync();
    expect(host.life.alive).toBe(false);
    const death=b.journal.since(0).find(e=>e.kind==='death'&&e.targetId===host.id)!;expect(death).toBeDefined();
    expect(latest!.state.actors.some(a=>a.id===enemy.id)).toBe(false);
    expect(latest!.poses.some(p=>p.id===enemy.id)).toBe(false);
    // The authority sends each event once; subsequent same-frame snapshots may be empty.
    const receivedDeath=receivedEvents.find(e=>e.kind==='death'&&e.targetId===host.id)!;
    expect(receivedDeath).toBeDefined();expect(receivedDeath.actorId).toBeUndefined();expect(receivedDeath.position).toBeUndefined();
    await expect(page.locator('.combat-killer')).toHaveText('击杀者 · Smoke attacker');
    await expect(page.locator('.combat-cause')).toContainText('破片');
    await expect(page.locator('.combat-count')).toHaveText('RESPAWN IN 5');
    await expect(page.locator('[data-hud="health"]')).toHaveText('OPERATOR DOWN · 已阵亡');
    await page.screenshot({path:'artifacts/qa/growth-hidden-grenade-death.png'});
    step(death.tick+60-b.frame);await sync();await expect(page.locator('.combat-observe')).toBeEnabled();
    await page.locator('.combat-observe').click();
    for(const socket of server.wss.clients)socket.close();
    await expect(page.locator('#status')).toContainText('断开');await page.locator('#growth-reconnect').click();
    await expect(page.locator('#status')).toContainText('房间码');await sync();
    await expect(page.locator('.combat-feedback')).toHaveAttribute('data-frozen','false');
    await expect(page.locator('.combat-killer')).toHaveText('击杀者 · Smoke attacker');
    await expect(page.locator('.combat-observe')).toBeEnabled();
    step(death.tick+149-b.frame);await sync();expect(host.life.alive).toBe(false);
    await expect(page.locator('.combat-count')).toHaveText('RESPAWN IN 1');
    step(1);await sync();expect(host.life.alive).toBe(true);expect(host.itemCharges).toBe(1);
    await expect(page.locator('.combat-death')).toBeHidden();expect(errors).toEqual([]);
  }finally{await server.close();}
});

test('real smoke, beacon, EMP and interceptor share a rendered authoritative battlefield',async({page})=>{
  const server=startServer(0);await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  const errors:string[]=[];let latest:StateMessage|undefined;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',frame=>{
    const message=JSON.parse(frame.payload.toString());if(message.type==='state')latest=message;
  }));
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Tactical observer');await page.locator('#create-growth').click();
    const room=[...server.rooms.values()][0],hostId=room.hostId;if(!hostId)throw Error('Missing host');room.configure(hostId,'signal','tdm');
    const medic=defaultGrowthLoadoutV3('medic');medic.gadgetId='md_smoke';room.equipGrowth(hostId,medic);
    const tank=defaultGrowthLoadoutV3('tank');tank.gadgetId='tk_interceptor';
    const beacon=defaultGrowthLoadoutV3('sniper');beacon.gadgetId='sn_beacon';
    const emp=defaultGrowthLoadoutV3('sniper');emp.gadgetId='sn_emp';
    // Three authority fixture seats; the observer uses a real authenticated browser/socket.
    room.join('fixture-tank','Interceptor',undefined,tank);room.join('fixture-beacon','Beacon',undefined,beacon);room.join('fixture-emp','EMP',undefined,emp);
    for(const id of ['fixture-tank','fixture-beacon','fixture-emp'])room.ready(id,true);
    await page.locator('#online-ready').click();await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click();await expect(page.locator('canvas')).toBeVisible();
    const session=room.session!,b=session.battle;session.advance=()=>{};
    // Seed the presentation cursor before producing effects; a newly mounted scene
    // deliberately discards historical audio from its first snapshot.
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    await expect.poll(()=>latest?.state.frame).toBe(b.frame);
    await page.locator('canvas').click();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const actor=(id:string)=>b.actors.find(a=>a.id===session.actorId(id))!;
    const host=actor(hostId),defender=actor('fixture-tank'),scout=actor('fixture-beacon'),saboteur=actor('fixture-emp');
    for(const [a,x] of [[host,350],[defender,550],[scout,500],[saboteur,520]] as const){a.life.spawnProtectionFrames=0;a.movement.reset(x,599.5);}
    const step=(n:number)=>{for(let i=0;i<n;i++)session.tick();};
    expect(b.useItem({x:550,y:599.5},defender)).toBe(true);expect(b.useItem({x:520,y:599.5},scout)).toBe(true);
    expect(b.useItem({x:350,y:599.5},host)).toBe(true);step(31);host.movement.reset(530,599.5);step(1);
    const screenshot=async(name:string)=>{
      await expect.poll(()=>latest?.state.frame).toBe(b.frame);
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const panel=await page.locator('#growth-panel').boundingBox();expect(panel).not.toBeNull();
      expect(panel!.y+panel!.height).toBeLessThan(page.viewportSize()!.height/2);
      await page.screenshot({path:`artifacts/qa/growth-tactical-${name}.png`});
    };
    expect(b.growthV3!.gadgets.smoke()).toHaveLength(1);expect(b.growthV3!.gadgets.entities()).toHaveLength(2);
    await screenshot('active');expect(latest!.state.growthWorld!.smoke).toHaveLength(1);
    await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_Whip1'))).toBe(true);
    expect(latest!.state.growthWorld!.entities).toHaveLength(2);
    expect(b.useItem({x:520,y:599.5},saboteur)).toBe(true);step(31);
    const beaconEntity=b.growthV3!.gadgets.entities().find(e=>e.gadgetId==='sn_beacon')!;
    expect(beaconEntity.stoppedUntil).toBeGreaterThan(b.frame);
    await screenshot('emp');expect(latest!.state.growthWorld!.entities.find(e=>e.gadgetId==='sn_beacon')?.stopped).toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_Skill'))).toBe(true);
    const interceptor=b.growthV3!.gadgets.entities().find(e=>e.gadgetId==='tk_interceptor')!;
    const capacity=interceptor.interceptions;expect(b.useItem({x:550,y:599.5},host)).toBe(true);step(7);
    expect(interceptor.interceptions).toBe(capacity-1);expect(b.growthV3!.gadgets.smoke()).toHaveLength(1);
    expect(b.journal.since(0).some(e=>e.kind==='intercept')).toBe(true);await screenshot('intercept');
    await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_Reflect1'))).toBe(true);
    expect(errors).toEqual([]);
  }finally{await server.close();}
});
