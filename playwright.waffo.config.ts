import { defineConfig, devices } from '@playwright/test';
import {
  E2E_BETTER_AUTH_SECRET,
  E2E_TEST_SECRET,
} from './tests/e2e/fixtures/test-data';

const port = Number(process.env.WAFFO_E2E_PORT ?? 3118);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e/waffo',
  fullyParallel: false,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 300_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_PUBLIC_BASE_URL: baseURL,
      NEXT_PUBLIC_DEMO_WEBSITE: 'true',
      NEXT_PUBLIC_E2E_TEST_MODE: 'true',
      NEXT_PUBLIC_PAYMENT_PROVIDER: 'waffo',
      NEXT_DIST_DIR: '.next-waffo-e2e',
      BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
      E2E_TEST_SECRET: E2E_TEST_SECRET,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
