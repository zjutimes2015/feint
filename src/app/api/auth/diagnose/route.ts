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
export async function GET() {
  const baseUrl = getBaseUrl();

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
    database_error: null,
  };

  try {
    const db = await getDb();
    const result = await db.execute(sql`
      select name
      from (
        values ('user'), ('session'), ('account'), ('verification')
      ) as t (name)
      where to_regclass('public.' || quote_ident(name)) is not null
    `);
    const rows = result as unknown as { name: string }[];
    const found = new Set(rows.map((r) => r.name));
    report.tables = {
      user: found.has('user'),
      session: found.has('session'),
      account: found.has('account'),
      verification: found.has('verification'),
      all_present: found.size === 4,
    };
  } catch (error) {
    report.database_error =
      error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(report);
}
