import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PRODUCTION_E2E_PORT ?? 3201);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const distDir = '.next-production-e2e';
const runtimeEnv = [
  `NEXT_DIST_DIR=${distDir}`,
  `NEXT_PUBLIC_BASE_URL=${baseURL}`,
].join(' ');

export default defineConfig({
  testDir: './tests/e2e/production',
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
      `${runtimeEnv} pnpm build`,
      `${runtimeEnv} PORT=${port} pnpm start`,
    ].join(' && '),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
