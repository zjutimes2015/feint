/**
 * Newsletter 订阅 API。
 * POST /api/subscribe {email} → 存入 newsletter_subscribers（幂等）。
 */
import { checkRate, clientIp, qWrite } from '@/lib/brawlverse/db';
import { json, preflight, readJson } from '@/lib/brawlverse/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request): Promise<Response> {
  return preflight(req);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubscribeBody {
  email?: string;
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: 'rate_limited' }, 429, req);
  }

  const body = await readJson<SubscribeBody>(req);
  const email = (body.email ?? '').trim().toLowerCase();

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'invalid_email' }, 400, req);
  }

  await qWrite(
    `INSERT INTO newsletter_subscribers (email, created_at)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email, Date.now() / 1000]
  );

  return json({ success: true }, 200, req);
}
