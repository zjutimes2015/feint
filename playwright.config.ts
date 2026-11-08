import { defineConfig, devices } from '@playwright/test';
import {
  E2E_BETTER_AUTH_SECRET,
  E2E_STRIPE_SECRET_KEY,
  E2E_STRIPE_WEBHOOK_SECRET,
  E2E_TEST_SECRET,
} from './tests/e2e/fixtures/test-data';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: [
      `PORT=${port}`,
      `NEXT_PUBLIC_BASE_URL=${baseURL}`,
      'NEXT_PUBLIC_DEMO_WEBSITE=true',
      'NEXT_PUBLIC_E2E_TEST_MODE=true',
      'NEXT_PUBLIC_PAYMENT_PROVIDER=stripe',
      'NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_pro_monthly_test',
      'NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_pro_yearly_test',
      'NEXT_PUBLIC_STRIPE_PRICE_LIFETIME=price_lifetime_test',
      'NEXT_DIST_DIR=.next-e2e',
      `BETTER_AUTH_SECRET=${E2E_BETTER_AUTH_SECRET}`,
      `E2E_TEST_SECRET=${E2E_TEST_SECRET}`,
      `STRIPE_SECRET_KEY=${E2E_STRIPE_SECRET_KEY}`,
      `STRIPE_WEBHOOK_SECRET=${E2E_STRIPE_WEBHOOK_SECRET}`,
      'pnpm dev',
    ].join(' '),
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
