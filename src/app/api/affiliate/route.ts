/**
 * 联盟营销 API。
 * GET  ?op=dashboard&device_id= → 联盟看板（点击/转化/待结算/已结算）
 * POST ?op=apply {device_id}    → 申请成为联盟伙伴（待审核）
 * POST ?op=click {code}         → 记录联盟链接点击（30 天归因）
 */
import { checkRate, clientIp, sha } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import {
  applyAffiliate,
  getAffiliateDashboard,
  trackAffiliateClick,
} from '@/lib/growth/logic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  if (op !== 'dashboard') return json({ ok: false, error: 'bad_op' }, 400);
  if (!(await checkRate(clientIp(req))))
    return json({ ok: false, error: 'rate_limited' }, 429);
  const url = new URL(req.url);
  const identity = await resolveIdentity(
    req,
    url.searchParams.get('device_id') || undefined
  );
  if (!identity) return json({ ok: false, error: 'identity_required' }, 400);
  const dashboard = await getAffiliateDashboard(identity.key);
  if (!dashboard) return json({ ok: false, error: 'not_affiliate' }, 404);
  return json({ ok: true, ...dashboard });
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (!(await checkRate(clientIp(req))))
    return json({ ok: false, error: 'rate_limited' }, 429);
  const body = await readJson<{ code?: string; device_id?: string }>(req);

  if (op === 'click') {
    const code = (body.code || '').trim().toUpperCase();
    if (!code) return json({ ok: false, error: 'code_required' }, 400);
    await trackAffiliateClick(code, sha(clientIp(req)));
    return json({ ok: true });
  }

  if (op === 'apply') {
    const identity = await resolveIdentity(req, body.device_id);
    if (!identity) return json({ ok: false, error: 'identity_required' }, 400);
    const result = await applyAffiliate(identity.key);
    if (!result.ok)
      return json({ ok: false, error: result.error, code: result.code }, 400);
    return json({ ok: true, code: result.code });
  }

  return json({ ok: false, error: 'bad_op' }, 400);
}
