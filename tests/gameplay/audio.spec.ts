import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';

test('offline mixer decodes every bundled clip, persists settings, displays subtitles and stops on pause', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?offline'); await page.waitForFunction(()=>!!window.__strikeCampaign && !!window.__strikeAudio);
  await page.locator('#audio-settings summary').click();
  await page.locator('#audio-preview').click();
  await expect(page.locator('#audio-subtitle')).toContainText('医疗兵');
  const report = await page.evaluate(async () => {
    const manifest = await (await fetch('/assets/audio/manifest.json')).json(), ctx = new AudioContext();
    const measurements = [];
    for (const [id, asset] of Object.entries(manifest.assets) as [string,any][]) {
      const response = await fetch(`/assets/audio/${asset.file}`), buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      const samples = buffer.getChannelData(0); let peak=0, sum=0;
      for (const sample of samples) { peak=Math.max(peak,Math.abs(sample)); sum+=sample*sample; }
      measurements.push({id,duration:buffer.duration,peak,rms:Math.sqrt(sum/samples.length)});
    }
    await ctx.close(); return measurements;
  });
  await test.info().attach('decoded-audio.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(report).toHaveLength(48); expect(report.filter(r=>!(r.duration>0 && r.peak>.005 && r.peak<=1))).toEqual([]);
  await page.locator('[data-audio=effects]').fill('35');
  await page.locator('[data-audio=muted]').check();
  await page.reload(); await page.waitForFunction(()=>!!window.__strikeAudio);
  expect(await page.evaluate(()=>window.__strikeAudio!.settings)).toMatchObject({effects:.35,muted:true});
  await page.locator('#audio-settings summary').click(); await page.locator('[data-audio=muted]').uncheck(); await page.locator('#audio-settings summary').click();
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  const canvas = page.locator('canvas'); const box=await canvas.boundingBox();
  await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.75); await page.mouse.down();
  await page.waitForFunction(()=>window.__strikeAudio!.diagnostics.recent.includes('S_assaultFire'));
  await page.mouse.up(); await page.keyboard.press('Escape');
  await expect(page.locator('#resume')).toBeVisible();
  const count=await page.evaluate(()=>window.__strikeAudio!.diagnostics.played);
  await page.waitForTimeout(250); expect(await page.evaluate(()=>window.__strikeAudio!.diagnostics.played)).toBe(count);
  await page.locator('#audio-settings summary').click();
  await page.screenshot({path:'artifacts/qa/audio-settings.png'});
  expect(errors).toEqual([]);
});

for (const mode of ['original','lab']) test(`${mode} training plays shots and swap with the shared mixer`, async ({page}) => {
  await page.goto(`/?rules=${mode}`); await page.waitForFunction(()=>!!window.__strikeAudio && (!!window.__originalStrike || !!window.__strike));
  await page.locator('#audio-settings summary').click(); await page.locator('#audio-settings summary').click();
  await page.waitForTimeout(250);
  await page.locator('canvas').click(); await page.keyboard.down('f');
  await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.some(id=>id==='S_assaultFire'||id==='S_pistolFire'))).toBe(true);
  await page.keyboard.up('f'); await page.keyboard.press('q');
  await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_Equip'))).toBe(true);
});

test('online debug battle plays authoritative events, reconnects without replay and stops on leaving', async ({page}) => {
  const server = startServer(0, '127.0.0.1', 30000, undefined, 60000, true); await new Promise<void>(r=>server.wss.once('listening',r));
  const address=server.wss.address(); if (!address || typeof address==='string') throw Error('No port');
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); await page.locator('#join-debug').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    await page.locator('canvas').click();
    const battle=server.rooms.get('debug')!.session!.battle;
    const start=battle.player.arsenal.shots;
    const box=await page.locator('canvas').boundingBox(); await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.5); await page.mouse.down();
    await expect.poll(()=>battle.player.arsenal.shots).toBeGreaterThan(start+2); await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_assaultFire'))).toBe(true);
    await page.waitForTimeout(150);
    await page.evaluate(()=>{ window.__strikeAudio!.diagnostics.recent.length=0; });
    // Close just this test client's transport; resume the same round.
    for (const client of server.wss.clients) client.close();
    await expect(page.locator('#status')).toContainText('断开'); await page.locator('#reconnect').click();
    await expect(page.locator('#status')).toContainText('公共调试房间');
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    await page.waitForTimeout(150);
    expect(await page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_assaultFire'))).toBe(false);
    await page.locator('#online-leave').click(); await expect(page.locator('#join-debug')).toBeEnabled();
    const count=await page.evaluate(()=>window.__strikeAudio!.diagnostics.played);
    await page.waitForTimeout(350); expect(await page.evaluate(()=>window.__strikeAudio!.diagnostics.played)).toBeLessThanOrEqual(count+1);
  } finally { await server.close(); }
});

test('four class selections use original voices with matching Chinese subtitles', async ({page}) => {
  await page.goto('/?offline'); await page.waitForFunction(()=>!!window.__strikeCampaign);
  await page.locator('#armory-nav').click();
  for (const [id,name] of [['medic','医疗兵'],['assassin','刺客'],['commando','突击兵'],['tank','重装兵']]) {
    await page.locator(`[data-class=${id}]`).click();
    await expect(page.locator('#audio-subtitle')).toContainText(name);
  }
  await page.screenshot({path:'artifacts/qa/audio-class-subtitle.png'});
});

test('eight simultaneous automatic weapons remain below full scale through the production mixer', async ({page}) => {
  await page.goto('/?offline'); await page.waitForFunction(()=>!!window.__strikeAudio);
  const peak = await page.evaluate(async () => {
    const path='/src/client/audio/AudioService.ts';
    const { audioCatalog, createAudioMixer } = await import(path);
    const ctx=new OfflineAudioContext(1,44100*2,44100), mixer=createAudioMixer(ctx);
    mixer.master.gain.value=.8; mixer.effects.gain.value=.7;
    const asset=audioCatalog.assets.S_assaultFire;
    const buffer=await ctx.decodeAudioData(await (await fetch(`/assets/audio/${asset.file}`)).arrayBuffer());
    for(let player=0;player<8;player++) for(let shot=0;shot<12;shot++) {
      const source=ctx.createBufferSource(), gain=ctx.createGain(); source.buffer=buffer; gain.gain.value=asset.volume;
      source.connect(gain);gain.connect(mixer.effects);source.start(shot*4/30);
    }
    const rendered=await ctx.startRendering(); return Math.max(...rendered.getChannelData(0).map(Math.abs));
  });
  expect(peak).toBeGreaterThan(.01); expect(peak).toBeLessThan(1);
});

test('failed audio downloads leave single player usable', async ({page}) => {
  await page.route('**/assets/audio/*.ogg',route=>route.fulfill({status:404,body:'missing'}));
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?offline'); await page.waitForFunction(()=>!!window.__strikeCampaign);
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await page.waitForFunction(()=>window.__strikeCampaign!.battle.frame>10);
  await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.failed)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
