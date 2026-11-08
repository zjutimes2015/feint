import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { sendPaymentNotification } from '@/notification';
import { findPaymentPlan, getCheckoutPlan } from '@/lib/price-plan';
import { Creem } from 'creem';
import type {
  CheckoutEntity,
  CustomerEntity,
  ProductEntity,
  SubscriptionEntity,
} from 'creem/models/components';
import {
  CheckoutEntity$inboundSchema,
  SubscriptionEntity$inboundSchema,
} from 'creem/models/components';
import { desc, eq } from 'drizzle-orm';
import { WebhookVerificationError } from '../errors';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreatePortalParams,
  type PaymentProvider,
  PaymentScenes,
  type PaymentStatus,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PortalResult,
} from '../types';

function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && current.code === '23505') return true;
    if (
      current instanceof Error &&
      current.message.includes('unique constraint')
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }

  return false;
}

// ─── Creem Webhook Types ──────────────────────────────────────
// The core SDK does not include webhook types or verification.
// Following the pattern from @creem_io/nextjs, we build normalized
// webhook types from SDK entities. The SDK's Zod inbound schemas
// are used to parse raw snake_case JSON into typed camelCase objects.

/**
 * Subscription entity as it appears in subscription.* webhook events.
 *
 * In webhook payloads, `product` and `customer` are always expanded
 * as full objects (never just ID strings), unlike the SDK's union type.
 */
type WebhookSubscriptionObject = Omit<
  SubscriptionEntity,
  'product' | 'customer'
> & {
  product: ProductEntity;
  customer: CustomerEntity;
  metadata?: Record<string, unknown>;
};

/**
 * Checkout entity as it appears in checkout.completed webhook events.
 *
 * Product and customer are expanded. The nested subscription has
 * product/customer as ID strings (not expanded).
 */
type WebhookCheckoutObject = Omit<
  CheckoutEntity,
  'product' | 'customer' | 'subscription'
> & {
  product: ProductEntity;
  customer: CustomerEntity;
  subscription?: SubscriptionEntity;
};

// ─── Discriminated Union: Webhook Events ─────────────────────

interface CreemCheckoutCompletedEvent {
  id: string;
  eventType: 'checkout.completed';
  created_at: number;
  object: WebhookCheckoutObject;
}

interface CreemSubscriptionEvent<T extends string = string> {
  id: string;
  eventType: T;
  created_at: number;
  object: WebhookSubscriptionObject;
}

type CreemSubscriptionActiveEvent =
  CreemSubscriptionEvent<'subscription.active'>;
type CreemSubscriptionTrialingEvent =
  CreemSubscriptionEvent<'subscription.trialing'>;
type CreemSubscriptionPaidEvent = CreemSubscriptionEvent<'subscription.paid'>;
type CreemSubscriptionCanceledEvent =
  CreemSubscriptionEvent<'subscription.canceled'>;
type CreemSubscriptionScheduledCancelEvent =
  CreemSubscriptionEvent<'subscription.scheduled_cancel'>;
type CreemSubscriptionExpiredEvent =
  CreemSubscriptionEvent<'subscription.expired'>;
type CreemSubscriptionPastDueEvent =
  CreemSubscriptionEvent<'subscription.past_due'>;
type CreemSubscriptionUnpaidEvent =
  CreemSubscriptionEvent<'subscription.unpaid'>;
type CreemSubscriptionPausedEvent =
  CreemSubscriptionEvent<'subscription.paused'>;
type CreemSubscriptionUpdateEvent =
  CreemSubscriptionEvent<'subscription.update'>;

// ─── Creem Provider Implementation ───────────────────────────

/**
 * Creem payment provider implementation
 *
 * Uses the official Creem TypeScript SDK (`creem` npm package)
 * for API calls (checkout, billing portal, subscriptions).
 *
 * Webhook payloads are parsed using the SDK's Zod inbound schemas
 * to convert raw snake_case JSON into typed camelCase objects.
 * Signature verification is handled manually (Web Crypto API).
 *
 * Creem API docs: https://docs.creem.io
 */
export class CreemProvider implements PaymentProvider {
  private client: Creem;
  private webhookSecret: string;

  constructor() {
    const apiKey = process.env.CREEM_API_KEY;
    if (!apiKey) {
      throw new Error('CREEM_API_KEY environment variable is not set');
    }

    const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('CREEM_WEBHOOK_SECRET environment variable is not set');
    }

