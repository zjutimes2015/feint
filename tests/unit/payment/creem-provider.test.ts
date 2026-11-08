import { createHmac } from 'node:crypto';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  portal: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  notification: vi.fn(),
}));
vi.mock('creem', () => ({
  Creem: class {
    checkouts = { create: mocks.checkout };
    customers = { generateBillingLinks: mocks.portal };
  },
}));
vi.mock('@/db', () => ({ getDb: () => mocks }));
vi.mock('@/notification', () => ({
  sendPaymentNotification: mocks.notification,
}));
import { CreemProvider } from '@/payment/provider/creem';
import { WebhookVerificationError } from '@/payment/errors';

const secret = 'creem_local_webhook_secret';
const date = '2026-09-01T00:00:00.000Z';
const customer = {
  id: 'cus_creem',
  mode: 'test',
  object: 'customer',
  email: 'buyer@example.test',
  country: 'US',
  created_at: date,
  updated_at: date,
};
function product(recurring = false, id?: string) {
  return {
    id: id ?? 'price_annual_test',
    mode: 'test',
    object: 'product',
    name: 'Plan',
    description: 'Test plan',
    price: recurring ? 990 : 19900,
    currency: 'USD',
    billing_type: recurring ? 'recurring' : 'recurring',
    billing_period: recurring ? 'every-month' : 'every-year',
    status: 'active',
    tax_mode: 'inclusive',
    tax_category: 'saas',
    created_at: date,
    updated_at: date,
  };
}
function subscription() {
  return {
    id: 'sub_creem',
    mode: 'test',
    object: 'subscription',
    customer,
    product: product(true),
    collection_method: 'charge_automatically',
    status: 'active',
    current_period_start_date: date,
    current_period_end_date: '2026-10-01T00:00:00.000Z',
    created_at: date,
    updated_at: date,
  };
}
function checkout(recurring = false, id?: string) {
  return {
    id: 'chk_creem',
    mode: 'test',
    object: 'checkout',
    status: 'completed',
    product: product(recurring, id),
    customer,
    metadata: { userId: 'user_creem', userName: 'Buyer' },
    ...(recurring ? { subscription: subscription() } : {}),
  };
}
async function dispatch(type: string, object: object) {
  const payload = JSON.stringify({
    id: 'evt_creem',
    eventType: type,
    created_at: Date.now(),
    object,
  });
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  await new CreemProvider().handleWebhookEvent(payload, signature);
}

describe('Creem payment lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CREEM_API_KEY = 'creem_test_key';
    process.env.CREEM_WEBHOOK_SECRET = secret;
    process.env.CREEM_DEBUG = 'true';
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'payment_creem' }]);
    const chain = { where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
    chain.where.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.limit.mockResolvedValue([{ id: 'payment_creem' }]);
    mocks.select.mockReturnValue({ from: () => chain });
    mocks.checkout.mockResolvedValue({
      id: 'chk_creem',
      checkoutUrl: 'https://checkout.creem.io/local',
    });
  });

  test.each([false, true])(
    'accepts a replay with a Drizzle-wrapped unique conflict (recurring=%s)',
    async (recurring) => {
      await dispatch('checkout.completed', checkout(recurring));
      const cause = Object.assign(new Error('Database conflict'), {
        code: '23505',
      });
      mocks.values.mockRejectedValueOnce(
        new DrizzleQueryError('insert into payment', [], cause)
      );

      await expect(
        dispatch('checkout.completed', checkout(recurring))
      ).resolves.toBeUndefined();
      // 两条分支都已改为订阅商品(annual),订阅路径不发送一次性付款通知
      expect(mocks.notification).not.toHaveBeenCalled();
    }
  );

  test.each([false, true])(
    'propagates other wrapped database failures for retry (recurring=%s)',
    async (recurring) => {
      const cause = Object.assign(new Error('Database unavailable'), {
        code: '08006',
      });
      mocks.values.mockRejectedValueOnce(
        new DrizzleQueryError('insert into payment', [], cause)
      );

      await expect(
        dispatch('checkout.completed', checkout(recurring))
      ).rejects.toThrow('Failed to handle Creem webhook event');
      expect(mocks.notification).not.toHaveBeenCalled();
    }
  );

  test('validates checkout prices and sets plan metadata', async () => {
    const provider = new CreemProvider();
    await provider.createCheckout({
      planId: 'annual',
      priceId: 'price_annual_test',
      customerEmail: customer.email,
      metadata: {
        userId: 'user_creem',
        affonso_referral: 'ref',
        planId: 'free',
      },
    });
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'price_annual_test',
        metadata: {
          userId: 'user_creem',
          affonso_referral: 'ref',
          planId: 'annual',
          priceId: 'price_annual_test',
        },
      })
    );
    mocks.checkout.mockClear();
    await expect(
      provider.createCheckout({
        planId: 'booker',
        priceId: 'price_annual_test',
        customerEmail: customer.email,
      })
    ).rejects.toThrow();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  test('records a paid annual checkout and sends a payment notification', async () => {
    await dispatch('checkout.completed', checkout());
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription',
        scene: 'subscription',
        interval: 'year',
        paid: true,
        priceId: 'price_annual_test',
        userId: 'user_creem',
      })
    );
    // 订阅路径不触发一次性付款通知
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  test('rejects an unknown product so the provider can retry after configuration is fixed', async () => {
    await expect(
      dispatch('checkout.completed', {
        ...checkout(false, 'product_unknown'),
        metadata: {
          userId: 'user_creem',
        },
      })
    ).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  test('records an initial subscription and updates the same row on renewal', async () => {
    await dispatch('checkout.completed', checkout(true));
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription',
        scene: 'subscription',
        paid: true,
        subscriptionId: 'sub_creem',
        interval: 'month',
      })
    );
    mocks.insert.mockClear();
    await dispatch('subscription.paid', subscription());
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'active',
        paid: true,
        periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      })
    );
  });

  test.each([
    ['subscription.scheduled_cancel', { cancelAtPeriodEnd: true }],
    ['subscription.canceled', { status: 'canceled' }],
    ['subscription.expired', { status: 'past_due' }],
    ['subscription.past_due', { status: 'past_due' }],
    ['subscription.unpaid', { status: 'unpaid' }],
    ['subscription.paused', { status: 'paused' }],
    ['subscription.trialing', { status: 'trialing', paid: true }],
    ['subscription.active', { status: 'active', paid: true }],
  ])('synchronizes %s', async (eventType, expected) => {
    await dispatch(eventType, subscription());
    expect(mocks.set).toHaveBeenLastCalledWith(
      expect.objectContaining(expected)
    );
  });

  test('persists an unconfigured subscription product so access fails closed', async () => {
    await dispatch('subscription.update', {
      ...subscription(),
      product: product(true, 'product_unknown'),
    });
    expect(mocks.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ priceId: 'product_unknown' })
    );
  });

  test('rejects invalid webhook signatures before writing data', async () => {
    await expect(
      new CreemProvider().handleWebhookEvent('{}', 'invalid')
    ).rejects.toBeInstanceOf(WebhookVerificationError);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('opens the billing portal using the stored customer ID', async () => {
    mocks.portal.mockResolvedValue({
      customerPortalLink: 'https://creem.io/customer/test',
    });
    await expect(
      new CreemProvider().createCustomerPortal({ customerId: 'cus_creem' })
    ).resolves.toEqual({ url: 'https://creem.io/customer/test' });
    expect(mocks.portal).toHaveBeenCalledWith({ customerId: 'cus_creem' });
  });
});
