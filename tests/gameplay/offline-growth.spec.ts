import { test } from '@playwright/test';
import { exerciseOfflineGrowth } from '../helpers/offline-growth';

test('offline entry saves an exclusive build and plays, pauses and restarts without a WebSocket', async ({ page }) => {
  test.setTimeout(60000);
  await exerciseOfflineGrowth(page);
});
