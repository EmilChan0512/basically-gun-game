import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('station radar stays compact during default and wide-view offline combat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?rules=lab');
  await page.locator('#offline-growth-map').selectOption('longshot');
  await page.locator('#offline-growth-start').click();
  await expect(page.locator('[data-hud=clock]')).not.toHaveText('15:00');
  await expect(page.locator('#online-radar svg > g > path')).toHaveCount(1);
  expect(await page.locator('#online-radar svg *').count()).toBeLessThan(30);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const results = [];
  for (const wide of [false, true]) {
    if (wide) {
      for (let i = 0; i < 5; i++) await page.locator('[data-view=wider]').click();
      await page.keyboard.down('d');
    }
    const before = (await cdp.send('Performance.getMetrics')).metrics;
    const cadence = await page.evaluate(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>('#online-game canvas')!;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const times: number[] = [];
      await new Promise<void>(resolve => {
        const start = performance.now(); let previous = start;
        const frame = (now: number) => {
          times.push(now - previous); previous = now;
          if (now - start >= 10000) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      times.shift(); times.sort((a, b) => a - b);
      return { samples: times.length, p95Ms: times[Math.floor(times.length * .95)],
        p99Ms: times[Math.floor(times.length * .99)], hidden: document.hidden,
        renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        canvas: { width: canvas.width, height: canvas.height } };
    });
    const after = (await cdp.send('Performance.getMetrics')).metrics;
    const cpuSeconds = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(name =>
      [name, (after.find(m => m.name === name)?.value ?? 0) - (before.find(m => m.name === name)?.value ?? 0)]));
    results.push({ viewFactor: wide ? 3.5 : 1, ...cadence, cpuSeconds });
    // RAF cadence is recorded, not treated as proof of GPU presentation rate.
    expect(cadence.samples).toBeGreaterThan(0); expect(cadence.hidden).toBe(false);
  }
  await page.keyboard.up('d');
  await page.screenshot({ path: 'artifacts/qa/station-performance-wide.png' });
  mkdirSync('artifacts/qa', { recursive: true });
  writeFileSync('artifacts/qa/station-performance.json', JSON.stringify({ results, errors }, null, 2));
  expect(errors).toEqual([]);
});
