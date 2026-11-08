import { createPaymentWebhookHandler } from '@/payment/webhook-route';

/**
 * Creem webhook handler
 *
 * Configure in Creem Dashboard: Settings -> Webhooks -> Add endpoint
 * Endpoint URL: https://your-domain.com/api/webhooks/creem
 * Events: checkout.completed, subscription.paid, subscription.active,
 *         subscription.update, subscription.canceled,
 *         subscription.scheduled_cancel, subscription.expired,
 *         subscription.trialing, subscription.past_due, subscription.unpaid,
 *         subscription.paused
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export const POST = createPaymentWebhookHandler({
  provider: 'creem',
  signatureHeader: 'creem-signature',
});
