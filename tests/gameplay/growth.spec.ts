import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { seededRandom } from '../../src/game/campaign/Battle';
import { GROWTH_V3_OPERATORS } from '../../src/shared/content/growth-v3/Operators';

test('host explicitly selects a short experiment and lobby, HUD and logs agree on its clocks',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const logs:Record<string,unknown>[]=[];
  const server=startServer(0,'127.0.0.1',30000,{log(_level,event,fields){if(event==='match.started')logs.push(fields!);}});
  await new Promise<void>(resolve=>server.wss.once('listening',resolve));const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Short experiment');await page.locator('#create-growth').click();
    await expect(page.locator('#growth-match-preset')).toHaveValue('standard');
    await page.locator('#growth-match-preset').selectOption('short');
    await expect(page.locator('#growth-solo-note')).toContainText('10分钟实验');
    await page.locator('#online-map').selectOption('signal');await expect(page.locator('#growth-match-preset')).toHaveValue('short');
    await page.locator('#online-start').click();await expect(page.locator('#growth-panel')).toContainText('第7分钟觉醒');
    const room=[...server.rooms.values()][0];expect(room.session!.battle.mission.seconds).toBe(600);
    expect(logs).toEqual([expect.objectContaining({growthPreset:'short',content:expect.any(String),mapId:'signal'})]);
    await expect(page.locator('[data-hud=mode]')).toContainText('成长·10分钟实验');
    await expect(page.locator('[data-hud=health]')).toContainText('HP');
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await page.screenshot({path:'artifacts/qa/growth-v3-short.png'});
    expect(errors).toEqual([]);
  }finally{await server.close();}
});

test('complete armory exposes eighteen guns and thirty-six attachments and runs an isolated live range', async ({ page }) => {
  test.setTimeout(60000);const server=startServer(0);await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Complete range');await page.locator('#online-armory-nav').click();
    const weapons=new Set<string>(),parts=new Set<string>();
    for(const id of ['assault','tank','sniper','medic']){
      await page.locator(`[data-growth-class=${id}]`).click();await page.locator('#growth-tab-weapons').click();
      const ids=await page.locator('[data-growth-weapon]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-growth-weapon')!,slot:n.getAttribute('data-weapon-slot')!})));
      for(const gun of ids){
        if(weapons.has(gun.id))continue;weapons.add(gun.id);
        await page.locator(`[data-growth-weapon=${gun.id}]`).click();await page.locator(gun.slot==='primary'?'#growth-open-gunsmith':'#growth-open-secondary-gunsmith').click();
        for(const part of await page.locator('[data-growth-attachment]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-growth-attachment')!)))parts.add(part);
        await page.getByRole('button',{name:'← 返回武器',exact:true}).click();
      }
    }
    expect(weapons.size).toBe(18);expect(parts.size).toBe(36);
    await page.locator('[data-growth-class=assault]').click();await page.locator('#growth-open-gunsmith').click();
    await page.locator('#growth-open-range').click();await expect(page.locator('[data-range-result]')).toContainText('M4');
    await page.locator('[data-range-auto]').click();await expect(page.locator('[data-range-result]')).toHaveAttribute('data-killed','true');
    await expect(page.locator('[data-range-result]')).toContainText('TTK 1.20 秒');
    await page.screenshot({path:'artifacts/qa/growth-v3-range.png',fullPage:true});
    await page.locator('[data-range-health]').selectOption('115');await page.locator('[data-range-armor]').selectOption('25');
    await expect(page.locator('[data-range-result]')).toHaveAttribute('data-shots','0');
    await page.locator('[data-range-back]').click();await expect(page.locator('#growth-career-save')).toBeEnabled();
    await page.locator('#online-lobby-nav').click();expect(server.rooms.size).toBe(0);
    await expect(page.locator('#account-status')).toContainText('对局 0');expect(errors).toEqual([]);
  }finally{await server.close();}
});

