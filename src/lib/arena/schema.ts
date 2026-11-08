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
`;
