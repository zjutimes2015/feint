import { expect, test } from '@playwright/test';
import {
  expectHealthyPage,
  installPageHealthMonitor,
  localizedPath,
  type LocaleMode,
} from '../fixtures/page-health';

const publicPages = [
  { path: '/', name: 'home' },
  { path: '/episodes', name: 'episodes' },
  { path: '/fighters', name: 'fighters' },
  { path: '/storylines', name: 'storylines' },
  { path: '/bet', name: 'bet' },
  { path: '/fantasy', name: 'fantasy' },
  { path: '/live', name: 'live' },
  { path: '/fan-forge', name: 'fan forge' },
  { path: '/tickets', name: 'tickets' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/cookie', name: 'cookie policy' },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms of service' },
  { path: '/auth/login', name: 'login' },
  { path: '/auth/register', name: 'register' },
  { path: '/auth/forgot-password', name: 'forgot password' },
  { path: '/auth/reset-password', name: 'reset password' },
] as const;

const locales: LocaleMode[] = ['en', 'zh'];

test.describe('public page smoke coverage', () => {
  for (const locale of locales) {
    test(`renders all public pages in ${locale}`, async ({ page }) => {
      const monitor = installPageHealthMonitor(page);

      for (const publicPage of publicPages) {
        await test.step(publicPage.name, async () => {
          await expectHealthyPage(
            page,
            monitor,
            localizedPath(publicPage.path, locale)
          );
        });
      }
    });
  }

  test('opens the home page login modal', async ({ page }) => {
    const monitor = installPageHealthMonitor(page);

    await expectHealthyPage(page, monitor, '/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('navbar-login-trigger').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[name="email"]')).toBeVisible();
    await expect(dialog.locator('input[name="password"]')).toBeVisible();
    monitor.expectNoErrors('home login modal');
  });

  test('health check responds with pong', async ({ request }) => {
    const response = await request.get('/api/ping');

    await expect(response).toBeOK();
    expect(await response.json()).toEqual({ message: 'pong' });
  });

  test('switches locale while preserving query and hash', async ({ page }) => {
    const monitor = installPageHealthMonitor(page);

    await expectHealthyPage(page, monitor, '/?source=e2e#features');
    monitor.reset();

    await page.getByTestId('locale-switcher-trigger').click();
    await page.getByTestId('locale-switcher-option-zh').click();

    await expect(page).toHaveURL('/zh?source=e2e#features');
    monitor.expectNoErrors('home locale switch');
  });
});
