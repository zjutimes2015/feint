import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { userAdditionalFields } from '@/lib/auth-user-fields';

function setup() {
  const database = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'local-customer-id-test-secret-long-enough',
    database: memoryAdapter(database),
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true },
    user: { additionalFields: userAdditionalFields },
  });
  const post = (path: string, body: object, cookie = '') =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      })
    );
  const account = {
    email: 'customer-id@example.test',
    name: 'Customer Test',
    password: 'test-password-123',
  };
  return { database, post, account };
}

describe('provider-owned customer IDs through auth endpoints', () => {
  it('rejects signup injection without creating an account', async () => {
    const { database, post, account } = setup();
    const response = await post('sign-up/email', {
      ...account,
      customerId: 'cus_other_test',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
    expect(database.user).toHaveLength(0);
  });

  it('preserves provider mapping while allowing ordinary profile updates', async () => {
    const { database, post, account } = setup();
    const signup = await post('sign-up/email', account);
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(cookie).not.toBe('');
    const user = database.user[0] as { name: string; customerId?: string };
    // Simulate the trusted provider's database write, outside public auth inputs.
    user.customerId = 'cus_owner_test';

    const rejected = await post(
      'update-user',
      { name: 'Injected name', customerId: 'cus_other_test' },
      cookie
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
    expect(database.user[0]).toMatchObject({
      name: account.name,
      customerId: 'cus_owner_test',
    });

    for (const customerId of ['', null, undefined]) {
      const updated = await post(
        'update-user',
        { name: 'Updated profile', customerId },
        cookie
      );
      expect(updated.status).toBe(200);
      expect(database.user[0]).toMatchObject({
        name: 'Updated profile',
        customerId: 'cus_owner_test',
      });
    }
  });
});
