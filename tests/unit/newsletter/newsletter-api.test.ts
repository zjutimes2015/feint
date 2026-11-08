import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  checkSubscribeStatus: vi.fn(),
}));
vi.mock('@/newsletter/provider/resend', () => ({
  ResendNewsletterProvider: class {
    subscribe = mocks.subscribe;
    unsubscribe = mocks.unsubscribe;
    checkSubscribeStatus = mocks.checkSubscribeStatus;
    getProviderName = () => 'resend';
  },
}));
vi.mock('@/config/website', () => ({
  websiteConfig: { newsletter: { enable: true, provider: 'resend' } },
}));
import { isSubscribed, subscribe, unsubscribe } from '@/newsletter';

describe('newsletter API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test.each([
    ['subscribe', subscribe, mocks.subscribe],
    ['unsubscribe', unsubscribe, mocks.unsubscribe],
    ['isSubscribed', isSubscribed, mocks.checkSubscribeStatus],
  ] as const)(
    '%s passes a trimmed, lowercased email to the provider',
    async (_name, fn, provider) => {
      provider.mockResolvedValue(true);

      await expect(fn('  Reader@Example.TEST ')).resolves.toBe(true);
      expect(provider).toHaveBeenCalledWith({ email: 'reader@example.test' });
    }
  );
});
