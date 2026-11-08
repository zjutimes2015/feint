/** 押注辅助:彩池、钱包、流水。纯虚拟币。 */
import { qAll, qOne, qWrite } from './db';

export const SIGNUP_BONUS = 1000;
export const DAILY_CLAIM = 100;
export const DAY_S = 86400;
export const MAX_BET = 100000;

export interface Wallet {
  device_hash: string;
  balance: string | number;
  last_claim: number;
  created_at: number;
}

export async function getWallet(dh: string): Promise<Wallet | null> {
  const w = await qOne<Wallet>(
    'SELECT * FROM bet_wallets WHERE device_hash = $1',
    [dh]
  );
  if (w) return w;
  const now = Date.now() / 1000;
  await qWrite(
    'INSERT INTO bet_wallets (device_hash, balance, last_claim, created_at) VALUES ($1,$2,$3,$4)',
    [dh, SIGNUP_BONUS, 0, now]
  );
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [dh, SIGNUP_BONUS, 'signup', '', now]
  );
  return qOne<Wallet>('SELECT * FROM bet_wallets WHERE device_hash = $1', [dh]);
}

export async function poolTotals(
  marketId: string
): Promise<Record<string, number>> {
  const rows = await qAll<{ selection: string; pool: string }>(
    'SELECT selection, COALESCE(SUM(amount),0) AS pool FROM bets WHERE market_id = $1 GROUP BY selection',
    [marketId]
  );
  const pools: Record<string, number> = {};
  for (const r of rows) pools[r.selection] = Number(r.pool);
  const m = await qOne<{ house_pool: string | null }>(
    'SELECT house_pool FROM bet_markets WHERE id = $1',
    [marketId]
  );
  if (m?.house_pool) {
    try {
      for (const [s, amt] of Object.entries(JSON.parse(m.house_pool))) {
        pools[s] = (pools[s] || 0) + Number(amt);
      }
    } catch {
      /* 忽略坏数据 */
    }
  }
  return pools;
}

export async function bumpRecord(
  fighter: string,
  won: boolean,
  ko: boolean
): Promise<void> {
  const now = Date.now() / 1000;
  const w = won ? 1 : 0;
  const l = won ? 0 : 1;
  const k = won && ko ? 1 : 0;
  await qWrite(
    `INSERT INTO fighter_records (fighter, wins, losses, kos, updated_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (fighter) DO UPDATE SET
       wins = fighter_records.wins + $6,
       losses = fighter_records.losses + $7,
       kos = fighter_records.kos + $8,
       updated_at = $9`,
    [fighter, w, l, k, now, w, l, k, now]
  );
}

export interface MarketRow {
  id: string;
  bout_id: string;
  market_type: string;
  question: string;
  selections: string;
  status: string;
  winning_selection: string | null;
}

export async function marketView(m: MarketRow) {
  const sels: string[] = JSON.parse(m.selections);
  const pools = await poolTotals(m.id);
  const total = Object.values(pools).reduce((a, b) => a + b, 0);
  const odds: Record<string, number | null> = {};
  for (const s of sels) {
    const p = pools[s] || 0;
    odds[s] = p > 0 ? Math.round((total / p) * 100) / 100 : null;
  }
  return {
    id: m.id,
    bout_id: m.bout_id,
    market_type: m.market_type,
    question: m.question,
    selections: sels,
    status: m.status,
    pools,
    total_pool: total,
    implied_odds: odds,
    winning_selection: m.winning_selection,
  };
}

/** 同注分彩派彩。返回 null 表示不可结算。 */
export async function settleMarket(marketId: string, winningSelection: string) {
  const m = await qOne<MarketRow>('SELECT * FROM bet_markets WHERE id = $1', [
    marketId,
  ]);
  if (!m || m.status === 'settled') return null;
  const sels: string[] = JSON.parse(m.selections);
  if (!sels.includes(winningSelection)) return null;

  const bets = await qAll<{
    device_hash: string;
    selection: string;
    amount: string;
  }>('SELECT * FROM bets WHERE market_id = $1', [marketId]);
  const total = bets.reduce((a, b) => a + Number(b.amount), 0);
  const winBets = bets.filter((b) => b.selection === winningSelection);
  const winPool = winBets.reduce((a, b) => a + Number(b.amount), 0);
  const now = Date.now() / 1000;
  const payouts: { device: string; payout: number }[] = [];

  if (winPool > 0) {
    for (const b of winBets) {
      const payout = Math.floor((Number(b.amount) * total) / winPool);
      await qWrite(
        'UPDATE bet_wallets SET balance = balance + $1 WHERE device_hash = $2',
        [payout, b.device_hash]
      );
      await qWrite(
        'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
        [b.device_hash, payout, 'bet_won', marketId, now]
      );
      payouts.push({ device: b.device_hash.slice(0, 8), payout });
    }
  } else {
    for (const b of bets) {
      await qWrite(
        'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
        [b.device_hash, 0, 'bet_void', marketId, now]
      );
    }
  }

  await qWrite(
    "UPDATE bet_markets SET status='settled', winning_selection=$1, settled_at=$2 WHERE id=$3",
    [winningSelection, now, marketId]
  );

  if (m.market_type === 'winner') {
    const bout = await qOne<{ fighter_a: string; fighter_b: string }>(
      'SELECT fighter_a, fighter_b FROM bouts WHERE id = $1',
      [m.bout_id]
    );
    if (bout && [bout.fighter_a, bout.fighter_b].includes(winningSelection)) {
      const loser =
        winningSelection === bout.fighter_a ? bout.fighter_b : bout.fighter_a;
      const method = await qOne<{ winning_selection: string }>(
        `SELECT winning_selection FROM bet_markets
         WHERE bout_id = $1 AND market_type = 'method' AND status = 'settled'
         ORDER BY settled_at DESC LIMIT 1`,
        [m.bout_id]
      );
      const ko = Boolean(
        method && String(method.winning_selection).toUpperCase() === 'KO'
      );
      await bumpRecord(winningSelection, true, ko);
      await bumpRecord(loser, false, false);
    }
  }

  return { total_pool: total, win_pool: winPool, payouts };
}
