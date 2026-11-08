import { websiteConfig } from '@/config/website';
import { PaymentTypes } from '@/payment/types';
import {
  findPaymentPlan,
  getCheckoutPlan,
  findPlanByPlanId,
  findPlanByPriceId,
  findPriceInPlan,
  getAllPricePlans,
} from '@/lib/price-plan';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('pricing catalog', () => {
  test('exposes the configured free, membership, and annual plans', () => {
    expect(getAllPricePlans().map((plan) => plan.id)).toEqual([
      'free',
      'ringside',
      'booker',
      'promoter',
      'annual',
    ]);
    expect(findPlanByPlanId('free')).toMatchObject({
      isFree: true,
    });
  });

  test('finds plans and prices by their public identifiers', () => {
    expect(findPlanByPriceId('price_booker_test')?.id).toBe('booker');
    expect(findPriceInPlan('booker', 'price_booker_test')).toMatchObject({
      amount: 1499,
      interval: 'month',
    });
    expect(findPlanByPriceId('price_missing')).toBeUndefined();
  });

  test('returns no price when the requested plan does not exist', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(findPriceInPlan('missing', 'price_missing')).toBeUndefined();
    expect(error).toHaveBeenCalledOnce();

    error.mockRestore();
  });
});

const initialPlans = websiteConfig.price.plans;
afterEach(() => {
  websiteConfig.price.plans = initialPlans;
});

describe('checkout plan validation', () => {
  test.each(['booker', 'annual'] as const)(
    'requires the payment type to match the %s plan',
    (planId) => {
      const plan = initialPlans[planId];
      const type = plan.isLifetime
        ? PaymentTypes.SUBSCRIPTION
        : PaymentTypes.ONE_TIME;
      const price = { ...plan.prices[0], type };
      websiteConfig.price.plans = {
        ...initialPlans,
        [planId]: { ...plan, prices: [price] },
      };
      expect(() => getCheckoutPlan(planId, price.priceId)).toThrow();
      expect(findPaymentPlan(price.priceId, type)).toBeUndefined();
    }
  );

  test('rejects cross-plan, unknown, empty, and free checkout prices', () => {
    for (const [planId, priceId] of [
      ['booker', 'price_annual_test'],
      ['annual', 'price_unknown'],
      ['annual', ''],
      ['free', 'price_booker_test'],
    ])
      expect(() => getCheckoutPlan(planId, priceId)).toThrow();
    expect(
      findPaymentPlan('price_unknown', PaymentTypes.ONE_TIME)
    ).toBeUndefined();
    expect(
      findPaymentPlan('price_booker_test', PaymentTypes.ONE_TIME)
    ).toBeUndefined();
    expect(
      findPaymentPlan('price_annual_test', PaymentTypes.ONE_TIME)
    ).toBeUndefined();
  });

  test.each(['plan', 'price'])(
    'recognizes existing purchases but rejects a disabled %s for checkout',
    (target) => {
      const annual = initialPlans.annual;
      websiteConfig.price.plans = {
        ...initialPlans,
        annual: {
          ...annual,
          disabled: target === 'plan',
          prices: annual.prices.map((price) => ({
            ...price,
            disabled: target === 'price',
          })),
        },
      };
      expect(() => getCheckoutPlan('annual', 'price_annual_test')).toThrow();
      expect(
        findPaymentPlan('price_annual_test', PaymentTypes.SUBSCRIPTION)
          ?.isLifetime
      ).toBe(false);
    }
  );
});
