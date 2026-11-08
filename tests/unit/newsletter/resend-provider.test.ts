import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
}));
vi.mock('resend', () => ({
  Resend: class {
    contacts = {
      create: mocks.create,
      update: mocks.update,
      get: mocks.get,
    };
  },
}));
import { ResendNewsletterProvider } from '@/newsletter/provider/resend';

const email = 'reader@example.test';

describe('Resend newsletter provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.RESEND_API_KEY = 're_test';
  });

  test('subscribes a new contact with a single create request', async () => {
    mocks.create.mockResolvedValue({ data: { id: 'c_1' }, error: null });

    await expect(
      new ResendNewsletterProvider().subscribe({ email })
    ).resolves.toBe(true);

    expect(mocks.create).toHaveBeenCalledWith({ email, unsubscribed: false });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('resubscribes an existing contact when create fails', async () => {
    mocks.create.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Contact already exists' },
    });
    mocks.update.mockResolvedValue({ data: { id: 'c_1' }, error: null });

    await expect(
      new ResendNewsletterProvider().subscribe({ email })
    ).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith({ email, unsubscribed: false });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  test('fails when both create and update fail', async () => {
    const error = { name: 'rate_limit_exceeded', message: 'Too many requests' };
    mocks.create.mockResolvedValue({ data: null, error });
    mocks.update.mockResolvedValue({ data: null, error });

    await expect(
      new ResendNewsletterProvider().subscribe({ email })
    ).resolves.toBe(false);
  });

  test('fails without throwing when the SDK rejects', async () => {
    mocks.create.mockRejectedValue(new Error('network down'));

    await expect(
      new ResendNewsletterProvider().subscribe({ email })
    ).resolves.toBe(false);
  });

  test('requires RESEND_API_KEY', () => {
    delete process.env.RESEND_API_KEY;

    expect(() => new ResendNewsletterProvider()).toThrow('RESEND_API_KEY');
  });
});
