import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options) => options),
  after: vi.fn(),
  subscribe: vi.fn(),
  e2e: vi.fn(() => false),
  newsletter: { enable: true, autoSubscribeAfterSignUp: true },
}));
vi.mock('better-auth', () => ({ betterAuth: mocks.betterAuth }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: vi.fn() }));
vi.mock('better-auth/plugins', () => ({ admin: vi.fn() }));
vi.mock('@better-auth/api-key', () => ({ apiKey: vi.fn() }));
vi.mock('better-auth-harmony', () => ({ emailHarmony: vi.fn() }));
vi.mock('@/db/index', () => ({ getDb: async () => ({}) }));
vi.mock('@/mail', () => ({ sendEmail: vi.fn() }));
vi.mock('@/newsletter', () => ({ subscribe: mocks.subscribe }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/e2e', () => ({ isE2ETestMode: mocks.e2e }));
vi.mock('@/config/website', () => ({
  websiteConfig: {
    auth: {},
    newsletter: mocks.newsletter,
    i18n: { defaultLocale: 'en', locales: { en: {}, zh: {} } },
  },
}));
await import('@/lib/auth');

const onCreateUser = mocks.betterAuth.mock.calls[0][0].databaseHooks.user.create
  .after as (user: { email: string }) => Promise<void>;

describe('signup newsletter lifecycle', () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.subscribe.mockReset().mockResolvedValue(true);
    mocks.e2e.mockReturnValue(false);
    mocks.newsletter.enable = true;
    mocks.newsletter.autoSubscribeAfterSignUp = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('returns before subscription and awaits delayed work in after', async () => {
    vi.useFakeTimers();
    await onCreateUser({ email: 'reader@example.test' });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    const pending = mocks.after.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(1999);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(mocks.subscribe).toHaveBeenCalledWith('reader@example.test');
  });

  test.each(['e2e', 'disabled', 'manual', 'no-email'])(
    'does not schedule subscription when %s',
    async (condition) => {
      mocks.e2e.mockReturnValue(condition === 'e2e');
      mocks.newsletter.enable = condition !== 'disabled';
      mocks.newsletter.autoSubscribeAfterSignUp = condition !== 'manual';
      await onCreateUser({
        email: condition === 'no-email' ? '' : 'reader@example.test',
      });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.subscribe).not.toHaveBeenCalled();
    }
  );

  test.each([false, new Error('Provider unavailable')])(
    'contains provider failure in the background task (%s)',
    async (result) => {
      vi.useFakeTimers();
      if (result instanceof Error) mocks.subscribe.mockRejectedValue(result);
      else mocks.subscribe.mockResolvedValue(result);
      await onCreateUser({ email: 'reader@example.test' });
      const pending = mocks.after.mock.calls[0][0]();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    }
  );
});
