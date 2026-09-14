import {test,expect} from '@playwright/test';
import {startServer} from '../../server/server';
import {registerOnline} from '../helpers/online-account';
import {defaultGrowthLoadoutV3} from '../../src/shared/content/growth-v3/Loadout';
import type {StateMessage} from '../../src/shared/protocol/State';

test('online contrast follows the held gun and cannot render a smoke-hidden enemy',async({page})=>{
  const server=startServer(0);await new Promise<void>(r=>server.wss.once('listening',r));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  let latest:StateMessage|undefined;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',frame=>{const m=JSON.parse(frame.payload.toString());if(m.type==='state')latest=m;}));
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Contrast observer');await page.locator('#create-growth').click();
    const room=[...server.rooms.values()][0],host=room.hostId!;
    room.configure(host,'signal','tdm');const build=defaultGrowthLoadoutV3('medic');build.attachments.primary=['O06'];room.equipGrowth(host,build);
    room.join('enemy','Enemy',undefined,defaultGrowthLoadoutV3('assault'));room.ready('enemy',true);
    await page.locator('#online-ready').click();await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    await page.evaluate(async()=>{
      const path='/src/game/campaign/ReferenceArt.ts';const {ReferenceArt}=await import(path);
      const begin=ReferenceArt.prototype.begin,soldier=ReferenceArt.prototype.soldier;
      ReferenceArt.prototype.begin=function(){(window as any).__contrastActors={};return begin.call(this);};
      ReferenceArt.prototype.soldier=function(...args:any[]){
        const first=this.cursor;const result=soldier.apply(this,args);
        (window as any).__contrastActors[args[14]]={contrast:args[19]===true,active:this.pool.slice(first,this.cursor).filter((p:any)=>p.preFX?.enabled).length};return result;
      };
    });
    const session=room.session!,b=session.battle;session.advance=()=>{};
    const self=b.actors.find(a=>a.id===session.actorId(host))!,enemy=b.actors.find(a=>a.id===session.actorId('enemy'))!;
    b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(a===self?450:550,599.5);});
    const step=(n=1)=>{for(let i=0;i<n;i++)session.tick();};
    const rendered=()=>page.evaluate(()=>(window as any).__contrastActors as Record<string,{contrast:boolean;active:number}>);
    const sync=async()=>{await expect.poll(()=>latest?.state.frame).toBe(b.frame);};
    step();await sync();await expect.poll(async()=>(await rendered())[enemy.id]?.active??0).toBeGreaterThan(0);
    expect((await rendered())[self.id]).toEqual({contrast:false,active:0});
    b.swap(self);step();await sync();await expect.poll(async()=>(await rendered())[enemy.id]?.active).toBe(0);
    step(6);b.swap(self);step();await sync();await expect.poll(async()=>(await rendered())[enemy.id]?.active??0).toBeGreaterThan(0);
    await page.screenshot({path:'artifacts/qa/contrast-online-visible.png'});
    expect(b.useItem({x:450,y:599.5},self)).toBe(true);step(31);await sync();
    expect(b.growthV3!.gadgets.smoke()).toHaveLength(1);
    expect(latest!.state.actors.some(a=>a.id===enemy.id)).toBe(false);
    await expect.poll(async()=>Object.hasOwn(await rendered(),enemy.id)).toBe(false);
    await page.screenshot({path:'artifacts/qa/contrast-online-smoke.png'});
    const end=b.growthV3!.gadgets.smoke()[0].expiresTick;step(end-b.frame);await sync();
    await expect.poll(async()=>(await rendered())[enemy.id]?.active??0).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  }finally{await server.close();}
});
