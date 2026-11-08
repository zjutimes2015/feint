import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { loadEnv } from 'vite';
import {
  E2E_BETTER_AUTH_SECRET,
  E2E_TEST_SECRET,
} from '../tests/e2e/fixtures/test-data';

type Env = Record<string, string | undefined>;

export type PaymentProvider = 'stripe' | 'creem' | 'waffo';

export function mergePaymentEnv(
  provider: PaymentProvider,
  defaults: Env,
  source: Env,
  shell: Env
): Env {
  const env = { ...defaults, ...source, ...shell };
  const prefix =
    provider === 'stripe'
      ? 'STRIPE_PRICE'
      : `${provider.toUpperCase()}_PRODUCT`;
  for (const plan of ['PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME']) {
    const key = `${prefix}_${plan}`;
    // Resolve aliases within each source before moving to a lower-priority source.
    env[`NEXT_PUBLIC_${key}`] = [shell, source, defaults]
      .flatMap((layer) => [layer[`NEXT_PUBLIC_${key}`], layer[`VITE_${key}`]])
      .find((value) => value !== undefined);
  }
  return env;
}

export function loadPaymentEnv(
  provider: PaymentProvider,
  cwd = process.cwd(),
  shell: Env = process.env
) {
  // Keep existing project .env expansion behavior; resolve source precedence
  // separately so injected shell values cannot outrank explicit-file aliases.
  const defaults = loadEnv('development', cwd, '');
  const key = `${provider.toUpperCase()}_ENV_FILE`;
  const file = shell[key];
  let source: Env = {};
  if (file) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) throw new Error(`${key} does not exist: ${path}`);
    source = parse(readFileSync(path));
  }
  return mergePaymentEnv(provider, defaults, source, shell);
}

export function sandboxEnv(
  provider: PaymentProvider,
  env: Env,
  port: number,
  baseURL: string
): NodeJS.ProcessEnv {
  return {
    ...env,
    NODE_ENV: 'development',
    NEXT_PUBLIC_PAYMENT_PROVIDER: provider,
    NEXT_PUBLIC_BASE_URL: baseURL,
    NEXT_PUBLIC_DEMO_WEBSITE: 'true',
    NEXT_PUBLIC_E2E_TEST_MODE: 'true',
    E2E_TEST_SECRET,
    BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
    [`${provider.toUpperCase()}_E2E_PORT`]: String(port),
    PLAYWRIGHT_BASE_URL: baseURL,
  };
}

export function stripeWebhookEnv(env: Env, secret: string): NodeJS.ProcessEnv {
  return {
    ...env,
    NODE_ENV: 'development',
    STRIPE_E2E_WEBHOOK_SECRET: secret,
    STRIPE_WEBHOOK_SECRET: secret,
  };
}
