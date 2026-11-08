import { loadPaymentEnv, sandboxEnv } from './payment-e2e-env';
import { PaymentE2EProcesses } from './payment-e2e-process';

async function main() {
  const port = Number(process.env.CREEM_E2E_PORT ?? 3120);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
  const runtimeEnv = sandboxEnv(
    'creem',
    loadPaymentEnv('creem'),
    port,
    baseURL
  );
  runtimeEnv.CREEM_DEBUG ??= 'true';

  const requiredVariables = [
    'CREEM_API_KEY',
    'CREEM_WEBHOOK_SECRET',
    'NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY',
    'NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY',
    'NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME',
  ] as const;

  for (const variable of requiredVariables) {
    if (!runtimeEnv[variable]) {
      throw new Error(
        `${variable} is required. Use CREEM_ENV_FILE to load a Creem sandbox env file or set it in the current environment.`
      );
    }
  }

  if (runtimeEnv.CREEM_DEBUG !== 'true') {
    throw new Error(
      'Creem sandbox E2E requires CREEM_DEBUG=true and a test-mode API key'
    );
  }

  console.log(
    'Creem E2E prerequisites (the local Next.js server starts automatically):'
  );
  console.log(`  1. HTTPS tunnel → http://localhost:${port}`);
  console.log(
    `     (for example: cloudflared --config /dev/null tunnel --url http://localhost:${port} --no-autoupdate --protocol quic)`
  );
  console.log(
    '  2. Creem Dashboard Test Mode: webhook → <tunnel>/api/webhooks/creem'
  );
  console.log(
    '     subscribed to checkout.completed, subscription.active, subscription.paid, subscription.update, subscription.scheduled_cancel, subscription.canceled, subscription.expired, subscription.past_due, subscription.unpaid, subscription.trialing, subscription.paused'
  );
  console.log(`Playwright base URL: ${baseURL}`);
  console.log('');

  const processes = new PaymentE2EProcesses();
  try {
    await processes.playwright('creem', runtimeEnv);
  } finally {
    await processes.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode ||= 1;
});
