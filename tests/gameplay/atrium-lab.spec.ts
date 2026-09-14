import { test, expect } from '@playwright/test';
test('growth laboratory replaces legacy entry and runs the ComfyUI atrium',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?rules=lab');
  await expect(page.locator('#offline-setup h1')).toHaveText('联机成长模式实验室');
  await expect(page.locator('#offline-growth-map')).toHaveValue('atrium');
  await page.locator('#offline-growth-start').click();
  await expect(page.locator('#online-game canvas')).toBeVisible();
  await expect(page.locator('[data-hud=clock]')).not.toHaveText('15:00');
  const canvas=page.locator('#online-game canvas');await canvas.click();
  await page.keyboard.down('KeyD');await page.waitForTimeout(1000);await page.keyboard.up('KeyD');
  await page.screenshot({path:'artifacts/qa/atrium-lab.png'});
  await page.locator('#offline-growth-leave').click();
  await expect(page.locator('#offline-setup')).toBeVisible();
  expect(errors).toEqual([]);
});
