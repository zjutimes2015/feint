import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  loadPaymentEnv,
  mergePaymentEnv,
  sandboxEnv,
  stripeWebhookEnv,
} from '../../scripts/payment-e2e-env';
import { PaymentE2EProcesses } from '../../scripts/payment-e2e-process';

describe('payment sandbox environment', () => {
  for (const provider of ['stripe', 'creem', 'waffo'] as const) {
    it(`${provider}: resolves aliases by source and preserves credentials`, () => {
      const prefix =
        provider === 'stripe'
          ? 'STRIPE_PRICE'
          : `${provider.toUpperCase()}_PRODUCT`;
      const key = `NEXT_PUBLIC_${prefix}_PRO_MONTHLY`;
      const alias = `VITE_${prefix}_PRO_MONTHLY`;
      const defaults = { [key]: 'default', DATABASE_URL: 'default-db' };
      const source = { [alias]: 'source', DATABASE_URL: 'source-db' };
      expect(mergePaymentEnv(provider, defaults, source, {})[key]).toBe(
        'source'
      );
      const result = mergePaymentEnv(provider, defaults, source, {
        [alias]: 'shell',
      });
      expect(result[key]).toBe('shell');
      expect(result.DATABASE_URL).toBe('source-db');
      expect(
        mergePaymentEnv(provider, defaults, source, { [key]: '' })[key]
      ).toBe('');
      const runtime = sandboxEnv(
        provider,
        result,
        3118,
        'http://localhost:3118'
      );
      expect(runtime.NEXT_PUBLIC_PAYMENT_PROVIDER).toBe(provider);
      expect(runtime.NEXT_PUBLIC_BASE_URL).toBe(runtime.PLAYWRIGHT_BASE_URL);
      expect(runtime.NEXT_PUBLIC_E2E_TEST_MODE).toBe('true');
      expect(runtime.BETTER_AUTH_SECRET).toBeTruthy();
    });
  }
  it('dynamic listener secret overrides both inherited secrets', () => {
    expect(
      stripeWebhookEnv(
        { STRIPE_WEBHOOK_SECRET: 'old', STRIPE_E2E_WEBHOOK_SECRET: 'older' },
        'dynamic'
      )
    ).toEqual({
      NODE_ENV: 'development',
      STRIPE_WEBHOOK_SECRET: 'dynamic',
      STRIPE_E2E_WEBHOOK_SECRET: 'dynamic',
    });
  });
});

describe('sandbox process ownership', () => {
  it('cleans a running child and removes signal handlers', async () => {
    const before = process.listenerCount('SIGTERM');
    const owner = new PaymentE2EProcesses();
    const child = owner.start(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: 'ignore' }
    );
    await once(child, 'spawn');
    await owner.close();
    expect(child.signalCode).toBe('SIGTERM');
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
  it('cleans after a spawn failure', async () => {
    const owner = new PaymentE2EProcesses();
    const child = owner.start('/nonexistent/payment-e2e-command', [], {
      stdio: 'ignore',
    });
    await new Promise<void>((resolve) => child.once('error', () => resolve()));
    await owner.close();
  });
  it('forwards interruption and prevents subsequent starts', async () => {
    const oldCode = process.exitCode;
    const owner = new PaymentE2EProcesses();
    try {
      const child = owner.start(
        process.execPath,
        ['-e', "process.stdout.write('ready'); setInterval(() => {}, 1000)"],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
      await once(child.stdout!, 'data');
      process.emit('SIGTERM');
      await owner.close();
      expect(child.signalCode).toBe('SIGTERM');
      expect(process.exitCode).toBe(143);
      expect(() => owner.start(process.execPath, [], {})).toThrow(
        'interrupted'
      );
    } finally {
      await owner.close();
      process.exitCode = oldCode;
    }
  });
});

it('loads all explicit Waffo fields above project defaults', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'payment-env-'));
  vi.stubEnv('WAFFO_MERCHANT_ID', undefined);
  try {
    writeFileSync(
      join(cwd, '.env'),
      'WAFFO_MERCHANT_ID=default\nNEXT_PUBLIC_WAFFO_PRODUCT_PRO_MONTHLY=default\n'
    );
    writeFileSync(join(cwd, '.env.local'), 'WAFFO_MERCHANT_ID=local\n');
    writeFileSync(
      join(cwd, 'sandbox.env'),
      'WAFFO_MERCHANT_ID=sandbox\nVITE_WAFFO_PRODUCT_PRO_MONTHLY=sandbox-product\nWAFFO_PUBLIC_KEY=verification-key\n'
    );
    const env = loadPaymentEnv('waffo', cwd, { WAFFO_ENV_FILE: 'sandbox.env' });
    expect(env.WAFFO_MERCHANT_ID).toBe('sandbox');
    expect(env.NEXT_PUBLIC_WAFFO_PRODUCT_PRO_MONTHLY).toBe('sandbox-product');
    expect(env.WAFFO_PUBLIC_KEY).toBe('verification-key');
    expect(loadPaymentEnv('waffo', cwd, {}).WAFFO_MERCHANT_ID).toBe('local');
    expect(() =>
      loadPaymentEnv('waffo', cwd, { WAFFO_ENV_FILE: 'missing' })
    ).toThrow('does not exist');
  } finally {
    vi.unstubAllEnvs();
    rmSync(cwd, { recursive: true, force: true });
  }
});

