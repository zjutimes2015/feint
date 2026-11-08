import { websiteConfig } from '@/config/website';
import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';
import type { PaymentProviderName } from './types';
import { WebhookVerificationError } from './errors';

interface PaymentWebhookRouteOptions {
  provider: PaymentProviderName;
  signatureHeader: string;
}

/**
 * Build a provider webhook route with consistent authentication and retry
 * semantics. Only successfully processed events receive a 2xx response.
 */
export function createPaymentWebhookHandler({
  provider,
  signatureHeader,
}: PaymentWebhookRouteOptions) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    if (websiteConfig.payment.provider !== provider) {
      return NextResponse.json(
        { error: `${provider} is not the active payment provider` },
        { status: 404 }
      );
    }

    const payload = await req.text();
    const signature = req.headers.get(signatureHeader) ?? '';

    if (!payload || !signature) {
      console.warn(`${provider} webhook: missing payload or signature`);
      return NextResponse.json(
        { error: 'Missing payload or signature' },
        { status: 400 }
      );
    }

    try {
      await handleWebhookEvent(payload, signature);
      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      console.error(`Error in ${provider} webhook route:`, error);

      if (error instanceof WebhookVerificationError) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 400 }
        );
      }

      // A non-2xx response asks the provider to retry transient processing
      // failures. Handlers must therefore remain idempotent.
      return NextResponse.json(
        { error: 'Webhook handler failed' },
        { status: 500 }
      );
    }
  };
}
