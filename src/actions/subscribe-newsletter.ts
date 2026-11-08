'use server';

import { websiteConfig } from '@/config/website';
import { actionClient } from '@/lib/safe-action';
import { sendEmail } from '@/mail';
import { subscribe } from '@/newsletter';
import { newsletterEmailSchema } from '@/newsletter/schema';
import { getLocale } from 'next-intl/server';
import { after } from 'next/server';

// Resend allows 2 requests per second per API key, and subscribing may have
// just used up to two of them, so the welcome email waits before sending.
const WELCOME_EMAIL_DELAY_MS = 3000;

// Create a safe action for newsletter subscription
export const subscribeNewsletterAction = actionClient
  .inputSchema(newsletterEmailSchema)
  .action(async ({ parsedInput: { email } }) => {
    // Do not check if the user is authenticated here
    try {
      const subscribed = await subscribe(email);

      if (!subscribed) {
        console.error('subscribe newsletter error:', email);
        return {
          success: false,
          error: 'Failed to subscribe to the newsletter',
        };
      }

      // Send the welcome email after the response so the user does not wait
      // for the delay; failures are logged and do not affect the subscription.
      if (!websiteConfig.mail.enable) {
        return { success: true };
      }
      const locale = await getLocale();
      after(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, WELCOME_EMAIL_DELAY_MS)
        );
        const result = await sendEmail({
          to: email,
          template: 'subscribeNewsletter',
          context: {
            email,
          },
          locale,
        });
        if (!result.success) {
          console.error('newsletter welcome email error:', result.error);
        }
      });

      return {
        success: true,
      };
    } catch (error) {
      console.error('subscribe newsletter error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
