/**
 * Arena 表结构：拼进 src/lib/brawlverse/db.ts 的 ensure() 里执行。
 * 与 brawlverse 现有表同一风格：原生 SQL，CREATE TABLE IF NOT EXISTS。
 */
export const ARENA_SCHEMA = `
CREATE TABLE IF NOT EXISTS arena_matches (
  id TEXT PRIMARY KEY,
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  fighter_a TEXT NOT NULL,
  fighter_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  round_no INTEGER NOT NULL DEFAULT 0,
  hp_a INTEGER NOT NULL DEFAULT 100,
  hp_b INTEGER NOT NULL DEFAULT 100,
  hype_a INTEGER NOT NULL DEFAULT 0,
  hype_b INTEGER NOT NULL DEFAULT 0,
  stamina_a INTEGER NOT NULL DEFAULT 100,
  stamina_b INTEGER NOT NULL DEFAULT 100,
  read_a INTEGER NOT NULL DEFAULT 0,
  read_b INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_matches_player ON arena_matches (player_a, updated_at);
CREATE TABLE IF NOT EXISTS arena_rounds (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  move_a TEXT NOT NULL,
  move_b TEXT NOT NULL,
  log_json TEXT NOT NULL DEFAULT '[]',
  hp_a INTEGER NOT NULL,
  hp_b INTEGER NOT NULL,
  hype_a INTEGER NOT NULL DEFAULT 0,
  hype_b INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_rounds_match ON arena_rounds (match_id, round_no);
CREATE TABLE IF NOT EXISTS arena_rankings (
  player TEXT PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  kos INTEGER NOT NULL DEFAULT 0,
  updated_at DOUBLE PRECISION NOT NULL DEFAULT 0
);
-- v0.2 每日同题 / 异步挑战：比赛记录种子与初始残局，便于精确复现
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS seed BIGINT NOT NULL DEFAULT 0;
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'casual';
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS day_key TEXT NOT NULL DEFAULT '';
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS challenge_code TEXT NOT NULL DEFAULT '';
ALTER TABLE arena_matches ADD COLUMN IF NOT EXISTS scenario_json TEXT NOT NULL DEFAULT '';
-- 每日榜：每人每天只留最好的一局（先比胜负，再比剩余血量，最后比回合数）
CREATE TABLE IF NOT EXISTS arena_daily_runs (
  day_key TEXT NOT NULL,
  player TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  rounds INTEGER NOT NULL DEFAULT 0,
  hp_left INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (day_key, player)
);
CREATE INDEX IF NOT EXISTS idx_arena_daily_rank
  ON arena_daily_runs (day_key, wins DESC, hp_left DESC, rounds ASC);
-- 玩家进度：段位分 / 连胜 / 最佳连胜（排位榜原表直接加列）
ALTER TABLE arena_rankings ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE arena_rankings ADD COLUMN IF NOT EXISTS streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE arena_rankings ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;
-- 每日连击：连续几天来打今日残局
CREATE TABLE IF NOT EXISTS arena_daily_streaks (
  player TEXT PRIMARY KEY,
  days INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_day TEXT NOT NULL DEFAULT '',
  updated_at DOUBLE PRECISION NOT NULL DEFAULT 0
);
-- 异步挑战码：朋友打开同一码，打同一套 AI 种子与残局
CREATE TABLE IF NOT EXISTS arena_challenges (
  code TEXT PRIMARY KEY,
  seed BIGINT NOT NULL,
  fighter_a TEXT NOT NULL,
  fighter_b TEXT NOT NULL,
  start_json TEXT NOT NULL DEFAULT '',
  source_mode TEXT NOT NULL DEFAULT 'casual',
  created_by TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);
`;
