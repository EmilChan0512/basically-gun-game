import { expect, test } from '@playwright/test';

test('tank plate cast blocks Q and completes with the original gun still selected',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?offline&growth');await page.locator('[data-growth-class=tank]').click();
  await page.locator('#growth-tab-skills').click();await page.locator('[data-growth-gadget=tk_plate]').click();
  await page.locator('#growth-career-save').click();await expect(page.locator('[data-growth-save-status]')).toContainText('已保存在本机');
  await page.locator('#offline-growth-map').selectOption('signal');await page.locator('#offline-growth-start').click();
  await expect(page.locator('[data-hud=weapon]')).toContainText('SAW');
  const canvas=(await page.locator('#online-game canvas').boundingBox())!;
  await page.mouse.move(canvas.x+canvas.width*.65,canvas.y+canvas.height*.5);
  await page.mouse.down(); // Hold through the weapon's preparation time.
  await expect(page.locator('[data-hud=weapon]')).not.toContainText('50 / 150');
  await page.mouse.up();
  await page.keyboard.press('g');await page.waitForTimeout(150);await page.keyboard.press('q');
  await expect(page.locator('.combat-status')).toHaveText('当前动作尚未结束');
  await expect(page.locator('[data-hud=armor]')).toContainText('15');
  await expect(page.locator('[data-hud=ability]')).toContainText('装甲包 ×1');
  await expect(page.locator('[data-hud=weapon]')).toContainText('SAW');
  expect(errors).toEqual([]);
});
