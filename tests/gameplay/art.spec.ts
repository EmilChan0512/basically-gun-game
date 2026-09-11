import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';

test('curated textures load in campaign and sandbox without missing assets', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', r => { if (r.url().includes('/assets/') && !r.ok()) failures.push(r.url()); });
  page.on('pageerror', e => failures.push(e.message));
  await page.goto('/?offline');
  await page.waitForFunction(() => !!window.__strikeCampaign);
  await enterOffline(page, 'Art Pilot');
  await page.getByRole('button', { name: '开始行动', exact: true }).click();
  await page.getByRole('button', { name: '进入战斗' }).click();
  await page.mouse.move(1000, 600);
  await page.waitForFunction(() => window.__strikeCampaign!.battle.frame > 5);
  expect(await page.evaluate(() => ['actor-medic-head', 'actor-medic-torso', 'actor-m4', 'ref-clouds', 'ref-supply'].every(id => window.__strikeCampaign!.textures.exists(id)))).toBe(true);
  await page.screenshot({ path: 'artifacts/qa/reference-battle.png' });
  await page.goto('/?rules=original');
  await page.waitForFunction(() => !!window.__originalStrike);
  await page.mouse.move(1000, 500);
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.crouching);
  await page.screenshot({ path: 'artifacts/qa/reference-crouch.png' });
  await page.keyboard.up('s');
  expect(failures).toEqual([]);
});

test('four original class skins, reload phases and mirrored muzzle alignment render together', async ({ page }) => {
  await page.goto('/?rules=original');
  await page.waitForFunction(() => !!window.__originalStrike);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/game/campaign/ReferenceArt.ts';
    const { ReferenceArt } = await import(modulePath);
    const scene = window.__originalStrike!;
    scene.scene.pause();
    scene.children.removeAll(true);
    scene.cameras.main.setScroll(0, 0).setZoom(1);
    const graphics = scene.add.graphics();
    graphics.fillStyle(0x17252e).fillRect(0, 0, 1400, 900);
    const rig = new ReferenceArt(scene);
    rig.begin();
    const roles = ['medic', 'assassin', 'commando', 'tank'];
    const checks: boolean[] = [];
    roles.forEach((role, column) => {
      const x = 150 + column * 240;
      scene.add.text(x - 45, 20, role, { fontSize: '20px' });
      [0, 28, 17, 6].forEach((reload, row) => {
        const y = 150 + row * 120;
        const flip = row === 3;
        const aim = { x: x + (flip ? -200 : 200), y: y - 42 };
        const id = `${role}-${row}`;
        rig.soldier(x, y, row === 2, 0, false, 10, aim, 'm4', 0xffffff, true, reload, row === 0, undefined, role, id);
        if (row === 0) rig.tracer(graphics, { origin: { x: x + 55, y: y - 43 }, end: { x: x + 135, y: y - 43 } }, id);
        scene.add.text(x - 60, y + 8, ['idle / fire', 'reload: lower', 'reload: insert / crouch', 'reload: return / left'][row], { fontSize: '12px' });
      });
      for (const part of ['head', 'torso', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'boot']) checks.push(scene.textures.exists(`actor-${role}-${part}`));
    });
    return checks;
  });
  expect(result.every(Boolean)).toBe(true);
  await page.screenshot({ path: 'artifacts/qa/class-reload-gallery.png' });
});
