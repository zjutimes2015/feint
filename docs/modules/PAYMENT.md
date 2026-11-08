# Payment Module

The template supports Pro subscriptions and one-time Lifetime purchases through
Stripe, Creem, or Waffo. Select the provider with
`NEXT_PUBLIC_PAYMENT_PROVIDER` (default: `stripe`). Plans and prices are defined
in `src/config/website.tsx`.

| Plan | Payment type | Scene |
| --- | --- | --- |
| Pro monthly/yearly | `subscription` | `subscription` |
| Lifetime | `one_time` | `lifetime` |

Free requires no payment. `src/lib/price-plan.ts` validates the selected plan and
price before checkout. Keep disabled plans/prices configured while existing
customers need their billing history and subscriptions recognized.

## Routes and actions

- `/pricing`: plans and checkout buttons.
- `/payment`: payment confirmation and Billing refresh.
- `/settings/billing`: current plan and billing portal.
- `createCheckoutAction`: authenticated checkout with localized return URLs.
- `createPortalAction`: authenticated access to the provider's billing portal.
- `getCurrentPlanAction`: Lifetime, active/trialing subscription, or Free.
- `checkPaymentCompletionAction`: payment polling scoped to the current user.

Actions are in `src/actions/`. The provider interface and factory are in
`src/payment/`; implementations are in `src/payment/provider/`. Payment records
are stored in the shared `payment` table in `src/db/app.schema.ts`.

The checkout action derives the buyer's identity from the session. Client
metadata accepts `promotekit_referral` and `affonso_referral`; Datafast
attribution is read from cookies when enabled. Providers set `planId` and
`priceId` from the validated checkout parameters.

Checkout success/cancel URLs and Customer Portal return URLs are resolved
against `NEXT_PUBLIC_BASE_URL`; request `Host` and `Origin` headers are not
trusted. Root-relative and canonical same-origin absolute URLs are accepted.
Protocol-relative URLs, subdomains, protocol changes, and non-equivalent ports
are rejected. URL parsing treats explicit default ports as the same origin.
The payment page reduces an accepted callback to its internal path before
client navigation and falls back to Billing for an unsafe callback.

Payment completion lookups always combine the supplied checkout session ID
with the authenticated user ID. Another user's session and forged or unknown
session IDs all return the same unpaid result, while the owner can observe the
paid state.

## Provider setup

Create Pro monthly, Pro yearly, and Lifetime products in the selected provider,
then configure the variables in `env.example`:

| Provider | Server credentials | Public price/product IDs |
| --- | --- | --- |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `NEXT_PUBLIC_STRIPE_PRICE_{PRO_MONTHLY,PRO_YEARLY,LIFETIME}` |
| Creem | `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` | `NEXT_PUBLIC_CREEM_PRODUCT_{PRO_MONTHLY,PRO_YEARLY,LIFETIME}` |
| Waffo | `WAFFO_MERCHANT_ID`, `WAFFO_PRIVATE_KEY` | `NEXT_PUBLIC_WAFFO_PRODUCT_{PRO_MONTHLY,PRO_YEARLY,LIFETIME}` |

Apply pending PostgreSQL migrations with `pnpm db:migrate`. Configure the
provider's webhook as `https://your-domain.com/api/webhooks/{provider}`. Each
endpoint verifies signatures and accepts events only for the configured
provider.

### Stripe

Checkout returns through `/payment?session_id={CHECKOUT_SESSION_ID}`.
`checkout.session.completed` creates a pending payment record. `invoice.paid` is
the authoritative paid transition, even when Checkout reports
`payment_status=paid`. The confirmation page polls that record and refreshes
Billing.

Stripe does not guarantee event order. When `invoice.paid` arrives before
Checkout, the handler reconstructs the local record from Stripe instead of
waiting inside the webhook request:

- subscriptions resolve the Subscription and its Checkout Session;
- Lifetime invoices resolve their PaymentIntent and Checkout Session.

