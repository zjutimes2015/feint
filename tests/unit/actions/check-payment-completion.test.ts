import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
}));

const paymentRows = [{ paid: false }, { paid: true }];

vi.mock('@/lib/server', () => ({ getSession: mocks.session }));
vi.mock('@/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          const query = new PgDialect().sqlToQuery(condition);
          const requiresPaid =
            query.sql.includes('"payment"."paid" = $') &&
            query.params.includes(true);
          const matchingRows = requiresPaid
            ? paymentRows.filter((row) => row.paid)
            : paymentRows;

          return {
            limit: async (count: number) => matchingRows.slice(0, count),
          };
        },
      }),
    }),
  }),
}));

import { checkPaymentCompletionAction } from '@/actions/check-payment-completion';

describe('payment completion polling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: 'actual_user', name: 'Buyer', email: 'buyer@example.test' },
    });
  });

  test('returns paid when a session has both pending and paid records', async () => {
    const result = await checkPaymentCompletionAction({
      sessionId: 'checkout_session',
    });

    expect(result?.data).toEqual({ success: true, isPaid: true });
  });
});
