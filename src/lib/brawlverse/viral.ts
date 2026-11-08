/** BRAWLVERSE 裂变三机制 · 共用服务端逻辑（spec §5/§6/§10）。
 * 不碰 entitlements.ts、LMSR 数学、支付链路。
 */
import { getContractMarket, getTicks } from './contract';
import { qAll, qOne, qWrite } from './db';
import {
  MILESTONE_BOUTS,
  MILESTONE_DEFAULTS,
  VIRAL_CONFIG,
} from './viral-config';

/** spec §5 建表 SQL（幂等）。也在 src/lib/brawlverse/viral-schema.sql 存一份。 */
export const VIRAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS viral_unlocks (
  identity_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  unlock_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (identity_key, content_id)
);
CREATE TABLE IF NOT EXISTS viral_shares (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_shares_key ON viral_shares(identity_key);
CREATE TABLE IF NOT EXISTS viral_milestones (
  milestone_id TEXT PRIMARY KEY,
  threshold INTEGER NOT NULL,
  current_count INTEGER NOT NULL DEFAULT 0,
  unlocked_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS viral_push_log (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  push_type TEXT NOT NULL,
  bout_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_push_log_key ON viral_push_log(identity_key, sent_at);
CREATE TABLE IF NOT EXISTS viral_events (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  props TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_events_name ON viral_events(event_name, created_at);
`;

let schemaReady = false;

/** 确保裂变表存在 + 里程碑 seed 行存在。 */
export async function ensureViralSchema(): Promise<void> {
  if (schemaReady) return;
  await qWrite(VIRAL_SCHEMA);
  const now = Math.floor(Date.now() / 1000);
  for (const [mid, threshold] of Object.entries(MILESTONE_DEFAULTS)) {
    await qWrite(
      `INSERT INTO viral_milestones (milestone_id, threshold, current_count, updated_at)
       VALUES ($1,$2,0,$3) ON CONFLICT (milestone_id) DO NOTHING`,
      [mid, threshold, now]
    );
  }
  schemaReady = true;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 埋点：写 viral_events（三机制共用）。失败不抛错。 */
export async function logViralEvent(
  identityKey: string,
  eventName: string,
  props?: Record<string, unknown>
): Promise<void> {
  try {
    await ensureViralSchema();
    await qWrite(
      'INSERT INTO viral_events (identity_key, event_name, props, created_at) VALUES ($1,$2,$3,$4)',
      [identityKey, eventName, props ? JSON.stringify(props) : null, nowSec()]
    );
  } catch {
    /* 埋点失败不影响主流程 */
  }
}

// ---------------- 机制一：近失判定 ----------------

export interface NearMissResult {
  triggered: boolean;
  userSide: 'yes' | 'no' | null;
  peakPrice: number | null;
  finalPrice: number | null;
  winningSide: string | null;
}

/**
 * 近失评估（spec §6 路由 4 逻辑）。
 * price_ticks.price_yes 为 1–99 展示价；no 方向价格 = 100 - price_yes。
 * 边界（spec §10）：无持仓/胜方/void → triggered=false；无 ticks → 只用 final 判定。
 */
export async function nearMissEval(
  marketId: string,
  identityKey: string
): Promise<NearMissResult> {
  const base: NearMissResult = {
    triggered: false,
    userSide: null,
    peakPrice: null,
    finalPrice: null,
    winningSide: null,
  };
  const m = await getContractMarket(marketId);
  if (m?.status !== 'settled' || !m.winning_side || m.winning_side === 'void')
    return base;
  base.winningSide = m.winning_side;

  const pos = await qOne<{
    yes_contracts: string;
    no_contracts: string;
  }>(
    'SELECT yes_contracts, no_contracts FROM contract_positions WHERE device_hash=$1 AND market_id=$2',
    [identityKey, marketId]
  );
  if (!pos) return base;
  const yes = Number(pos.yes_contracts);
  const no = Number(pos.no_contracts);
  if (yes <= 0 && no <= 0) return base;

  // 持仓较多的一边为用户方向（双边都有取大者）
  const userSide: 'yes' | 'no' = yes >= no ? 'yes' : 'no';
  base.userSide = userSide;
  if (userSide === m.winning_side) return base; // 赢了不需要安慰

  const ticks = await getTicks(marketId, 500);
  const sidePrice = (pYes: number) => (userSide === 'yes' ? pYes : 100 - pYes);

  if (ticks.length > 0) {
    let peak = -Infinity;
    for (const t of ticks) {
      const p = sidePrice(Number(t.price_yes));
      if (p > peak) peak = p;
    }
    base.peakPrice = Math.round(peak);
    base.finalPrice = Math.round(
      sidePrice(Number(ticks[ticks.length - 1].price_yes))
    );
  } else {
    // 无 ticks（老合约）：final 取结算时刻市价近似 → 用出生价 50 降级为 null，按 spec 只用 final 判定
    base.finalPrice = null;
  }

  const { nearMissPeak, nearMissFinal } = VIRAL_CONFIG;
  base.triggered =
    (base.peakPrice !== null && base.peakPrice >= nearMissPeak) ||
    (base.finalPrice !== null && base.finalPrice >= nearMissFinal);
  return base;
}

// ---------------- 机制三：翻盘判定 ----------------

/** bout 表 fighter 名（'IRON JAW'）→ 展示名 / slug */
const FIGHTER_DISPLAY: Record<string, { name: string; slug: string }> = {
  'IRON JAW': { name: 'Iron Jaw', slug: 'iron_jaw' },
  VIPER: { name: 'Viper', slug: 'viper' },
  SLEDGE: { name: 'Sledge', slug: 'sledge' },
  MONSOON: { name: 'Monsoon', slug: 'monsoon' },
  VOLT: { name: 'Volt', slug: 'volt' },
  'THE PROFESSOR': { name: 'The Professor', slug: 'the_professor' },
  'LA REINA': { name: 'La Reina', slug: 'la_reina' },
  'GOLIATH-7': { name: 'Goliath-7', slug: 'goliath-7' },
};

export interface LossCtaResult {
  show: boolean;
  loserSlug: string | null;
  loserName: string | null;
  nextMarketUrl: string;
  nextMarketId: string | null;
}

/**
 * 翻盘评估（spec §6 路由 5 逻辑）。
 * 查该 bout 下已结算合约：用户持有输方仓位 → show=true。
 * loser 解析：仅对 market_kind='winner' 做 question 文本匹配；其余置 null（前端用通用文案）。
 */
export async function lossCtaEval(
  boutId: string | null,
  identityKey: string,
  marketId?: string
): Promise<LossCtaResult> {
  const fallback: LossCtaResult = {
    show: false,
    loserSlug: null,
    loserName: null,
    nextMarketUrl: '/bet',
    nextMarketId: null,
  };

  let bid = boutId;
  if (!bid && marketId) {
    const mk = await qOne<{ bout_id: string }>(
      'SELECT bout_id FROM contract_markets WHERE id=$1',
      [marketId]
    );
    bid = mk?.bout_id || null;
  }
  if (!bid) return fallback;

  const bout = await qOne<{ fighter_a: string; fighter_b: string }>(
    'SELECT fighter_a, fighter_b FROM bouts WHERE id=$1',
    [bid]
  );
  if (!bout) return fallback;

  const markets = await qAll<{
    id: string;
    market_kind: string;
    question: string;
    winning_side: string | null;
  }>(
    "SELECT id, market_kind, question, winning_side FROM contract_markets WHERE bout_id=$1 AND status='settled' AND winning_side IN ('yes','no')",
    [bid]
  );

  let lostMarket: {
    id: string;
    market_kind: string;
    question: string;
    winning_side: string;
  } | null = null;
  for (const mk of markets) {
    const pos = await qOne<{ yes_contracts: string; no_contracts: string }>(
      'SELECT yes_contracts, no_contracts FROM contract_positions WHERE device_hash=$1 AND market_id=$2',
      [identityKey, mk.id]
    );
    if (!pos) continue;
    const yes = Number(pos.yes_contracts);
    const no = Number(pos.no_contracts);
    const losingSide = mk.winning_side === 'yes' ? 'no' : 'yes';
    const lostContracts = losingSide === 'yes' ? yes : no;
    if (lostContracts > 0) {
      lostMarket = { ...mk, winning_side: mk.winning_side as string };
      break;
    }
  }
  if (!lostMarket) return fallback;

  // loser 解析（仅 winner 盘）
  let loserSlug: string | null = null;
  let loserName: string | null = null;
  if (lostMarket.market_kind === 'winner') {
    const q = lostMarket.question.toUpperCase();
    const fa = bout.fighter_a.toUpperCase();
    const fb = bout.fighter_b.toUpperCase();
    const mentionsA = q.includes(fa);
    const mentionsB = q.includes(fb);
    let loserKey: string | null = null;
    if (lostMarket.winning_side === 'yes') {
      // question 主体赢了 → 另一方是 loser
      if (mentionsA && !mentionsB) loserKey = bout.fighter_b.toUpperCase();
      else if (mentionsB && !mentionsA) loserKey = bout.fighter_a.toUpperCase();
    } else {
      // question 主体输了 → 主体是 loser
      if (mentionsA && !mentionsB) loserKey = bout.fighter_a.toUpperCase();
      else if (mentionsB && !mentionsA) loserKey = bout.fighter_b.toUpperCase();
    }
    if (loserKey && FIGHTER_DISPLAY[loserKey]) {
      loserSlug = FIGHTER_DISPLAY[loserKey].slug;
      loserName = FIGHTER_DISPLAY[loserKey].name;
    }
  }

  // 下一场：同 bout 的 open 合约优先，否则 /bet
  const next = await qOne<{ id: string }>(
    "SELECT id FROM contract_markets WHERE bout_id=$1 AND status='open' ORDER BY created_at ASC LIMIT 1",
    [bid]
  );

  return {
    show: true,
    loserSlug,
    loserName,
    nextMarketUrl: '/bet',
    nextMarketId: next ? next.id : null,
  };
}

/** 当天是否已对该用户推过翻盘推送（频率上限，spec §5 viral_push_log）。 */
export async function lossPushAllowed(identityKey: string): Promise<boolean> {
  await ensureViralSchema();
  const dayAgo = nowSec() - 86400;
  const row = await qOne<{ n: string }>(
    'SELECT COUNT(*) AS n FROM viral_push_log WHERE identity_key=$1 AND push_type=$2 AND sent_at>$3',
    [identityKey, 'loss_cta', dayAgo]
  );
  return Number(row?.n ?? 0) < VIRAL_CONFIG.pushDailyCap;
}

/** 记录翻盘推送已发送（供外部推送任务调用）。 */
export async function logLossPush(
  identityKey: string,
  boutId: string
): Promise<void> {
  await ensureViralSchema();
  await qWrite(
    'INSERT INTO viral_push_log (identity_key, push_type, bout_id, sent_at) VALUES ($1,$2,$3,$4)',
    [identityKey, 'loss_cta', boutId, nowSec()]
  );
}

// ---------------- 机制二：里程碑 ----------------

export interface MilestoneState {
  milestoneId: string;
  threshold: number;
  currentCount: number;
  unlocked: boolean;
  unlockedAt: number | null;
}

/**
 * 里程碑计数（幂等）：current_count = 对应 bout 的 votes 表行数。
 * 达阈值则写 unlocked_at（WHERE unlocked_at IS NULL 防并发超发，spec §10）。
 */
export async function milestoneBump(
  milestoneId: string
): Promise<MilestoneState | null> {
  await ensureViralSchema();
  const boutId = MILESTONE_BOUTS[milestoneId];
  if (!boutId) return null;
  const now = nowSec();

  const cnt = await qOne<{ n: string }>(
    'SELECT COUNT(*) AS n FROM votes WHERE bout_id=$1',
    [boutId]
  );
  const n = Number(cnt?.n ?? 0);
  await qWrite(
    'UPDATE viral_milestones SET current_count=$1, updated_at=$2 WHERE milestone_id=$3',
    [n, now, milestoneId]
  );
  await qWrite(
    'UPDATE viral_milestones SET unlocked_at=$1, updated_at=$1 WHERE milestone_id=$2 AND unlocked_at IS NULL AND current_count >= threshold',
    [now, milestoneId]
  );
  return getMilestone(milestoneId);
}

export async function getMilestone(
  milestoneId: string
): Promise<MilestoneState | null> {
  await ensureViralSchema();
  const r = await qOne<{
    milestone_id: string;
    threshold: string;
    current_count: string;
    unlocked_at: string | null;
  }>('SELECT * FROM viral_milestones WHERE milestone_id=$1', [milestoneId]);
  if (!r) return null;
  return {
    milestoneId: r.milestone_id,
    threshold: Number(r.threshold),
    currentCount: Number(r.current_count),
    unlocked: r.unlocked_at !== null,
    unlockedAt: r.unlocked_at !== null ? Number(r.unlocked_at) : null,
  };
}

// ---------------- 机制二：解锁 ----------------

/** 是否已解锁某内容。里程碑达成 → 全站视为解锁（不写 viral_unlocks）。 */
export async function isUnlocked(
  identityKey: string,
  contentId: string
): Promise<boolean> {
  await ensureViralSchema();
  const u = await qOne(
    'SELECT 1 FROM viral_unlocks WHERE identity_key=$1 AND content_id=$2',
    [identityKey, contentId]
  );
  if (u) return true;
  // milestone-gated：查内容绑定的里程碑是否已达成
  const milestoneId = contentMilestone(contentId);
  if (milestoneId) {
    const ms = await getMilestone(milestoneId);
    if (ms?.unlocked) return true;
  }
  return false;
}

/** content_id → 里程碑映射（milestone-gated 内容） */
export function contentMilestone(contentId: string): string | null {
  if (contentId === 'video:qf2-trash-talk') return 'qf2-trash-talk';
  return null;
}

/** 分享解锁（幂等）：写 viral_unlocks + 标记 viral_shares.confirmed=1 */
export async function confirmShareUnlock(
  identityKey: string,
  contentId: string
): Promise<boolean> {
  await ensureViralSchema();
  const now = nowSec();
  await qWrite(
    `INSERT INTO viral_unlocks (identity_key, content_id, unlock_type, created_at)
     VALUES ($1,$2,'share',$3) ON CONFLICT (identity_key, content_id) DO NOTHING`,
    [identityKey, contentId, now]
  );
  await qWrite(
    'UPDATE viral_shares SET confirmed=1 WHERE identity_key=$1 AND content_id=$2',
    [identityKey, contentId]
  );
  return true;
}

/** 记录分享发起（点 Share on X 即记） */
export async function logShareInit(
  identityKey: string,
  contentId: string
): Promise<void> {
  await ensureViralSchema();
  await qWrite(
    'INSERT INTO viral_shares (identity_key, content_id, confirmed, created_at) VALUES ($1,$2,0,$3)',
    [identityKey, contentId, nowSec()]
  );
}
