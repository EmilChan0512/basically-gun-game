import { expect, test } from '@playwright/test';

test('painted menu, pause controls and HUD remain usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/ui-kit/') && !response.ok()) errors.push(response.url()); });
  await page.goto('/?offline');
  const start = page.locator('#continue-campaign');
  await expect(start).toHaveCSS('border-image-source', /ui-kit\/v1\/button-primary.png/);
  await start.focus(); await page.keyboard.press('Enter');
  await page.locator('#deploy').click();
  await expect(page.locator('#player-health')).toContainText('生命');
  await expect(page.locator('.hud-vitals')).toHaveCSS('border-image-source', /hud-vitals.png/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#resume')).toBeVisible();
  await expect(page.locator('.compact-panel')).toHaveCSS('border-image-source', /dialog.png/);
  await page.screenshot({ path: 'artifacts/qa/ui-kit-pause-tested.png', fullPage: true });
  await page.locator('#resume').click();
  await expect(page.locator('#resume')).toBeHidden();
  expect(errors).toEqual([]);
});

test('painted growth loadout preserves selections and fits narrow screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?offline&growth');
  await page.locator('[data-growth-class=sniper]').click();
  const selected = page.locator('[data-growth-class=sniper]');
  const unselected = page.locator('[data-growth-class=medic]');
  await unselected.hover();
  await expect(unselected).toHaveAttribute('aria-pressed', 'false');
  await expect(unselected).toHaveCSS('border-image-source', /\/card.png/);
  await expect(unselected).toHaveCSS('box-shadow', 'none');
  await selected.hover();
  await expect(selected).toHaveCSS('border-image-source', /\/card-selected.png/);
  await expect(selected).not.toHaveCSS('box-shadow', 'none');
  await page.locator('#growth-tab-skills').click();
  await page.locator('[data-growth-gadget=sn_emp]').click();
  await page.locator('#growth-career-save').click();
  await expect(page.locator('[data-growth-save-status]')).toContainText('已保存在本机');
  await page.reload(); await page.locator('#growth-tab-skills').click();
  await expect(page.locator('[data-growth-gadget=sn_emp]')).toHaveAttribute('aria-pressed', 'true');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#growth-career-save')).toBeEnabled();
    await page.screenshot({ path: `artifacts/qa/ui-kit-skills-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
