import {
  E2E_TEST_SECRET_HEADER,
  isE2ETestMode,
  isValidE2ETestRequest,
} from '@/lib/e2e';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('E2E-only request guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('accepts the configured local development secret', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_TEST_SECRET', 'local-e2e-secret');
    const request = new Request('http://localhost/api/e2e/users', {
      headers: { [E2E_TEST_SECRET_HEADER]: 'local-e2e-secret' },
    });

    expect(isE2ETestMode()).toBe(true);
    expect(isValidE2ETestRequest(request)).toBe(true);
  });

  test('rejects the endpoint outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_TEST_SECRET', 'local-e2e-secret');
    const request = new Request('https://example.com/api/e2e/users', {
      headers: { [E2E_TEST_SECRET_HEADER]: 'local-e2e-secret' },
    });

    expect(isE2ETestMode()).toBe(false);
    expect(isValidE2ETestRequest(request)).toBe(false);
  });

  test('rejects missing or incorrect secrets', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_TEST_SECRET', 'wrong-secret');

    expect(isE2ETestMode()).toBe(false);
    expect(
      isValidE2ETestRequest(
        new Request('http://localhost/api/e2e/users', {
          headers: { [E2E_TEST_SECRET_HEADER]: 'local-e2e-secret' },
        })
      )
    ).toBe(false);
  });
});
