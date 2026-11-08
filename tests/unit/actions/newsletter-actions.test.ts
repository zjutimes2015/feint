import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  isSubscribed: vi.fn(),
  sendEmail: vi.fn(),
  after: vi.fn(),
  mail: { enable: true },
}));
vi.mock('@/lib/server', () => ({ getSession: mocks.session }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'zh' }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/mail', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/newsletter', () => ({
  subscribe: mocks.subscribe,
  unsubscribe: mocks.unsubscribe,
  isSubscribed: mocks.isSubscribed,
}));
vi.mock('@/config/website', () => ({
  websiteConfig: { mail: mocks.mail },
}));
import { checkNewsletterStatusAction } from '@/actions/check-newsletter-status';
import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { unsubscribeNewsletterAction } from '@/actions/unsubscribe-newsletter';

const scheduledWork = () => {
  const [[callback]] = mocks.after.mock.calls;
  return callback as () => Promise<void>;
};

describe('newsletter actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.mail.enable = true;
    mocks.session.mockResolvedValue({
      user: { id: 'user_1', email: 'reader@example.test' },
    });
    mocks.subscribe.mockResolvedValue(true);
    mocks.unsubscribe.mockResolvedValue(true);
    mocks.isSubscribed.mockResolvedValue(true);
    mocks.sendEmail.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    ['subscribe', subscribeNewsletterAction, mocks.subscribe],
    ['unsubscribe', unsubscribeNewsletterAction, mocks.unsubscribe],
    ['status', checkNewsletterStatusAction, mocks.isSubscribed],
  ] as const)(
    'normalizes the %s email before calling the provider',
    async (_name, action, provider) => {
      const result = await action({ email: '  Reader@Example.TEST ' });

      expect(result?.data?.success).toBe(true);
      expect(provider).toHaveBeenCalledWith('reader@example.test');
    }
  );

  test('rejects an invalid email without calling the provider', async () => {
    const result = await subscribeNewsletterAction({
      email: '  not-an-email ',
    });

    expect(result?.validationErrors).toBeDefined();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  test.each([
    ['unsubscribe', unsubscribeNewsletterAction, mocks.unsubscribe],
    ['status', checkNewsletterStatusAction, mocks.isSubscribed],
  ] as const)(
    'rejects %s access to another email',
    async (_name, action, provider) => {
      const result = await action({ email: 'other@example.test' });

      expect(result?.data?.success).toBe(false);
      expect(provider).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['unsubscribe', unsubscribeNewsletterAction, mocks.unsubscribe],
    ['status', checkNewsletterStatusAction, mocks.isSubscribed],
  ] as const)('requires a session for %s', async (_name, action, provider) => {
    mocks.session.mockResolvedValue(null);
    const result = await action({ email: 'reader@example.test' });

    expect(result?.serverError).toBeDefined();
    expect(provider).not.toHaveBeenCalled();
  });

  test.each([
    ['unsubscribe', unsubscribeNewsletterAction, mocks.unsubscribe],
    ['status', checkNewsletterStatusAction, mocks.isSubscribed],
  ] as const)(
    'normalizes the session email for %s',
    async (_name, action, provider) => {
      mocks.session.mockResolvedValue({
        user: { id: 'user_1', email: '  Reader@Example.TEST ' },
      });
      const result = await action({ email: 'reader@example.test' });

      expect(result?.data?.success).toBe(true);
      expect(provider).toHaveBeenCalledWith('reader@example.test');
    }
  );

  test('responds before sending the welcome email after a delay', async () => {
    vi.useFakeTimers();

    const result = await subscribeNewsletterAction({
      email: 'Reader@Example.test',
    });

    expect(result?.data?.success).toBe(true);
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    const pending = scheduledWork()();
    await vi.advanceTimersByTimeAsync(2999);
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: 'reader@example.test',
      template: 'subscribeNewsletter',
      context: { email: 'reader@example.test' },
      locale: 'zh',
    });
  });

  test('keeps the subscription successful when the welcome email fails', async () => {
    vi.useFakeTimers();
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'boom' });

    const result = await subscribeNewsletterAction({
      email: 'reader@example.test',
    });
    const pending = scheduledWork()();
    await vi.advanceTimersByTimeAsync(3000);
    await pending;

    expect(result?.data?.success).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      'newsletter welcome email error:',
      'boom'
    );
  });

  test('skips the welcome email when mail is disabled', async () => {
    mocks.mail.enable = false;

    const result = await subscribeNewsletterAction({
      email: 'reader@example.test',
    });

    expect(result?.data?.success).toBe(true);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  test('does not schedule a welcome email when subscribing fails', async () => {
    mocks.subscribe.mockResolvedValue(false);

    const result = await subscribeNewsletterAction({
      email: 'reader@example.test',
    });

    expect(result?.data?.success).toBe(false);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
