import { loadPaymentEnv, sandboxEnv } from './payment-e2e-env';
import { PaymentE2EProcesses } from './payment-e2e-process';

async function main() {
  const port = Number(process.env.WAFFO_E2E_PORT ?? 3118);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
  const runtimeEnv = sandboxEnv(
    'waffo',
    loadPaymentEnv('waffo'),
    port,
    baseURL
  );

  const requiredVariables = [
    'WAFFO_MERCHANT_ID',
    'WAFFO_PRIVATE_KEY',
    'NEXT_PUBLIC_WAFFO_PRODUCT_PRO_MONTHLY',
    'NEXT_PUBLIC_WAFFO_PRODUCT_PRO_YEARLY',
    'NEXT_PUBLIC_WAFFO_PRODUCT_LIFETIME',
  ] as const;

  for (const variable of requiredVariables) {
    if (!runtimeEnv[variable]) {
      throw new Error(
        `${variable} is required. Use WAFFO_ENV_FILE to load a Waffo sandbox env file or set it in the current environment.`
      );
    }
  }

  console.log('Waffo E2E prerequisites:');
  console.log(`  - Next dev server: ${baseURL}`);
  console.log(
    '  - Public tunnel: point cloudflared/ngrok at the same port and preserve X-Waffo-Signature'
  );
  console.log(
    '  - Waffo test webhook: <tunnel>/api/webhooks/waffo with order, subscription, and refund events'
  );

  const processes = new PaymentE2EProcesses();
  try {
    await processes.playwright('waffo', runtimeEnv);
  } finally {
    await processes.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode ||= 1;
});
