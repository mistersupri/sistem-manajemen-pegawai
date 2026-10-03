import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E berjalan terhadap aplikasi yang sudah hidup dengan data demo (SEED_DEMO=1).
//   BASE_URL=http://127.0.0.1:3000 npm run test:e2e
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    launchOptions: chromium ? { executablePath: chromium } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
});
