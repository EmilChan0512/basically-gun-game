import { expect, test, type Page } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { seededRandom } from '../../src/game/campaign/Battle';

async function observe(page:Page) {
  await page.evaluate(async()=>{
    const path='/src/game/campaign/ReferenceArt.ts',{ReferenceArt}=await import(path);
    const original=ReferenceArt.prototype.tracer;
    (window as any).__tracers=[];
    ReferenceArt.prototype.tracer=function(...args:any[]){
      (window as any).__scene=this.scene;
      (window as any).__tracers.push({id:args[2],age:args[3],at:performance.now()});
      if((window as any).__tracers.length>2000)(window as any).__tracers.shift();
      return original.apply(this,args);
    };
    const feedbackPath='/src/client/presentation/GrowthFeedbackView.ts',{GrowthFeedbackView}=await import(feedbackPath);
    const render=GrowthFeedbackView.prototype.render;
    GrowthFeedbackView.prototype.render=function(...args:any[]){
      (window as any).__scene=this.scene;(window as any).__feedback=this.model;
      if(this.model.floats.length)(window as any).__sawDamage=true;
      return render.apply(this,args);
    };
  });
}
test('two human clients see each other firing, damage and confirmed kills',async({browser})=>{
  test.setTimeout(60000);
  const server=startServer(0);await new Promise<void>(r=>server.wss.once('listening',r));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));const errors:string[]=[];
  try {
    for(const [i,p] of pages.entries()) {
      p.on('pageerror',e=>errors.push(e.message));await p.goto('/?online');
      await p.locator('#server').fill(`ws://127.0.0.1:${address.port}`);await registerOnline(p,`Feedback ${i}`);await observe(p);
    }
    await pages[0].locator('#create-growth').click();await pages[0].locator('#online-map').selectOption('signal');
    const room=[...server.rooms.values()][0];await pages[1].locator('#code').fill(room.id);await pages[1].locator('#join').click();
    for(const p of pages){await expect(p.locator('#online-ready')).toBeVisible();await p.locator('#online-ready').click();}
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');await pages[0].locator('#online-start').click();
    for(const p of pages)await expect(p.locator('#online-game')).toHaveAttribute('aria-busy','false');
    const b=room.session!.battle,actors=[...room.players.keys()].map(id=>b.actors.find(a=>a.id===room.session!.actorId(id))!);
    b.actors.forEach(a=>{a.human=true;a.life.spawnProtectionFrames=0;});
    for(const [i,a] of actors.entries()){a.movement.reset(480+i*200,599.5);a.life.health=a.life.maxHealth;}
    for(const [i,p] of pages.entries()) {
      await p.bringToFront();await p.waitForTimeout(250);
      const target=actors[1-i];
      const point=await p.evaluate(({x,y})=>{
        const scene=(window as any).__scene,c=scene.cameras.main,rect=scene.game.canvas.getBoundingClientRect();
        const out=c.matrix.transformPoint(x-c.scrollX,y-c.scrollY);
        return {x:rect.x+out.x*rect.width/scene.scale.width,y:rect.y+out.y*rect.height/scene.scale.height};
      },{x:target.movement.x,y:target.movement.y-33});
      const before=target.life.health;await p.mouse.move(point.x,point.y);await p.mouse.down();
      await expect.poll(()=>target.life.health,{intervals:[30]}).toBeLessThan(before);await p.mouse.up();
      await expect.poll(()=>pages[1-i].evaluate(id=>(window as any).__tracers.filter((t:any)=>t.id===id).length,actors[i].id)).toBeGreaterThan(0);
      await expect.poll(()=>p.evaluate(()=>!!(window as any).__sawDamage),{intervals:[20]}).toBe(true);
    }
    await pages[0].bringToFront();b.damage(actors[1],9999,actors[0]);
    await expect(pages[0].locator('.growth-kill')).toContainText('击杀');
    await pages[0].screenshot({path:'artifacts/qa/growth-feedback-online-kill.png'});
    expect(errors).toEqual([]);
  } finally {for(const c of contexts)await c.close();await server.close();}
});

test('upgrade prompts stay compact, U toggles cards and authority confirms selection at both resolutions',async({page})=>{
  const server=startServer(0);await new Promise<void>(r=>server.wss.once('listening',r));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  try {
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);await registerOnline(page,'Upgrade feedback');
    await page.locator('#create-growth').click();await page.locator('#online-map').selectOption('signal');await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    const b=[...server.rooms.values()][0].session!.battle,p=b.growthV3!.participant('player');
    b.actors.forEach(a=>a.human=true);
    await page.waitForTimeout(200);awardGrowthV3(p.progression,p.loadout,210,b.frame,seededRandom(7));
    await expect(page.locator('.growth-notice')).toContainText('升至 Lv.');
    await expect(page.locator('[data-upgrade]')).toHaveCount(0);
    for(const [width,height] of [[1280,720],[1920,1080]]) {
      await page.setViewportSize({width,height});await page.screenshot({path:`artifacts/qa/growth-feedback-hud-${width}.png`});
      await page.keyboard.press('u');await expect(page.locator('[data-upgrade]')).toHaveCount(3);
      const canvas=await page.locator('canvas').boundingBox();
      await page.screenshot({path:`artifacts/qa/growth-feedback-upgrade-${width}.png`});
      await page.keyboard.press('u');await expect(page.locator('[data-upgrade]')).toHaveCount(0);
      expect(await page.locator('canvas').boundingBox()).toEqual(canvas);
    }
    await page.keyboard.press('u');const shots=p.metrics.shots;await page.locator('[data-upgrade]').first().click();
    await expect(page.locator('.growth-notice')).toContainText('强化已生效');expect(p.metrics.shots).toBe(shots);
    await expect(page.locator('[data-upgrade]')).toHaveCount(0);
  } finally {await server.close();}
});
