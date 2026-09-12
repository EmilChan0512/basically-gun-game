import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { awardGrowth } from '../../src/shared/simulation/Growth';
import { seededRandom } from '../../src/game/campaign/Battle';

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
    await page.locator('#online-map').selectOption('signal'); await page.locator('#growth-class').selectOption('medic');
    await expect(page.locator('#growth-weapon')).toHaveValue('famas');
    await page.locator('#growth-room-guide > summary').click();
    await expect(page.locator('#growth-room-guide')).toContainText('贴近队友救援');
    await expect(page.locator('#growth-room-guide')).toContainText('第12分钟');
    const room = [...server.rooms.values()][0];
    for (const other of pages.slice(1)) { await other.locator('#code').fill(room.id); await other.locator('#join').click(); }
    for (const other of pages) { await expect(other.locator('#online-ready')).toBeVisible(); await other.locator('#online-ready').click(); }
    await expect(page.locator('#lobby')).not.toContainText('未准备'); await page.locator('#online-start').click();
    await expect(page.locator('#growth-panel')).toContainText('Medic');
    await page.locator('canvas').click();
    const battle = room.session!.battle, medic = battle.player;
    const ally = battle.actors.find(a => a.team === medic.team && a !== medic)!, enemy = battle.actors.find(a => a.team !== medic.team)!;
    medic.movement.reset(220, 599.5); ally.movement.reset(250, 599.5); ally.life.spawnProtectionFrames = 0;
    battle.damage(ally, 50, enemy);
    await page.keyboard.press('e');
    await expect.poll(() => medic.growth!.metrics.healingDone).toBe(25);
    await expect(page.locator('#growth-panel')).toContainText('队友治疗 25 · 治疗经验 12');
    expect(ally.life.health).toBeGreaterThanOrEqual(75); expect(medic.arsenal.primary).toBe('famas');
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
    await page.locator('#growth-career-section > summary').click();
    await page.locator('#career-growth-class').selectOption('tank');
    await page.locator('#career-growth-weapon').selectOption('shotgun');
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    // Saving an unchanged build must also receive an acknowledgement.
    await page.locator('#growth-career-save').click();
    await expect(page.locator('#growth-career-save')).toBeEnabled();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#create-growth').click();
    await expect(page.locator('#online-start')).toBeVisible();
    const room = [...server.rooms.values()][0];
    expect([...room.players.values()][0].growthLoadout).toMatchObject({ classId: 'tank', primary: 'shotgun' });
    await page.locator('#online-start').click();
    await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    expect(room.session!.battle.player.growth).toMatchObject({ classId: 'tank', primary: 'shotgun' });
    const battle = room.session!.battle;
    // Authority fixture shortens the match; player activity still traverses the real browser/socket path.
    await page.locator('canvas').click(); await page.keyboard.down('d');
    const activeStart = battle.frame;
    await expect.poll(() => battle.frame - activeStart).toBeGreaterThan(60);
    await page.keyboard.up('d');
    awardGrowth(battle.player.growth!, 1500, seededRandom(5), battle.frame);
    battle.frame = Math.max(900, battle.frame); battle.endMatch(battle.player.team, 'career settlement fixture');
    await expect(page.locator('#growth-panel')).toContainText('服务器自动发放账号与职业经验');
    await page.locator('#growth-leave').click();
    await expect(page.locator('#create-growth')).toBeEnabled();
    await expect(page.locator('#growth-career-content')).toContainText('1局 / 1胜');
    await expect(page.locator('[data-growth-option="coolant"]')).toBeEnabled();
    await page.locator('[data-growth-option="brace"]').uncheck();
    await page.locator('[data-growth-option="coolant"]').check();
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await page.locator('#account-logout').click();
    await page.locator('#account-name').fill('Career journey');
    await page.locator('#account-password').fill('test-password-123');
    await page.locator('#account-signin').click();
    await expect(page.locator('#account-status')).toContainText('Career journey · 金币');
    await expect(page.locator('#career-growth-class')).toHaveValue('tank');
    await expect(page.locator('#career-growth-weapon')).toHaveValue('shotgun');
    await expect(page.locator('[data-growth-option="coolant"]')).toBeChecked();
    await expect(page.locator('[data-growth-option="brace"]')).not.toBeChecked();
    await page.locator('#create-growth').click();
    await expect(page.locator('#online-start')).toBeVisible();
    const nextRoom = [...server.rooms.values()].find(value => value.players.size > 0)!;
    expect([...nextRoom.players.values()][0].growthLoadout!.pool).toContain('coolant');
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
    await expect.poll(() => actor.growth!.selected.length).toBe(1);
    await page.screenshot({ path: 'artifacts/qa/growth-solo.png', fullPage: true });
    await page.locator('#growth-leave').click();
    await expect.poll(() => results.length).toBe(1);
    expect(results[0].players).toEqual([expect.objectContaining({ actorId: actor.id, kills: 2, level: 2, xp: 200,
      choices: [expect.objectContaining({ id: actor.growth!.selected[0] })] })]);
    expect(room.session!.battle.actors.some(a => a.id === actor.id)).toBe(false);
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
    awardGrowth(actor.growth!, 1200, seededRandom(1), battle.frame);
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    await expect(pages[1].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    const firstBatch = actor.growth!.offer!.batch;
    await pages[0].locator('[data-growth-reroll]').click();
    await expect(pages[0].locator('[data-growth-reroll]')).toBeDisabled();
    await expect.poll(() => actor.growth!.offer!.batch).not.toBe(firstBatch);
    battle.damage(actor, 10000);
    await pages[0].locator('[data-upgrade]').first().click();
    await expect.poll(() => actor.growth!.selected.length).toBe(1);
    await pages[0].screenshot({ path: 'artifacts/qa/growth-dead-choice.png', fullPage: true });
    const selected = [...actor.growth!.selected], pending = structuredClone(actor.growth!.offer);
    for (const socket of server.wss.clients) socket.terminate();
    for (const page of pages) await expect(page.locator('#status')).toContainText('连接已断开');
    for (const page of pages) await page.locator('#growth-reconnect').click();
    for (const page of pages) await expect(page.locator('#status')).toContainText('房间码');
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    expect(actor.growth!.selected).toEqual(selected); expect(actor.growth!.offer).toEqual(pending);
    while (actor.growth!.offer) {
      const before = actor.growth!.selected.length;
      await pages[0].locator('[data-upgrade]').first().click();
      await expect.poll(() => actor.growth!.selected.length).toBe(before + 1);
    }
    battle.endMatch(1, 'growth lifecycle fixture');
    await expect(pages[0].locator('#growth-panel')).toContainText('服务器自动发放账号与职业经验');
    await pages[0].locator('#online-return').click();
    for (const page of pages) await page.locator('#online-ready').click();
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    expect(room.session!.battle.player.growth!.selected).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await Promise.allSettled(contexts.map(c => c.close())); await server.close(); }
});
