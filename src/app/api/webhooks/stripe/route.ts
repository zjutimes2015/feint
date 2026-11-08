import { createPaymentWebhookHandler } from '@/payment/webhook-route';

/**
 * Stripe webhook handler
 * This endpoint receives webhook events from Stripe and processes them
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export const POST = createPaymentWebhookHandler({
  provider: 'stripe',
  signatureHeader: 'stripe-signature',
});
