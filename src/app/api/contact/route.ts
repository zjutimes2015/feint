/**
 * 联系表单 API。
 * POST /api/contact {name, email, message} → Resend 发到站长邮箱。
 *
 * 环境变量：
 * - CONTACT_TO_EMAIL（必填）：收件人（站长邮箱）。
 * - RESEND_API_KEY（必填）：见 src/lib/email.ts。
 */
import { checkRate, clientIp } from '@/lib/brawlverse/db';
import { json, preflight, readJson } from '@/lib/brawlverse/http';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request): Promise<Response> {
  return preflight(req);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: 'rate_limited' }, 429, req);
  }

  const body = await readJson<ContactBody>(req);
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const message = (body.message ?? '').trim();

  if (name.length < 2 || name.length > 50) {
    return json({ error: 'invalid_name' }, 400, req);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'invalid_email' }, 400, req);
  }
  if (message.length < 10 || message.length > 2000) {
    return json({ error: 'invalid_message' }, 400, req);
  }

  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) {
    console.error('[contact] CONTACT_TO_EMAIL is not set');
    return json({ error: 'not_configured' }, 503, req);
  }

  const result = await sendEmail({
    to,
    subject: `[BRAWLVERSE Contact] ${name}`,
    html: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  if (!result.success) {
    return json({ error: 'send_failed' }, 502, req);
  }
  return json({ success: true }, 200, req);
}
