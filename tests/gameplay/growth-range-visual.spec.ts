import { expect, test } from '@playwright/test';

test('range draws real smoke and cover and hides the obscured target',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?offline&growth');
  await page.locator('[data-growth-class=medic]').click();await page.locator('#growth-open-gunsmith').click();await page.locator('#growth-open-range').click();
  const result=page.locator('[data-range-result]');await expect(result).toHaveAttribute('data-target-visible','true');
  let canvas=page.locator('.growth-range canvas'),box=(await canvas.boundingBox())!;
  await canvas.click({position:{x:box.width*.415,y:box.height*.68}});await page.keyboard.press('g');
  await expect(result).toHaveAttribute('data-smoke','1');await expect(result).toHaveAttribute('data-target-visible','false');
  await page.screenshot({path:'artifacts/qa/growth-v3-range-smoke.png',fullPage:true});
  await page.locator('[data-range-back]').click();await page.getByRole('button',{name:'← 返回武器',exact:true}).click();
  await page.locator('[data-growth-class=tank]').click();await page.locator('#growth-open-gunsmith').click();await page.locator('#growth-open-range').click();
  canvas=page.locator('.growth-range canvas');box=(await canvas.boundingBox())!;
  await canvas.click({position:{x:box.width*.1985,y:box.height*.831}});await page.keyboard.press('g');
  await expect(result).toHaveAttribute('data-deployments','1');
  await page.keyboard.press('e');
  await expect(result).not.toContainText('E冷却 0.0秒');
  await page.screenshot({path:'artifacts/qa/growth-v3-range-cover.png',fullPage:true});
  expect(errors).toEqual([]);
});
