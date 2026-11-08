import {
  CHOICES,
  checkRate,
  clientIp,
  qAll,
  qOne,
  qWrite,
  sha,
} from '@/lib/brawlverse/db';
import { entitlements } from '@/lib/brawlverse/entitlements';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { verifyTurnstile } from '@/lib/brawlverse/turnstile';
import { milestoneBump } from '@/lib/brawlverse/viral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, 'tally');
  if (op !== 'tally') return json({ error: 'unknown op' }, 400, req);

  const url = new URL(req.url);
  const boutId = url.searchParams.get('bout_id');
  const roundNo = parseInt(url.searchParams.get('round_no') || '1', 10) || 1;

  const rows = await qAll<{ choice: string; n: string }>(
    'SELECT choice, SUM(weight) AS n FROM votes WHERE bout_id = $1 AND round_no = $2 GROUP BY choice',
    [boutId, roundNo]
  );
  const tally: Record<string, number> = {
    heavy: 0,
    dodge: 0,
    guard: 0,
    rage: 0,
    fair: 0,
  };
  for (const r of rows) tally[r.choice] = Number(r.n);

  return json(
    {
      bout_id: boutId,
      round_no: roundNo,
      tally,
      total: Object.values(tally).reduce((a, b) => a + b, 0),
    },
    200,
    req
  );
}

export async function POST(req: Request) {
  const op = opOf(req, 'cast');
  if (op !== 'cast') return json({ error: 'unknown op' }, 400, req);

  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const choice = String(body.choice ?? '')
    .trim()
    .toLowerCase();
  if (!CHOICES.has(choice))
    return json({ error: 'choice must be heavy|dodge|guard' }, 400, req);

  const boutId = body.bout_id;
  const roundNo = body.round_no;
  if (!boutId || !roundNo) {
    return json({ error: 'bout_id, round_no required' }, 400, req);
  }

  // 双轨身份:登录用户用账号,游客用设备指纹
  const identity = await resolveIdentity(req, String(body.device_id ?? ''));
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const ip = clientIp(req);
  if (!(await checkRate(ip)))
    return json({ error: 'rate limited: slow down' }, 429, req);
  if (!(await verifyTurnstile(String(body.turnstile_token ?? ''), ip))) {
    return json({ error: '人机校验未通过,请稍后重试' }, 403, req);
  }

  const bout = await qOne<{ voting_open: number }>(
    'SELECT * FROM bouts WHERE id = $1',
    [boutId]
  );
  if (!bout) return json({ error: 'bout not found' }, 404, req);
  if (!bout.voting_open)
    return json({ error: 'voting is closed for this bout' }, 409, req);

  const ua = req.headers.get('user-agent') || '';
  const now = Date.now() / 1000;
  const dh = identity.key;
  const weight = (await entitlements(dh)).vote_weight;

  await qWrite(
    `INSERT INTO votes (bout_id, round_no, choice, device_hash, ip, ip_ua, weight, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (bout_id, round_no, device_hash)
     DO UPDATE SET choice = EXCLUDED.choice, weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at`,
    [
      boutId,
      Number(roundNo),
      choice,
      dh,
      ip,
      sha(ip + '|' + ua),
      weight,
      now,
      now,
    ]
  );

  // 裂变机制二：里程碑计数（幂等 recount，投票/改票都安全）
  try {
    await milestoneBump('qf2-trash-talk');
  } catch {
    /* 里程碑失败不影响投票主流程 */
  }

  return json(
    { ok: true, bout_id: boutId, round_no: Number(roundNo), choice, weight },
    200,
    req
  );
}
