'use server';

import { randomUUID } from 'node:crypto';
import { websiteConfig } from '@/config/website';
import { normalizePaymentReturnUrl } from '@/lib/payment-return-url';
import { getCheckoutPlan } from '@/lib/price-plan';
import { userActionClient } from '@/lib/safe-action';
import { getUrlWithLocale } from '@/lib/urls';
import { createCheckout, getPaymentProvider } from '@/payment';
import type { CreateCheckoutParams } from '@/payment/types';
import { Routes } from '@/routes';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const checkoutSchema = z.object({
  planId: z.string().min(1, { error: 'Plan ID is required' }),
  priceId: z.string().min(1, { error: 'Price ID is required' }),
  metadata: z
    .object({
      promotekit_referral: z.string().max(500).optional(),
      affonso_referral: z.string().max(500).optional(),
    })
    .optional(),
  theme: z.enum(['dark', 'light']).optional(),
  successUrl: z.string().trim().min(1).optional(),
  cancelUrl: z.string().trim().min(1).optional(),
});

/**
 * Create a checkout session for a price plan
 */
export const createCheckoutAction = userActionClient
  .inputSchema(checkoutSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { planId, priceId, metadata, theme, successUrl, cancelUrl } =
      parsedInput;
    const currentUser = ctx.user;

    try {
      // Get the current locale from the request
      const locale = await getLocale();

      getCheckoutPlan(planId, priceId);

      // Add user id to metadata, so we can get it in the webhook event
      const customMetadata: Record<string, string> = {
        ...metadata,
        userId: currentUser.id,
        userName: currentUser.name,
      };

      // https://datafa.st/docs/stripe-checkout-api
      // if datafast analytics is enabled, add the revenue attribution to the metadata
      if (websiteConfig.features.enableDatafastRevenueTrack) {
        const cookieStore = await cookies();
        customMetadata.datafast_visitor_id =
          cookieStore.get('datafast_visitor_id')?.value ?? '';
        customMetadata.datafast_session_id =
          cookieStore.get('datafast_session_id')?.value ?? '';
      }

      // Create the checkout session with localized URLs
      const provider = getPaymentProvider();
      const hostsPostCheckoutPage = provider.hostsPostCheckoutPage === true;
      const paymentReference = hostsPostCheckoutPage ? randomUUID() : undefined;
      const checkoutMetadata: Record<string, string> = {
        ...customMetadata,
        ...(paymentReference ? { paymentReference } : {}),
      };

      // Stripe replaces {CHECKOUT_SESSION_ID} on redirect, then the Payment
      // page polls until the webhook writes the DB record. Waffo hosts its
      // own confirmation page, so it returns through the same page with an
      // order-scoped reference that is carried by the webhook.
      const isCreem = websiteConfig.payment.provider === 'creem';
      const defaultSuccessUrl = hostsPostCheckoutPage
        ? getUrlWithLocale(
            `${Routes.Payment}?checkout_id=${paymentReference}&callback=${encodeURIComponent(Routes.SettingsBilling)}`,
            locale
          )
        : isCreem
          ? getUrlWithLocale(Routes.SettingsBilling, locale)
          : getUrlWithLocale(
              `${Routes.Payment}?session_id={CHECKOUT_SESSION_ID}&callback=${encodeURIComponent(Routes.SettingsBilling)}`,
              locale
            );
      const defaultCancelUrl = getUrlWithLocale(Routes.SettingsBilling, locale);
      const params: CreateCheckoutParams = {
        planId,
        priceId,
        customerEmail: currentUser.email,
        metadata: checkoutMetadata,
        successUrl: normalizePaymentReturnUrl(successUrl) ?? defaultSuccessUrl,
        cancelUrl: normalizePaymentReturnUrl(cancelUrl) ?? defaultCancelUrl,
        locale,
        theme,
      };

      const result = await createCheckout(params);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('create checkout session error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
