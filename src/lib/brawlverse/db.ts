/**
 * BRAWLVERSE 数据层:复用模板 postgres(postgres-js)驱动 + 原生 SQL。
 * 表结构与原站严格一致,不进入 Drizzle schema、不生成迁移。
 */
import crypto from 'node:crypto';
import postgres from 'postgres';
import { ARENA_SCHEMA } from '@/lib/arena/schema';
import { GROWTH_SCHEMA } from '@/lib/growth/schema';

const DSN = process.env.DATABASE_URL || '';

export const RATE_LIMIT = 20;
export const RATE_WINDOW_S = 60;
// rage/fair 属于首页 exhibition 规则投票,与回合战术投票共用 votes 表
export const CHOICES = new Set(['heavy', 'dodge', 'guard', 'rage', 'fair']);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  fighter_a TEXT NOT NULL,
  fighter_b TEXT NOT NULL,
  round_no INTEGER NOT NULL DEFAULT 1,
  voting_open INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  bout_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  choice TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  ip TEXT NOT NULL,
  ip_ua TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  UNIQUE (bout_id, round_no, device_hash)
);
CREATE TABLE IF NOT EXISTS rate_hits (
  ip TEXT NOT NULL,
  ts DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip_ts ON rate_hits (ip, ts);
CREATE TABLE IF NOT EXISTS fan_captions (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '匿名拳迷',
  device_hash TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  ip_ua TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captions_status ON fan_captions (status, created_at);
CREATE TABLE IF NOT EXISTS bet_wallets (
  device_hash TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  last_claim DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS bet_markets (
  id TEXT PRIMARY KEY,
  bout_id TEXT NOT NULL,
  market_type TEXT NOT NULL,
  question TEXT NOT NULL,
  selections TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  winning_selection TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  settled_at DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS bets (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  selection TEXT NOT NULL,
  amount BIGINT NOT NULL,
  ip_ua TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bets_market ON bets (market_id);
CREATE TABLE IF NOT EXISTS bet_ledger (
  id BIGSERIAL PRIMARY KEY,
  device_hash TEXT NOT NULL,
  delta BIGINT NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_device ON bet_ledger (device_hash, created_at);
CREATE TABLE IF NOT EXISTS fighter_records (
  fighter TEXT PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  kos INTEGER NOT NULL DEFAULT 0,
  updated_at DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contract_markets (
  id TEXT PRIMARY KEY,
  bout_id TEXT NOT NULL DEFAULT '',
  market_kind TEXT NOT NULL,
  question TEXT NOT NULL,
  rule_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  qy_outstanding DOUBLE PRECISION NOT NULL DEFAULT 0,
  qn_outstanding DOUBLE PRECISION NOT NULL DEFAULT 0,
  winning_side TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  settled_at DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS contract_positions (
  device_hash TEXT NOT NULL,
  market_id TEXT NOT NULL,
  yes_contracts DOUBLE PRECISION NOT NULL DEFAULT 0,
  no_contracts DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_basis_yes DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_basis_no DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (device_hash, market_id)
);
CREATE TABLE IF NOT EXISTS contract_trades (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  side TEXT NOT NULL,
  action TEXT NOT NULL,
  contracts DOUBLE PRECISION NOT NULL,
  credits BIGINT NOT NULL,
  avg_price DOUBLE PRECISION NOT NULL,
  fee BIGINT NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ctrades_market ON contract_trades (market_id, created_at);
CREATE TABLE IF NOT EXISTS price_ticks (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  price_yes DOUBLE PRECISION NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticks_market ON price_ticks (market_id, created_at);
CREATE TABLE IF NOT EXISTS contract_blacklist (
  device_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS ops_gates (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  updated_at DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS subscriptions (
  device_hash TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT NOT NULL DEFAULT '',
  stripe_subscription_id TEXT NOT NULL DEFAULT '',
  current_period_end DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS fantasy_teams (
  id BIGSERIAL PRIMARY KEY,
  device_hash TEXT NOT NULL,
  season TEXT NOT NULL DEFAULT 's1',
  team_name TEXT NOT NULL,
  picks TEXT NOT NULL DEFAULT '[]',
  created_at DOUBLE PRECISION NOT NULL,
  UNIQUE (device_hash, season)
);
CREATE INDEX IF NOT EXISTS idx_fantasy_season ON fantasy_teams (season);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS live_rounds (
  id TEXT PRIMARY KEY,
  bout_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  tactic_a TEXT NOT NULL,
  tactic_b TEXT NOT NULL,
  branch_a_url TEXT NOT NULL DEFAULT '',
  branch_b_url TEXT NOT NULL DEFAULT '',
  winning_branch TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'scheduled',
  vote_deadline DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_bout ON live_rounds (bout_id, round_no);
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS fan_forge_submissions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  device_hash TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  ip_ua TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  votes INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forge_created ON fan_forge_submissions (created_at DESC);
CREATE TABLE IF NOT EXISTS episode_renders (
  week_key TEXT PRIMARY KEY,
  bout_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  job_id TEXT NOT NULL DEFAULT '',
  brief_json TEXT NOT NULL DEFAULT '{}',
  video_url TEXT NOT NULL DEFAULT '',
  poster_url TEXT NOT NULL DEFAULT '',
  credits_used INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episode_status ON episode_renders (status, updated_at DESC);
CREATE TABLE IF NOT EXISTS fan_forge_variants (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  base_fighter TEXT NOT NULL,
  variant_name TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT '',
  dna TEXT NOT NULL DEFAULT '',
  portrait_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  votes INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forge_variants_sub ON fan_forge_variants (submission_id);
CREATE INDEX IF NOT EXISTS idx_forge_variants_status ON fan_forge_variants (status, votes DESC);
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  week_key TEXT NOT NULL DEFAULT '',
  bout_id TEXT NOT NULL DEFAULT '',
  round_no INTEGER NOT NULL DEFAULT 0,
  tactic TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  poster_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  credits_used INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_kind ON content_items (kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_week ON content_items (week_key);
`;

const GATE_SEED: [string, string][] = [
  ['p1-teaser-posted', 'P1 预告片已手动发布(三平台+热门BGM)'],
  ['p1-window', 'P1 七天验证窗口(发布日起 7 天)'],
  ['p1-kill', "P1 杀线裁决:≥3 条 'when's the fight' 类评论 或 单条 >5k 播放"],
  ['p2-unlocked', 'P2 解锁(需 p1-kill 先完成,代码强制)'],
  ['sub-ringside', '订阅 Ringside 开放(门槛:1 万粉)'],
  ['sub-booker', '订阅 Booker/Promoter 开放(门槛:5 万粉)'],
  ['sub-fantasy', '梦幻联赛上线(S2 开赛)'],
  ['b-pilot', 'Friday Fight Night 试播 1 场(门控:50 同时在线 或 200 总投票)'],
  ['b-weekly', 'Friday Fight Night 周更(试播通过后)'],
];

/**
 * v1 遗留的样例赛程标题。早期 seed 的占位数据必须清掉,
 * 否则后台盘口和 /live 会出现「QF1 — Sample Bout」这种假比赛。
 * 只按这个精确标题删除,不动运营后来创建的任何 bout。
 */
const SAMPLE_BOUT_TITLE = 'QF1 — Sample Bout';

let client: postgres.Sql | null = null;
let inited = false;

function getClient(): postgres.Sql {
  if (!DSN) throw new Error('DATABASE_URL not set');
  if (!client) {
    client = postgres(DSN, {
      max: 4,
      // 与模板数据库客户端保持一致:Neon pooler 兼容
      prepare: false,
    });
  }
  return client;
}

async function ensure(): Promise<void> {
  if (inited) return;
  const sql = getClient();
  await sql.unsafe(SCHEMA);
  // Arena 对战表（v0.1）：独立 schema 文件，幂等建表
  await sql.unsafe(ARENA_SCHEMA);
  // 增长体系表（邀请 + 联盟营销）：独立 schema 文件，幂等建表
  await sql.unsafe(GROWTH_SCHEMA);
  // 老库的增量迁移(与原站一致)
  await sql.unsafe(
    "ALTER TABLE bouts ADD COLUMN IF NOT EXISTS tactic_note TEXT DEFAULT ''"
  );
  await sql.unsafe(
    "ALTER TABLE bet_markets ADD COLUMN IF NOT EXISTS house_pool TEXT DEFAULT '{}'"
  );
  await sql.unsafe(
    'ALTER TABLE votes ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 1'
  );
  await sql.unsafe(
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS waffo_subscription_id TEXT DEFAULT ''"
  );
  // 赛果回写(P0-2):bout 级胜者 / 终结方式 / 结算时间;P1-5 固定档期时间。
  // 全部 IF NOT EXISTS,纯增列,不影响已有数据。
  await sql.unsafe(
    "ALTER TABLE bouts ADD COLUMN IF NOT EXISTS winner TEXT DEFAULT ''"
  );
  await sql.unsafe(
    "ALTER TABLE bouts ADD COLUMN IF NOT EXISTS result_method TEXT DEFAULT ''"
  );
  await sql.unsafe(
    'ALTER TABLE bouts ADD COLUMN IF NOT EXISTS settled_at DOUBLE PRECISION DEFAULT 0'
  );
  await sql.unsafe(
    'ALTER TABLE bouts ADD COLUMN IF NOT EXISTS scheduled_at DOUBLE PRECISION DEFAULT 0'
  );

  // 清掉 v1 样例赛程「QF1 — Sample Bout」,避免后台/直播页出现假比赛。幂等,只匹配这个标题。
  const sample = [SAMPLE_BOUT_TITLE];
  await sql.unsafe(
    `DELETE FROM live_rounds WHERE bout_id IN (
       SELECT id FROM bouts WHERE title = $1)`,
    sample
  );
  await sql.unsafe(
    `DELETE FROM votes WHERE bout_id IN (
       SELECT id FROM bouts WHERE title = $1)`,
    sample
  );
  await sql.unsafe(
    `DELETE FROM bet_markets WHERE bout_id IN (
       SELECT id FROM bouts WHERE title = $1)`,
    sample
  );
  await sql.unsafe('DELETE FROM bouts WHERE title = $1', sample);

  // 首页规则投票用的常驻 exhibition 赛程(幂等,老库也会补上)
  await sql.unsafe(
    `INSERT INTO bouts (id,title,fighter_a,fighter_b,round_no,voting_open,created_at)
     VALUES ('ex1','EXHIBITION — NEXT RULE','RAGE MODE','FAIR PLAY',1,1,$1)
     ON CONFLICT (id) DO NOTHING`,
    [Date.now() / 1000]
  );

  const gates = await sql.unsafe<{ n: string }[]>(
    'SELECT COUNT(*) AS n FROM ops_gates'
  );
  if (Number(gates[0].n) === 0) {
    const now = Date.now() / 1000;
    for (const [id, label] of GATE_SEED) {
      await sql.unsafe(
        "INSERT INTO ops_gates (id,label,status,updated_at) VALUES ($1,$2,'pending',$3)",
        [id, label, now]
      );
    }
  }
  inited = true;
}

export async function qAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensure();
  const rows = await getClient().unsafe(sql, params as never[]);
  return rows as unknown as T[];
}

export async function qOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await qAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function qWrite(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  await ensure();
  const res = await getClient().unsafe(sql, params as never[]);
  return res.count ?? 0;
}

export function sha(s: string): string {
  return crypto
    .createHash('sha256')
    .update(s, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff ? xff.split(',')[0].trim() : 'unknown';
}

export async function checkRate(ip: string): Promise<boolean> {
  const now = Date.now() / 1000;
  await qWrite('DELETE FROM rate_hits WHERE ts < $1', [now - RATE_WINDOW_S]);
  const row = await qOne<{ n: string }>(
    'SELECT COUNT(*) AS n FROM rate_hits WHERE ip = $1',
    [ip]
  );
  if (row && Number(row.n) >= RATE_LIMIT) return false;
  await qWrite('INSERT INTO rate_hits (ip, ts) VALUES ($1, $2)', [ip, now]);
  return true;
}
