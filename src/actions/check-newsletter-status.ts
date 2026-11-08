'use server';

import { userActionClient } from '@/lib/safe-action';
import { isSubscribed } from '@/newsletter';
import { newsletterEmailSchema } from '@/newsletter/schema';

// Create a safe action to check if a user is subscribed to the newsletter
export const checkNewsletterStatusAction = userActionClient
  .inputSchema(newsletterEmailSchema)
  .action(async ({ parsedInput, ctx }) => {
    const email = ctx.user.email.trim().toLowerCase();
    if (parsedInput.email !== email) {
      return { success: false, subscribed: false, error: 'Unauthorized' };
    }

    try {
      const subscribed = await isSubscribed(email);

      return {
        success: true,
        subscribed,
      };
    } catch (error) {
      console.error('check newsletter status error:', error);
      return {
        success: false,
        subscribed: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
