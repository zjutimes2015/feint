/** Phase 2: Kalshi 式事件合约市场（LMSR 做市，纯虚拟积分）。
 *
 * 机制映射（spec v1.0 §2）：
 * - Yes/No 二值合约，1 张合约赢了赔 CONTRACT_PAYOUT(100) 拳场币，价格 1–99 = 隐含概率
 * - LMSR 做市商（行为等价恒定乘积 CPMM，数学更简洁可审计）：b=LIQUIDITY_B
 * - 手续费：简化版固定 2% 名义（用户 2026-11-04 拍板，不用 Kalshi 原式）
 * - 提前平仓：持仓随时按市价卖回；结算口径开盘前置公示
 *
 * 红线：真钱冻结；$AXON 永不进池；内地 IP 不展示入口（由前端/网关控制）。
 */
import { qAll, qOne, qWrite } from './db';
import { MAX_BET, getWallet } from './betting';
import { entitlements } from './entitlements';

export const CONTRACT_PAYOUT = 100; // 1 张合约获胜赔付拳场币
export const LIQUIDITY_B = 300; // LMSR 流动性参数（合约单位），可调
export const FEE_RATE = 0.02; // 简化版：固定 2% 名义手续费
export const MIN_TRADE_CREDITS = 10;
export const MAX_POSITION_NOTIONAL = 100000; // 单用户单市场持仓名义上限（拳场币）

// ---------------- 纯数学（LMSR，可单测） ----------------

/** 稳定的 log-sum-exp 成本函数，单位=合约 */
export function lmsrCost(
  qy: number,
  qn: number,
  b: number = LIQUIDITY_B
): number {
  const m = Math.max(qy, qn) / b;
  return b * (m + Math.log(Math.exp(qy / b - m) + Math.exp(qn / b - m)));
}

/** Yes 合约市价，0..1（sigmoid 形式，数值稳定） */
export function lmsrPriceYes(
  qy: number,
  qn: number,
  b: number = LIQUIDITY_B
): number {
  return 1 / (1 + Math.exp((qn - qy) / b));
}

/** 展示价 1..99 */
export function displayPrice(
  qy: number,
  qn: number,
  b: number = LIQUIDITY_B
): number {
  const p = Math.round(lmsrPriceYes(qy, qn, b) * 100);
  return Math.min(99, Math.max(1, p));
}

/** 买入 c 张 Yes 的成本（合约单位） */
export function buyCostYes(
  qy: number,
  qn: number,
  c: number,
  b: number = LIQUIDITY_B
): number {
  return lmsrCost(qy + c, qn, b) - lmsrCost(qy, qn, b);
}

/** 买入 c 张 No 的成本（合约单位） */
export function buyCostNo(
  qy: number,
  qn: number,
  c: number,
  b: number = LIQUIDITY_B
): number {
  return lmsrCost(qy, qn + c, b) - lmsrCost(qy, qn, b);
}

/** 卖出 c 张 Yes 的回款（合约单位），要求 c <= qy */
export function sellProceedsYes(
  qy: number,
  qn: number,
  c: number,
  b: number = LIQUIDITY_B
): number {
  return lmsrCost(qy, qn, b) - lmsrCost(qy - c, qn, b);
}

/** 卖出 c 张 No 的回款（合约单位），要求 c <= qn */
export function sellProceedsNo(
  qy: number,
  qn: number,
  c: number,
  b: number = LIQUIDITY_B
): number {
  return lmsrCost(qy, qn, b) - lmsrCost(qy, qn - c, b);
}

