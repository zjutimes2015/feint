export const E2E_TEST_SECRET = 'local-e2e-secret';

export const E2E_BETTER_AUTH_SECRET =
  'q7N4vP9xR2mK8cL5sT1wY6bD3fH0jA7uE4gZ9nQ2';

export const E2E_STRIPE_SECRET_KEY = 'sk_test_local_e2e';

export const E2E_STRIPE_WEBHOOK_SECRET = 'whsec_local_e2e';

export const E2E_USER_PASSWORD = 'Password123456!';

export interface E2EUser {
  email: string;
  name: string;
  password: string;
  role?: 'admin' | 'user';
}

export function createE2EUser(overrides: Partial<E2EUser> = {}): E2EUser {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    email: `e2e-${suffix}@example.test`,
    name: `E2E User ${suffix}`,
    password: E2E_USER_PASSWORD,
    ...overrides,
  };
}
