# Waffo sandbox payment testing

This directory contains the real Waffo sandbox browser flow in
`waffo-sandbox.spec.ts`. It covers monthly and yearly hosted subscriptions,
the Lifetime checkout, Waffo's hosted confirmation page, webhook-backed local
payment persistence, and Billing updates.

Waffo does not provide a local webhook-forwarding CLI in this workflow. The
local application must be exposed through an HTTPS tunnel, and the webhook
must retain the `X-Waffo-Signature` header.

## Manual local testing

The steps below use the normal local development server on port `3000`. Waffo
uses its Test Mode automatically when the app is running in development.

### 1. Configure the local environment

Set the following values in the uncommitted `.env` file:

```dotenv
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_PAYMENT_PROVIDER=waffo

WAFFO_MERCHANT_ID=MER_...
WAFFO_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
NEXT_PUBLIC_WAFFO_PRODUCT_PRO_MONTHLY=PROD_...
NEXT_PUBLIC_WAFFO_PRODUCT_PRO_YEARLY=PROD_...
NEXT_PUBLIC_WAFFO_PRODUCT_LIFETIME=PROD_...
```

The merchant credentials and product IDs must belong to the Waffo sandbox
account. `WAFFO_DEBUG=true` is not required for `pnpm dev`; development mode
expects Test Mode webhook events. If the database is new, apply migrations
before starting the application:

```bash
pnpm db:migrate
```

### 2. Start the application

```bash
pnpm dev
```

Keep this terminal open. The Waffo webhook route is:

```text
http://localhost:3000/api/webhooks/waffo
```

### 3. Start an isolated Cloudflared tunnel

In a second terminal, expose port `3000` with a temporary HTTPS URL:

```bash
cloudflared --config /dev/null tunnel \
  --url http://localhost:3000 \
  --no-autoupdate \
  --protocol quic
```

Copy the `https://....trycloudflare.com` URL printed by Cloudflared. The
`--config /dev/null` option is intentional: it prevents Cloudflared from
loading an existing `~/.cloudflared/config.yml` or named-tunnel settings on
the machine.

Keep this terminal running for the entire checkout. If the temporary URL
changes, register the new webhook URL again.

### 4. Register the Waffo Test Mode webhook

Use the Cloudflared URL together with the Waffo webhook path:

```bash
pnpm waffo:setup -- \
  --url https://xxxx.trycloudflare.com/api/webhooks/waffo
```

The helper loads `.env`, registers a Test Mode HTTP webhook by default, and
subscribes it to the order, subscription, and refund events used by the
provider. If the merchant has more than one store, specify the store ID:

```bash
pnpm waffo:setup -- \
  --store STO_xxx \
  --url https://xxxx.trycloudflare.com/api/webhooks/waffo
```

If the credentials are stored in a separate environment file, point the helper
at that file instead of copying the private key into the current shell:

```bash
WAFFO_ENV_FILE=/path/to/sandbox.env \
  pnpm waffo:setup -- \
  --url https://xxxx.trycloudflare.com/api/webhooks/waffo
```

The registration helper is safe to rerun for the same store, URL, channel,
and mode. Alternatively, create the endpoint manually in the Waffo dashboard
in Test Mode using the same URL. The endpoint must receive the raw request
body and preserve `X-Waffo-Signature`.

### 5. Complete a hosted checkout

Open `http://localhost:3000/pricing`, register or sign in with a test account,
and select a Waffo product. On the hosted Waffo checkout:

1. Click `Continue`.
2. Choose `Credit/Debit Card`.
3. Select the sandbox `Success` test option.
4. Click `Subscribe` for a Pro subscription or `Pay` for the Lifetime plan.
5. Click `Done` on Waffo's confirmation page.
6. Wait for the browser to return to `/payment?checkout_id=...`, which polls
   the webhook-backed payment record and then redirects to Billing.

Verify that:

1. The Cloudflared terminal remains connected and the local server logs a
   `POST` to `/api/webhooks/waffo`.
2. The webhook request is acknowledged with HTTP 200 and includes the
   `X-Waffo-Signature` header.
3. Billing shows the expected active Pro plan or Lifetime access.
4. The subscription interval is monthly or yearly as selected.
5. The local payment record is eventually marked paid. Waffo webhook delivery
   is asynchronous, so allow a few seconds for persistence.

Repeat the flow with the yearly selector and the Lifetime product to cover all
three sandbox scenarios. The Waffo customer portal is a shared hosted URL;
the local flow does not require a Stripe-style customer ID.

## Automated sandbox test

`pnpm e2e:waffo` starts its own isolated Next.js server through Playwright. It
defaults to port `3118`, prints the tunnel and webhook prerequisites, and runs
this directory's suite. The runner does **not** start Cloudflared and does not
register the Waffo webhook for you.

For the automated port, start the same isolated tunnel against `3118` instead
of `3000`:

```bash
cloudflared --config /dev/null tunnel \
  --url http://localhost:3118 \
  --no-autoupdate \
  --protocol quic
```

Register the printed tunnel URL with `/api/webhooks/waffo`, then run the suite
with the sandbox environment file if needed:

```bash
WAFFO_ENV_FILE=/path/to/sandbox.env pnpm e2e:waffo
```

The suite covers monthly, yearly, and Lifetime checkout. Use
`WAFFO_E2E_PORT` to choose another port; the tunnel must target the same port.
You can pass Playwright arguments after `--`, for example:

```bash
WAFFO_ENV_FILE=/path/to/sandbox.env \
  pnpm e2e:waffo -- --grep "monthly subscription"
```

Do not leave a manual tunnel pointed at port `3000` and assume it will receive
the automated webhooks. The automated server and tunnel must use the same
port.

## Troubleshooting

- The webhook URL returns 404: set `NEXT_PUBLIC_PAYMENT_PROVIDER=waffo` and
  restart the local server.
- Waffo reports an invalid or missing signature: use an HTTPS tunnel that
  preserves `X-Waffo-Signature`; do not parse and recreate the request body.
- The helper cannot find a store: pass `--store STO_xxx` or set
  `WAFFO_STORE_ID`.
- The checkout succeeds but Billing stays unchanged: keep both the dev server
  and Cloudflared running, verify that the webhook is registered in Test Mode,
  and wait for the asynchronous delivery before retrying.
- A new `trycloudflare.com` URL no longer works: rerun `pnpm waffo:setup` with
  the new URL and the `/api/webhooks/waffo` suffix.

Never commit `.env` or the Waffo private key.

Environment precedence: shell variables override the explicit provider env file
(`WAFFO_ENV_FILE`), which overrides project `.env*` defaults.
Product IDs accept `NEXT_PUBLIC_*` and `VITE_*` aliases; aliases are resolved
within each source before falling back to another source. An explicit empty
value remains empty and fails required-variable validation. The launcher forces
the local base URL, auth fixture secrets and E2E mode. Interrupting it cleans
Playwright and its local server.

The automated suite enters sandbox card fields sequentially and checks the
hosted form validity before submission. It avoids the cashier quick-fill
buttons, which can leave subscription checkout waiting without confirmation.
Hosted confirmation allows up to four minutes within a six-minute test budget.