/** 给定净投入（合约单位），二分反解能买到几张 Yes */
export function contractsForCostYes(
  qy: number,
  qn: number,
  costUnits: number,
  b: number = LIQUIDITY_B
): number {
  let lo = 0;
  let hi = Math.max(1, costUnits * 4); // 成本单调增，hi 必够
  while (buyCostYes(qy, qn, hi, b) < costUnits) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (buyCostYes(qy, qn, mid, b) < costUnits) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 给定净投入（合约单位），二分反解能买到几张 No */
export function contractsForCostNo(
  qy: number,
  qn: number,
  costUnits: number,
  b: number = LIQUIDITY_B
): number {
  let lo = 0;
  let hi = Math.max(1, costUnits * 4);
  while (buyCostNo(qy, qn, hi, b) < costUnits) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (buyCostNo(qy, qn, mid, b) < costUnits) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 简化版手续费：名义 2%，向上取整到 1 拳场币 */
export function calcFee(grossCredits: number): number {
  return Math.max(1, Math.ceil(grossCredits * FEE_RATE));
}

// ---------------- 数据层 ----------------

export interface ContractMarket {
  id: string;
  bout_id: string;
  market_kind: string;
  question: string;
  rule_text: string;
  status: string;
  qy_outstanding: number;
  qn_outstanding: number;
  winning_side: string | null;
  created_at: number;
  settled_at: number | null;
}

export async function getContractMarket(
  id: string
): Promise<ContractMarket | null> {
  const r = await qOne<any>('SELECT * FROM contract_markets WHERE id = $1', [
    id,
  ]);
  if (!r) return null;
  return {
    ...r,
    qy_outstanding: Number(r.qy_outstanding),
    qn_outstanding: Number(r.qn_outstanding),
  };
}

export function marketView(m: ContractMarket) {
  return {
    id: m.id,
    bout_id: m.bout_id,
    market_kind: m.market_kind,
    question: m.question,
    rule_text: m.rule_text,
    status: m.status,
    price_yes: displayPrice(m.qy_outstanding, m.qn_outstanding),
    qy_outstanding: m.qy_outstanding,
    qn_outstanding: m.qn_outstanding,
    winning_side: m.winning_side,
    created_at: m.created_at,
  };
}

export async function listContractMarkets(): Promise<
  ReturnType<typeof marketView>[]
> {
  const rows = await qAll<any>(
    `SELECT * FROM contract_markets WHERE status IN ('open','locked') ORDER BY created_at DESC`
  );
  return rows.map((r) =>
    marketView({
      ...r,
      qy_outstanding: Number(r.qy_outstanding),
      qn_outstanding: Number(r.qn_outstanding),
    })
  );
}

async function recordTick(marketId: string, qy: number, qn: number) {
  const now = Date.now() / 1000;
  await qWrite(
    'INSERT INTO price_ticks (market_id, price_yes, created_at) VALUES ($1,$2,$3)',
    [marketId, displayPrice(qy, qn), now]
  );
}

async function sinkFee(deviceHash: string, marketId: string, fee: number) {
  const now = Date.now() / 1000;
  // 用户侧扣费
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [deviceHash, -fee, 'trade_fee', marketId, now]
  );
  // 回收池记账（销毁口径）
  await qWrite(
    `INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ('__sink__',$1,'fee_sink',$2,$3)`,
    [fee, marketId, now]
  );
}

export interface TradeResult {
  ok: true;
  market_id: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  contracts: number;
  avg_price: number; // 1..99 展示价
  fee: number;
  balance: number;
  price_yes: number; // 交易后市价 1..99
}

async function getPosition(dh: string, marketId: string) {
  const p = await qOne<any>(
    'SELECT * FROM contract_positions WHERE device_hash=$1 AND market_id=$2',
    [dh, marketId]
  );
  if (p)
    return {
      yes: Number(p.yes_contracts),
      no: Number(p.no_contracts),
      costYes: Number(p.cost_basis_yes),
      costNo: Number(p.cost_basis_no),
    };
  return { yes: 0, no: 0, costYes: 0, costNo: 0 };
}

/** 买入：credits 为用户愿意花的总拳场币（含手续费） */
async function buy(
  dh: string,
  m: ContractMarket,
  side: 'yes' | 'no',
  grossCredits: number
): Promise<TradeResult> {
  const fee = calcFee(grossCredits);
  const netUnits = (grossCredits - fee) / CONTRACT_PAYOUT;
  if (netUnits <= 0) throw new Error('amount too small after fee');
  const { qy_outstanding: qy, qn_outstanding: qn } = m;
  const contracts =
    side === 'yes'
      ? contractsForCostYes(qy, qn, netUnits)
      : contractsForCostNo(qy, qn, netUnits);
  const c = Math.floor(contracts * 1e6) / 1e6;
  if (c <= 0) throw new Error('amount too small');

  // 持仓名义上限检查
  const pos = await getPosition(dh, m.id);
  const heldNotional = (side === 'yes' ? pos.yes : pos.no) * CONTRACT_PAYOUT;
  const e = await entitlements(dh);
  const cap = MAX_POSITION_NOTIONAL * e.bet_max_mult;
  if (heldNotional + c * CONTRACT_PAYOUT > cap)
    throw new Error(`position cap exceeded (${cap})`);

  const w = await getWallet(dh);
  const balance = Number(w!.balance);
  if (balance < grossCredits) {
    const err: any = new Error('insufficient balance');
    err.balance = balance;
    throw err;
  }

  const now = Date.now() / 1000;
  const newQy = qy + (side === 'yes' ? c : 0);
  const newQn = qn + (side === 'no' ? c : 0);
  const avgPrice = Math.round((netUnits / c) * 100);

  await qWrite(
    'UPDATE bet_wallets SET balance = balance - $1 WHERE device_hash = $2',
    [grossCredits, dh]
  );
  await qWrite(
    'UPDATE contract_markets SET qy_outstanding=$1, qn_outstanding=$2 WHERE id=$3',
    [newQy, newQn, m.id]
  );
  await qWrite(
    `INSERT INTO contract_positions (device_hash, market_id, yes_contracts, no_contracts, cost_basis_yes, cost_basis_no)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (device_hash, market_id) DO UPDATE SET
       yes_contracts = contract_positions.yes_contracts + EXCLUDED.yes_contracts,
       no_contracts = contract_positions.no_contracts + EXCLUDED.no_contracts,
       cost_basis_yes = contract_positions.cost_basis_yes + EXCLUDED.cost_basis_yes,
       cost_basis_no = contract_positions.cost_basis_no + EXCLUDED.cost_basis_no`,
    [
      dh,
      m.id,
      side === 'yes' ? c : 0,
      side === 'no' ? c : 0,
      side === 'yes' ? grossCredits - fee : 0,
      side === 'no' ? grossCredits - fee : 0,
    ]
  );
  await qWrite(
    'INSERT INTO contract_trades (market_id, device_hash, side, action, contracts, credits, avg_price, fee, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [m.id, dh, side, 'buy', c, grossCredits, avgPrice, fee, now]
  );
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [dh, -(grossCredits - fee), 'contract_buy', m.id, now]
  );
  await sinkFee(dh, m.id, fee);
  await recordTick(m.id, newQy, newQn);

  return {
    ok: true,
    market_id: m.id,
    side,
    action: 'buy',
    contracts: c,
    avg_price: avgPrice,
    fee,
    balance: balance - grossCredits,
    price_yes: displayPrice(newQy, newQn),
  };
}

