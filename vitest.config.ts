import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({ test: {
  include: ['tests/unit/**/*.test.{ts,mjs}'],
  // Keep expensive exhaustive checks in local npm test runs, outside CI.
  exclude: [...configDefaults.exclude, ...(/^(true|1)$/i.test(process.env.CI ?? '')
    ? ['tests/unit/**/*.exhaustive.test.ts'] : [])],
} });
