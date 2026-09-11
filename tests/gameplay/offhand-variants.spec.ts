import { test, expect } from '@playwright/test';

test('all original offhand variants render and shield position follows all sixteen directions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/reference/') && !response.ok()) errors.push(response.url()); });
  await page.goto('/?rules=original');
  await page.waitForFunction(() => !!window.__originalStrike);
  const result = await page.evaluate(async () => {
    const artModule = '/src/game/campaign/ReferenceArt.ts', contentModule = '/src/shared/content/Offhands.ts';
    const { ReferenceArt } = await import(artModule);
    const { SPECIAL_OFFHANDS } = await import(contentModule);
    const scene = window.__originalStrike!;
    scene.scene.pause(); scene.children.removeAll(true); scene.cameras.main.setScroll(0, 0).setZoom(1);
    const rig = new ReferenceArt(scene), rotations: boolean[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      rig.begin(); rig.soldier(500, 300, false, 0, false, 0, { x: 500 + Math.cos(angle) * 100, y: 258 + Math.sin(angle) * 100 },
        'm4', 0xffffff, true, 0, false, { id: 'shield', kind: 'shield', equipped: true, age: -1, facing: { x: 1, y: 0 }, durability: 120, deployed: true }, 'tank');
      const image = scene.children.list.find(child => {
        const part = child as unknown as { visible: boolean; texture?: { key: string } };
        return part.visible && ['ref-shield', 'ref-shield-back'].includes(part.texture?.key ?? '');
      }) as unknown as { x: number; y: number; rotation: number; flipX: boolean };
      rotations.push(Math.abs(image.x - 500 - Math.cos(angle) * 24) < 0.001
        && Math.abs(image.y - 258 - Math.sin(angle) * 24) < 0.001
        && Math.cos(image.rotation + (image.flipX ? Math.PI : 0) - angle) > 0.999);
    }
    rig.begin();
    scene.add.graphics().setDepth(-1).fillStyle(0x17252e).fillRect(0, 0, 1400, 900);
    let knife = 0, shield = 0;
    for (const [id, value] of Object.entries(SPECIAL_OFFHANDS)) {
      const item = value as { kind: string; name: string; windup: number; style?: string };
      const column = item.kind === 'melee' ? knife++ : shield++, x = 95 + column * 177;
      scene.add.text(x - 45, item.kind === 'melee' ? 12 : 385, id, { fontSize: '13px' });
      for (let row = 0; row < (item.kind === 'melee' ? 3 : 1); row++) {
        const y = item.kind === 'melee' ? 115 + row * 120 : 520;
        const angle = item.kind === 'melee' ? 0 : [0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI * 0.75, Math.PI * 0.75][column];
        rig.soldier(x, y, false, 0, false, 0, { x: x + Math.cos(angle) * 100, y: y - 42 + Math.sin(angle) * 100 },
          'm4', 0xffffff, true, 0, false,
          { id, kind: item.kind, equipped: true, age: row === 0 ? -1 : row === 1 ? item.windup : item.windup + 1,
            facing: { x: 1, y: 0 }, durability: 120, deployed: true }, item.kind === 'melee' ? 'assassin' : 'tank', id);
        if (item.kind === 'melee') scene.add.text(x - 25, y + 10, ['ready', 'windup', 'strike'][row], { fontSize: '12px' });
      }
    }
    return { rotations, knife, shield };
  });
  expect(result.rotations).toEqual(Array(16).fill(true));
  expect(result.knife).toBe(6); expect(result.shield).toBe(6);
  await page.screenshot({ path: 'artifacts/qa/offhand-variants.png' });
  expect(errors).toEqual([]);
});
