'use client';

import type { PricePlan } from '@/payment/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get price plans with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the price plans in server components, use getAllPricePlans instead.
 * Use this function when showing the pricing table or the billing card to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/price
 *
 * @returns The price plans with translated content
 */
export function usePricePlans(): Record<string, PricePlan> {
  const t = useTranslations('PricePlans');
  const priceConfig = websiteConfig.price;
  const plans: Record<string, PricePlan> = {};

  // Add translated content to each plan
  if (priceConfig.plans.free) {
    plans.free = {
      ...priceConfig.plans.free,
      name: t('free.name'),
      description: t('free.description'),
      features: [
        t('free.features.feature-1'),
        t('free.features.feature-2'),
        t('free.features.feature-3'),
        t('free.features.feature-4'),
      ],
      limits: [
        t('free.limits.limit-1'),
        t('free.limits.limit-2'),
        t('free.limits.limit-3'),
      ],
    };
  }

  if (priceConfig.plans.ringside) {
    plans.ringside = {
      ...priceConfig.plans.ringside,
      name: t('ringside.name'),
      description: t('ringside.description'),
      features: [
        t('ringside.features.feature-1'),
        t('ringside.features.feature-2'),
        t('ringside.features.feature-3'),
        t('ringside.features.feature-4'),
      ],
      limits: [
        t('ringside.limits.limit-1'),
        t('ringside.limits.limit-2'),
        t('ringside.limits.limit-3'),
      ],
    };
  }

  if (priceConfig.plans.booker) {
    plans.booker = {
      ...priceConfig.plans.booker,
      name: t('booker.name'),
      description: t('booker.description'),
      features: [
        t('booker.features.feature-1'),
        t('booker.features.feature-2'),
        t('booker.features.feature-3'),
        t('booker.features.feature-4'),
        t('booker.features.feature-5'),
      ],
      limits: [
        t('booker.limits.limit-1'),
        t('booker.limits.limit-2'),
        t('booker.limits.limit-3'),
      ],
    };
  }

  if (priceConfig.plans.promoter) {
    plans.promoter = {
      ...priceConfig.plans.promoter,
      name: t('promoter.name'),
      description: t('promoter.description'),
      features: [
        t('promoter.features.feature-1'),
        t('promoter.features.feature-2'),
        t('promoter.features.feature-3'),
        t('promoter.features.feature-4'),
        t('promoter.features.feature-5'),
        t('promoter.features.feature-6'),
      ],
      limits: [t('promoter.limits.limit-1'), t('promoter.limits.limit-2')],
    };
  }

  if (priceConfig.plans.annual) {
    plans.annual = {
      ...priceConfig.plans.annual,
      name: t('annual.name'),
      description: t('annual.description'),
      features: [
        t('annual.features.feature-1'),
        t('annual.features.feature-2'),
        t('annual.features.feature-3'),
        t('annual.features.feature-4'),
        t('annual.features.feature-5'),
        t('annual.features.feature-6'),
        t('annual.features.feature-7'),
      ],
      limits: [t('annual.limits.limit-1')],
    };
  }

  return plans;
}
