/** 裂变机制三：结果页翻盘模块数据（spec §6 路由 5）。 */
import { json, preflight } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { logViralEvent, lossCtaEval } from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const identity = await resolveIdentity(req, sp.get('device_id') || '');
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const boutId = (sp.get('bout') || '').trim().slice(0, 40);
  const marketId = (sp.get('market') || '').trim().slice(0, 80);
  if (!boutId && !marketId)
    return json({ error: 'bout or market required' }, 400, req);

  const r = await lossCtaEval(
    boutId || null,
    identity.key,
    marketId || undefined
  );
  if (r.show) {
    await logViralEvent(identity.key, 'loss_cta_shown', {
      bout_id: boutId || undefined,
      market_id: marketId || undefined,
      loser_slug: r.loserSlug,
    });
  }

  return json(
    {
      show: r.show,
      loser_slug: r.loserSlug,
      loser_name: r.loserName,
      next_market_url: r.nextMarketUrl,
      next_market_id: r.nextMarketId,
    },
    200,
    req
  );
}
