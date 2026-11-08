import { WaffoPancake, WebhookEventType } from '@waffo/pancake-ts';
import { config as loadDotenv } from 'dotenv';

/**
 * Register a Waffo HTTP webhook for the current merchant.
 *
 * Usage:
 *   pnpm waffo:setup -- --url https://host.example/api/webhooks/waffo
 *   pnpm waffo:setup -- --store STO_xxx --url https://host.example/api/webhooks/waffo
 *   pnpm waffo:setup -- --store STO_xxx --url https://host.example/api/webhooks/waffo --prod
 *
 * Test mode is the default. Re-running the same store/channel/url/mode is
 * safe because Waffo deduplicates that registration tuple.
 */

async function main() {
  loadDotenv({ path: process.env.WAFFO_ENV_FILE ?? '.env' });

  const DEFAULT_EVENTS = [
    WebhookEventType.OrderCompleted,
    WebhookEventType.SubscriptionActivated,
    WebhookEventType.SubscriptionPaymentSucceeded,
    WebhookEventType.SubscriptionRenewed,
    WebhookEventType.SubscriptionRecovered,
    WebhookEventType.SubscriptionPlanChanged,
    WebhookEventType.SubscriptionCanceling,
    WebhookEventType.SubscriptionUncanceled,
    WebhookEventType.SubscriptionCanceled,
    WebhookEventType.SubscriptionPastDue,
    WebhookEventType.RefundSucceeded,
    WebhookEventType.RefundFailed,
  ];

  function readArg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
  }

  let storeId = readArg('store') ?? process.env.WAFFO_STORE_ID;
  const url = readArg('url');
  const events = (readArg('events') ?? DEFAULT_EVENTS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const testMode = !process.argv.includes('--prod');

  if (!url) {
    throw new Error('Missing --url <WEBHOOK_URL>');
  }

  const merchantId = process.env.WAFFO_MERCHANT_ID;
  const privateKey = process.env.WAFFO_PRIVATE_KEY;
  if (!merchantId) throw new Error('WAFFO_MERCHANT_ID is not set');
  if (!privateKey) throw new Error('WAFFO_PRIVATE_KEY is not set');

  const client = new WaffoPancake({ merchantId, privateKey });
  if (!storeId) {
    const storesResult = await client.graphql.query<{
      stores: Array<{ id: string; name: string }>;
    }>({
      query: 'query { stores { id name } }',
    });
    const stores = storesResult.data?.stores ?? [];
    if (stores.length !== 1) {
      throw new Error(
        `Could not select one Waffo store automatically (found ${stores.length}); pass --store STO_xxx or set WAFFO_STORE_ID`
      );
    }
    storeId = stores[0].id;
  }

  const result = await client.webhooks.add({
    storeId,
    channel: 'http',
    url,
    events: events as `${import('@waffo/pancake-ts').WebhookEventType}`[],
    testMode,
  });

  console.log(
    `Registered Waffo ${testMode ? 'test' : 'production'} webhook ${result.webhook.id}`
  );
  console.log(`  store:  ${storeId}`);
  console.log(`  url:    ${url}`);
  console.log(`  events: ${events.join(', ')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
