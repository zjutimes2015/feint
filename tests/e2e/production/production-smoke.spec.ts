import { expect, test } from '@playwright/test';

const publicPages = ['/', '/episodes', '/tickets', '/auth/login'] as const;

test('production build serves representative pages and APIs', async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const path of publicPages) {
    await test.step(path, async () => {
      pageErrors.length = 0;
      const response = await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok(), `${path} should return 2xx`).toBeTruthy();
      expect(response?.headers()['content-type']).toContain('text/html');
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(100);
      expect(pageErrors, `${path} should hydrate without errors`).toEqual([]);
    });
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/auth\/login/);

  const health = await request.get('/api/ping');
  await expect(health).toBeOK();
  expect(await health.json()).toEqual({ message: 'pong' });

  const testHelper = await request.delete('/api/e2e/users', {
    headers: { 'x-e2e-secret': 'local-e2e-secret' },
  });
  expect(testHelper.status()).toBe(404);
});
