/**
 * 数据库层：Neon Postgres（node-postgres）。
 * 表结构与 Python 版严格一致，已有数据可直接复用。
 */
import crypto from "node:crypto";
import { Pool, type PoolClient } from "pg";

const DSN = process.env.DATABASE_URL || "";

export const RATE_LIMIT = 20;
export const RATE_WINDOW_S = 60;
export const CHOICES = new Set(["heavy", "dodge", "guard"]);

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
`;

const GATE_SEED: [string, string][] = [
  ["p1-teaser-posted", "P1 预告片已手动发布（三平台+热门BGM）"],
  ["p1-window", "P1 七天验证窗口（发布日起 7 天）"],
  ["p1-kill", "P1 杀线裁决：≥3 条 'when's the fight' 类评论 或 单条 >5k 播放"],
  ["p2-unlocked", "P2 解锁（需 p1-kill 先完成，代码强制）"],
  ["sub-ringside", "订阅 Ringside 开放（门槛：1 万粉）"],
  ["sub-booker", "订阅 Booker/Promoter 开放（门槛：5 万粉）"],
  ["sub-fantasy", "梦幻联赛上线（S2 开赛）"],
  ["b-pilot", "Friday Fight Night 试播 1 场（门控：50 同时在线 或 200 总投票）"],
  ["b-weekly", "Friday Fight Night 周更（试播通过后）"],
];

const SEED: [string, string, string, string, number, number][] = [
  ["qf1", "QF1 — Sample Bout", "IRON JAW", "VIPER", 2, 1],
  ["qf2", "QF2", "SLEDGE", "MONSOON", 1, 0],
  ["qf3", "QF3", "VOLT", "THE PROFESSOR", 1, 0],
  ["qf4", "QF4", "GOLIATH-7", "LA REINA", 1, 0],
];

let pool: Pool | null = null;
let inited = false;

function getPool(): Pool {
  if (!DSN) throw new Error("DATABASE_URL not set");
  if (!pool) {
    pool = new Pool({
      connectionString: DSN,
      max: 4,
      // Neon 需要 TLS；连接串里的 sslmode=require 由 pg 解析，这里兜底
      ssl: DSN.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function ensure(): Promise<void> {
  if (inited) return;
  const p = getPool();
  const c = await p.connect();
  try {
    await c.query(SCHEMA);
    // 老库的增量迁移（与 Python 版一致）
    await c.query("ALTER TABLE bouts ADD COLUMN IF NOT EXISTS tactic_note TEXT DEFAULT ''");
    await c.query("ALTER TABLE bet_markets ADD COLUMN IF NOT EXISTS house_pool TEXT DEFAULT '{}'");
    await c.query("ALTER TABLE votes ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 1");
    await c.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS waffo_subscription_id TEXT DEFAULT ''");

    const bouts = await c.query<{ n: string }>("SELECT COUNT(*) AS n FROM bouts");
    if (Number(bouts.rows[0].n) === 0) {
      const now = Date.now() / 1000;
      for (const [id, title, a, b, roundNo, open] of SEED) {
        await c.query(
          "INSERT INTO bouts (id,title,fighter_a,fighter_b,round_no,voting_open,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [id, title, a, b, roundNo, open, now],
        );
      }
    }
    const gates = await c.query<{ n: string }>("SELECT COUNT(*) AS n FROM ops_gates");
    if (Number(gates.rows[0].n) === 0) {
      const now = Date.now() / 1000;
      for (const [id, label] of GATE_SEED) {
        await c.query("INSERT INTO ops_gates (id,label,status,updated_at) VALUES ($1,$2,'pending',$3)", [
          id,
          label,
          now,
        ]);
      }
    }
  } finally {
    c.release();
  }
  inited = true;
}

async function withConn<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensure();
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

export async function qAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withConn(async (c) => {
    const r = await c.query(sql, params as any[]);
    return r.rows as T[];
  });
}

export async function qOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await qAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function qWrite(sql: string, params: unknown[] = []): Promise<number> {
  return withConn(async (c) => {
    const r = await c.query(sql, params as any[]);
    return r.rowCount ?? 0;
  });
}

export function sha(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff ? xff.split(",")[0].trim() : "unknown";
}

export async function checkRate(ip: string): Promise<boolean> {
  const now = Date.now() / 1000;
  await qWrite("DELETE FROM rate_hits WHERE ts < $1", [now - RATE_WINDOW_S]);
  const row = await qOne<{ n: string }>("SELECT COUNT(*) AS n FROM rate_hits WHERE ip = $1", [ip]);
  if (row && Number(row.n) >= RATE_LIMIT) return false;
  await qWrite("INSERT INTO rate_hits (ip, ts) VALUES ($1, $2)", [ip, now]);
  return true;
}