/** 卖出：contracts 为要卖的合约张数 */
async function sell(
  dh: string,
  m: ContractMarket,
  side: 'yes' | 'no',
  contracts: number
): Promise<TradeResult> {
  const pos = await getPosition(dh, m.id);
  const held = side === 'yes' ? pos.yes : pos.no;
  if (contracts <= 0 || contracts > held + 1e-9)
    throw new Error('insufficient position');
  const c = Math.min(contracts, held);
  const { qy_outstanding: qy, qn_outstanding: qn } = m;
  const proceedsUnits =
    side === 'yes' ? sellProceedsYes(qy, qn, c) : sellProceedsNo(qy, qn, c);
  const gross = Math.round(proceedsUnits * CONTRACT_PAYOUT);
  if (gross <= 0) throw new Error('proceeds too small');
  const fee = calcFee(gross);
  const net = gross - fee;
  if (net <= 0) throw new Error('proceeds too small after fee');

  const now = Date.now() / 1000;
  const newQy = qy - (side === 'yes' ? c : 0);
  const newQn = qn - (side === 'no' ? c : 0);
  const avgPrice = Math.round((proceedsUnits / c) * 100);
  // 成本按比例核减
  const costKey = side === 'yes' ? 'cost_basis_yes' : 'cost_basis_no';
  const heldCost = side === 'yes' ? pos.costYes : pos.costNo;
  const costReduction = held > 0 ? (heldCost * c) / held : 0;

  await qWrite(
    'UPDATE bet_wallets SET balance = balance + $1 WHERE device_hash = $2',
    [net, dh]
  );
  await qWrite(
    'UPDATE contract_markets SET qy_outstanding=$1, qn_outstanding=$2 WHERE id=$3',
    [newQy, newQn, m.id]
  );
  await qWrite(
    `UPDATE contract_positions SET
       yes_contracts = yes_contracts - $3, no_contracts = no_contracts - $4,
       cost_basis_yes = cost_basis_yes - $5, cost_basis_no = cost_basis_no - $6
     WHERE device_hash=$1 AND market_id=$2`,
    [
      dh,
      m.id,
      side === 'yes' ? c : 0,
      side === 'no' ? c : 0,
      side === 'yes' ? costReduction : 0,
      side === 'no' ? costReduction : 0,
    ]
  );
  await qWrite(
    'INSERT INTO contract_trades (market_id, device_hash, side, action, contracts, credits, avg_price, fee, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [m.id, dh, side, 'sell', c, gross, avgPrice, fee, now]
  );
  await qWrite(
    'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
    [dh, net, 'contract_sell', m.id, now]
  );
  await sinkFee(dh, m.id, fee);
  await recordTick(m.id, newQy, newQn);

  const w = await getWallet(dh);
  return {
    ok: true,
    market_id: m.id,
    side,
    action: 'sell',
    contracts: c,
    avg_price: avgPrice,
    fee,
    balance: Number(w!.balance),
    price_yes: displayPrice(newQy, newQn),
  };
}

