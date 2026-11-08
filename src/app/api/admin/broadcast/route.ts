/**
 * 管理员广播 API（手动触发）。
 * POST /api/admin/broadcast {subject, html} → 发给全部订阅者。
 *
 * 鉴权：请求头 x-admin-secret 必须等于 ADMIN_SECRET 环境变量。
 * 用法示例：
 *   curl -X POST https://<host>/api/admin/broadcast \
 *     -H 'Content-Type: application/json' \
 *     -H 'x-admin-secret: <ADMIN_SECRET>' \
 *     -d '{"subject":"Fight night is live","html":"<p>...</p>"}'
 */
import { qAll } from '@/lib/brawlverse/db';
import { json, preflight, readJson } from '@/lib/brawlverse/http';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request): Promise<Response> {
  return preflight(req);
}

interface BroadcastBody {
  subject?: string;
  html?: string;
}

interface SubscriberRow {
  email: string;
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('[broadcast] ADMIN_SECRET is not set');
    return json({ error: 'not_configured' }, 503, req);
  }

  const provided = req.headers.get('x-admin-secret') ?? '';
  if (provided !== secret) {
    return json({ error: 'unauthorized' }, 401, req);
  }

  const body = await readJson<BroadcastBody>(req);
  const subject = (body.subject ?? '').trim();
  const html = (body.html ?? '').trim();

  if (!subject || !html) {
    return json({ error: 'invalid_body' }, 400, req);
  }
  if (subject.length > 200 || html.length > 100000) {
    return json({ error: 'body_too_large' }, 400, req);
  }

  const rows = await qAll<SubscriberRow>(
    `SELECT email FROM newsletter_subscribers ORDER BY created_at ASC`
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await sendEmail({ to: row.email, subject, html });
    if (result.success) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return json({ success: true, total: rows.length, sent, failed }, 200, req);
}
