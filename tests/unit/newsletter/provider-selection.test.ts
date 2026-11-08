import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { NewsletterConfig } from '@/types';

const mocks = vi.hoisted(() => ({
  newsletter: { enable: true, provider: 'mailcheap' } as NewsletterConfig,
}));

vi.mock('@/config/website', () => ({
  websiteConfig: { newsletter: mocks.newsletter },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.newsletter.provider = 'mailcheap';
  vi.stubEnv('MAILCHEAP_API_KEY', 'mc_test');
  vi.stubEnv('MAILCHEAP_NEWSLETTER_ID', 'weekly');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('the module uses MailCheap for subscription, status, unsubscribe and re-subscription', async () => {
  let active = false;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_, options) => {
      if (options?.method === 'POST') active = true;
      if (options?.method === 'PATCH') active = false;
      return new Response(
        JSON.stringify({
          id: 'contact',
          status: active ? 'active' : 'unsubscribed',
        })
      );
    });
  vi.stubGlobal('fetch', fetcher);
  const { getNewsletterProvider, isSubscribed, subscribe, unsubscribe } =
    await import('@/newsletter');
  expect(getNewsletterProvider().getProviderName()).toBe('mailcheap');
  expect(getNewsletterProvider()).toBe(getNewsletterProvider());
  expect(await isSubscribed(' Reader@Example.TEST ')).toBe(false);
  expect(await subscribe(' Reader@Example.TEST ')).toBe(true);
  expect(await isSubscribed('reader@example.test')).toBe(true);
  expect(await unsubscribe('reader@example.test')).toBe(true);
  expect(await isSubscribed('reader@example.test')).toBe(false);
  expect(await subscribe('reader@example.test')).toBe(true);
  expect(await isSubscribed('reader@example.test')).toBe(true);
});

test.each(['resend', 'beehiiv'] as const)(
  'existing %s provider initializes without MailCheap credentials',
  async (name) => {
    mocks.newsletter.provider = name;
    vi.stubEnv('MAILCHEAP_API_KEY', undefined);
    vi.stubEnv('MAILCHEAP_NEWSLETTER_ID', undefined);
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('BEEHIIV_API_KEY', 'beehiiv_test');
    vi.stubEnv('BEEHIIV_PUBLICATION_ID', 'publication_test');
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const { getNewsletterProvider } = await import('@/newsletter');
    expect(getNewsletterProvider().getProviderName()).toBe(name);
    expect(fetcher).not.toHaveBeenCalled();
  }
);

test('MailCheap initialization requires its settings before making requests', async () => {
  vi.stubEnv('MAILCHEAP_NEWSLETTER_ID', undefined);
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  const { getNewsletterProvider } = await import('@/newsletter');
  expect(getNewsletterProvider).toThrow(
    'Configure MAILCHEAP_API_KEY and MAILCHEAP_NEWSLETTER_ID'
  );
  expect(fetcher).not.toHaveBeenCalled();
});
