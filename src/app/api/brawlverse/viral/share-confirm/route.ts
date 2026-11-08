/** 裂变机制二：用户点 I've shared —— 即时解锁（诚信模式，spec §6 路由 3）。幂等。 */
import { json, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { confirmShareUnlock, logViralEvent } from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const identity = await resolveIdentity(req, String(body.device_id ?? ''));
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const contentId = String(body.content_id ?? '')
    .trim()
    .slice(0, 80);
  if (!contentId) return json({ error: 'content_id required' }, 400, req);

  // 仅 share-gated 内容走此路由；milestone/tier 由各自逻辑判定
  if (!contentId.startsWith('backstory:')) {
    return json({ error: 'content is not share-gated' }, 400, req);
  }

  await confirmShareUnlock(identity.key, contentId);
  await logViralEvent(identity.key, 'share_confirmed', {
    content_id: contentId,
  });

  return json({ unlocked: true, content_id: contentId }, 200, req);
}
