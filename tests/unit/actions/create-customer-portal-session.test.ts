import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  portal: vi.fn(),
  provider: vi.fn(),
  customerRows: vi.fn(),
  locale: vi.fn(),
}));

vi.mock('@/lib/server', () => ({ getSession: mocks.session }));
vi.mock('next-intl/server', () => ({ getLocale: mocks.locale }));
vi.mock('@/payment', () => ({
  createCustomerPortal: mocks.portal,
  getPaymentProvider: mocks.provider,
}));
vi.mock('@/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.customerRows }),
      }),
    }),
  }),
}));

import { createPortalAction } from '@/actions/create-customer-portal-session';

describe('customer portal return URL security', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: 'actual_user', name: 'Buyer', email: 'buyer@example.test' },
    });
    mocks.portal.mockResolvedValue({
      id: 'portal_test',
      url: 'https://billing.example.test',
    });
    mocks.provider.mockReturnValue({ requiresCustomerId: false });
    mocks.customerRows.mockResolvedValue([]);
    mocks.locale.mockResolvedValue('en');
  });

  test.each([
    'https://attacker.example/settings/billing',
    '//attacker.example/settings/billing',
    'https://localhost:3000/settings/billing',
    'http://sub.localhost:3000/settings/billing',
    'http://localhost:3001/settings/billing',
  ])('rejects an untrusted return URL: %s', async (returnUrl) => {
    const result = await createPortalAction({
      userId: 'spoofed_user',
      returnUrl,
    });

    expect(result?.data).toEqual({
      success: false,
      error: 'Payment return URL must use the application origin',
    });
    expect(mocks.portal).not.toHaveBeenCalled();
  });

  test.each([
    ['/settings/billing', 'http://localhost:3000/settings/billing'],
    [
      'http://localhost:3000/settings/billing?source=portal',
      'http://localhost:3000/settings/billing?source=portal',
    ],
  ])('allows a trusted return URL: %s', async (returnUrl, expected) => {
    const result = await createPortalAction({
      userId: 'spoofed_user',
      returnUrl,
    });

    expect(result?.data?.success).toBe(true);
    expect(mocks.portal).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'actual_user',
        returnUrl: expected,
      })
    );
  });
});

describe('customer portal session creation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: 'actual_user', name: 'Buyer', email: 'buyer@example.test' },
    });
    mocks.portal.mockResolvedValue({ url: 'https://billing.example.test' });
    mocks.provider.mockReturnValue({});
    mocks.customerRows.mockResolvedValue([{ customerId: 'cus_stored' }]);
    mocks.locale.mockResolvedValue('zh');
  });

  test('uses the stored customer ID and the localized Billing return URL', async () => {
    const result = await createPortalAction({ userId: 'spoofed_user' });

    expect(result?.data).toEqual({
      success: true,
      data: { url: 'https://billing.example.test' },
    });
    expect(mocks.portal).toHaveBeenCalledWith({
      customerId: 'cus_stored',
      returnUrl: 'http://localhost:3000/zh/settings/billing',
      locale: 'zh',
    });
  });

  test.each([[[]], [[{ customerId: null }]]])(
    'rejects a user without a stored customer ID: %j',
    async (rows) => {
      mocks.customerRows.mockResolvedValue(rows);

      const result = await createPortalAction({ userId: 'actual_user' });

      expect(result?.data).toEqual({
        success: false,
        error: 'No customer found for user',
      });
      expect(mocks.portal).not.toHaveBeenCalled();
    }
  );

  test('returns a failure result when the provider cannot create a portal', async () => {
    mocks.portal.mockRejectedValue(
      new Error('Failed to create customer portal')
    );

    const result = await createPortalAction({ userId: 'actual_user' });

    expect(result?.data).toEqual({
      success: false,
      error: 'Failed to create customer portal',
    });
  });
});