test('growth hit feedback leaves browser aim unchanged and reduced motion persists locally', async ({ page }) => {
  const server=startServer(0);await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address();if(!address||typeof address==='string')throw Error('No port');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'Motion aim');await page.locator('#create-growth').click();
    await page.locator('#online-map').selectOption('signal');await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    const battle=[...server.rooms.values()][0].session!.battle;
    battle.actors[1].human=true;battle.player.life.spawnProtectionFrames=0;
    const canvas=await page.locator('canvas').boundingBox();
    await page.mouse.move(canvas!.x+canvas!.width*.7,canvas!.y+canvas!.height*.5);
    const start=battle.frame;await expect.poll(()=>battle.frame-start).toBeGreaterThan(15);
    const aim={...battle.player.aim};battle.damage(battle.player,1,battle.actors[1]);
    const hitTick=battle.frame;
    await expect.poll(()=>battle.frame-hitTick,{intervals:[10]}).toBeGreaterThanOrEqual(2);
    expect(battle.player.aim.x).toBeCloseTo(aim.x,4);expect(battle.player.aim.y).toBeCloseTo(aim.y,4);
    await page.locator('#combat-motion-setting').click();
    await expect(page.locator('#combat-motion-setting')).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>localStorage.getItem('strike.motion.reduced'))).toBe('true');
    await page.screenshot({path:'artifacts/qa/growth-v3-motion.png'});
    await page.reload();await expect(page.locator('#combat-motion-setting')).toHaveAttribute('aria-pressed','true');
    expect(errors).toEqual([]);
  } finally {await server.close();}
});

test('growth EMP releases through keyboard G and plays one audible burst without an electronic target', async ({ page }) => {
  const server=startServer(0);
  await new Promise<void>(resolve=>server.wss.once('listening',resolve));
  const address=server.wss.address(); if(!address||typeof address==='string')throw Error('No port');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('/?online');await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page,'EMP audio');await page.locator('#online-armory-nav').click();
    await page.locator('[data-growth-class=sniper]').click();await page.locator('#growth-tab-skills').click();
    await page.locator('[data-growth-gadget=sn_emp]').click();await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#online-lobby-nav').click();await page.locator('#create-growth').click();
    await page.locator('#online-map').selectOption('signal');await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy','false');
    await page.locator('canvas').click();
    const battle=[...server.rooms.values()][0].session!.battle;
    battle.actors[1].human=true;battle.player.life.spawnProtectionFrames=0;
    await page.keyboard.press('g');
    await expect.poll(()=>battle.player.itemCharges).toBe(1);
    await expect.poll(()=>page.evaluate(()=>window.__strikeAudio!.diagnostics.recent.includes('S_Skill'))).toBe(true);
    expect(battle.journal.since(0).flatMap(e=>e.soundRecipients??[]).filter(s=>s.id===battle.player.id&&s.cue==='emp')).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {await server.close();}
});