The reconstructed Checkout Session supplies the original user, price, and
session metadata. The invoice unique constraint and session lookup make the
flow idempotent when Checkout and Invoice handlers run concurrently. PostgreSQL
unique violations (`23505`) are recognized through Drizzle's nested error
causes, then the winning row is reloaded so paid state wins the race. Lifetime
notifications are sent only by the handler whose conditional update atomically
performs the unpaid-to-paid transition.

Subscription events synchronize the price, billing period, trial, status, and
cancellation. Renewals and Customer Portal price changes update the existing
subscription row, including `priceId`, interval, `periodStart`, and `periodEnd`.
Customer Portal supports subscription and payment-method management.

Lifetime payment notifications are sent once on the transition to paid. A full
`charge.refunded` event cancels the matching Lifetime order by invoice or checkout
session. Partial refunds retain access. Replayed paid invoices cannot reactivate
a refunded order.

Invalid signatures receive HTTP 400. Processing failures receive HTTP 500 so
Stripe can retry; only a completed, idempotent handler receives HTTP 200.
An Invoice-first delivery normally completes on its first attempt. Missing
Stripe recovery data, temporary Stripe API failures, or database failures use
the 500 retry path; the handler never holds the request open waiting for another
webhook.

### Creem

Creem uses product IDs for checkout. Set `CREEM_DEBUG=true` for its test API.
Checkout returns to Billing. `checkout.completed` creates the paid Lifetime or
subscription record; `subscription.paid` updates the existing subscription row.
Status events (`subscription.active`, `update`, `trialing`, `past_due`,
`unpaid`, `paused`, `scheduled_cancel`, `expired`, `canceled`) synchronize
products, periods, and cancellation. `expired` is
treated as recoverable `past_due` until Creem sends `canceled`, while `unpaid`
suspends access. Customer Portal uses the stored Creem customer ID. Invalid
signatures receive HTTP 400 and processing failures receive HTTP 500.

Creem refund events are not handled automatically. Reconcile refunded purchases
with the local payment and access state.

### Waffo

Waffo hosts its confirmation page and returns through
`/payment?checkout_id=...`. The server-generated order reference is carried by the
webhook so the confirmation page can poll the corresponding payment before
refreshing Billing.

`order.completed` records Lifetime purchases. Subscription activation, renewal,
updates, and cancellation synchronize the subscription row. Product metadata
should contain `priceId`; it takes precedence over checkout metadata when a
subscription changes products.

`refund.succeeded` cancels the payment matched by its payment/order ID. This
applies to any successful refund, including a partial refund. The shared
consumer portal is `https://pancake.waffo.ai/consumer/portal/login`.

Development accepts test events; production accepts production events unless
`WAFFO_DEBUG=true`. Keep the private key server-only. Configure the webhook with
`pnpm waffo:setup -- --url https://your-domain.com/api/webhooks/waffo`; use
`--store STO_xxx` when the merchant has multiple stores.

## Testing

Unit tests live in `tests/unit/` and run with Vitest (`pnpm test`). Run
`pnpm test:coverage` for provider, webhook-route, checkout, Customer Portal,
return-URL, and price-plan tests with coverage thresholds. Stripe provider tests
cover Checkout-first,
Invoice-first, concurrent insertion, duplicate delivery, and retry-after-failure
sequences. Local `pnpm e2e` uses a dedicated development server and should use a
disposable PostgreSQL database.
Its signed Stripe webhook tests exercise persistence, payment polling, Billing,
and refunds with locally signed events. The Invoice-first recovery test sends a
real Stripe API request with the E2E placeholder key; Stripe rejects it, so the
test needs network access and expects the retryable 5xx path. The other webhook
tests do not contact Stripe. E2E mode skips mail, newsletter, and payment
notifications.

Use `pnpm e2e:stripe`, `pnpm e2e:creem`, or `pnpm e2e:waffo` with separately
configured provider sandboxes to verify hosted checkout and real webhook delivery.