it('passes the sandbox environment through Playwright into the Next server', async () => {
  const env = stripeWebhookEnv(
    sandboxEnv(
      'stripe',
      {
        STRIPE_SECRET_KEY: 'sk_test_fixture',
        NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY: 'price_fixture',
      },
      3119,
      'http://localhost:3119'
    ),
    'whsec_dynamic'
  );
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  try {
    vi.resetModules();
    const { default: config } = await import('../../playwright.stripe.config');
    const server = config.webServer as {
      env: Record<string, string>;
      url: string;
    };
    expect(server.env.STRIPE_SECRET_KEY).toBe('sk_test_fixture');
    expect(server.env.STRIPE_WEBHOOK_SECRET).toBe('whsec_dynamic');
    expect(server.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY).toBe(
      'price_fixture'
    );
    expect(server.env.NEXT_PUBLIC_BASE_URL).toBe(server.url);
    expect(server.env.BETTER_AUTH_SECRET).toBe(env.BETTER_AUTH_SECRET);
    expect(server.env.NEXT_PUBLIC_E2E_TEST_MODE).toBe('true');
  } finally {
    vi.unstubAllEnvs();
  }
});
// Windows 没有 POSIX 信号与进程组语义(process.kill(-pid) 不可用),
// 这两条用例只在类 Unix 平台有意义。
const posixOnly = process.platform === 'win32' ? it.skip : it;

posixOnly(
  'escalates cleanup when a child ignores termination',
  async () => {
    const owner = new PaymentE2EProcesses();
    const child = owner.start(
      process.execPath,
      [
        '-e',
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    await once(child.stdout!, 'data');
    await owner.close();
    expect(child.signalCode).toBe('SIGKILL');
  },
  5000
);

posixOnly(
  'cleans a web server in a detached descendant process group',
  async () => {
    const owner = new PaymentE2EProcesses();
    const serverCode =
      "require('node:http').createServer((req,res)=>res.end('ready')).listen(0,'127.0.0.1',function(){console.log(this.address().port)})";
    const parentCode = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(serverCode)}],{detached:true,stdio:'inherit'});setInterval(()=>{},1000)`;
    const child = owner.start(process.execPath, ['-e', parentCode], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const [chunk] = await once(child.stdout!, 'data');
    const url = `http://127.0.0.1:${String(chunk).trim()}`;
    try {
      expect((await fetch(url)).status).toBe(200);
      await owner.close();
      await expect(fetch(url)).rejects.toThrow();
    } finally {
      await owner.close();
    }
  },
  5000
);
