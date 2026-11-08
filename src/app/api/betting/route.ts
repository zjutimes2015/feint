/** 押注 API：市场列表 / 排行榜 / 战绩 / 下注 / 每日领取。 */
import {
  DAILY_CLAIM,
  DAY_S,
  MAX_BET,
  getWallet,
  poolTotals,
} from '@/lib/brawlverse/betting';
import {
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);

  if (op === 'wallet') {
    const deviceId = new URL(req.url).searchParams.get('device_id') || '';
    // 双轨身份:登录用户免 device_id,游客用设备指纹
    const identity = await resolveIdentity(req, deviceId);
    if (!identity) return json({ error: 'device_id required' }, 400, req);
    const dh = identity.key;
    const w = await getWallet(dh);
    const e = await entitlements(dh);
    const last = Number(w!.last_claim);
    const now = Date.now() / 1000;
    return json(
      {
        balance: Number(w!.balance),
        last_claim: last,
        next_claim_in_s: last
          ? Math.max(0, Math.trunc(DAY_S - (now - last)))
          : 0,
        daily_claim: DAILY_CLAIM * e.daily_mult,
        max_bet: MAX_BET * e.bet_max_mult,
        tier: e.tier,
        vote_weight: e.vote_weight,
      },
      200,
      req
    );
  }

  if (op === 'markets') {
    const rows = await qAll<Record<string, any>>(
      "SELECT * FROM bet_markets WHERE status IN ('open','locked') ORDER BY created_at DESC"
    );
    const out = [];
    for (const m of rows) {
      const sels: string[] = JSON.parse(m.selections);
      const pools = await poolTotals(m.id);
      const total = Object.values(pools).reduce((a, b) => a + b, 0);
      const odds: Record<string, number | null> = {};
      for (const s of sels) {
        const p = pools[s] || 0;
        odds[s] = p > 0 ? Math.round((total / p) * 100) / 100 : null;
      }
      let house: Record<string, number> = {};
      try {
        house = JSON.parse(m.house_pool || '{}');
      } catch {
        house = {};
      }
      out.push({
        id: m.id,
        bout_id: m.bout_id,
        market_type: m.market_type,
        question: m.question,
        selections: sels,
        status: m.status,
        pools,
        total_pool: total,
        implied_odds: odds,
        house_seed: house,
      });
    }
    return json({ markets: out }, 200, req);
  }

  if (op === 'leaderboard') {
    const rows = await qAll<{ device_hash: string; balance: string }>(
      'SELECT device_hash, balance FROM bet_wallets ORDER BY balance DESC LIMIT 20'
    );
    const board = rows.map((r, i) => ({
      rank: i + 1,
      player: r.device_hash.slice(0, 8),
      balance: Number(r.balance),
    }));
    return json({ leaderboard: board }, 200, req);
  }

  if (op === 'records') {
    const rows = await qAll<{
      fighter: string;
      wins: number;
      losses: number;
      kos: number;
    }>(
      'SELECT fighter, wins, losses, kos FROM fighter_records ORDER BY wins DESC, kos DESC'
    );
    return json(
      {
        records: rows.map((r) => ({
          fighter: r.fighter,
          wins: r.wins,
          losses: r.losses,
          kos: r.kos,
        })),
      },
      200,
      req
    );
  }

  return json({ error: 'unknown op' }, 400, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op === 'bet') return bet(req);
  if (op === 'claim') return claim(req);
  return json({ error: 'unknown op' }, 400, req);
}

async function bet(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const marketId = String(v.market_id || '').trim();
  const selection = String(v.selection || '').trim();
  let amount = 0;
  try {
    amount = Math.trunc(Number(v.amount || 0));
  } catch {
    amount = 0;
  }

  // 双轨身份:登录用户用账号,游客用设备指纹
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) {
    return json(
      { error: 'market_id, selection, device_id required' },
      400,
      req
    );
  }
  if (!marketId || !selection) {
    return json(
      { error: 'market_id, selection, device_id required' },
      400,
      req
    );
  }

  const dh = identity.key;
  const e = await entitlements(dh);
  const cap = MAX_BET * e.bet_max_mult;
  if (!Number.isFinite(amount) || amount <= 0 || amount > cap) {
    return json({ error: `amount must be 1..${cap}` }, 400, req);
  }

  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: 'rate limited: slow down' }, 429, req);
  }

  const m = await qOne<Record<string, any>>(
    'SELECT * FROM bet_markets WHERE id = $1',
    [marketId]
  );
  if (!m) return json({ error: 'market not found' }, 404, req);
  if (m.status !== 'open')
    return json({ error: `market is ${m.status}` }, 409, req);
  const sels: string[] = JSON.parse(m.selections);
  if (!sels.includes(selection))
    return json({ error: 'invalid selection' }, 400, req);

  const w = await getWallet(dh);
  const balance = Number(w!.balance);
  if (balance < amount) {
    return json({ error: 'insufficient balance', balance }, 409, req);
  }

  const ua = req.headers.get('user-agent') || '';
  const now = Date.now() / 1000;
  await qWrite(
    'UPDATE bet_wallets SET balance = balance - $1 WHERE device_hash = $2',
    [amount, dh]
  );
  await qWrite(
    'INSERT INTO bets (market_id, device_hash, selection, amount, ip_ua, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [marketId, dh, selection, amount, sha(ip + '|' + ua), now]
  );
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [dh, -amount, 'bet_placed', marketId, now]
  );

  return json(
    {
      ok: true,
      market_id: marketId,
      selection,
      amount,
      balance: balance - amount,
    },
    200,
    req
  );
}

async function claim(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  // 双轨身份:登录用户用账号,游客用设备指纹
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) {
    return json({ error: 'device_id required' }, 400, req);
  }

  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: 'rate limited: slow down' }, 429, req);
  }

  const dh = identity.key;
  const w = await getWallet(dh);
  const now = Date.now() / 1000;
  const e = await entitlements(dh);
  const amount = DAILY_CLAIM * e.daily_mult;
  const lastClaim = Number(w!.last_claim);
  const balance = Number(w!.balance);

  if (now - lastClaim < DAY_S) {
    return json(
      {
        error: 'already claimed',
        next_claim_in_s: Math.trunc(DAY_S - (now - lastClaim)),
        balance,
      },
      409,
      req
    );
  }

  await qWrite(
    'UPDATE bet_wallets SET balance = balance + $1, last_claim = $2 WHERE device_hash = $3',
    [amount, now, dh]
  );
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [dh, amount, 'daily_claim', '', now]
  );

  return json(
    { ok: true, claimed: amount, balance: balance + amount },
    200,
    req
  );
}
