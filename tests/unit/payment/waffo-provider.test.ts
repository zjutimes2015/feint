import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  verifyWebhook: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  sendPaymentNotification: vi.fn(),
}));

vi.mock('@waffo/pancake-ts', () => ({
  WaffoPancake: class {
    checkout = {
      authenticated: {
        create: mocks.createCheckout,
      },
    };
  },
  verifyWebhook: mocks.verifyWebhook,
  WebhookEventType: {
    OrderCompleted: 'order.completed',
    SubscriptionActivated: 'subscription.activated',
    SubscriptionPaymentSucceeded: 'subscription.payment_succeeded',
    SubscriptionRenewed: 'subscription.renewed',
    SubscriptionRecovered: 'subscription.recovered',
    SubscriptionCanceling: 'subscription.canceling',
    SubscriptionUncanceled: 'subscription.uncanceled',
    SubscriptionPlanChanged: 'subscription.plan_changed',
    SubscriptionCanceled: 'subscription.canceled',
    SubscriptionPastDue: 'subscription.past_due',
    RefundSucceeded: 'refund.succeeded',
    RefundFailed: 'refund.failed',
  },
  WaffoPancakeError: class extends Error {
    status = 400;
    errors = [];
  },
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    insert: mocks.insert,
    update: mocks.update,
  }),
}));

vi.mock('@/config/website', () => {
  const booker = {
    id: 'booker',
    isFree: false,
    isLifetime: false,
    prices: [
      {
        type: 'subscription',
        priceId: 'PROD_monthly',
        amount: 990,
        currency: 'USD',
        interval: 'month',
      },
      {
        type: 'subscription',
        priceId: 'PROD_yearly',
        amount: 9900,
        currency: 'USD',
        interval: 'year',
      },
    ],
  };
  const lifetime = {
    id: 'lifetime',
    isFree: false,
    isLifetime: true,
    prices: [
      {
        type: 'one_time',
        priceId: 'PROD_lifetime',
        amount: 19900,
        currency: 'USD',
      },
    ],
  };
  return { websiteConfig: { price: { plans: { booker, lifetime } } } };
});

vi.mock('@/notification', () => ({
  sendPaymentNotification: mocks.sendPaymentNotification,
}));

import { WaffoProvider } from '@/payment/provider/waffo';
import { WebhookVerificationError } from '@/payment/errors';

function event(
  eventType: string,
  data: Record<string, unknown>,
  mode: 'test' | 'prod' = 'test'
) {
  return {
    id: `delivery_${eventType}`,
    eventId: `event_${eventType}`,
    eventType,
    mode,
    data: {
      orderId: 'ORD_test',
      buyerEmail: 'buyer@example.com',
      currency: 'USD',
      amount: '9.90',
      taxAmount: '0.00',
      productName: 'Pro',
      ...data,
    },
  };
}