test('four operator armory exposes all exclusive choices and saves main and secondary attachments', async ({ page }) => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'Four choices'); await page.locator('#online-armory-nav').click();
    for (const [id, operator] of Object.entries(GROWTH_V3_OPERATORS)) {
      await page.locator(`[data-growth-class=${id}]`).click(); await page.locator('#growth-tab-skills').click();
      expect(await page.locator('[data-growth-ability]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-growth-ability')))).toEqual([...operator.abilities]);
      expect(await page.locator('[data-growth-gadget]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-growth-gadget')))).toEqual([...operator.gadgets]);
      for (const ability of operator.abilities) {
        await page.locator(`[data-growth-ability=${ability}]`).click();
        await expect(page.locator('#growth-career-save')).toBeEnabled();
      }
      for (const gadget of operator.gadgets) {
        await page.locator(`[data-growth-gadget=${gadget}]`).click();
        await expect(page.locator(`[data-growth-gadget=${gadget}]`)).toHaveAttribute('aria-pressed', 'true');
      }
      await page.screenshot({ path: `artifacts/qa/growth-v3-${id}-armory.png`, fullPage: true });
    }
    await page.locator('[data-growth-class=assault]').click(); await page.locator('#growth-tab-weapons').click();
    await page.locator('#growth-open-gunsmith').click();
    const primary = await page.locator('[data-growth-attachment]').first().getAttribute('data-growth-attachment');
    await page.locator('[data-growth-attachment]').first().click();
    await expect(page.locator('[data-growth-weapon-preview]')).toContainText('1/3件');
    await page.getByRole('button', { name: '← 返回武器', exact: true }).click();
    await page.locator('#growth-open-secondary-gunsmith').click();
    const secondary = await page.locator('[data-growth-attachment]').first().getAttribute('data-growth-attachment');
    await page.locator('[data-growth-attachment]').first().click();
    await expect(page.locator('[data-growth-weapon-preview]')).toContainText('1/1件');
    await page.screenshot({ path: 'artifacts/qa/growth-v3-gunsmith.png', fullPage: true });
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#online-lobby-nav').click(); await page.locator('#create-growth').click();
    await expect(page.locator('#online-start')).toBeVisible();
    const room = [...server.rooms.values()][0];
    expect([...room.players.values()][0].growthLoadout!.attachments).toEqual({ primary: [primary], secondary: [secondary] });
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('Medic lobby loadout heals a teammate through the real skill input and displays credited healing', async ({ browser }) => {
  test.setTimeout(60000);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  try {
    for (const [i, page] of pages.entries()) {
      await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); await registerOnline(page, `Clinic ${i}`);
    }
    const page = pages[0]; await page.locator('#create-growth').click(); await expect(page.locator('#online-map')).toBeVisible();
    await page.locator('#online-map').selectOption('signal');
    await page.locator('#growth-room-armory').click();
    await page.locator('[data-growth-class=medic]').click();
    await expect(page.locator('[data-growth-weapon=famas]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('本房间配装已确认，请重新准备。');
    await page.locator('#growth-tab-skills').click();
    await expect(page.locator('[data-growth-ability]')).toHaveCount(2);
    await expect(page.locator('[data-growth-gadget]')).toHaveCount(3);
    await expect(page.locator('#growth-career-content')).toContainText('第12分钟');
    await page.locator('#online-lobby-nav').click();
    const room = [...server.rooms.values()][0];
    for (const other of pages.slice(1)) { await other.locator('#code').fill(room.id); await other.locator('#join').click(); }
    for (const other of pages) { await expect(other.locator('#online-ready')).toBeVisible(); await other.locator('#online-ready').click(); }
    await expect(page.locator('#lobby')).not.toContainText('未准备'); await page.locator('#online-start').click();
    await expect(page.locator('#growth-panel')).toContainText('医疗兵');
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    await page.locator('canvas').click();
    const battle = room.session!.battle, medic = battle.player;
    const ally = battle.actors.find(a => a.team === medic.team && a !== medic)!, enemy = battle.actors.find(a => a.team !== medic.team)!;
    medic.movement.reset(220, 599.5); ally.movement.reset(250, 599.5); ally.life.spawnProtectionFrames = 0; medic.life.spawnProtectionFrames = 0;
    battle.damage(ally, 50, enemy);
    await page.keyboard.press('e');
    await expect.poll(() => battle.growthV3!.participant(medic.id).metrics.healingDone).toBe(50);
    await expect(page.locator('#growth-panel')).toContainText('队友治疗 50 · 治疗经验 20');
    expect(ally.life.health).toBe(100); expect(medic.arsenal.primary).toBe('famas');
    await page.screenshot({ path: 'artifacts/qa/growth-medic.png', fullPage: true });
  } finally { await Promise.all(contexts.map(context => context.close())); await server.close(); }
});

test('career build is acknowledged, used by the room and retained after signing in again', async ({ page }) => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'Career journey');
    await page.locator('#online-armory-nav').click();
    await page.locator('[data-growth-class=tank]').click();
    await page.locator('[data-growth-weapon=shotgun]').click();
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    // Saving an unchanged build must also receive an acknowledgement.
    await page.locator('#growth-career-save').click();
    await expect(page.locator('#growth-career-save')).toBeEnabled();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#online-lobby-nav').click();
    await page.locator('#create-growth').click();
    await expect(page.locator('#online-start')).toBeVisible();
    const room = [...server.rooms.values()][0];
    expect([...room.players.values()][0].growthLoadout).toMatchObject({ classId: 'tank', primary: 'shotgun' });
    await page.locator('#online-start').click();
    await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    expect(room.session!.battle.growthV3!.participant(room.session!.battle.player.id).loadout).toMatchObject({ classId: 'tank', primary: 'shotgun' });
    const battle = room.session!.battle;
    // Authority fixture shortens the match; player activity still traverses the real browser/socket path.
    await page.locator('canvas').click(); await page.keyboard.down('d');
    const activeStart = battle.frame;
    await expect.poll(() => battle.frame - activeStart).toBeGreaterThan(60);
    await page.keyboard.up('d');
    awardGrowthV3(battle.growthV3!.participant(battle.player.id).progression, battle.growthV3!.participant(battle.player.id).loadout, 1500, battle.frame, seededRandom(5));
    battle.frame = Math.max(900, battle.frame); battle.endMatch(battle.player.team, 'career settlement fixture');
    await expect(page.locator('#growth-panel')).toContainText('服务器自动发放账号与职业经验');
    await page.locator('#growth-leave').click();
    await expect(page.locator('#create-growth')).toBeEnabled();
    await page.locator('#online-armory-nav').click();
    await expect(page.locator('#growth-career-content')).toContainText('1局 / 1胜');
    await page.locator('#growth-tab-perks').click();
    await expect(page.locator('[data-growth-option="tk_steel"]')).toBeEnabled();
    await page.locator('[data-growth-option="tk_steel"]').click();
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#online-lobby-nav').click();
    await page.locator('#account-logout').click();
    await page.locator('#account-name').fill('Career journey');
    await page.locator('#account-password').fill('test-password-123');
    await page.locator('#account-signin').click();
    await expect(page.locator('#account-status')).toContainText('Career journey · 金币');
    await page.locator('#online-armory-nav').click();
    await page.locator('#growth-tab-weapons').click();
    await expect(page.locator('[data-growth-class=tank]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-growth-weapon=shotgun]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#growth-tab-perks').click();
    await expect(page.locator('[data-growth-option="tk_steel"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-growth-option="tk_platform"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#online-lobby-nav').click();
    await page.locator('#create-growth').click();
    await expect(page.locator('#online-start')).toBeVisible();
    const nextRoom = [...server.rooms.values()].find(value => value.players.size > 0)!;
    expect([...nextRoom.players.values()][0].growthLoadout!.perks).toContain('tk_steel');
  } finally { await server.close(); }
});