export async function executeTrade(opts: {
  deviceHash: string;
  marketId: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  credits?: number;
  contracts?: number;
}): Promise<TradeResult> {
  const m = await getContractMarket(opts.marketId);
  if (!m) throw Object.assign(new Error('market not found'), { status: 404 });
  if (m.status !== 'open')
    throw Object.assign(new Error(`market is ${m.status}`), { status: 409 });
  if (opts.side !== 'yes' && opts.side !== 'no')
    throw Object.assign(new Error('side must be yes|no'), { status: 400 });

  if (opts.action === 'buy') {
    const gross = Math.trunc(Number(opts.credits || 0));
    const e = await entitlements(opts.deviceHash);
    const cap = MAX_BET * e.bet_max_mult;
    if (!Number.isFinite(gross) || gross < MIN_TRADE_CREDITS || gross > cap)
      throw Object.assign(
        new Error(`credits must be ${MIN_TRADE_CREDITS}..${cap}`),
        { status: 400 }
      );
    return buy(opts.deviceHash, m, opts.side, gross);
  }
  if (opts.action === 'sell') {
    const c = Number(opts.contracts || 0);
    if (!Number.isFinite(c) || c <= 0)
      throw Object.assign(new Error('contracts must be > 0'), { status: 400 });
    return sell(opts.deviceHash, m, opts.side, c);
  }
  throw Object.assign(new Error('action must be buy|sell'), { status: 400 });
}

/** 试算（不落库）：买入按 credits，卖出按 contracts */
export async function quoteTrade(opts: {
  marketId: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  credits?: number;
  contracts?: number;
}) {
  const m = await getContractMarket(opts.marketId);
  if (!m) throw Object.assign(new Error('market not found'), { status: 404 });
  if (m.status !== 'open')
    throw Object.assign(new Error(`market is ${m.status}`), { status: 409 });
  if (opts.side !== 'yes' && opts.side !== 'no')
    throw Object.assign(new Error('side must be yes|no'), { status: 400 });
  const { qy_outstanding: qy, qn_outstanding: qn } = m;
  if (opts.action === 'buy') {
    const gross = Math.trunc(Number(opts.credits || 0));
    if (!Number.isFinite(gross) || gross < MIN_TRADE_CREDITS)
      throw Object.assign(
        new Error(`credits must be >= ${MIN_TRADE_CREDITS}`),
        { status: 400 }
      );
    const fee = calcFee(gross);
    const netUnits = (gross - fee) / CONTRACT_PAYOUT;
    const raw =
      opts.side === 'yes'
        ? contractsForCostYes(qy, qn, netUnits)
        : contractsForCostNo(qy, qn, netUnits);
    const c = Math.floor(raw * 1e6) / 1e6;
    if (c <= 0)
      throw Object.assign(new Error('amount too small'), { status: 400 });
    const nqy = qy + (opts.side === 'yes' ? c : 0);
    const nqn = qn + (opts.side === 'no' ? c : 0);
    return {
      contracts: c,
      avg_price: Math.round((netUnits / c) * 100),
      fee,
      price_yes_after: displayPrice(nqy, nqn),
    };
  }
  if (opts.action === 'sell') {
    const c = Number(opts.contracts || 0);
    if (!Number.isFinite(c) || c <= 0)
      throw Object.assign(new Error('contracts must be > 0'), { status: 400 });
    const units =
      opts.side === 'yes'
        ? sellProceedsYes(qy, qn, c)
        : sellProceedsNo(qy, qn, c);
    const gross = Math.round(units * CONTRACT_PAYOUT);
    const fee = calcFee(gross);
    return {
      contracts: c,
      credits_out: Math.max(0, gross - fee),
      avg_price: Math.round((units / c) * 100),
      fee,
    };
  }
  throw Object.assign(new Error('action must be buy|sell'), { status: 400 });
}

