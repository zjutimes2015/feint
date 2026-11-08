'use server';

import { userActionClient } from '@/lib/safe-action';
import { unsubscribe } from '@/newsletter';
import { newsletterEmailSchema } from '@/newsletter/schema';

// Create a safe action for newsletter unsubscription
export const unsubscribeNewsletterAction = userActionClient
  .inputSchema(newsletterEmailSchema)
  .action(async ({ parsedInput, ctx }) => {
    const email = ctx.user.email.trim().toLowerCase();
    if (parsedInput.email !== email) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const unsubscribed = await unsubscribe(email);

      if (!unsubscribed) {
        console.error('unsubscribe newsletter error:', email);
        return {
          success: false,
          error: 'Failed to unsubscribe from the newsletter',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('unsubscribe newsletter error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
