import { randomUUID } from 'node:crypto';
import {
  type CashierLanguage,
  verifyWebhook,
  WaffoPancake,
  WaffoPancakeError,
  type WebhookEvent,
  type WebhookEventData,
  WebhookEventType,
} from '@waffo/pancake-ts';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { findPaymentPlan, getCheckoutPlan } from '@/lib/price-plan';
import { sendPaymentNotification } from '@/notification';
import { and, eq, or } from 'drizzle-orm';
import { WebhookVerificationError } from '../errors';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreatePortalParams,
  PaymentProvider,
  PaymentStatus,
  PlanInterval,
  PortalResult,
  Price,
} from '../types';
import { PaymentScenes, PaymentTypes, PlanIntervals } from '../types';

export const WAFFO_CUSTOMER_PORTAL_URL =
  'https://pancake.waffo.ai/consumer/portal/login';

type WaffoEvent = WebhookEvent<WebhookEventData>;

const WAFFO_LANGUAGES: Record<string, CashierLanguage> = {
  en: 'en',
  zh: 'zh-Hans',
};

type CheckoutPrice = Pick<Price, 'currency' | 'trialPeriodDays'>;

type SubscriptionUpdate = {
  status?: PaymentStatus;
  cancelAtPeriodEnd?: boolean;
  paid?: boolean;
  syncPlan?: boolean;
};

/**
 * Waffo Pancake provider for subscriptions and one-time purchases.
 */
export class WaffoProvider implements PaymentProvider {
  /** Waffo uses a shared consumer portal rather than merchant customer IDs. */
  readonly requiresCustomerId = false;

  /** Waffo owns the confirmation page shown before returning to the app. */
  readonly hostsPostCheckoutPage = true;

  private client: WaffoPancake;

  constructor() {
    const merchantId = process.env.WAFFO_MERCHANT_ID;
    const privateKey = process.env.WAFFO_PRIVATE_KEY;

    if (!merchantId) {
      throw new Error('WAFFO_MERCHANT_ID environment variable is not set');
    }
    if (!privateKey) {
      throw new Error('WAFFO_PRIVATE_KEY environment variable is not set');
    }

    this.client = new WaffoPancake({ merchantId, privateKey });
  }

  public getProviderName(): string {
    return 'waffo';
  }

  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { price } = getCheckoutPlan(params.planId, params.priceId);

