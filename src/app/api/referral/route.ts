/**
 * 邀请 API。
 * GET  ?op=stats&device_id=   → 我的邀请码 + 统计
 * POST ?op=redeem {code, device_id} → 使用邀请码（注册时调用）
 */
import { checkRate, clientIp } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { getReferralStats, redeemReferralCode } from '@/lib/growth/logic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  if (op !== 'stats') return json({ ok: false, error: 'bad_op' }, 400);
  if (!(await checkRate(clientIp(req))))
    return json({ ok: false, error: 'rate_limited' }, 429);
  const url = new URL(req.url);
  const identity = await resolveIdentity(
    req,
    url.searchParams.get('device_id') || undefined
  );
  if (!identity) return json({ ok: false, error: 'identity_required' }, 400);
  const stats = await getReferralStats(identity.key);
  return json({ ok: true, ...stats });
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op !== 'redeem') return json({ ok: false, error: 'bad_op' }, 400);
  if (!(await checkRate(clientIp(req))))
    return json({ ok: false, error: 'rate_limited' }, 429);
  const body = await readJson<{ code?: string; device_id?: string }>(req);
  const identity = await resolveIdentity(req, body.device_id);
  if (!identity) return json({ ok: false, error: 'identity_required' }, 400);
  const code = (body.code || '').trim().toUpperCase();
  if (!code) return json({ ok: false, error: 'code_required' }, 400);
  const result = await redeemReferralCode(identity.key, code);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true });
}
