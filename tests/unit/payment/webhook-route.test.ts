import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { payment: { provider: 'stripe' } },
  handleWebhookEvent: vi.fn(),
}));

vi.mock('@/config/website', () => ({ websiteConfig: mocks.config }));
vi.mock('@/payment', () => ({
  handleWebhookEvent: mocks.handleWebhookEvent,
}));

import { WebhookVerificationError } from '@/payment/errors';
import { createPaymentWebhookHandler } from '@/payment/webhook-route';

const POST = createPaymentWebhookHandler({
  provider: 'stripe',
  signatureHeader: 'stripe-signature',
});

function request(body = '{}', signature = 'signed') {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: signature ? { 'stripe-signature': signature } : undefined,
  });
}

describe('payment webhook route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.payment.provider = 'stripe';
  });

  test('accepts only the active provider', async () => {
    mocks.config.payment.provider = 'creem';
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.handleWebhookEvent).not.toHaveBeenCalled();
  });

  test.each([
    ['', 'signed'],
    ['{}', ''],
  ])('rejects a missing payload or signature', async (body, signature) => {
    const response = await POST(request(body, signature));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing payload or signature',
    });
  });

  test('returns success only after processing completes', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.handleWebhookEvent).toHaveBeenCalledWith('{}', 'signed');
  });

  test('rejects invalid signatures without asking the provider to retry', async () => {
    mocks.handleWebhookEvent.mockRejectedValueOnce(
      new WebhookVerificationError('invalid')
    );
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid webhook signature',
    });
  });

  test('returns a retryable failure when processing does not complete', async () => {
    mocks.handleWebhookEvent.mockRejectedValueOnce(new Error('database down'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed' });
  });
});