    return this.createWaffoCheckout({
      priceId: params.priceId,
      price,
      customerEmail: params.customerEmail,
      successUrl: params.successUrl,
      metadata: {
        ...params.metadata,
        planId: params.planId,
        priceId: params.priceId,
      },
      locale: params.locale,
      theme: params.theme,
    });
  }

  public async createCustomerPortal(
    _params: CreatePortalParams
  ): Promise<PortalResult> {
    return { url: WAFFO_CUSTOMER_PORTAL_URL };
  }

  public async handleWebhookEvent(
    payload: string,
    signature: string
  ): Promise<void> {
    try {
      const expectedMode = this.getExpectedMode();
      let event: WaffoEvent;
      try {
        event = verifyWebhook<WebhookEventData>(payload, signature, {
          environment: expectedMode,
          toleranceMs: 300_000,
        });
      } catch (error) {
        throw new WebhookVerificationError(
          'Invalid Waffo webhook signature',
          error
        );
      }

      if (event.mode !== expectedMode) {
        console.warn(
          `Skipping Waffo ${event.mode} event in ${expectedMode} runtime: ${event.eventType}`
        );
        return;
      }

      switch (event.eventType) {
        case WebhookEventType.OrderCompleted:
          await this.createOneTimePayment(event);
          break;
        case WebhookEventType.SubscriptionActivated:
          await this.createSubscriptionPayment(event);
          break;
        case WebhookEventType.SubscriptionPaymentSucceeded:
          await this.updateSubscription(event, { status: 'active' });
          break;
        case WebhookEventType.SubscriptionRenewed:
        case WebhookEventType.SubscriptionRecovered:
          await this.updateSubscription(event, {
            status: 'active',
            syncPlan: true,
          });
          break;
        case WebhookEventType.SubscriptionPlanChanged:
          await this.updateSubscription(event, { syncPlan: true });
          break;
        case WebhookEventType.SubscriptionCanceling:
          await this.updateSubscription(event, {
            status: 'active',
            cancelAtPeriodEnd: true,
          });
          break;
        case WebhookEventType.SubscriptionUncanceled:
          await this.updateSubscription(event, {
            status: 'active',
            cancelAtPeriodEnd: false,
          });
          break;
        case WebhookEventType.SubscriptionPastDue:
          await this.updateSubscription(event, { status: 'past_due' });
          break;
        case WebhookEventType.SubscriptionCanceled:
          await this.updateSubscription(event, {
            status: 'canceled',
            cancelAtPeriodEnd: false,
            paid: false,
          });
          break;
        case WebhookEventType.RefundSucceeded:
          await this.revokeRefundedPayment(event);
          break;
        case WebhookEventType.RefundFailed:
          console.warn('Waffo refund failed:', event.eventId);
          break;
        default:
          console.warn(`Unhandled Waffo webhook event: ${event.eventType}`);
      }
    } catch (error) {
      this.logError('webhook handling', error);
      if (error instanceof WebhookVerificationError) throw error;
      throw new Error('Failed to handle Waffo webhook event');
    }
  }

  private async createWaffoCheckout(params: {
    priceId: string;
    price: CheckoutPrice;
    customerEmail: string;
    successUrl?: string;
    metadata?: Record<string, string>;
    locale?: CreateCheckoutParams['locale'];
    theme?: CreateCheckoutParams['theme'];
  }): Promise<CheckoutResult> {
    if (!params.priceId) {
      throw new Error('Waffo product ID is not configured');
    }

    try {
      const language = this.mapLocaleToWaffoLanguage(params.locale);
      const withTrial =
        typeof params.price.trialPeriodDays === 'number' &&
        params.price.trialPeriodDays > 0
          ? true
          : undefined;
      const darkMode =
        params.theme === 'dark'
          ? true
          : params.theme === 'light'
            ? false
            : undefined;
      const result = await this.client.checkout.authenticated.create({
        buyerIdentity: params.metadata?.userId ?? params.customerEmail,
        buyerEmail: params.customerEmail,
        currency: params.price.currency,
        metadata: params.metadata ?? {},
        orderMerchantExternalId:
          params.metadata?.paymentReference ?? randomUUID(),
        productId: params.priceId,
        successUrl: params.successUrl,
        ...(language ? { language } : {}),
        ...(withTrial !== undefined ? { withTrial } : {}),
        ...(darkMode !== undefined ? { darkMode } : {}),
      });

      return {
        id: result.sessionId,
        url: result.checkoutUrl,
      };
    } catch (error) {
      this.logError('create checkout', error);
      throw new Error('Failed to create Waffo checkout session');
    }
  }

  private getExpectedMode(): 'test' | 'prod' {
    const useTestMode =
      process.env.NODE_ENV !== 'production' ||
      process.env.WAFFO_DEBUG === 'true';
    return useTestMode ? 'test' : 'prod';
  }

  private getUserId(data: WebhookEventData): string | undefined {
    return data.orderMetadata?.userId ?? data.merchantProvidedBuyerIdentity;
  }

  private getPriceId(data: WebhookEventData): string | undefined {
    return data.productMetadata?.priceId ?? data.orderMetadata?.priceId;
  }

  private getPaymentSessionId(data: WebhookEventData): string | null {
    return (
      data.orderMerchantExternalId ??
      data.orderMetadata?.paymentReference ??
      null
    );
  }

  private async createOneTimePayment(event: WaffoEvent): Promise<void> {
    const { data } = event;
    const userId = this.getUserId(data);
    const priceId = this.getPriceId(data);
    if (!userId || !priceId) {
      throw new Error('Waffo one-time event is missing userId or priceId');
    }

    if (!findPaymentPlan(priceId, PaymentTypes.ONE_TIME)) {
      throw new Error(`Waffo one-time product is not configured: ${priceId}`);
    }

    const customerId = data.merchantProvidedBuyerIdentity ?? userId;
    const now = new Date();
    try {
      const db = await getDb();
      await db.insert(payment).values({
        id: data.orderId,
        priceId,
        userId,
        customerId,
        subscriptionId: null,
        sessionId: this.getPaymentSessionId(data),
        invoiceId: data.paymentId ?? event.eventId,
        type: PaymentTypes.ONE_TIME,
        scene: PaymentScenes.LIFETIME,
        interval: null,
        status: 'completed',
        paid: true,
        periodStart: null,
        periodEnd: null,
        cancelAtPeriodEnd: null,
        trialStart: null,
        trialEnd: null,
        createdAt: now,
        updatedAt: now,
      });

      await sendPaymentNotification({
        sessionId: data.orderId,
        customerId,
        userName: data.orderMetadata?.userName ?? data.buyerEmail,
        amount: Number(data.amount) || 0,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        console.log('Waffo one-time payment already exists, skipping');
        return;
      }
      throw error;
    }
  }

  private async createSubscriptionPayment(event: WaffoEvent): Promise<void> {
    const { data } = event;
    const userId = this.getUserId(data);
    const priceId = this.getPriceId(data);
    if (!userId || !priceId) {
      throw new Error('Waffo subscription event is missing userId or priceId');
    }
    if (!findPaymentPlan(priceId, PaymentTypes.SUBSCRIPTION)) {
      throw new Error(
        `Waffo subscription product is not configured: ${priceId}`
      );
    }

    const now = new Date();
    try {
      const db = await getDb();
      await db.insert(payment).values({
        id: data.orderId,
        priceId,
        userId,
        customerId: data.merchantProvidedBuyerIdentity ?? userId,
        subscriptionId: data.orderId,
        sessionId: this.getPaymentSessionId(data),
        invoiceId: data.paymentId ?? event.eventId,
        type: PaymentTypes.SUBSCRIPTION,
        scene: PaymentScenes.SUBSCRIPTION,
        interval: this.mapBillingPeriod(data.billingPeriod),
        status: this.mapSubscriptionStatus(data.orderStatus),
        paid: true,
        periodStart: this.parseDate(data.currentPeriodStart),
        periodEnd: this.parseDate(data.currentPeriodEnd),
        cancelAtPeriodEnd: data.orderStatus === 'canceling',
        trialStart: null,
        trialEnd: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        console.log('Waffo subscription payment already exists, skipping');
        return;
      }
      throw error;
    }
  }

  private async updateSubscription(
    event: WaffoEvent,
    options: SubscriptionUpdate = {}
  ): Promise<void> {
    const { data } = event;
    const values: Partial<typeof payment.$inferInsert> = {
      status: this.mapSubscriptionStatus(data.orderStatus, options.status),
      paid: options.paid ?? true,
      cancelAtPeriodEnd:
        options.cancelAtPeriodEnd ?? data.orderStatus === 'canceling',
      updatedAt: new Date(),
    };
    const periodStart = this.parseDate(data.currentPeriodStart);
    const periodEnd = this.parseDate(data.currentPeriodEnd);
    if (periodStart) values.periodStart = periodStart;
    if (periodEnd) values.periodEnd = periodEnd;
    if (options.syncPlan) {
      const priceId = this.getPriceId(data);
      if (priceId) {
        if (!findPaymentPlan(priceId, PaymentTypes.SUBSCRIPTION)) {
          console.warn(
            'Waffo subscription product is not configured; access will be suspended'
          );
        }
        values.priceId = priceId;
      }
      if (data.billingPeriod) {
        values.interval = this.mapBillingPeriod(data.billingPeriod);
      }
    }

    const db = await getDb();
    await db
      .update(payment)
      .set(values)
      .where(
        and(
          eq(payment.subscriptionId, data.orderId),
          eq(payment.type, PaymentTypes.SUBSCRIPTION)
        )
      );
  }

  private async revokeRefundedPayment(event: WaffoEvent): Promise<void> {
    const { orderId, paymentId } = event.data;
    const filters = [
      ...(paymentId ? [eq(payment.invoiceId, paymentId)] : []),
      ...(orderId ? [eq(payment.id, orderId)] : []),
    ];
    if (filters.length === 0) {
      console.warn('Waffo refund event is missing paymentId and orderId');
      return;
    }
    const db = await getDb();
    await db
      .update(payment)
      .set({ paid: false, status: 'canceled', updatedAt: new Date() })
      .where(or(...filters));
  }

  private logError(context: string, error: unknown): void {
    if (error instanceof WaffoPancakeError) {
      console.error(
        `Waffo ${context} error [status=${error.status}]:`,
        error.errors.map((item) => ({
          layer: item.layer,
          message: item.message,
          aiHint: item.aiHint,
        }))
      );
      return;
    }
    console.error(`Waffo ${context} error:`, error);
  }

  private mapLocaleToWaffoLanguage(
    locale?: CreateCheckoutParams['locale']
  ): CashierLanguage | undefined {
    if (!locale) return undefined;
    return WAFFO_LANGUAGES[locale] ?? WAFFO_LANGUAGES[locale.split('-')[0]];
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private mapBillingPeriod(value?: string): PlanInterval {
    return value === 'yearly' ? PlanIntervals.YEAR : PlanIntervals.MONTH;
  }

  private mapSubscriptionStatus(
    status: string | undefined,
    fallback: PaymentStatus = 'active'
  ): PaymentStatus {
    switch (status) {
      case 'past_due':
        return 'past_due';
      case 'canceling':
        return 'active';
      case 'canceled':
      case 'expired':
      case 'closed':
        return 'canceled';
      case 'active':
        return 'active';
      default:
        return fallback;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    let current: unknown = error;
    const visited = new Set<unknown>();

    while (current && typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      if ('code' in current && current.code === '23505') return true;
      if (
        current instanceof Error &&
        current.message.toLowerCase().includes('unique')
      ) {
        return true;
      }
      current = 'cause' in current ? current.cause : undefined;
    }

    return false;
  }
}
