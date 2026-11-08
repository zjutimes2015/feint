/** 裂变机制一：结算页数据 + 近失判定（spec §6 路由 4）。 */
import { json, preflight } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { logViralEvent, nearMissEval } from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const identity = await resolveIdentity(req, sp.get('device_id') || '');
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const marketId = (sp.get('market') || '').trim().slice(0, 80);
  if (!marketId) return json({ error: 'market required' }, 400, req);

  const r = await nearMissEval(marketId, identity.key);
  if (r.triggered) {
    await logViralEvent(identity.key, 'near_miss_shown', {
      market_id: marketId,
      user_side: r.userSide,
      peak_price: r.peakPrice,
      final_price: r.finalPrice,
    });
  }

  return json(
    {
      market_id: marketId,
      user_side: r.userSide,
      winning_side: r.winningSide,
      near_miss: {
        triggered: r.triggered,
        peak_price: r.peakPrice,
        final_price: r.finalPrice,
      },
    },
    200,
    req
  );
}
