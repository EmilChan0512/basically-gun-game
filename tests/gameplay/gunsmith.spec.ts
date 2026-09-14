import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';

test('conditional ammo parts preview separate loaded and empty reload times',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?offline&growth');
  await page.locator('[data-growth-class=assault]').click();await page.locator('#growth-open-gunsmith').click();
  const preview=page.locator('[data-growth-weapon-preview]');
  await page.locator('[data-growth-attachment=A06]').click();
  await expect(preview).toContainText('非空 / 空仓换弹 28 / 49 tick');
  await page.locator('[data-growth-attachment=B01]').click();
  await expect(preview).toContainText('非空 / 空仓换弹 32 / 54 tick');
  await page.screenshot({path:'artifacts/qa/growth-gunsmith-conditional-reload.png',fullPage:true});
  await page.getByRole('button',{name:'← 返回武器',exact:true}).click();
  await page.locator('[data-growth-class=tank]').click();await page.locator('#growth-open-gunsmith').click();
  await page.locator('[data-growth-attachment=A05]').click();
  await expect(preview).toContainText('非空 / 空仓换弹 52 / 78 tick');
  await page.locator('[data-growth-attachment=B01]').click();
  await expect(preview).toContainText('非空 / 空仓换弹 60 / 88 tick');
  expect(errors).toEqual([]);
});

test('v3 gunsmith previews freely available parts in a draft, resets, saves, and fits narrow screens', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); await registerOnline(page, 'Gunsmith pilot');
    await page.locator('#online-armory-nav').click(); await page.locator('#growth-open-gunsmith').click();
    const preview=page.locator('[data-growth-weapon-preview]');
    await expect(preview).toContainText('0/3件');
    await page.locator('[data-growth-attachment="B01"]').click();
    await expect(preview).toContainText('1/3件');
    await expect(preview).toContainText('持枪移速 ×0.96');
    await expect(preview).toContainText('有效射程 403 px');
    const reloadAccount=async()=>{
      await page.reload();await page.locator('#online-lobby-nav').click();
      await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);await page.locator('#server').blur();
      await expect(page.locator('#account-status')).toContainText('Gunsmith pilot · 金币');
      await page.locator('#online-armory-nav').click();
      await expect(page.locator('#growth-open-gunsmith')).toBeVisible();
    };
    // A draft survives editor navigation, but a reload reads the acknowledged account build.
    await reloadAccount();
    await page.locator('#growth-open-gunsmith').click();await expect(preview).toContainText('0/3件');
    await page.locator('[data-growth-attachment="B01"]').click();
    await page.screenshot({ path: 'artifacts/qa/gunsmith-desktop.png', fullPage: true });
    await page.getByRole('button',{name:'← 返回武器',exact:true}).click();
    await page.locator('#growth-open-gunsmith').click();await expect(preview).toContainText('1/3件');
    await page.locator('[data-growth-attachment="A01"]').click();
    await expect(preview).toContainText('弹匣 30 → 24');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(preview).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'artifacts/qa/gunsmith-mobile.png', fullPage: true });
    await page.getByRole('button',{name:'移除全部配件',exact:true}).click();await expect(preview).toContainText('0/3件');
    await page.locator('[data-growth-attachment="A01"]').click();
    await page.locator('#growth-career-save').click(); await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    await reloadAccount();
    await page.locator('#growth-open-gunsmith').click();await expect(preview).toContainText('1/3件');
    await expect(page.locator('[data-growth-attachment="A01"]')).toHaveAttribute('aria-pressed','true');
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('unlocked gunsmith confirms only the chosen modification and supports cancel', async ({ page }) => {
  await page.goto('/?online');
  await page.evaluate(async () => {
    const path = '/src/client/presentation/Gunsmith.ts', catalog = '/src/shared/content/GrowthCatalog.ts';
    const { gunsmith } = await import(path), { defaultGrowthLoadout } = await import(catalog);
    const host = document.createElement('main'); document.body.replaceChildren(host);
    host.append(gunsmith(defaultGrowthLoadout(), 1000, (id: string) => { host.dataset.confirmed = id; }, () => { host.dataset.cancelled = 'true'; }));
  });
  await page.locator('[data-smith-part="quickmag"]').click();
  await expect(page.locator('[data-smith-apply]')).toBeEnabled();
  await expect(page.locator('main')).not.toHaveAttribute('data-confirmed');
  await page.locator('[data-smith-apply]').click(); await expect(page.locator('main')).toHaveAttribute('data-confirmed', 'quickmag');
  await page.locator('[data-smith-part="heavy"]').click(); await page.locator('[data-smith-back]').click();
  await expect(page.locator('main')).toHaveAttribute('data-cancelled', 'true');
  await expect(page.locator('main')).toHaveAttribute('data-confirmed', 'quickmag');
});

test('all six weapons compose their own three transparent components over the original reference', async ({ page }) => {
  const failures: string[] = []; page.on('response', r => { if (r.url().includes('/assets/') && !r.ok()) failures.push(r.url()); });
  await page.goto('/?online');
  await page.evaluate(async () => {
    const path='/src/client/presentation/Gunsmith.ts'; const { gunsmithProfile }=await import(path);
    document.body.innerHTML='<main id="component-sheet" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px"></main>';
    const host=document.getElementById('component-sheet')!;
    for(const gun of ['m4','famas','mp5','shotgun','scout','saw'])for(const part of ['heavy','short','quickmag']){
      const card=document.createElement('article');card.style.cssText='padding:12px;background:#233640;border:1px solid #64828e';
      card.innerHTML=`<p>${gun} / ${part}</p>`+gunsmithProfile(gun,part);host.append(card);
    }
    await Promise.all(Array.from(document.querySelectorAll('svg image')).map(node=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=reject;img.src=node.getAttribute('href')!;})));
  });
  await expect(page.locator('.smith-component-layer')).toHaveCount(18);
  await expect(page.locator('.smith-original-layer')).toHaveCount(18);
  await page.screenshot({path:'artifacts/qa/gunsmith-component-sheet.png',fullPage:true});
  expect(failures).toEqual([]);
});
