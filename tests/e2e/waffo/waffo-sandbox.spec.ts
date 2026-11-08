import { expect, test } from '@playwright/test';
import {
  cleanupE2EUsers,
  loginByForm,
  registerE2EUser,
  waitForE2EPayment,
  waitForPaidPayment,
  waitForSubscription,
} from '../fixtures/auth';

test.describe('Waffo sandbox payment', () => {
  let currentUserEmail: string | null = null;

  test.beforeEach(async ({ request }) => {
    currentUserEmail = null;
    await cleanupE2EUsers(request);
  });

  test.afterEach(async ({ request }) => {
    if (currentUserEmail) {
      await waitForPaidPayment(request, currentUserEmail, {
        timeoutMs: 30_000,
      });
    }
    await cleanupE2EUsers(request);
  });

  async function completeHostedCheckout(
    page: import('@playwright/test').Page,
    options: {
      paymentButton: 'Pay' | 'Subscribe';
    }
  ) {
    const baseURL = test.info().project.use.baseURL ?? '';
    const billingURL = `${baseURL.replace(/\/$/, '')}/settings/billing`;

    await page.waitForURL(/https:\/\/.*\.waffo\.(ai|com)\//, {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByText('Payment', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const cardMethod = page.getByRole('button', {
      name: 'Credit/Debit Card',
    });
    await cardMethod.click();
    const cardNumber = page.locator('input[autocomplete="cc-number"]');
    if (!(await cardNumber.isVisible().catch(() => false))) {
      await page.waitForTimeout(1_000);
      await cardMethod.click();
    }
    await expect(cardNumber).toBeVisible({ timeout: 30_000 });
    await cardNumber.click();
    await cardNumber.pressSequentially('2226900000000110', { delay: 50 });
    const expiry = page.locator('input[autocomplete="cc-exp"]');
    await expiry.click();
    await expiry.pressSequentially('1229', { delay: 50 });
    await expect(expiry).toHaveValue('12/29');
    const cvv = page.locator('input[autocomplete="cc-csc"]');
    await cvv.click();
    await cvv.pressSequentially('123', { delay: 50 });
    const cardholder = page.locator('input[autocomplete="cc-name"]');
    await cardholder.click();
    await cardholder.pressSequentially('TEST USER', { delay: 30 });
    const terms = page.getByRole('checkbox', {
      name: /By clicking Pay/i,
    });
    if (await terms.isVisible().catch(() => false)) {
      await terms.check();
      await expect(terms).toBeChecked();
    }
    const formIsValid = await cardNumber.evaluate(
      (input: HTMLInputElement) => input.form?.checkValidity() ?? false
    );
    expect(formIsValid).toBe(true);

    const payButton = page.getByRole('button', {
      name: options.paymentButton,
      exact: true,
    });
    await expect(payButton).toBeEnabled();
    await payButton.click();

    const doneLink = page.getByRole('link', { name: 'Done', exact: true });
    await expect(doneLink).toHaveAttribute(
      'href',
      /\/payment\?checkout_id=.*callback=/,
      { timeout: 240_000 }
    );
    await doneLink.click();
    await page.waitForURL(billingURL, { timeout: 60_000 });
  }

  test('monthly subscription returns to Billing and activates the plan', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    currentUserEmail = user.email;
    await loginByForm(page, user);
    await page.goto('/pricing');

    await page.getByTestId('pricing-card-pro').getByRole('button').click();
    await completeHostedCheckout(page, {
      paymentButton: 'Subscribe',
    });

    const subscription = await waitForSubscription(request, user.email);
    expect(subscription?.paymentCount).toBe(1);
    expect(subscription?.subscription).toMatchObject({
      status: 'active',
      interval: 'month',
      cancelAtPeriodEnd: false,
    });
  });

  test('yearly subscription returns to Billing and keeps yearly interval', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    currentUserEmail = user.email;
    await loginByForm(page, user);
    await page.goto('/pricing');
    await page.getByTestId('pricing-interval-year').click();
    await page.getByTestId('pricing-card-pro').getByRole('button').click();
    await completeHostedCheckout(page, {
      paymentButton: 'Subscribe',
    });

    const subscription = await waitForSubscription(request, user.email);
    expect(subscription?.paymentCount).toBe(1);
    expect(subscription?.subscription?.interval).toBe('year');
  });

  test('lifetime purchase returns to Billing with lifetime access', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    currentUserEmail = user.email;
    await loginByForm(page, user);
    await page.goto('/pricing');

    await page.getByTestId('pricing-card-lifetime').getByRole('button').click();
    await completeHostedCheckout(page, {
      paymentButton: 'Pay',
    });

    const state = await waitForE2EPayment(request, user.email, {
      paidOnly: true,
      predicate: (current) => current.latestPayment?.scene === 'lifetime',
    });
    expect(state?.latestPayment).toMatchObject({
      paid: true,
      scene: 'lifetime',
      status: 'completed',
      type: 'one_time',
    });
  });
});