describe('Waffo provider boundary', () => {
  beforeEach(() => {
    process.env.WAFFO_MERCHANT_ID = 'MER_test';
    process.env.WAFFO_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----';
    mocks.createCheckout.mockReset();
    mocks.verifyWebhook.mockReset();
    mocks.insert.mockReset();
    mocks.update.mockReset();
    mocks.values.mockReset();
    mocks.set.mockReset();
    mocks.where.mockReset();
    mocks.returning.mockReset();
    mocks.sendPaymentNotification.mockReset();

    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.values.mockResolvedValue(undefined);
    mocks.returning.mockResolvedValue([
      { userId: 'user_123', priceId: 'PROD_monthly' },
    ]);
    mocks.createCheckout.mockResolvedValue({
      checkoutUrl: 'https://pancake.waffo.ai/checkout/CHK_test',
      sessionId: 'CHK_test',
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
  });

  test('creates an authenticated checkout with metadata and a unique order reference', async () => {
    const provider = new WaffoProvider();

    await expect(
      provider.createCheckout({
        planId: 'booker',
        priceId: 'PROD_monthly',
        customerEmail: 'buyer@example.com',
        successUrl: 'https://example.com/payment?checkout_id=ref',
        metadata: { userId: 'user_123', userName: 'Buyer' },
      })
    ).resolves.toEqual({
      id: 'CHK_test',
      url: 'https://pancake.waffo.ai/checkout/CHK_test',
    });

    expect(mocks.createCheckout).toHaveBeenCalledWith({
      buyerIdentity: 'user_123',
      buyerEmail: 'buyer@example.com',
      currency: 'USD',
      metadata: {
        userId: 'user_123',
        userName: 'Buyer',
        planId: 'booker',
        priceId: 'PROD_monthly',
      },
      orderMerchantExternalId: expect.any(String),
      productId: 'PROD_monthly',
      successUrl: 'https://example.com/payment?checkout_id=ref',
    });

    const [args] = mocks.createCheckout.mock.calls[0];
    expect(args.orderMerchantExternalId).not.toBe('user_123');
    expect(args.orderMerchantExternalId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test('maps locale and theme to the hosted checkout', async () => {
    const provider = new WaffoProvider();

    await provider.createCheckout({
      planId: 'booker',
      priceId: 'PROD_monthly',
      customerEmail: 'buyer@example.com',
      locale: 'zh',
      theme: 'dark',
      metadata: { userId: 'user_123' },
    });

    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh-Hans', darkMode: true })
    );

    mocks.createCheckout.mockClear();
    await provider.createCheckout({
      planId: 'booker',
      priceId: 'PROD_monthly',
      customerEmail: 'buyer@example.com',
      locale: 'en',
      theme: 'light',
      metadata: { userId: 'user_123' },
    });

    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en', darkMode: false })
    );
  });

  test('records a lifetime order and carries the webhook order reference', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('order.completed', {
        orderId: 'ORD_lifetime',
        paymentId: 'PAY_lifetime',
        orderMerchantExternalId: 'checkout_ref',
        orderMetadata: {
          planId: 'lifetime',
          priceId: 'PROD_lifetime',
          userId: 'user_123',
        },
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ORD_lifetime',
        invoiceId: 'PAY_lifetime',
        sessionId: 'checkout_ref',
        scene: 'lifetime',
        status: 'completed',
        paid: true,
        userId: 'user_123',
      })
    );
    expect(mocks.sendPaymentNotification).toHaveBeenCalled();
  });

  test('rejects an unknown product so the provider can retry after configuration is fixed', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('order.completed', {
        orderId: 'ORD_unknown',
        paymentId: 'PAY_unknown',
        orderMetadata: {
          priceId: 'PROD_unknown',
          userId: 'user_123',
        },
      })
    );

    await expect(
      new WaffoProvider().handleWebhookEvent('{}', 'signed')
    ).rejects.toThrow();

    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.sendPaymentNotification).not.toHaveBeenCalled();
  });

  test('inserts an active subscription', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('subscription.activated', {
        orderId: 'ORD_subscription',
        paymentId: 'PAY_subscription',
        orderStatus: 'active',
        billingPeriod: 'monthly',
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        orderMetadata: {
          planId: 'booker',
          priceId: 'PROD_monthly',
          userId: 'user_123',
        },
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ORD_subscription',
        subscriptionId: 'ORD_subscription',
        interval: 'month',
        status: 'active',
        paid: true,
        type: 'subscription',
      })
    );
  });

  test.each(['subscription.renewed', 'subscription.recovered'])(
    'updates a subscription for %s',
    async (eventType) => {
      mocks.verifyWebhook.mockReturnValue(
        event(eventType, {
          orderId: 'ORD_subscription',
          orderStatus: 'active',
          currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        })
      );

      await new WaffoProvider().handleWebhookEvent('{}', 'signed');

      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          paid: true,
          cancelAtPeriodEnd: false,
        })
      );
    }
  );

  test('marks a successful subscription payment paid without status fields', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('subscription.payment_succeeded', {
        orderId: 'ORD_subscription',
        paymentId: 'PAY_renewal',
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        paid: true,
        cancelAtPeriodEnd: false,
      })
    );
  });

  test('keeps a canceling subscription active until period end', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('subscription.canceling', {
        orderId: 'ORD_subscription',
        orderStatus: 'canceling',
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        paid: true,
        cancelAtPeriodEnd: true,
      })
    );
  });

  test('syncs product and interval when a subscription plan changes', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('subscription.plan_changed', {
        orderId: 'ORD_subscription',
        orderStatus: 'active',
        billingPeriod: 'yearly',
        productMetadata: { priceId: 'PROD_yearly' },
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'PROD_yearly',
        interval: 'year',
        status: 'active',
      })
    );
  });

  test('persists an unconfigured subscription product so access fails closed', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('subscription.plan_changed', {
        orderId: 'ORD_subscription',
        orderStatus: 'active',
        productMetadata: { priceId: 'PROD_unknown' },
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'PROD_unknown' })
    );
  });

  test('rejects an invalid signature as a verification error', async () => {
    mocks.verifyWebhook.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });

    await expect(
      new WaffoProvider().handleWebhookEvent('{}', 'invalid')
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  test('ignores a webhook from the wrong Waffo environment', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event(
        'order.completed',
        {
          orderId: 'ORD_prod',
          paymentId: 'PAY_prod',
          orderMetadata: {
            priceId: 'PROD_lifetime',
            userId: 'user_123',
          },
        },
        'prod'
      )
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('marks a refunded payment as unpaid by payment or order id', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('refund.succeeded', {
        orderId: 'ORD_lifetime',
        paymentId: 'PAY_lifetime',
        refundStatus: 'succeeded',
      })
    );

    await new WaffoProvider().handleWebhookEvent('{}', 'signed');

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ paid: false, updatedAt: expect.any(Date) })
    );
  });

  test('does not fail when a webhook replay hits a unique payment row', async () => {
    mocks.verifyWebhook.mockReturnValue(
      event('order.completed', {
        orderId: 'ORD_duplicate',
        paymentId: 'PAY_duplicate',
        orderMetadata: {
          priceId: 'PROD_lifetime',
          userId: 'user_123',
        },
      })
    );
    mocks.values.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint')
    );

    await expect(
      new WaffoProvider().handleWebhookEvent('{}', 'signed')
    ).resolves.toBeUndefined();
  });

  test('returns the shared hosted portal URL without a customer record', async () => {
    const provider = new WaffoProvider();

    await expect(
      provider.createCustomerPortal({
        customerId: 'user_123',
        returnUrl: 'https://example.com/settings/billing',
      })
    ).resolves.toEqual({
      url: 'https://pancake.waffo.ai/consumer/portal/login',
    });
    expect(provider.requiresCustomerId).toBe(false);
    expect(provider.hostsPostCheckoutPage).toBe(true);
  });

  test('requires the merchant id and private key', () => {
    const previousMerchant = process.env.WAFFO_MERCHANT_ID;
    const previousKey = process.env.WAFFO_PRIVATE_KEY;
    try {
      delete process.env.WAFFO_MERCHANT_ID;
      expect(() => new WaffoProvider()).toThrow(/WAFFO_MERCHANT_ID/);
      process.env.WAFFO_MERCHANT_ID = 'MER_test';
      delete process.env.WAFFO_PRIVATE_KEY;
      expect(() => new WaffoProvider()).toThrow(/WAFFO_PRIVATE_KEY/);
    } finally {
      if (previousMerchant === undefined) {
        delete process.env.WAFFO_MERCHANT_ID;
      } else {
        process.env.WAFFO_MERCHANT_ID = previousMerchant;
      }
      if (previousKey === undefined) {
        delete process.env.WAFFO_PRIVATE_KEY;
      } else {
        process.env.WAFFO_PRIVATE_KEY = previousKey;
      }
    }
  });
});
