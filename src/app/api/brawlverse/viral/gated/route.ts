/** 裂变机制二：G1–G4 内容列表 + 上锁状态（spec §6 路由 1）。 */
import { GATED_CONTENT } from '@/data/viral-gated-content';
import { getTier } from '@/lib/brawlverse/entitlements';
import { json, preflight } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import {
  getMilestone,
  isUnlocked,
  logViralEvent,
} from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

const TIER_RANK: Record<string, number> = {
  free: 0,
  ringside: 1,
  booker: 2,
  promoter: 3,
  annual: 3,
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const identity = await resolveIdentity(req, sp.get('device_id') || '');
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const tier = identity.authed ? await getTier(identity.key) : 'free';

  const items = [];
  for (const g of GATED_CONTENT) {
    let locked = true;
    let lockReason: 'share' | 'milestone' | 'tier' | 'unlocked' = 'share';
    let milestone: { current: number; threshold: number } | null = null;

    if (g.type === 'tier') {
      const ok =
        (TIER_RANK[tier] ?? 0) >= (TIER_RANK[g.minTier ?? 'booker'] ?? 2);
      locked = !ok;
      lockReason = ok ? 'unlocked' : 'tier';
    } else if (g.type === 'milestone' && g.milestoneId) {
      const ms = await getMilestone(g.milestoneId);
      if (ms) milestone = { current: ms.currentCount, threshold: ms.threshold };
      const un = await isUnlocked(identity.key, g.contentId);
      locked = !un;
      lockReason = un ? 'unlocked' : 'milestone';
    } else {
      // share / achievement：查解锁表（achievement v1 由外部逻辑发放，此处只读状态）
      const un = await isUnlocked(identity.key, g.contentId);
      locked = !un;
      lockReason = un
        ? 'unlocked'
        : g.type === 'achievement'
          ? 'share'
          : 'share';
    }

    items.push({
      content_id: g.contentId,
      type: g.type,
      title: g.title,
      locked,
      lock_reason: lockReason,
      ...(milestone ? { milestone } : {}),
    });
  }

  await logViralEvent(identity.key, 'gate_impression', { n: items.length });
  return json({ items }, 200, req);
}
