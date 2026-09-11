import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/production', outputDir: './test-results/production', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4177', viewport: { width: 1280, height: 900 }, headless: true },
  webServer: { command: 'node artifacts/project-strike-local/tools/serve-game.mjs --port 4177', url: 'http://127.0.0.1:4177', reuseExistingServer: false },
});