test('one browser can start growth practice against a bot without a second account', async ({ page }) => {
  const results: Record<string, unknown>[] = [];
  const server = startServer(0, '127.0.0.1', 30000, { log(_level, event, fields) { if (event === 'growth.playtest_result') results.push(fields!); } });
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'Solo growth'); await page.locator('#create-growth').click();
    await expect(page.locator('#growth-solo-note')).toContainText('可单人');
    await expect(page.locator('#lobby')).toContainText('未准备');
    await page.getByRole('button', { name: '开始单人试玩（对战机器人）', exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    const room = [...server.rooms.values()][0];
    expect(room.players.size).toBe(1);
    expect(room.session!.battle.actors.filter(a => !a.human)).toHaveLength(1);
    const actor = room.session!.battle.player, bot = room.session!.battle.actors[1];
    // Authority kill fixture verifies bot kills feed the same upgrade flow.
    for (let i = 0; i < 2; i++) {
      bot.life.alive = true; bot.life.health = 100; bot.life.spawnProtectionFrames = 0;
      room.session!.battle.damage(bot, 1000, actor);
    }
    await expect(page.locator('[data-upgrade]')).toHaveCount(3);
    await page.locator('[data-upgrade]').first().click();
    await expect.poll(() => room.session!.battle.growthV3!.participant(actor.id).progression.selected.length).toBe(1);
    await page.screenshot({ path: 'artifacts/qa/growth-solo.png', fullPage: true });
    await page.locator('#growth-leave').click();
    await expect.poll(() => results.length).toBe(1);
    expect(results[0].players).toEqual([expect.objectContaining({ actorId: actor.id, kills: 2, level: 2, xp: 200,
      choices: [expect.objectContaining({ id: room.session!.battle.growthV3!.participant(actor.id).progression.selected[0] })] })]);
    expect(room.session!.battle.snapshot().actors.some(a => a.id === actor.id)).toBe(false);
    expect(results[0].trainingBots).toBe(1);
  } finally { await server.close(); }
});

