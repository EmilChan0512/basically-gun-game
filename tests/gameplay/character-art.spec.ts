import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('original jointed limbs and weapon grips render across classes and poses', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/characters/') && !response.ok()) errors.push(response.url()); });
  await page.setViewportSize({ width: 1500, height: 1240 });
  await page.goto('/?rules=original'); await page.waitForFunction(() => !!window.__originalStrike);
  const checks = await page.evaluate(async () => {
    const artPath = '/src/game/campaign/ReferenceArt.ts', posePath = '/src/client/presentation/CharacterPose.ts';
    const { ReferenceArt } = await import(artPath), { characterPose } = await import(posePath);
    const scene = window.__originalStrike!;
    scene.scene.pause(); scene.children.removeAll(true); scene.scale.resize(1440, 1200); scene.cameras.main.setScroll(0, 0).setZoom(1);
    scene.cameras.main.setBackgroundColor('#172126');
    const roles = ['medic', 'assassin', 'commando', 'tank'];
    const labels = ['IDLE / M4', 'RUN / AK47', 'CROUCH / USP', 'AIR / SAW', 'RELOAD / VECTOR', 'LEFT / DRAGUNOV'];
    const weapons = ['m4', 'ak47', 'usp', 'saw', 'vector', 'dragunov'];
    const report: boolean[] = [];
    for (let row = 0; row < labels.length; row++) for (let column = 0; column < roles.length; column++) {
      const role = roles[column], weapon = weapons[row], x = (row === 5 ? 180 : 105) + column * 350, y = 180 + row * 195;
      const pose = characterPose(role, weapon);
      report.push(pose.parts.filter((p: { id: string }) => p.id.endsWith('-thigh')).length === 2
        && pose.parts.filter((p: { id: string }) => p.id.endsWith('-hand')).length === 2
        && pose.parts.filter((p: { id: string }) => p.id === weapon).length === 1);
      scene.add.text(x - 65, y - 177, `${role.toUpperCase()} · ${labels[row]}`, { fontFamily: 'monospace', fontSize: '13px', color: '#bed29f' });
      const before = scene.children.list.length, rig = new ReferenceArt(scene);
      rig.begin(); rig.soldier(0, 0, row === 2, row === 1 ? 4 : 0, row === 3, row === 1 ? 5 : 0,
        { x: row === 5 ? -100 : 100, y: row === 2 ? -28 : -42 }, weapon, 0xffffff, true,
        row === 4 ? 17 : 0, false, undefined, role);
      const children = scene.children.list.slice(before);
      scene.add.container(x, y, children).setScale(2);
    }
    return report;
  });
  expect(checks).toEqual(Array(24).fill(true));
  const snapshot = await page.evaluate(() => new Promise<string>(resolve => {
    window.__originalStrike!.game.renderer.snapshot(image => resolve((image as HTMLImageElement).src));
  }));
  mkdirSync('artifacts/qa', { recursive: true });
  writeFileSync('artifacts/qa/character-anatomy-review.png', Buffer.from(snapshot.split(',')[1], 'base64'));
  expect(errors).toEqual([]);
});
