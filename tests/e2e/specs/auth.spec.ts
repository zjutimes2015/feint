import { expect, test } from '@playwright/test';
import {
  cleanupE2EUsers,
  loginByForm,
  registerE2EUser,
  updateE2EUser,
} from '../fixtures/auth';
import { createE2EUser } from '../fixtures/test-data';

test.describe('authentication and protected routes', () => {
  test.beforeAll(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test('redirects guests from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('allows a verified user to sign in and view dashboard', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);

    await loginByForm(page, user);
    await expect(page.getByTestId('dashboard-overview')).toBeVisible();
  });

  test('allows a user to register from the register page', async ({
    page,
    request,
  }) => {
    const user = createE2EUser();

    await page.goto('/auth/register');
    const nameInput = page.locator('input[name="name"]');
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');

    await expect(nameInput).toBeVisible();
    await nameInput.fill(user.name);
    await emailInput.fill(user.email);
    await passwordInput.fill(user.password);
    await page.getByTestId('auth-register-submit').click();

    await updateE2EUser(request, {
      email: user.email,
      emailVerified: true,
      role: 'user',
    });
    await loginByForm(page, user);
    await expect(page.getByTestId('dashboard-overview')).toBeVisible();
  });

  test('denies the admin users dashboard to a signed-in non-admin', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);

    await loginByForm(page, user);
    await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/admin\/users\/?$/);
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.locator('a[href="/admin/users"]')).toHaveCount(0);
  });

  test('allows a credential user to change their password', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    const user = await registerE2EUser(request);
    const newPassword = 'UpdatedPassword123456!';

    await loginByForm(page, user);
    await page.goto('/settings/security');
    const passwordForm = page.getByTestId('security-password-form');
    await expect(passwordForm).toBeVisible();
    await passwordForm
      .locator('input[name="currentPassword"]')
      .fill(user.password);
    await passwordForm.locator('input[name="newPassword"]').fill(newPassword);
    await passwordForm.locator('button[type="submit"]').click();
    await expect(
      passwordForm.locator('input[name="currentPassword"]')
    ).toHaveValue('');

    await page.context().clearCookies();
    await loginByForm(page, { ...user, password: newPassword });
    await expect(page.getByTestId('dashboard-overview')).toBeVisible();
  });
});

test.describe('verification email recovery', () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test('resends after registration, recovers a send failure and counts down', async ({
    page,
  }) => {
    const user = createE2EUser();
    await page.goto('/auth/register');
    await page.locator('input[name="name"]').fill(user.name);
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByTestId('auth-register-submit').click();
    const resend = page.getByTestId('auth-resend-verification');
    await expect(resend).toBeEnabled();
    const evidence = process.env.AUTH_MAIL_SCREENSHOT_DIR;
    if (evidence) await page.screenshot({ path: `${evidence}/pending.png` });
    let calls = 0;
    await page.route('**/api/auth/send-verification-email', async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        email: user.email,
        callbackURL: '/dashboard',
      });
      calls++;
      if (calls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'AUTH_EMAIL_SEND_FAILED',
            message: 'Unable to send verification email.',
          }),
        });
      } else {
        await route.continue();
      }
    });
    await resend.click();
    await expect(resend).toBeEnabled();
    if (evidence) await page.screenshot({ path: `${evidence}/failed.png` });
    await page.clock.install();
    const sent = page.waitForResponse('**/api/auth/send-verification-email');
    await resend.click();
    expect((await sent).status()).toBe(200);
    await expect(resend).toBeDisabled();
    if (evidence) await page.screenshot({ path: `${evidence}/resent.png` });
    await page.clock.fastForward(59_000);
    await expect(resend).toBeDisabled();
    await page.clock.fastForward(1_000);
    await expect(resend).toBeEnabled();
    expect(calls).toBe(2);
    const session = await page.request.get('/api/auth/get-session');
    expect(await session.json()).toBeNull();
  });

  test('offers resend for an unverified login but not a wrong password', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    await updateE2EUser(request, { email: user.email, emailVerified: false });
    await page.goto('/auth/login');
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill('wrong-password');
    const wrong = page.waitForResponse('**/api/auth/sign-in/email');
    await page.getByTestId('auth-login-submit').click();
    expect((await wrong).status()).toBe(401);
    await expect(page.getByTestId('auth-resend-verification')).toHaveCount(0);
    await page.locator('input[name="password"]').fill(user.password);
    const unverified = page.waitForResponse('**/api/auth/sign-in/email');
    await page.getByTestId('auth-login-submit').click();
    expect((await unverified).status()).toBe(403);
    await expect(page.getByTestId('auth-resend-verification')).toBeEnabled();
    const session = await page.request.get('/api/auth/get-session');
    expect(await session.json()).toBeNull();
  });
});