test('growth room: private cards, refresh, dead selection, reconnect and new round', async ({ browser }) => {
  test.setTimeout(90000);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [];
  try {
    for (const [i, page] of pages.entries()) {
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
      await registerOnline(page, `Growth ${i}`);
    }
    await pages[0].locator('#create-growth').click();
    await expect(pages[0].locator('#status')).toContainText('房间码');
    const room = [...server.rooms.values()][0];
    await pages[1].locator('#code').fill(room.id); await pages[1].locator('#join').click();
    for (const page of pages) {
      await expect(page.locator('#lobby')).toContainText('Assault');
      await page.locator('#online-ready').click();
    }
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    const battle = room.session!.battle, actor = battle.player;
    // Authority fixture advances XP, not a client cheat endpoint; natural kills are unit-tested.
    awardGrowthV3(battle.growthV3!.participant(actor.id).progression, battle.growthV3!.participant(actor.id).loadout, 1200, battle.frame, seededRandom(1));
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    await expect(pages[1].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    const firstBatch = room.session!.battle.growthV3!.participant(actor.id).progression.offer!.batch;
    await pages[0].locator('[data-growth-reroll]').click();
    await expect(pages[0].locator('[data-growth-reroll]')).toBeDisabled();
    await expect.poll(() => room.session!.battle.growthV3!.participant(actor.id).progression.offer!.batch).not.toBe(firstBatch);
    battle.damage(actor, 10000);
    await pages[0].locator('[data-upgrade]').first().click();
    await expect.poll(() => room.session!.battle.growthV3!.participant(actor.id).progression.selected.length).toBe(1);
    await pages[0].screenshot({ path: 'artifacts/qa/growth-dead-choice.png', fullPage: true });
    const selected = [...room.session!.battle.growthV3!.participant(actor.id).progression.selected], pending = structuredClone(room.session!.battle.growthV3!.participant(actor.id).progression.offer);
    for (const socket of server.wss.clients) socket.terminate();
    for (const page of pages) await expect(page.locator('#status')).toContainText('连接已断开');
    for (const page of pages) await page.locator('#growth-reconnect').click();
    for (const page of pages) await expect(page.locator('#status')).toContainText('房间码');
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    expect(room.session!.battle.growthV3!.participant(actor.id).progression.selected).toEqual(selected); expect(room.session!.battle.growthV3!.participant(actor.id).progression.offer).toEqual(pending);
    while (room.session!.battle.growthV3!.participant(actor.id).progression.offer) {
      const before = room.session!.battle.growthV3!.participant(actor.id).progression.selected.length;
      await pages[0].locator('[data-upgrade]').first().click();
      await expect.poll(() => room.session!.battle.growthV3!.participant(actor.id).progression.selected.length).toBe(before + 1);
    }
    battle.endMatch(1, 'growth lifecycle fixture');
    await expect(pages[0].locator('#growth-panel')).toContainText('服务器自动发放账号与职业经验');
    await pages[0].locator('#online-return').click();
    for (const page of pages) await page.locator('#online-ready').click();
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    expect(room.session!.battle.growthV3!.participant(room.session!.battle.player.id).progression.selected).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await Promise.allSettled(contexts.map(c => c.close())); await server.close(); }
});
