/** Phase 2: Kalshi 式事件合约市场 API。
 * 公开：markets / positions / tape / ticks / leaderboard / wallet
 * 管理（isAdmin）：open / lock / settle / blacklist
 * 纯虚拟积分；$AXON 永不进池；真钱冻结。
 */
import {
  executeTrade,
  feeSinkTotal,
  getPositions,
  getTape,
  getTicks,
  listContractMarkets,
  lockContractMarket,
  openContractMarket,
  pnlLeaderboard,
  quoteTrade,
  settleContractMarket,
} from '@/lib/brawlverse/contract';
import { getWallet } from '@/lib/brawlverse/betting';
import { checkRate, clientIp, qWrite } from '@/lib/brawlverse/db';
import { entitlements } from '@/lib/brawlverse/entitlements';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { isAdmin, resolveIdentity } from '@/lib/brawlverse/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  const sp = new URL(req.url).searchParams;

  if (op === 'markets') {
    const markets = await listContractMarkets();
    return json({ markets }, 200, req);
  }

  if (op === 'positions') {
    const identity = await resolveIdentity(req, sp.get('device_id') || '');
    if (!identity) return json({ error: 'device_id required' }, 400, req);
    return json({ positions: await getPositions(identity.key) }, 200, req);
  }

  if (op === 'tape') {
    const mid = sp.get('market_id') || '';
    if (!mid) return json({ error: 'market_id required' }, 400, req);
    return json(
      { tape: await getTape(mid, Number(sp.get('limit') || 30)) },
      200,
      req
    );
  }

  if (op === 'ticks') {
    const mid = sp.get('market_id') || '';
    if (!mid) return json({ error: 'market_id required' }, 400, req);
    return json(
      { ticks: await getTicks(mid, Number(sp.get('limit') || 100)) },
      200,
      req
    );
  }

  if (op === 'quote') {
    const mid = sp.get('market_id') || '';
    try {
      const q = await quoteTrade({
        marketId: mid,
        side: sp.get('side') as 'yes' | 'no',
        action: sp.get('action') as 'buy' | 'sell',
        credits: Number(sp.get('credits') || 0),
        contracts: Number(sp.get('contracts') || 0),
      });
      return json({ quote: q }, 200, req);
    } catch (e: any) {
      return json({ error: e.message }, e.status || 400, req);
    }
  }

  if (op === 'leaderboard') {
    return json(
      { leaderboard: await pnlLeaderboard(Number(sp.get('limit') || 20)) },
      200,
      req
    );
  }

  if (op === 'wallet') {
    const identity = await resolveIdentity(req, sp.get('device_id') || '');
    if (!identity) return json({ error: 'device_id required' }, 400, req);
    const w = await getWallet(identity.key);
    const e = await entitlements(identity.key);
    return json(
      {
        balance: Number(w!.balance),
        max_trade: 100000 * e.bet_max_mult,
        tier: e.tier,
        fee_rate: 0.02,
        fee_sink_total: await feeSinkTotal(),
      },
      200,
      req
    );
  }

  return json({ error: 'unknown op' }, 400, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op === 'trade') return trade(req);
  if (op === 'open') return adminOpen(req);
  if (op === 'lock') return adminLock(req);
  if (op === 'settle') return adminSettle(req);
  if (op === 'blacklist') return adminBlacklist(req);
  return json({ error: 'unknown op' }, 400, req);
}

async function trade(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) return json({ error: 'device_id required' }, 400, req);
  const ip = clientIp(req);
  if (!(await checkRate(ip)))
    return json({ error: 'rate limited: slow down' }, 429, req);

  try {
    const res = await executeTrade({
      deviceHash: identity.key,
      marketId: String(v.market_id || ''),
      side: v.side,
      action: v.action,
      credits: v.credits,
      contracts: v.contracts,
    });
    return json(res, 200, req);
  } catch (e: any) {
    const status = e.status || 400;
    const body: Record<string, any> = { error: e.message || 'trade failed' };
    if (e.balance !== undefined) body.balance = e.balance;
    return json(body, status, req);
  }
}

const forbidden = () => json({ error: 'forbidden' }, 403);

async function adminOpen(req: Request): Promise<Response> {
  if (!(await isAdmin(req))) return forbidden();
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }
  try {
    const res = await openContractMarket({
      id: v.id,
      bout_id: v.bout_id,
      market_kind: v.market_kind,
      question: v.question,
      rule_text: v.rule_text,
    });
    return json(res, 200, req);
  } catch (e: any) {
    return json({ error: e.message }, e.status || 400, req);
  }
}

async function adminLock(req: Request): Promise<Response> {
  if (!(await isAdmin(req))) return forbidden();
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    v = {};
  }
  const id = String(v.id || new URL(req.url).searchParams.get('id') || '');
  try {
    return json(await lockContractMarket(id), 200, req);
  } catch (e: any) {
    return json({ error: e.message }, e.status || 400, req);
  }
}

async function adminSettle(req: Request): Promise<Response> {
  if (!(await isAdmin(req))) return forbidden();
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }
  try {
    const res = await settleContractMarket(
      String(v.id || ''),
      String(v.winning_side || '')
    );
    return json(res, 200, req);
  } catch (e: any) {
    return json({ error: e.message }, e.status || 400, req);
  }
}

async function adminBlacklist(req: Request): Promise<Response> {
  if (!(await isAdmin(req))) return forbidden();
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }
  const dh = String(v.device_hash || '').trim();
  const action = String(v.action || '').trim();
  if (!dh || !['add', 'remove'].includes(action))
    return json(
      { error: 'device_hash and action(add|remove) required' },
      400,
      req
    );
  if (action === 'add') {
    await qWrite(
      'INSERT INTO contract_blacklist (device_hash, reason, created_at) VALUES ($1,$2,$3) ON CONFLICT (device_hash) DO NOTHING',
      [dh, String(v.reason || 'team'), Date.now() / 1000]
    );
  } else {
    await qWrite('DELETE FROM contract_blacklist WHERE device_hash=$1', [dh]);
  }
  return json({ ok: true, action, device_hash: dh }, 200, req);
}
