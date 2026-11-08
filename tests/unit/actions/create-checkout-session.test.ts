import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), checkout: vi.fn() }));
vi.mock('@/lib/server', () => ({ getSession: mocks.session }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));
vi.mock('@/payment', () => ({
  createCheckout: mocks.checkout,
  getPaymentProvider: () => ({ hostsPostCheckoutPage: false }),
}));
import { createCheckoutAction } from '@/actions/create-checkout-session';

describe('authenticated plan checkout action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: 'actual_user', name: 'Buyer', email: 'buyer@example.test' },
    });
    mocks.checkout.mockResolvedValue({
      id: 'checkout_test',
      url: 'https://checkout.example.test',
    });
  });

  test('derives the owner from the session and drops client business metadata', async () => {
    const metadata = {
      userId: 'spoofed_metadata_user',
      planId: 'free',
      priceId: 'forged',
      scene: 'subscription',
      paymentReference: 'forged',
      affonso_referral: 'ref',
    };
    const result = await createCheckoutAction({
      planId: 'annual',
      priceId: 'price_annual_test',
      metadata,
    });
    expect(result?.data?.success).toBe(true);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'buyer@example.test',
        metadata: {
          userId: 'actual_user',
          userName: 'Buyer',
          affonso_referral: 'ref',
        },
      })
    );
  });

  test('requires authentication before checkout', async () => {
    mocks.session.mockResolvedValue(null);
    await createCheckoutAction({
      planId: 'annual',
      priceId: 'price_annual_test',
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  test('rejects a price belonging to a different plan before invoking a provider', async () => {
    const result = await createCheckoutAction({
      planId: 'booker',
      priceId: 'price_annual_test',
    });
    expect(result?.data?.success).toBe(false);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  test.each([
    ['success URL', { successUrl: 'https://attacker.example/paid' }],
    ['cancel URL', { cancelUrl: '//attacker.example/canceled' }],
  ])('rejects an external checkout %s', async (_name, urls) => {
    const result = await createCheckoutAction({
      planId: 'annual',
      priceId: 'price_annual_test',
      ...urls,
    });

    expect(result?.data).toEqual({
      success: false,
      error: 'Payment return URL must use the application origin',
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  test('normalizes trusted checkout return URLs before invoking the provider', async () => {
    const result = await createCheckoutAction({
      planId: 'annual',
      priceId: 'price_annual_test',
      successUrl: '/payment/complete?source=checkout',
      cancelUrl: 'http://localhost:3000/settings/billing',
    });

    expect(result?.data?.success).toBe(true);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: 'http://localhost:3000/payment/complete?source=checkout',
        cancelUrl: 'http://localhost:3000/settings/billing',
      })
    );
  });
});
