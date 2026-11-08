import { websiteConfig } from '@/config/website';
import {
  type PaymentType,
  PaymentTypes,
  type Price,
  type PricePlan,
} from '@/payment/types';

/**
 * Get all price plans (without translations, like name/description/features)
 * NOTICE: This function can be used in server or client components.
 * @returns Array of price plans
 */
export const getAllPricePlans = (): PricePlan[] => {
  return Object.values(websiteConfig.price.plans);
};

/**
 * Get plan by plan ID
 * @param planId Plan ID
 * @returns Plan or undefined if not found
 */
export const findPlanByPlanId = (planId: string): PricePlan | undefined => {
  return getAllPricePlans().find((plan) => plan.id === planId);
};

/**
 * Find plan by price ID
 * @param priceId Price ID (Stripe price ID)
 * @returns Plan or undefined if not found
 */
export const findPlanByPriceId = (priceId: string): PricePlan | undefined => {
  const plans = getAllPricePlans();
  for (const plan of plans) {
    const matchingPrice = plan.prices.find(
      (price) => price.priceId === priceId
    );
    if (matchingPrice) {
      return plan;
    }
  }
  return undefined;
};

/**
 * Find price in a plan by ID
 * @param planId Plan ID
 * @param priceId Price ID (Stripe price ID)
 * @returns Price or undefined if not found
 */
export const findPriceInPlan = (
  planId: string,
  priceId: string
): Price | undefined => {
  const plan = findPlanByPlanId(planId);
  if (!plan) {
    console.error(`findPriceInPlan, Plan with ID ${planId} not found`);
    return undefined;
  }
  return plan.prices.find((price) => price.priceId === priceId);
};

function resolvePlanPrice(
  plan: PricePlan | undefined,
  priceId: string | undefined,
  type?: PaymentType
): { plan: PricePlan; price: Price } | undefined {
  if (!plan || !priceId || plan.isFree) return undefined;

  const price = plan.prices.find((item) => item.priceId === priceId);
  if (
    !price ||
    (type && price.type !== type) ||
    plan.isLifetime !== (price.type === PaymentTypes.ONE_TIME)
  ) {
    return undefined;
  }

  return { plan, price };
}

export function getCheckoutPlan(planId: string, priceId: string) {
  const resolved = resolvePlanPrice(findPlanByPlanId(planId), priceId);
  if (!resolved || resolved.plan.disabled || resolved.price.disabled) {
    throw new Error('Price is not available for checkout');
  }
  return resolved;
}

/** Disabled plans and prices remain valid for existing payments. */
export function findPaymentPlan(
  priceId: string | undefined,
  type: PaymentType
): PricePlan | undefined {
  if (!priceId) return undefined;
  return resolvePlanPrice(findPlanByPriceId(priceId), priceId, type)?.plan;
}
