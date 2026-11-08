'use server';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { userActionClient } from '@/lib/safe-action';
import { PaymentScenes } from '@/payment/types';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

const checkPaymentCompletionSchema = z.object({
  sessionId: z.string(),
});

/**
 * Check if a payment is completed for the given session ID.
 */
export const checkPaymentCompletionAction = userActionClient
  .inputSchema(checkPaymentCompletionSchema)
  .action(async ({ parsedInput: { sessionId }, ctx }) => {
    try {
      const db = await getDb();
      const paidPayment = await db
        .select({ id: payment.id })
        .from(payment)
        .where(
          and(
            eq(payment.sessionId, sessionId),
            eq(payment.userId, ctx.user.id),
            eq(payment.paid, true),
            inArray(payment.scene, [
              PaymentScenes.LIFETIME,
              PaymentScenes.SUBSCRIPTION,
            ])
          )
        )
        .limit(1);

      const isPaid = paidPayment.length > 0;
      console.log('Check payment completion, isPaid:', isPaid);

      return {
        success: true,
        isPaid,
      };
    } catch (error) {
      console.error('Check payment completion error:', error);
      return {
        success: false,
        error: 'Failed to check payment completion',
      };
    }
  });
