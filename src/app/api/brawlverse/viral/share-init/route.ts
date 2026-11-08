/** 裂变机制二：用户点 Share on X —— 记发起 + 返回拼好的 X intent URL（spec §6 路由 2）。 */
import { json, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { logShareInit, logViralEvent } from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

const SHARE_BASE = 'https://www.feint.tv/bet';

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

  // 预填文案：客户端可传 pick（如 "VIPER by KO"），缺省用通用版
  const pick = String(body.pick ?? '')
    .trim()
    .slice(0, 60);
  const text = pick
    ? `I just called ${pick} on BRAWLVERSE. What's your call?`
    : `I'm calling the fights on BRAWLVERSE. What's your call?`;
  const url = `${SHARE_BASE}?utm_source=x&utm_medium=share_unlock`;
  const intentUrl =
    'https://twitter.com/intent/tweet?text=' +
    encodeURIComponent(`${text} 🥊`) +
    '&url=' +
    encodeURIComponent(url) +
    '&hashtags=' +
    encodeURIComponent('BRAWLVERSE');

  await logShareInit(identity.key, contentId);
  await logViralEvent(identity.key, 'share_initiated', {
    content_id: contentId,
  });

  return json({ intent_url: intentUrl }, 200, req);
}
