import { defineConfig, devices } from '@playwright/test';
import {
  E2E_BETTER_AUTH_SECRET,
  E2E_TEST_SECRET,
} from './tests/e2e/fixtures/test-data';

const port = Number(process.env.CREEM_E2E_PORT ?? 3120);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e/creem',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 120_000 },
  retries: 0,
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
      NEXT_PUBLIC_PAYMENT_PROVIDER: 'creem',
      NEXT_DIST_DIR: '.next-creem-e2e',
      BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
      E2E_TEST_SECRET,
      CREEM_DEBUG: process.env.CREEM_DEBUG ?? 'true',
      CREEM_API_KEY: process.env.CREEM_API_KEY ?? '',
      CREEM_WEBHOOK_SECRET: process.env.CREEM_WEBHOOK_SECRET ?? '',
      NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY:
        process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY ?? '',
      NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY:
        process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY ?? '',
      NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME:
        process.env.NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME ?? '',
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
