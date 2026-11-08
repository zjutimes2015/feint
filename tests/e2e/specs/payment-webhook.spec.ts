import { expect, test, type APIRequestContext } from '@playwright/test';
import Stripe from 'stripe';
import {
  cleanupE2EUsers,
  loginByForm,
  registerE2EUser,
  type E2EPaymentState,
} from '../fixtures/auth';
import {
  E2E_STRIPE_WEBHOOK_SECRET,
  E2E_TEST_SECRET,
} from '../fixtures/test-data';

async function postEvent(
  request: APIRequestContext,
  type: string,
  object: object
) {
  const payload = JSON.stringify({
    id: `evt_e2e_${crypto.randomUUID()}`,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: E2E_STRIPE_WEBHOOK_SECRET,
  });
  return request.post('/api/webhooks/stripe', {
    data: payload,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
  });
}

async function dispatch(
  request: APIRequestContext,
  type: string,
  object: object
) {
  const response = await postEvent(request, type, object);
  await expect(response).toBeOK();
  expect(await response.json()).toEqual({ received: true });
}

async function state(
  request: APIRequestContext,
  email: string,
  sessionId?: string
) {
  const query = new URLSearchParams({ email });
  if (sessionId) query.set('session_id', sessionId);
  const response = await request.get(`/api/e2e/users?${query}`, {
    headers: { 'x-e2e-secret': E2E_TEST_SECRET },
  });
  await expect(response).toBeOK();
  return (await response.json()) as E2EPaymentState;
}

function checkout(userId: string, customerId: string) {
  const suffix = crypto.randomUUID();
  return {
    id: `cs_test_${suffix}`,
    object: 'checkout.session',
    customer: customerId,
    invoice: `in_test_${suffix}`,
    metadata: { userId, priceId: 'price_lifetime_test' },
    mode: 'payment',
  };
}

function invoice(session: ReturnType<typeof checkout>) {
  return {
    id: session.invoice,
    object: 'invoice',
    customer: session.customer,
    subscription: null,
    amount_paid: 19900,
  };
}

test.describe('Stripe webhook boundary', () => {
  test.beforeAll(async ({ request }) => cleanupE2EUsers(request));
  test.afterAll(async ({ request }) => cleanupE2EUsers(request));

  test('validates signatures, persists one-time payment once, and refreshes Billing', async ({
    page,
    request,
  }) => {
    const missing = await request.post('/api/webhooks/stripe', { data: {} });
    expect(missing.status()).toBe(400);
    const invalid = await request.post('/api/webhooks/stripe', {
      data: {},
      headers: { 'stripe-signature': 'invalid' },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toEqual({
      error: 'Invalid webhook signature',
    });

    const user = await registerE2EUser(request);
    await loginByForm(page, user);
    const sessionResponse = await page.request.get('/api/auth/get-session');
    const auth = await sessionResponse.json();
    const purchase = checkout(auth.user.id, `cus_${crypto.randomUUID()}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      await dispatch(request, 'checkout.session.completed', purchase);
    }
    expect(await state(request, user.email)).toMatchObject({
      paymentCount: 1,
      latestPayment: {
        paid: false,
        type: 'one_time',
        scene: 'lifetime',
        sessionId: purchase.id,
      },
    });
    await page.goto(`/payment?session_id=${purchase.id}`);
    await expect(page.getByTestId('payment-status')).toHaveAttribute(
      'data-status',
      'processing'
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      await dispatch(request, 'invoice.paid', invoice(purchase));
    }
    await expect(page.getByTestId('payment-status')).toHaveAttribute(
      'data-status',
      'success'
    );
    expect(await state(request, user.email)).toMatchObject({
      paymentCount: 1,
      latestPayment: { paid: true, status: 'completed' },
    });
    await page.goto(
      `/payment?session_id=${purchase.id}&callback=%2Fsettings%2Fbilling`
    );
    await expect(page).toHaveURL(/\/settings\/billing$/);
    await expect(page.getByTestId('billing-current-plan')).toHaveAttribute(
      'data-plan-id',
      'lifetime'
    );
  });

  test('refunds only the matching order and keeps completion private to its owner', async ({
    page,
    request,
    browser,
  }) => {
    const user = await registerE2EUser(request);
    await loginByForm(page, user);
    const auth = await (await page.request.get('/api/auth/get-session')).json();
    const customerId = `cus_${crypto.randomUUID()}`;
    const first = checkout(auth.user.id, customerId);
    const second = checkout(auth.user.id, customerId);
    for (const purchase of [first, second]) {
      await dispatch(request, 'checkout.session.completed', purchase);
      await dispatch(request, 'invoice.paid', invoice(purchase));
    }
    await dispatch(request, 'charge.refunded', {
      id: 'ch_local_refund',
      object: 'charge',
      customer: customerId,
      invoice: first.invoice,
      refunded: true,
    });
    // A delayed paid invoice must not undo a refund.
    await dispatch(request, 'invoice.paid', invoice(first));
    expect(await state(request, user.email, first.id)).toMatchObject({
      latestPayment: { paid: false, status: 'canceled' },
    });
    expect(await state(request, user.email, second.id)).toMatchObject({
      latestPayment: { paid: true, status: 'completed' },
    });
    await page.goto(`/payment?session_id=${second.id}`);
    await expect(page.getByTestId('payment-status')).toHaveAttribute(
      'data-status',
      'success'
    );

    const otherContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    try {
      const otherPage = await otherContext.newPage();
      const otherUser = await registerE2EUser(request);
      await loginByForm(otherPage, otherUser);
      for (const sessionId of [
        second.id,
        `cs_test_forged_${crypto.randomUUID()}`,
        `cs_test_missing_${crypto.randomUUID()}`,
      ]) {
        const completion = otherPage.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.endsWith('/payment')
        );
        await otherPage.goto(`/payment?session_id=${sessionId}`);
        expect((await completion).status()).toBe(200);
        await expect(otherPage.getByTestId('payment-status')).toHaveAttribute(
          'data-status',
          'processing'
        );
      }
    } finally {
      await otherContext.close();
    }
  });

  test('returns a retryable error for checkout events with unknown prices', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    await loginByForm(page, user);
    const auth = await (await page.request.get('/api/auth/get-session')).json();
    const purchase = checkout(auth.user.id, `cus_${crypto.randomUUID()}`);
    const response = await postEvent(request, 'checkout.session.completed', {
      ...purchase,
      metadata: {
        userId: auth.user.id,
        priceId: 'price_unknown',
      },
    });
    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed' });
    expect(await state(request, user.email)).toMatchObject({ paymentCount: 0 });
  });

  test('retries when Invoice-first recovery cannot reach Stripe', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);
    await loginByForm(page, user);
    const auth = await (await page.request.get('/api/auth/get-session')).json();
    const purchase = checkout(auth.user.id, `cus_${crypto.randomUUID()}`);

    const earlyInvoice = await postEvent(
      request,
      'invoice.paid',
      invoice(purchase)
    );
    expect(earlyInvoice.status()).toBe(500);
    expect(await state(request, user.email)).toMatchObject({ paymentCount: 0 });

    await dispatch(request, 'checkout.session.completed', purchase);
    await dispatch(request, 'invoice.paid', invoice(purchase));
    expect(await state(request, user.email)).toMatchObject({
      paymentCount: 1,
      latestPayment: { paid: true, status: 'completed' },
    });
  });
});
