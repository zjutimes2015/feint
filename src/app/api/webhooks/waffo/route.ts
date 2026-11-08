import { createPaymentWebhookHandler } from '@/payment/webhook-route';

/**
 * Waffo Pancake webhook handler.
 *
 * Keep the body as raw text: Waffo's RSA-SHA256 signature covers the exact
 * bytes sent by the provider. Configure this endpoint for both test and
 * production webhooks, then let the provider validate the environment.
 */
export const POST = createPaymentWebhookHandler({
  provider: 'waffo',
  signatureHeader: 'x-waffo-signature',
});