export async function getPositions(dh: string) {
  const rows = await qAll<any>(
    `SELECT p.*, m.question, m.market_kind, m.status, m.qy_outstanding, m.qn_outstanding, m.winning_side
     FROM contract_positions p JOIN contract_markets m ON m.id = p.market_id
     WHERE p.device_hash = $1 AND (p.yes_contracts > 0 OR p.no_contracts > 0)
     ORDER BY m.created_at DESC`,
    [dh]
  );
  return rows.map((r) => {
    const qy = Number(r.qy_outstanding);
    const qn = Number(r.qn_outstanding);
    const py = displayPrice(qy, qn);
    const yes = Number(r.yes_contracts);
    const no = Number(r.no_contracts);
    const curValue =
      Math.round(((yes * py + no * (100 - py)) / 100) * 100) / 100;
    const cost = Number(r.cost_basis_yes) + Number(r.cost_basis_no);
    return {
      market_id: r.market_id,
      question: r.question,
      market_kind: r.market_kind,
      status: r.status,
      yes_contracts: yes,
      no_contracts: no,
      price_yes: py,
      current_value: Math.round(curValue),
      cost_basis: Math.round(cost),
      unrealized_pnl: Math.round(curValue - cost),
      winning_side: r.winning_side,
    };
  });
}

export async function getTape(marketId: string, limit = 30) {
  const rows = await qAll<any>(
    `SELECT side, action, contracts, credits, avg_price, fee, created_at,
            SUBSTRING(device_hash, 1, 8) AS player
     FROM contract_trades WHERE market_id = $1 ORDER BY id DESC LIMIT $2`,
    [marketId, Math.min(100, Math.max(1, limit))]
  );
  return rows.map((r) => ({ ...r, contracts: Number(r.contracts) }));
}

export async function getTicks(marketId: string, limit = 100) {
  const rows = await qAll<any>(
    'SELECT price_yes, created_at FROM price_ticks WHERE market_id=$1 ORDER BY id ASC LIMIT $2',
    [marketId, Math.min(500, Math.max(1, limit))]
  );
  return rows;
}

const MARKET_KINDS = new Set(['winner', 'method', 'round', 'storyline']);

export async function openContractMarket(v: {
  id: string;
  bout_id?: string;
  market_kind: string;
  question: string;
  rule_text: string;
}) {
  const id = String(v.id || '').trim();
  const kind = String(v.market_kind || '').trim();
  const question = String(v.question || '').trim();
  const rule = String(v.rule_text || '').trim();
  if (!id || !MARKET_KINDS.has(kind) || !question)
    throw Object.assign(
      new Error(
        'id, market_kind(winner|method|round|storyline), question required'
      ),
      { status: 400 }
    );
  if (!rule)
    throw Object.assign(new Error('rule_text required (结算口径开盘必填)'), {
      status: 400,
    });
  if (await qOne('SELECT id FROM contract_markets WHERE id=$1', [id]))
    throw Object.assign(new Error('market id exists'), { status: 409 });
  const now = Date.now() / 1000;
  await qWrite(
    `INSERT INTO contract_markets (id, bout_id, market_kind, question, rule_text, status, qy_outstanding, qn_outstanding, created_at)
     VALUES ($1,$2,$3,$4,$5,'open',0,0,$6)`,
    [id, String(v.bout_id || ''), kind, question, rule, now]
  );
  await recordTick(id, 0, 0); // 出生价 50
  return { ok: true, id };
}

export async function lockContractMarket(id: string) {
  const m = await getContractMarket(id);
  if (!m) throw Object.assign(new Error('market not found'), { status: 404 });
  if (m.status !== 'open')
    throw Object.assign(new Error(`market is ${m.status}`), { status: 409 });
  await qWrite("UPDATE contract_markets SET status='locked' WHERE id=$1", [id]);
  return { ok: true, id, status: 'locked' };
}

