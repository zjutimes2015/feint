# Creem Test Mode payment testing

This directory contains the real Creem Test Mode browser flow in
`creem-sandbox.spec.ts`. It covers monthly and yearly subscriptions, the
Lifetime checkout, declined payments, webhook-backed local payment state, and
scheduled subscription cancellation.

Creem does not provide a local webhook-forwarding CLI in this workflow. Use an
HTTPS tunnel for the local webhook route and configure the endpoint in Creem
Test Mode.

## Manual local testing

The steps below use the normal local development server on port `3000`. Do not
mix Creem Test Mode credentials or product IDs with production values.

### 1. Configure the local environment

Set the following values in the uncommitted `.env` file:

```dotenv
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_PAYMENT_PROVIDER=creem
CREEM_DEBUG=true
CREEM_API_KEY=...
CREEM_WEBHOOK_SECRET=...
NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY=prod_...
NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY=prod_...
NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME=prod_...
```

The product IDs must be Creem Test Mode products. `CREEM_WEBHOOK_SECRET` is
the signing secret for the webhook endpoint configured below. If the database
is new, apply migrations before starting the application:

```bash
pnpm db:migrate
```

### 2. Start the application and a temporary HTTPS tunnel

Start the local server:

```bash
pnpm dev
```

In a second terminal, use an isolated Cloudflared configuration if the machine
already has a Cloudflared setup:

```bash
cloudflared --config /dev/null tunnel \
  --url http://localhost:3000 \
  --no-autoupdate \
  --protocol quic
```

Copy the `https://....trycloudflare.com` URL printed by Cloudflared. The
`--config /dev/null` option prevents the command from reading an existing
`~/.cloudflared/config.yml`. Keep the tunnel running while testing.

### 3. Configure the Creem Test Mode webhook

In the Creem dashboard, switch to Test Mode and add an HTTP webhook endpoint:

```text
https://xxxx.trycloudflare.com/api/webhooks/creem
```

Subscribe the endpoint to the events handled by this project:

- `checkout.completed`
- `subscription.active`
- `subscription.paid`
- `subscription.update`
- `subscription.scheduled_cancel`
- `subscription.canceled`
- `subscription.expired`
- `subscription.past_due`
- `subscription.unpaid`
- `subscription.trialing`
- `subscription.paused`

Copy the endpoint signing secret into `CREEM_WEBHOOK_SECRET` and restart
`pnpm dev` if the value changed. The local route expects the raw request body
and the `creem-signature` header.

### 4. Complete a hosted checkout

Open `http://localhost:3000/pricing`, register or sign in with a test account,
and select a Creem product. Complete the hosted checkout with the following
test details:

| Field | Value |
|---|---|
| Cardholder name | The test user's name |
| Country | United States |
| Address | 123 Market Street |
| State | California |
| City | San Francisco |
| Postal code | 94105 |
| Successful card | `4242 4242 4242 4242` |
| Declined card | `4000 0000 0000 0002` |
| Expiry | Any future date, such as `12/30` |
| CVC | `123` |

For a successful payment, verify that:

1. Creem returns the browser to the local Billing page.
2. The local server receives `POST /api/webhooks/creem` with HTTP 200.
3. Billing shows the active monthly/yearly Pro plan or Lifetime access.
4. The local payment record eventually contains the expected Creem product
   ID. Webhook delivery is asynchronous, so wait before retrying.

For the declined-card case, verify that the hosted checkout fails and no paid
payment record is created locally. Repeat a successful checkout with the yearly
selector and with the Lifetime product.

### 5. Test scheduled cancellation

After completing a subscription, use the supported Creem cancellation flow or
the Creem Test Mode API to schedule cancellation. Confirm that the webhook
updates the local subscription to `cancelAtPeriodEnd=true` while it remains
active until the scheduled end.

## Automated sandbox test

`pnpm e2e:creem` starts an isolated Next.js server on port `3120` through
Playwright and runs this directory's suite. It does not start Cloudflared and
does not register the dashboard webhook automatically.

Before running the suite, expose port `3120` and register the corresponding
`/api/webhooks/creem` URL in Creem Test Mode:

```bash
cloudflared --config /dev/null tunnel \
  --url http://localhost:3120 \
  --no-autoupdate \
  --protocol quic
```

Then run the suite with the local environment or a separate sandbox file:

```bash
CREEM_ENV_FILE=/path/to/sandbox.env pnpm e2e:creem
```

The runner requires `CREEM_DEBUG=true`, a Test Mode API key, the webhook
secret, and the monthly, yearly, and Lifetime Test Mode product IDs. Use
`CREEM_E2E_PORT` to choose another port; the tunnel and webhook URL must use
that same port. To run a subset:

```bash
CREEM_ENV_FILE=/path/to/sandbox.env \
  pnpm e2e:creem -- --grep "monthly subscription"
```

## Troubleshooting

- The checkout uses the wrong product: verify `CREEM_DEBUG=true` and that the
  configured product IDs are from Creem Test Mode.
- Webhook signature verification fails: copy the secret from the current Creem
  Test Mode endpoint, update `CREEM_WEBHOOK_SECRET`, and restart the app.
- The browser succeeds but Billing does not update: keep the tunnel running,
  inspect the webhook delivery status in Creem, and wait for asynchronous
  processing.
- The webhook route returns 404: set `NEXT_PUBLIC_PAYMENT_PROVIDER=creem` and
  restart the local server.

Never commit `.env`, Creem API keys, or webhook secrets.

Environment precedence: shell variables override the explicit provider env file
(`CREEM_ENV_FILE`), which overrides project `.env*` defaults.
Product IDs accept `NEXT_PUBLIC_*` and `VITE_*` aliases; aliases are resolved
within each source before falling back to another source. An explicit empty
value remains empty and fails required-variable validation. The launcher forces
the local base URL, auth fixture secrets and E2E mode. Interrupting it cleans
Playwright and its local server.
