import type { ChildProcess } from 'node:child_process';
import {
  loadPaymentEnv,
  sandboxEnv,
  stripeWebhookEnv,
} from './payment-e2e-env';
import { PaymentE2EProcesses } from './payment-e2e-process';

async function main() {
  const port = Number(process.env.STRIPE_E2E_PORT ?? 3119);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
  const runtimeEnv = sandboxEnv(
    'stripe',
    loadPaymentEnv('stripe'),
    port,
    baseURL
  );

  const requiredVariables = [
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY',
    'NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY',
    'NEXT_PUBLIC_STRIPE_PRICE_LIFETIME',
  ] as const;

  for (const variable of requiredVariables) {
    if (!runtimeEnv[variable]) {
      throw new Error(
        `${variable} is required. Use STRIPE_ENV_FILE to load a Stripe sandbox env file or set it in the current environment.`
      );
    }
  }

  if (!runtimeEnv.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    throw new Error(
      'Stripe sandbox E2E refuses to run without an sk_test_ key'
    );
  }

  const processes = new PaymentE2EProcesses();
  const sanitizedOutput = (chunk: Buffer) =>
    chunk
      .toString()
      .replace(/whsec_[A-Za-z0-9_]+/g, '[redacted-webhook-secret]');

  const waitForWebhookSecret = (child: ChildProcess) =>
    new Promise<string>((resolveSecret, reject) => {
      const timeout = setTimeout(() => {
        settled = true;
        reject(new Error('Timed out waiting for Stripe CLI webhook secret'));
      }, 30_000);
      let settled = false;

      const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/whsec_[A-Za-z0-9_]+/);
        process.stdout.write(sanitizedOutput(chunk));
        if (match && !settled) {
          settled = true;
          clearTimeout(timeout);
          resolveSecret(match[0]);
        }
      };

      child.stdout?.on('data', handleChunk);
      child.stderr?.on('data', handleChunk);
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Stripe CLI listener exited early with code ${code}`));
      });
    });

  const listener = processes.start(
    'stripe',
    [
      'listen',
      '--skip-update',
      '--events',
      [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'charge.refunded',
      ].join(','),
      '--forward-to',
      `${baseURL}/api/webhooks/stripe`,
    ],
    {
      env: {
        ...runtimeEnv,
        STRIPE_API_KEY: runtimeEnv.STRIPE_SECRET_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const listenerFailed = () => processes.interrupt('SIGTERM', 1);
  try {
    const webhookSecret = await waitForWebhookSecret(listener);
    console.log('Stripe sandbox listener is ready');

    listener.once('exit', listenerFailed);
    await processes.playwright(
      'stripe',
      stripeWebhookEnv(runtimeEnv, webhookSecret)
    );
  } finally {
    listener.removeListener('exit', listenerFailed);
    await processes.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode ||= 1;
});
