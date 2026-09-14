import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/performance', outputDir: './test-results/performance', workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 1920, height: 1080 }, headless: true,
    ...(process.env.GROWTH_GPU==='d3d11'?{channel:'chromium',launchOptions:{args:['--use-angle=d3d11']}}:{}) },
  webServer: { command: 'node artifacts/project-strike-local/tools/serve-game.mjs --port 4178', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
});
