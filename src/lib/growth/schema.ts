/**
 * 增长体系表结构：邀请（Referral）+ 联盟营销（Affiliate）。
 * 拼进 src/lib/brawlverse/db.ts 的 ensure() 里执行，与现有表同一风格：原生 SQL。
 *
 * 利润率保证：
 * - 邀请积分是虚拟积分（bet_wallets），零边际成本，不影响利润率。
 * - 联盟佣金 15%：100% - 15%（佣金）- 4%（Waffo 手续费）- 1%（服务器分摊）= 80% 利润率 ✅
 */
export const GROWTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS referral_codes (
  device_hash TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  referrer_device TEXT NOT NULL,
  referred_device TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  friend_credits_awarded BIGINT NOT NULL DEFAULT 0,
  referrer_credits_awarded BIGINT NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL,
  completed_at DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_device);
CREATE TABLE IF NOT EXISTS affiliates (
  device_hash TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id BIGSERIAL PRIMARY KEY,
  affiliate_code TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON affiliate_clicks (affiliate_code, created_at);
CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id TEXT PRIMARY KEY,
  affiliate_device TEXT NOT NULL,
  referred_device TEXT NOT NULL,
  subscription_tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DOUBLE PRECISION NOT NULL,
  paid_at DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_affiliate ON affiliate_conversions (affiliate_device, status);
`;
