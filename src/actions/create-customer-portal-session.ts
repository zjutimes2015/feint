'use server';

import { getDb } from '@/db';
import { user } from '@/db/schema';
import { normalizePaymentReturnUrl } from '@/lib/payment-return-url';
import { userActionClient } from '@/lib/safe-action';
import { getUrlWithLocale } from '@/lib/urls';
import { createCustomerPortal, getPaymentProvider } from '@/payment';
import type { CreatePortalParams } from '@/payment/types';
import { eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

// Portal schema for validation
const portalSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
  returnUrl: z.string().trim().min(1).optional(),
});

/**
 * Create a customer portal session
 */
export const createPortalAction = userActionClient
  .inputSchema(portalSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { returnUrl } = parsedInput;
    const currentUser = ctx.user;

    try {
      const provider = getPaymentProvider();
      let customerId = currentUser.id;

      // Waffo uses a shared hosted portal and does not create a merchant-side
      // customer record. Stripe and Creem still require the stored ID.
      if (provider.requiresCustomerId !== false) {
        const db = await getDb();
        const customerResult = await db
          .select({ customerId: user.customerId })
          .from(user)
          .where(eq(user.id, currentUser.id))
          .limit(1);

        if (customerResult.length <= 0 || !customerResult[0].customerId) {
          console.error(`No customer found for user ${currentUser.id}`);
          return {
            success: false,
            error: 'No customer found for user',
          };
        }
        customerId = customerResult[0].customerId;
      }

      // Get the current locale from the request
      const locale = await getLocale();

      // Create the portal session with localized URL if no custom return URL is provided
      const returnUrlWithLocale =
        normalizePaymentReturnUrl(returnUrl) ??
        getUrlWithLocale('/settings/billing', locale);
      const params: CreatePortalParams = {
        customerId,
        returnUrl: returnUrlWithLocale,
        locale,
      };

      const result = await createCustomerPortal(params);
      // console.log('create customer portal result:', result);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('create customer portal error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