    this.webhookSecret = webhookSecret;

    // server: 'prod' = api.creem.io, 'test' = test-api.creem.io
    const isDebug = process.env.CREEM_DEBUG === 'true';
    this.client = new Creem({
      apiKey,
      server: isDebug ? 'test' : 'prod',
    });
  }

  public getProviderName(): string {
    return 'creem';
  }

  // ─── Checkout ─────────────────────────────────────────────

  /**
   * Create a Creem checkout session
   *
   * Maps the generic CreateCheckoutParams to Creem's checkout API:
   * - priceId → productId (Creem uses product IDs)
   * - metadata.userId is required for webhook correlation
   */
  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { planId, priceId, customerEmail, successUrl, metadata } = params;

    try {
      getCheckoutPlan(planId, priceId);
      const checkout: CheckoutEntity = await this.client.checkouts.create({
        productId: priceId,
        successUrl: successUrl ?? '',
        requestId: randomUUID(),
        metadata: { ...metadata, planId, priceId },
        ...(customerEmail ? { customer: { email: customerEmail } } : {}),
      });

      return {
        url: checkout.checkoutUrl ?? '',
        id: checkout.id,
      };
    } catch (error) {
      console.error('Creem create checkout error:', error);
      throw new Error('Failed to create Creem checkout session');
    }
  }

  // ─── Customer Portal ──────────────────────────────────────

  /**
   * Create a Creem customer portal link
   *
   * Creem provides a hosted customer portal where users can
   * manage subscriptions, view invoices, and update billing.
   */
  public async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    const { customerId } = params;

    try {
      const links = await this.client.customers.generateBillingLinks({
        customerId,
      });

      return {
        url: links.customerPortalLink,
      };
    } catch (error) {
      console.error('Creem create customer portal error:', error);
      throw new Error('Failed to create Creem customer portal');
    }
  }

  // ─── Webhook Handling ─────────────────────────────────────

  /**
   * Handle Creem webhook event
   *
   * Creem webhook events:
   * - checkout.completed: Payment successful (one-time or first subscription)
   * - subscription.active: Subscription becomes active
   * - subscription.paid: Recurring payment successful (renewal)
   * - subscription.update: Subscription updated (plan change, etc.)
   * - subscription.trialing: Trial started
   * - subscription.canceled: Subscription canceled
   * - subscription.scheduled_cancel: Cancellation scheduled at period end
   * - subscription.expired: Subscription expired without payment
   * - subscription.past_due: Payment failed
   * - subscription.unpaid: Payment collection exhausted
   * - subscription.paused: Subscription paused
   *
   * @param payload Raw webhook payload
   * @param signature Webhook signature (creem-signature header)
   */
  public async handleWebhookEvent(
    payload: string,
    signature: string
  ): Promise<void> {
    try {
      // Verify webhook signature (SDK does not include this)
      await this.verifySignature(payload, signature);

      const raw = JSON.parse(payload);
      const eventType: string = raw.eventType;
      console.log(`handle Creem webhook event, type: ${eventType}`);

      switch (eventType) {
        case 'checkout.completed': {
          const event = this.parseCheckoutEvent(raw);
          await this.onCheckoutCompleted(event);
          break;
        }
        case 'subscription.paid': {
          const event = this.parseSubscriptionEvent<'subscription.paid'>(raw);
          await this.onSubscriptionPaid(event);
          break;
        }
        case 'subscription.active': {
          const event = this.parseSubscriptionEvent<'subscription.active'>(raw);
          await this.onSubscriptionActive(event);
          break;
        }
        case 'subscription.update': {
          const event = this.parseSubscriptionEvent<'subscription.update'>(raw);
          await this.onSubscriptionUpdate(event);
          break;
        }
        case 'subscription.canceled': {
          const event =
            this.parseSubscriptionEvent<'subscription.canceled'>(raw);
          await this.onSubscriptionCanceled(event);
          break;
        }
        case 'subscription.scheduled_cancel': {
          const event =
            this.parseSubscriptionEvent<'subscription.scheduled_cancel'>(raw);
          await this.onSubscriptionScheduledCancel(event);
          break;
        }
        case 'subscription.expired': {
          const event =
            this.parseSubscriptionEvent<'subscription.expired'>(raw);
          await this.onSubscriptionExpired(event);
          break;
        }
        case 'subscription.past_due': {
          const event =
            this.parseSubscriptionEvent<'subscription.past_due'>(raw);
          await this.onSubscriptionPastDue(event);
          break;
        }
        case 'subscription.unpaid': {
          const event = this.parseSubscriptionEvent<'subscription.unpaid'>(raw);
          await this.onSubscriptionUnpaid(event);
          break;
        }
        case 'subscription.trialing': {
          const event =
            this.parseSubscriptionEvent<'subscription.trialing'>(raw);
          await this.onSubscriptionTrialing(event);
          break;
        }
        case 'subscription.paused': {
          const event = this.parseSubscriptionEvent<'subscription.paused'>(raw);
          await this.onSubscriptionPaused(event);
          break;
        }
        default:
          console.warn(`Unhandled Creem webhook event: ${eventType}`);
      }
    } catch (error) {
      console.error('Creem webhook handling error:', error);
      if (error instanceof WebhookVerificationError) throw error;
      throw new Error('Failed to handle Creem webhook event');
    }
  }

  // ─── Webhook Parsing ──────────────────────────────────────

  /**
   * Parse a checkout.completed webhook event using SDK's Zod schema.
   *
   * Converts raw snake_case JSON → typed camelCase CheckoutEntity.
   */
  private parseCheckoutEvent(
    raw: Record<string, unknown>
  ): CreemCheckoutCompletedEvent {
    const parsed = CheckoutEntity$inboundSchema.parse(raw.object);
    return {
      id: raw.id as string,
      eventType: 'checkout.completed',
      created_at: raw.created_at as number,
      object: parsed as WebhookCheckoutObject,
    };
  }

  /**
   * Parse a subscription.* webhook event using SDK's Zod schema.
   *
   * Converts raw snake_case JSON → typed camelCase SubscriptionEntity.
   * Falls back to raw object if Zod parsing fails (e.g. new statuses
   * like 'incomplete' not yet in the SDK schema).
   */
  private parseSubscriptionEvent<T extends string>(
    raw: Record<string, unknown>
  ): CreemSubscriptionEvent<T> {
    const parsed = SubscriptionEntity$inboundSchema.safeParse(raw.object);
    return {
      id: raw.id as string,
      eventType: raw.eventType as T,
      created_at: raw.created_at as number,
      object: parsed.success
        ? (parsed.data as WebhookSubscriptionObject)
        : (raw.object as WebhookSubscriptionObject),
    };
  }

  /**
   * Verify Creem webhook signature using HMAC-SHA256
   *
   * Uses Web Crypto API for cross-runtime compatibility.
   */
  private async verifySignature(
    payload: string,
    signature: string
  ): Promise<void> {
    if (!signature) {
      throw new WebhookVerificationError('Missing Creem webhook signature');
    }
    if (!/^[a-f\d]{64}$/i.test(signature)) {
      throw new WebhookVerificationError('Invalid Creem webhook signature');
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(
      signature.match(/.{2}/g) ?? [],
      (byte) => Number.parseInt(byte, 16)
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payload)
    );

    if (!valid) {
      throw new WebhookVerificationError('Invalid Creem webhook signature');
    }
  }

  // ─── Event Handlers ───────────────────────────────────────

  /**
   * Handle checkout.completed event
   *
   * This fires for both one-time payments and first subscription payments.
   * Creates a payment record and updates user's customerId.
   */
  private async onCheckoutCompleted(
    event: CreemCheckoutCompletedEvent
  ): Promise<void> {
    console.log('>> Handle Creem checkout completed:', event.id);

    const { object } = event;
    const isOneTime = object.product.billingType !== 'recurring';
    const plan = findPaymentPlan(
      object.product.id,
      isOneTime ? PaymentTypes.ONE_TIME : PaymentTypes.SUBSCRIPTION
    );
    if (!plan) {
      throw new Error(
        `Creem product is not configured for this payment type: ${object.product.id}`
      );
    }
    const userId = this.extractCheckoutUserId(object);

    if (!userId) {
      throw new Error('No userId found in Creem checkout event');
    }

    // Update user's customerId
    if (object.customer) {
      await this.updateUserCustomerId(object.customer.id, userId);
    }

    if (isOneTime) {
      await this.createOneTimePaymentRecord(event, userId);
    } else {
      await this.createSubscriptionPaymentRecord(event, userId);
    }

    console.log('<< Handle Creem checkout completed success');
  }

  /**
   * Handle subscription.paid event (renewal)
   *
   * Updates the existing payment record with new period dates.
   * This is the Creem equivalent of Stripe's invoice.paid — it fires
   * on both initial payment and renewals, always updating the SAME record
   * created by checkout.completed.
   *
   * If no record exists yet (event arrived before checkout.completed),
   * we skip — checkout.completed will create it.
   */
  private async onSubscriptionPaid(
    event: CreemSubscriptionPaidEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription paid:', event.id);

    const sub = event.object;

    // Find existing payment record by subscriptionId
    const db = await getDb();
    const existing = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, sub.id))
      .orderBy(desc(payment.createdAt))
      .limit(1);

    if (existing.length === 0) {
      console.log(
        '<< No payment record for subscription.paid, waiting for checkout.completed'
      );
      return;
    }

    // Update existing payment record with renewed period
    if (!findPaymentPlan(sub.product.id, PaymentTypes.SUBSCRIPTION)) {
      console.warn(
        'Creem subscription product is not configured; access will be suspended'
      );
    }
    await db
      .update(payment)
      .set({
        priceId: sub.product.id,
        interval: this.mapBillingPeriodToInterval(sub.product.billingPeriod),
        status: 'active' as PaymentStatus,
        paid: true,
        periodStart: sub.currentPeriodStartDate
          ? new Date(sub.currentPeriodStartDate)
          : null,
        periodEnd: sub.currentPeriodEndDate
          ? new Date(sub.currentPeriodEndDate)
          : null,
        // Clear trial fields on renewal
        trialStart: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id));

    console.log('<< Handle Creem subscription paid success');
  }

  /**
   * Handle subscription.canceled event
   */
  private async onSubscriptionCanceled(
    event: CreemSubscriptionCanceledEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription canceled:', event.id);

    const sub = event.object;

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        status: 'canceled' as PaymentStatus,
        cancelAtPeriodEnd: !sub.canceledAt,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id))
      .returning({ id: payment.id });

    if (result.length > 0) {
      console.log('<< Marked payment record as canceled');
    } else {
      console.warn('<< No payment record found for subscription cancellation');
    }
  }

  /**
   * Handle subscription.scheduled_cancel event
   *
   * Fires when a subscription is scheduled for cancellation at period end.
   * The subscription remains active until the billing period ends.
   */
  private async onSubscriptionScheduledCancel(
    event: CreemSubscriptionScheduledCancelEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription scheduled cancel:', event.id);

    const sub = event.object;

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id))
      .returning({ id: payment.id });

    if (result.length > 0) {
      console.log('<< Marked payment record as scheduled for cancellation');
    } else {
      console.warn(
        '<< No payment record found for subscription scheduled cancel'
      );
    }
  }

  /**
   * Handle subscription.expired event
   *
   * Creem can still recover payment after this event. Keep the state
   * non-terminal while suspending access; only subscription.canceled is final.
   */
  private async onSubscriptionExpired(
    event: CreemSubscriptionExpiredEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription expired:', event.id);

    const sub = event.object;

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        status: 'past_due' as PaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id))
      .returning({ id: payment.id });

    if (result.length > 0) {
      console.log('<< Marked payment record as past due (expired)');
    } else {
      console.warn('<< No payment record found for subscription expiration');
    }
  }

  /** Suspend access after Creem exhausts payment collection attempts. */
  private async onSubscriptionUnpaid(
    event: CreemSubscriptionUnpaidEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription unpaid:', event.id);

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        status: 'unpaid' as PaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, event.object.id))
      .returning({ id: payment.id });

    if (result.length === 0) {
      console.warn('<< No payment record found for subscription unpaid');
    }
  }

  /**
   * Handle subscription.past_due event
   *
   * Fires when a subscription payment fails. The subscription
   * remains in past_due status until payment succeeds or it expires.
   */
  private async onSubscriptionPastDue(
    event: CreemSubscriptionPastDueEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription past_due:', event.id);

    const sub = event.object;

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        status: 'past_due' as PaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id))
      .returning({ id: payment.id });

    if (result.length > 0) {
      console.log('<< Marked payment record as past_due');
    } else {
      console.warn('<< No payment record found for subscription past_due');
    }
  }

  /**
   * Handle subscription.trialing event
   *
   * Updates the payment record to trialing status with trial dates.
   * If no record exists, skip — checkout.completed will create it.
   */
  private async onSubscriptionTrialing(
    event: CreemSubscriptionTrialingEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription trialing:', event.id);

    const sub = event.object;

    const db = await getDb();
    const existing = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, sub.id))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record to trialing status
      // Creem has no separate trial fields; period dates ARE the trial dates
      const periodStart = sub.currentPeriodStartDate
        ? new Date(sub.currentPeriodStartDate)
        : null;
      const periodEnd = sub.currentPeriodEndDate
        ? new Date(sub.currentPeriodEndDate)
        : null;
      await db
        .update(payment)
        .set({
          status: 'trialing' as PaymentStatus,
          paid: true,
          periodStart,
          periodEnd,
          trialStart: periodStart,
          trialEnd: periodEnd,
          updatedAt: new Date(),
        })
        .where(eq(payment.subscriptionId, sub.id));
    } else {
      // No record yet — checkout.completed will create it
      console.log(
        '<< No payment record for subscription.trialing, waiting for checkout.completed'
      );
    }

    console.log('<< Handle Creem subscription trialing success');
  }

  /**
   * Handle subscription.paused event
   */
  private async onSubscriptionPaused(
    event: CreemSubscriptionPausedEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription paused:', event.id);

    const sub = event.object;

    const db = await getDb();
    const result = await db
      .update(payment)
      .set({
        status: 'paused' as PaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, sub.id))
      .returning({ id: payment.id });

    if (result.length > 0) {
      console.log('<< Marked payment record as paused');
    } else {
      console.warn('<< No payment record found for subscription pause');
    }
  }

  /**
   * Handle subscription.active event
   *
   * Fires when a subscription becomes active.
   * Updates the payment record with period dates and active status.
   *
   * If no payment record exists yet, we skip, checkout.completed will
   * create the record, and subsequent subscription events will update it.
   */
  private async onSubscriptionActive(
    event: CreemSubscriptionActiveEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription active:', event.id);

    const sub = event.object;

    const db = await getDb();
    const existing = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, sub.id))
      .orderBy(desc(payment.createdAt))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(payment)
        .set({
          status: 'active' as PaymentStatus,
          paid: true,
          periodStart: sub.currentPeriodStartDate
            ? new Date(sub.currentPeriodStartDate)
            : null,
          periodEnd: sub.currentPeriodEndDate
            ? new Date(sub.currentPeriodEndDate)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(payment.subscriptionId, sub.id));
      console.log('<< Updated subscription record to active with period dates');
    } else {
      // No record yet — this event arrived before checkout.completed.
      // Skip creation; checkout.completed will create the record.
      console.log(
        '<< No payment record for subscription.active, waiting for checkout.completed'
      );
    }
  }

  /**
   * Handle subscription.update event
   *
   * Fires when a subscription is updated (e.g. plan change, period renewal).
   * Updates the payment record with the latest period dates and status.
   *
   * Like subscription.active, this may arrive before checkout.completed.
   * If no record exists, we skip — never create from this event.
   */
  private async onSubscriptionUpdate(
    event: CreemSubscriptionUpdateEvent
  ): Promise<void> {
    console.log('>> Handle Creem subscription update:', event.id);

    const sub = event.object;

    const db = await getDb();
    const existing = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, sub.id))
      .orderBy(desc(payment.createdAt))
      .limit(1);

    if (existing.length > 0) {
      const updateSet: Record<string, unknown> = {
        priceId: sub.product.id,
        interval: this.mapBillingPeriodToInterval(sub.product.billingPeriod),
        updatedAt: new Date(),
      };
      if (!findPaymentPlan(sub.product.id, PaymentTypes.SUBSCRIPTION)) {
        console.warn(
          'Creem subscription product is not configured; access will be suspended'
        );
      }
      if (sub.currentPeriodStartDate) {
        updateSet.periodStart = new Date(sub.currentPeriodStartDate);
      }
      if (sub.currentPeriodEndDate) {
        updateSet.periodEnd = new Date(sub.currentPeriodEndDate);
      }
      // Map subscription status to payment status
      if (sub.status === 'active' || sub.status === 'trialing') {
        updateSet.status = sub.status as PaymentStatus;
      }

      await db
        .update(payment)
        .set(updateSet)
        .where(eq(payment.subscriptionId, sub.id));
      console.log('<< Updated subscription record from subscription.update');
    } else {
      console.log('<< No existing record for subscription.update, skipping');
    }
  }

  // ─── Record Creation ──────────────────────────────────────

  /**
   * Create a one-time payment record
   * Called from checkout.completed for billing_type !== 'recurring'
   */
  private async createOneTimePaymentRecord(
    event: CreemCheckoutCompletedEvent,
    userId: string
  ): Promise<void> {
    console.log('>> Create Creem one-time payment record');

    const { object } = event;
    const currentDate = new Date();

    try {
      const db = await getDb();
      await db.insert(payment).values({
        id: randomUUID(),
        priceId: object.product.id,
        userId,
        customerId: object.customer?.id ?? '',
        subscriptionId: null,
        sessionId: event.id,
        invoiceId: event.id,
        type: PaymentTypes.ONE_TIME,
        scene: PaymentScenes.LIFETIME,
        interval: null,
        status: 'completed' as PaymentStatus,
        paid: true,
        periodStart: null,
        periodEnd: null,
        cancelAtPeriodEnd: null,
        trialStart: null,
        trialEnd: null,
        createdAt: currentDate,
        updatedAt: currentDate,
      });

      // Send notification for one-time purchase
      const amount = object.product.price ? object.product.price / 100 : 0;
      await sendPaymentNotification({
        sessionId: event.id,
        customerId: object.customer?.id ?? '',
        userName:
          (object.metadata?.userName as string) ??
          object.customer?.name ??
          'Customer',
        amount,
      });

      console.log('<< Created Creem one-time payment record success');
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        console.log('<< One-time payment record already exists, skipping');
        return;
      }
      throw error;
    }
  }

  /**
   * Create a subscription payment record from checkout.completed event
   */
  private async createSubscriptionPaymentRecord(
    event: CreemCheckoutCompletedEvent,
    userId: string,
    statusOverride?: PaymentStatus
  ): Promise<void> {
    console.log('>> Create Creem subscription payment record (checkout)');

    const { object } = event;
    const currentDate = new Date();
    const sub = object.subscription;
    const subscriptionId = sub?.id ?? null;
    const periodStart = sub?.currentPeriodStartDate
      ? new Date(sub.currentPeriodStartDate)
      : null;
    const periodEnd = sub?.currentPeriodEndDate
      ? new Date(sub.currentPeriodEndDate)
      : null;
    const interval = this.mapBillingPeriodToInterval(
      object.product.billingPeriod
    );
    const isTrialing = statusOverride === 'trialing';

    try {
      const db = await getDb();
      await db.insert(payment).values({
        id: randomUUID(),
        priceId: object.product.id,
        userId,
        customerId: object.customer?.id ?? '',
        subscriptionId,
        sessionId: event.id,
        invoiceId: event.id,
        type: PaymentTypes.SUBSCRIPTION,
        scene: PaymentScenes.SUBSCRIPTION,
        interval,
        status: statusOverride ?? ('active' as PaymentStatus),
        paid: true,
        periodStart,
        periodEnd,
        cancelAtPeriodEnd: false,
        // Creem has no separate trial fields; during trialing the period dates ARE the trial dates
        trialStart: isTrialing ? periodStart : null,
        trialEnd: isTrialing ? periodEnd : null,
        createdAt: currentDate,
        updatedAt: currentDate,
      });

      console.log('<< Created Creem subscription payment record success');
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        console.log('<< Subscription payment record already exists, skipping');
        return;
      }
      throw error;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Extract userId from checkout webhook object.
   *
   * userId is stored in metadata.userId (set during checkout creation).
   */
  private extractCheckoutUserId(
    object: WebhookCheckoutObject
  ): string | undefined {
    return (object.metadata?.userId as string) || undefined;
  }

  /**
   * Map Creem billing_period to PlanInterval
   *
   * Creem periods: 'every-month', 'every-three-months', 'every-six-months', 'every-year', 'once'
   * Our intervals: 'month', 'year'
   */
  private mapBillingPeriodToInterval(billingPeriod?: string): PlanInterval {
    switch (billingPeriod) {
      case 'every-year':
        return PlanIntervals.YEAR;
      default:
        return PlanIntervals.MONTH;
    }
  }

  /**
   * Update user record with Creem customer ID
   */
  private async updateUserCustomerId(
    customerId: string,
    userId: string
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(user)
        .set({
          customerId,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));
      console.log('Updated user with Creem customer ID');
    } catch (error) {
      console.error('Update user with Creem customer ID error:', error);
    }
  }
}
