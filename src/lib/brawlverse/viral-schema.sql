-- BRAWLVERSE 裂变三机制 · 建表 SQL（spec §5 全文）
-- 用法：psql $DATABASE_URL -f viral-schema.sql（全部 IF NOT EXISTS，幂等）
-- identity_key 复用双轨身份：登录用户 'u:<userId>'，游客 sha256(device_id)

-- 分享解锁记录（防刷：每人每内容只记一次）
CREATE TABLE IF NOT EXISTS viral_unlocks (
  identity_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  unlock_type TEXT NOT NULL,          -- 'share' | 'milestone' | 'tier' | 'achievement'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (identity_key, content_id)
);

-- 分享行为记录（点 Share on X 即记，用于分享发起率统计）
CREATE TABLE IF NOT EXISTS viral_shares (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,  -- 0=仅发起 1=确认已分享
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_shares_key ON viral_shares(identity_key);

-- 里程碑（全站计数，阈值可配）
CREATE TABLE IF NOT EXISTS viral_milestones (
  milestone_id TEXT PRIMARY KEY,       -- 如 'qf2-trash-talk'
  threshold INTEGER NOT NULL,          -- 如 1000
  current_count INTEGER NOT NULL DEFAULT 0,
  unlocked_at INTEGER,                 -- NULL=未达成
  updated_at INTEGER NOT NULL
);

-- 推送频率控制（机制三：每天每人最多 1 条翻盘推送）
CREATE TABLE IF NOT EXISTS viral_push_log (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  push_type TEXT NOT NULL,             -- 'loss_cta'
  bout_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_push_log_key ON viral_push_log(identity_key, sent_at);

-- 行为埋点（通用事件表，三机制共用）
CREATE TABLE IF NOT EXISTS viral_events (
  id SERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  event_name TEXT NOT NULL,            -- near_miss_shown / share_initiated / loss_cta_click ...
  props TEXT,                          -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viral_events_name ON viral_events(event_name, created_at);

-- 里程碑 seed（阈值与 src/lib/brawlverse/viral-config.ts 保持一致）
INSERT INTO viral_milestones (milestone_id, threshold, current_count, updated_at)
VALUES ('qf2-trash-talk', 1000, 0, EXTRACT(EPOCH FROM NOW())::INTEGER)
ON CONFLICT (milestone_id) DO NOTHING;
