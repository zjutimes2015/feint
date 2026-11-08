# Stripe sandbox payment testing

This directory contains the real Stripe Test Mode browser flow in
`stripe-sandbox.spec.ts`. It exercises checkout, Stripe webhook delivery, the
local payment record, subscription cancellation, Customer Portal access, and
Lifetime refunds.

## Manual local testing

The steps below use the normal local development server on port `3000`. Use
Stripe Test Mode only; do not use live keys or live Price IDs.

### 1. Configure the local environment

Set the following values in the uncommitted `.env` file:

```dotenv
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_PAYMENT_PROVIDER=stripe

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_LIFETIME=price_...
```

The three Price IDs must belong to the same Stripe Test Mode account as
`STRIPE_SECRET_KEY`. If the database is new, apply the project migrations
before starting the application:

```bash
pnpm db:migrate
```

### 2. Start the application

From the repository root, start the local server:

```bash
pnpm dev
```

Keep this terminal open. The local webhook endpoint is:

```text
http://localhost:3000/api/webhooks/stripe
```

### 3. Forward Stripe webhooks with Stripe CLI

Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and authenticate
it once for the same Test Mode account:

```bash
stripe login
```

In a second terminal, start a listener that forwards all events used by the
application to the local webhook route:

```bash
stripe listen \
  --skip-update \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,charge.refunded \
  --forward-to http://localhost:3000/api/webhooks/stripe
```

The CLI prints a webhook signing secret similar to `whsec_...`. Put that value
in `.env` as `STRIPE_WEBHOOK_SECRET` and restart `pnpm dev`. The value printed
by `stripe listen` is the secret that signs forwarded local events; a
Dashboard webhook secret will not validate these CLI-delivered events.

### 4. Complete a checkout in the browser

Open `http://localhost:3000/pricing`, register or sign in with a test account,
and select a plan. Use the following Stripe test card values:

| Scenario | Card number |
|---|---|
| Successful payment | `4242 4242 4242 4242` |
| Declined payment | `4000 0000 0000 9995` |

For a successful payment, use any future expiry date, such as `12/30`, and a
three-digit CVC such as `123`. Verify all of the following:

1. The hosted Stripe Checkout page accepts the payment and returns to
   `/payment?session_id=...`, which polls the local payment record and then
   redirects to Billing.
2. The Stripe CLI terminal shows the forwarded checkout/subscription events
   with a successful response from the local route.
3. The Billing page shows the expected Pro or Lifetime entitlement.
4. The local payment record is eventually marked paid. Webhook delivery is
   asynchronous, so allow a few seconds before deciding that the flow failed.

Stripe may deliver `invoice.paid` before `checkout.session.completed`. The
handler should recover the Checkout Session from Stripe and return HTTP 200 on
that first Invoice delivery. A temporary Stripe API or database failure returns
HTTP 500 so Stripe retries; the handler does not wait inside one request for a
later event.

For the declined-card case, confirm that Checkout displays a decline and that
no paid payment record is created locally.

### 5. Test cancellation and refunds

For a subscription, open the Stripe Customer Portal from the local Billing
page, cancel the test subscription, and watch for
`customer.subscription.updated` and `customer.subscription.deleted` in the
Stripe CLI terminal. Confirm that the local subscription state changes after
the webhook is processed.

For a Lifetime refund, locate the successful Test Mode PaymentIntent in the
Stripe Dashboard and create a full refund, or use the CLI with its PaymentIntent
ID:

```bash
stripe refunds create --payment-intent pi_...
```

The listener must still be running so that `charge.refunded` reaches
`/api/webhooks/stripe`. Confirm that the local Lifetime entitlement is revoked
after the webhook arrives.

## Automated sandbox test

`pnpm e2e:stripe` starts an isolated Next.js server on port `3119`, starts
Stripe CLI itself, captures the CLI webhook signing secret, and runs this
directory's Playwright suite. Do not start a second `stripe listen` manually
for this command.

If the sandbox credentials are stored in a separate environment file, reuse it
without copying secrets into Git:

```bash
STRIPE_ENV_FILE=/path/to/project/.env pnpm e2e:stripe
```

The runner accepts the local `.env` as well. It requires an `sk_test_` key and
the monthly, yearly, and Lifetime Test Mode Price IDs. To run a subset of the
specification, pass Playwright arguments after `--`:

```bash
STRIPE_ENV_FILE=/path/to/project/.env \
  pnpm e2e:stripe -- --grep "monthly subscription"
```

The automated runner uses port `3119` so it can run alongside a normal
development server on port `3000`. Use `STRIPE_E2E_PORT` to select another
isolated port; the runner forwards Stripe webhooks to that same port.

## Troubleshooting

- `No such command: stripe`: install the Stripe CLI and make sure it is on
  `PATH`.
- Webhook signature failures: copy the secret from the currently running
  `stripe listen` process into `STRIPE_WEBHOOK_SECRET`, then restart the app.
- Checkout uses the wrong plan or fails to create a session: check that the
  provider is `stripe` and that all Price IDs are Test Mode IDs from the same
  account as the secret key.
- The browser returns successfully but Billing does not update: keep the CLI
  listener running, inspect its event response, and wait for asynchronous
  webhook processing before retrying.

Never commit `.env`, Stripe secret keys, or webhook signing secrets.

Environment precedence: shell variables override the explicit provider env file
(`STRIPE_ENV_FILE`), which overrides project `.env*` defaults.
Product IDs accept `NEXT_PUBLIC_*` and `VITE_*` aliases; aliases are resolved
within each source before falling back to another source. An explicit empty
value remains empty and fails required-variable validation. The launcher forces
the local base URL, auth fixture secrets and E2E mode. Interrupting it cleans
Playwright and its local server plus the Stripe listener. The listener secret overrides file webhook secrets.