/** 结算：winning_side = 'yes' | 'no' | 'void' */
export async function settleContractMarket(id: string, winningSide: string) {
  const m = await getContractMarket(id);
  if (!m) throw Object.assign(new Error('market not found'), { status: 404 });
  if (m.status === 'settled' || m.status === 'void')
    throw Object.assign(new Error(`market is ${m.status}`), { status: 409 });
  if (!['yes', 'no', 'void'].includes(winningSide))
    throw Object.assign(new Error('winning_side must be yes|no|void'), {
      status: 400,
    });

  const now = Date.now() / 1000;
  const positions = await qAll<any>(
    'SELECT * FROM contract_positions WHERE market_id=$1',
    [id]
  );
  let paid = 0;
  for (const p of positions) {
    const yes = Number(p.yes_contracts);
    const no = Number(p.no_contracts);
    if (yes <= 0 && no <= 0) continue;
    let payout = 0;
    let reason = '';
    if (winningSide === 'void') {
      payout = Math.round(Number(p.cost_basis_yes) + Number(p.cost_basis_no));
      reason = 'contract_void';
    } else {
      const winContracts = winningSide === 'yes' ? yes : no;
      payout = Math.round(winContracts * CONTRACT_PAYOUT);
      reason = 'contract_won';
    }
    if (payout > 0) {
      await qWrite(
        'UPDATE bet_wallets SET balance = balance + $1 WHERE device_hash = $2',
        [payout, p.device_hash]
      );
      await qWrite(
        'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
        [p.device_hash, payout, reason, id, now]
      );
      paid += payout;
    } else if (reason === 'contract_void') {
      await qWrite(
        'INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5)',
        [p.device_hash, 0, reason, id, now]
      );
    }
    await qWrite(
      'DELETE FROM contract_positions WHERE device_hash=$1 AND market_id=$2',
      [p.device_hash, id]
    );
  }
  const status = winningSide === 'void' ? 'void' : 'settled';
  await qWrite(
    'UPDATE contract_markets SET status=$1, winning_side=$2, settled_at=$3 WHERE id=$4',
    [status, winningSide === 'void' ? null : winningSide, now, id]
  );
  return { ok: true, id, status, winning_side: winningSide, total_paid: paid };
}

/** P&L 排行榜（已实现＋浮动，未实现按市价；团队钱包可拉黑） */
export async function pnlLeaderboard(limit = 20) {
  const rows = await qAll<any>(
    `SELECT device_hash,
            COALESCE(SUM(CASE WHEN reason IN ('contract_won','contract_void') THEN delta ELSE 0 END),0) AS won,
            COALESCE(SUM(CASE WHEN reason IN ('contract_buy') THEN delta ELSE 0 END),0) AS spent,
            COALESCE(SUM(CASE WHEN reason IN ('contract_sell') THEN delta ELSE 0 END),0) AS sold,
            COALESCE(SUM(CASE WHEN reason IN ('trade_fee') THEN delta ELSE 0 END),0) AS fees
     FROM bet_ledger
     WHERE reason LIKE 'contract_%' OR reason = 'trade_fee'
     GROUP BY device_hash`
  );
  const black = new Set(
    (await qAll<any>('SELECT device_hash FROM contract_blacklist')).map(
      (r) => r.device_hash
    )
  );
  // 浮动盈亏
  const pos = await qAll<any>(
    `SELECT p.device_hash, p.yes_contracts, p.no_contracts, p.cost_basis_yes, p.cost_basis_no,
            m.qy_outstanding, m.qn_outstanding, m.status
     FROM contract_positions p JOIN contract_markets m ON m.id = p.market_id
     WHERE m.status IN ('open','locked')`
  );
  const unreal = new Map<string, number>();
  for (const r of pos) {
    const py = displayPrice(Number(r.qy_outstanding), Number(r.qn_outstanding));
    const cur =
      (Number(r.yes_contracts) * py + Number(r.no_contracts) * (100 - py)) /
      100;
    const cost = Number(r.cost_basis_yes) + Number(r.cost_basis_no);
    unreal.set(r.device_hash, (unreal.get(r.device_hash) || 0) + (cur - cost));
  }
  const board = rows
    .filter((r) => !black.has(r.device_hash))
    .map((r) => {
      const realized =
        Number(r.won) + Number(r.spent) + Number(r.sold) + Number(r.fees);
      const u = unreal.get(r.device_hash) || 0;
      return {
        player: String(r.device_hash).slice(0, 8),
        realized_pnl: Math.round(realized),
        unrealized_pnl: Math.round(u),
        total_pnl: Math.round(realized + u),
      };
    })
    .sort((a, b) => b.total_pnl - a.total_pnl)
    .slice(0, Math.min(50, Math.max(1, limit)));
  return board.map((r, i) => ({ rank: i + 1, ...r }));
}

export async function feeSinkTotal(): Promise<number> {
  const r = await qOne<any>(
    `SELECT COALESCE(SUM(delta),0) AS s FROM bet_ledger WHERE device_hash='__sink__' AND reason='fee_sink'`
  );
  return Number(r?.s || 0);
}
