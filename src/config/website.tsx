import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { PaymentConfig, WebsiteConfig } from '@/types';

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

// Payment provider controlled by env var: 'stripe' | 'creem' | 'waffo'
const paymentProvider = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ||
  'stripe') as PaymentConfig['provider'];
const isCreem = paymentProvider === 'creem';
const isWaffo = paymentProvider === 'waffo';

// Resolve price/product IDs based on the active payment provider.
// BRAWLVERSE sells membership tiers, so the plan ids mirror the entitlement
// tiers in src/lib/brawlverse/entitlements.ts.
const priceIds = {
  ringside: isWaffo
    ? (process.env.NEXT_PUBLIC_WAFFO_PRODUCT_RINGSIDE ?? '')
    : isCreem
      ? (process.env.NEXT_PUBLIC_CREEM_PRODUCT_RINGSIDE ?? '')
      : (process.env.NEXT_PUBLIC_STRIPE_PRICE_RINGSIDE ?? ''),
  booker: isWaffo
    ? (process.env.NEXT_PUBLIC_WAFFO_PRODUCT_BOOKER ?? '')
    : isCreem
      ? (process.env.NEXT_PUBLIC_CREEM_PRODUCT_BOOKER ?? '')
      : (process.env.NEXT_PUBLIC_STRIPE_PRICE_BOOKER ?? ''),
  promoter: isWaffo
    ? (process.env.NEXT_PUBLIC_WAFFO_PRODUCT_PROMOTER ?? '')
    : isCreem
      ? (process.env.NEXT_PUBLIC_CREEM_PRODUCT_PROMOTER ?? '')
      : (process.env.NEXT_PUBLIC_STRIPE_PRICE_PROMOTER ?? ''),
  annual: isWaffo
    ? (process.env.NEXT_PUBLIC_WAFFO_PRODUCT_ANNUAL ?? '')
    : isCreem
      ? (process.env.NEXT_PUBLIC_CREEM_PRODUCT_ANNUAL ?? '')
      : (process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL ?? ''),
};

/** A tier is purchasable only once its product id is configured. */
function planEnabled(priceId: string): boolean {
  return priceId.length > 0;
}

/**
 * website config, without translations
 */
export const websiteConfig: WebsiteConfig = {
  ui: {
    mode: {
      defaultMode: 'dark',
      enableSwitch: true,
    },
  },
  metadata: {
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      github: 'https://github.com/zjutimes2015/hook.tv',
      twitter: 'https://x.com/hooktv',
    },
  },
  features: {
    enableUpgradeCard: false,
    enableUpdateAvatar: true,
    enableDatafastRevenueTrack: false,
    enableCrispChat: false,
    // Votes and danmaku are the write path, so the captcha turns itself on as
    // soon as a site key exists. The widget component stays hidden until the
    // key is present, so an unconfigured deployment never blocks a user.
    enableTurnstileCaptcha:
      Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !isE2ETestMode,
  },
  affiliates: {
    enable: false,
    provider: 'affonso',
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  auth: {
    enableGoogleLogin: true,
    enableGithubLogin: true,
    enableCredentialLogin: true,
    enableDeleteUser: true,
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
        hreflang: 'en',
      },
      zh: {
        flag: '🇨🇳',
        name: '中文',
        hreflang: 'zh-CN',
      },
    },
  },
  blog: {
    enable: false,
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  docs: {
    enable: false,
  },
  mail: {
    enable: true,
    provider: 'resend',
    fromEmail: 'BRAWLVERSE <support@feint.tv>',
    supportEmail: 'BRAWLVERSE <support@hook.tv>',
  },
  newsletter: {
    enable: false,
    provider: 'resend',
    autoSubscribeAfterSignUp: false,
  },
  notification: {
    enable: false,
    provider: 'discord',
  },
  storage: {
    enable: true,
    provider: 's3',
  },
  payment: {
    provider: paymentProvider,
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
      },
      ringside: {
        id: 'ringside',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.ringside,
            amount: 499,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
        ],
        isFree: false,
        isLifetime: false,
        disabled: !planEnabled(priceIds.ringside),
      },
      booker: {
        id: 'booker',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.booker,
            amount: 1499,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: true,
        disabled: !planEnabled(priceIds.booker),
      },
      promoter: {
        id: 'promoter',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.promoter,
            amount: 4900,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
        ],
        isFree: false,
        isLifetime: false,
        disabled: !planEnabled(priceIds.promoter),
      },
      annual: {
        id: 'annual',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.annual,
            amount: 19900,
            currency: 'USD',
            interval: PlanIntervals.YEAR,
            allowPromotionCode: true,
          },
        ],
        isFree: false,
        isLifetime: false,
        disabled: !planEnabled(priceIds.annual),
      },
    },
  },
};
