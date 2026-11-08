import { getDb } from '@/db/index';
import { getBaseUrl } from '@/lib/urls';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auth self-check.
 *
 * Google sign-in failures land on /auth/error with no detail, so this endpoint
 * reports the three things that actually break OAuth in production: the base
 * URL used to build the callback, whether provider credentials were injected,
 * and whether the Better Auth tables exist in the connected database.
 *
 * GET /api/auth/diagnose
 */
export async function GET(request: Request) {
  const baseUrl = getBaseUrl();
  const tokenProbe = new URL(request.url).searchParams.get('token_probe');

  const report: Record<string, unknown> = {
    base_url: baseUrl,
    next_public_base_url: Boolean(process.env.NEXT_PUBLIC_BASE_URL),
    google_client_id: Boolean(process.env.GOOGLE_CLIENT_ID),
    google_client_secret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    github_client_id: Boolean(process.env.GITHUB_CLIENT_ID),
    github_client_secret: Boolean(process.env.GITHUB_CLIENT_SECRET),
    auth_secret: Boolean(
      process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
    ),
    database_url: Boolean(process.env.DATABASE_URL),
    google_redirect_uri: `${baseUrl}/api/auth/callback/google`,
    github_redirect_uri: `${baseUrl}/api/auth/callback/github`,
    vercel_hosts: [
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_URL,
    ].filter(Boolean),
    tables: null,
    missing_columns: null,
    database_error: null,
  };

  try {
    const db = await getDb();
    const result = await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('user', 'session', 'account', 'verification', 'apikey')
    `);
    const rows = result as unknown as {
      table_name: string;
      column_name: string;
    }[];

    const present = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!present.has(row.table_name)) present.set(row.table_name, new Set());
      present.get(row.table_name)?.add(row.column_name);
    }

    // Required columns come from src/db/auth.schema.ts. A table that exists but
    // is missing a column fails at insert time and shows up as a generic
    // "something went wrong" page, so the drift has to be reported explicitly.
    const expected: Record<string, string[]> = {
      user: [
        'id',
        'name',
        'email',
        'normalized_email',
        'email_verified',
        'image',
        'created_at',
        'updated_at',
        'role',
        'banned',
        'ban_reason',
        'ban_expires',
        'customer_id',
      ],
      session: [
        'id',
        'expires_at',
        'token',
        'created_at',
        'updated_at',
        'ip_address',
        'user_agent',
        'user_id',
        'impersonated_by',
      ],
      account: [
        'id',
        'account_id',
        'provider_id',
        'user_id',
        'access_token',
        'refresh_token',
        'id_token',
        'access_token_expires_at',
        'refresh_token_expires_at',
        'scope',
        'password',
        'created_at',
        'updated_at',
      ],
      verification: [
        'id',
        'identifier',
        'value',
        'expires_at',
        'created_at',
        'updated_at',
      ],
      apikey: [
        'id',
        'config_id',
        'name',
        'start',
        'reference_id',
        'prefix',
        'key',
        'refill_interval',
        'refill_amount',
        'last_refill_at',
        'enabled',
        'rate_limit_enabled',
        'rate_limit_time_window',
        'rate_limit_max',
        'request_count',
        'remaining',
        'last_request',
        'expires_at',
        'created_at',
        'updated_at',
        'permissions',
        'metadata',
      ],
    };

    const missing: Record<string, string[]> = {};
    for (const [table, columns] of Object.entries(expected)) {
      const actual = present.get(table);
      if (!actual) {
        missing[table] = columns;
        continue;
      }
      const absent = columns.filter((column) => !actual.has(column));
      if (absent.length > 0) missing[table] = absent;
    }

    report.tables = {
      user: present.has('user'),
      session: present.has('session'),
      account: present.has('account'),
      verification: present.has('verification'),
      apikey: present.has('apikey'),
      all_present: ['user', 'session', 'account', 'verification'].every((t) =>
        present.has(t)
      ),
    };
    report.missing_columns = Object.keys(missing).length > 0 ? missing : 'none';
  } catch (error) {
    report.database_error =
      error instanceof Error ? error.message : String(error);
  }

  /**
   * Optional ?token_probe=1: exchanges a deliberately invalid code with Google.
   * Google still validates the client id/secret pair before the code, so
   * `invalid_grant` proves the stored secret is the one this client expects,
   * while `invalid_client` proves it is stale.
   */
  if (tokenProbe === '1') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (clientId && clientSecret) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: 'diagnostic_invalid_code',
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: `${baseUrl}/api/auth/callback/google`,
            grant_type: 'authorization_code',
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          error_description?: string;
        };
        report.google_token_probe = {
          status: response.status,
          error: payload.error ?? null,
          error_description: payload.error_description ?? null,
          verdict:
            payload.error === 'invalid_grant'
              ? 'client id/secret accepted'
              : payload.error === 'invalid_client'
                ? 'client id/secret rejected'
                : 'unexpected',
        };
      } catch (error) {
        report.google_token_probe = {
          status: null,
          error: error instanceof Error ? error.message : String(error),
          verdict: 'request failed',
        };
      }
    }
  }

  return NextResponse.json(report);
}
