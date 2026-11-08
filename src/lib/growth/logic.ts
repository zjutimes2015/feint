/**
 * 增长体系业务逻辑：邀请 + 联盟营销。
 *
 * 邀请（零成本，虚拟积分）：
 * - 每个用户有唯一邀请码，被邀请人注册得 500 积分
 * - 被邀请人完成首场 arena 对战后，邀请人得 500 积分
 * - 防刷：同一设备只能被邀请一次，不能邀请自己
 *
 * 联盟（一次性赏金，利润率 80%）：
 * - 批准的联盟伙伴拿专属链接，30 天 cookie
 * - 被推荐用户订阅后一次性结清赏金，不 recurring：
 *   Ringside $5 / Booker $15 / Promoter $50
 * - 满 $50 提现，月结
 * - 为什么一次性而非 recurring：内容 AI 成本 $300/季是固定的，
 *   小规模下 recurring 佣金数学上保不住 80%（见 BRAWLVERSE-投入产出比-v1.0）
 */
import { qAll, qOne, qWrite } from '@/lib/brawlverse/db';
import { randomBytes } from 'crypto';

export const FRIEND_CREDITS = 500;
export const REFERRER_CREDITS = 500;
/** 联盟一次性赏金（美分）：签约当月结清，不 recurring */
export const AFFILIATE_BOUNTIES: Record<string, number> = {
  ringside: 500,
  booker: 1500,
  promoter: 5000,
};
export const AFFILIATE_MIN_PAYOUT_CENTS = 5000;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const buf = randomBytes(8);
  for (let i = 0; i < 8; i++) code += chars[buf[i] % chars.length];
  return code;
}

async function uniqueCode(
  table: 'referral_codes' | 'affiliates'
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const row = await qOne(`SELECT 1 FROM ${table} WHERE code = $1 LIMIT 1`, [
      code,
    ]);
    if (!row) return code;
  }
  return generateCode() + randomBytes(2).toString('hex');
}

/** 获取或创建用户的邀请码 */
export async function getOrCreateReferralCode(
  deviceHash: string
): Promise<string> {
  const row = await qOne<{ code: string }>(
    `SELECT code FROM referral_codes WHERE device_hash = $1 LIMIT 1`,
    [deviceHash]
  );
  if (row) return row.code;
  const code = await uniqueCode('referral_codes');
  await qWrite(
    `INSERT INTO referral_codes (device_hash, code, created_at) VALUES ($1, $2, $3)`,
    [deviceHash, code, Date.now() / 1000]
  );
  return code;
}

/** 给钱包加虚拟积分（不存在则建钱包） */
export async function addCredits(
  deviceHash: string,
  amount: number
): Promise<void> {
  await qWrite(
    `INSERT INTO bet_wallets (device_hash, balance, last_claim, created_at)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (device_hash) DO UPDATE SET balance = bet_wallets.balance + $2`,
    [deviceHash, amount, Date.now() / 1000]
  );
}

/**
 * 被邀请人使用邀请码注册。成功时被邀请人立即得 500 积分。
 */
export async function redeemReferralCode(
  newDeviceHash: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const codeRow = await qOne<{ device_hash: string }>(
    `SELECT device_hash FROM referral_codes WHERE code = $1 LIMIT 1`,
    [code]
  );
  if (!codeRow) return { ok: false, error: 'invalid_code' };
  if (codeRow.device_hash === newDeviceHash)
    return { ok: false, error: 'self_referral' };

  const existing = await qOne(
    `SELECT 1 FROM referrals WHERE referred_device = $1 LIMIT 1`,
    [newDeviceHash]
  );
  if (existing) return { ok: false, error: 'already_referred' };

  const now = Date.now() / 1000;
  await qWrite(
    `INSERT INTO referrals (id, code, referrer_device, referred_device, status, friend_credits_awarded, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [
      newId('ref'),
      code,
      codeRow.device_hash,
      newDeviceHash,
      FRIEND_CREDITS,
      now,
    ]
  );
  await addCredits(newDeviceHash, FRIEND_CREDITS);
  return { ok: true };
}

/** 被邀请人完成首场对战后调用：邀请人得 500 积分 */
export async function completeReferralOnFirstBattle(
  deviceHash: string
): Promise<boolean> {
  const row = await qOne<{ id: string; referrer_device: string }>(
    `SELECT id, referrer_device FROM referrals WHERE referred_device = $1 AND status = 'pending' LIMIT 1`,
    [deviceHash]
  );
  if (!row) return false;
  const now = Date.now() / 1000;
  await qWrite(
    `UPDATE referrals SET status = 'completed', referrer_credits_awarded = $1, completed_at = $2 WHERE id = $3`,
    [REFERRER_CREDITS, now, row.id]
  );
  await addCredits(row.referrer_device, REFERRER_CREDITS);
  return true;
}

/** 邀请统计 */
export async function getReferralStats(deviceHash: string) {
  const code = await getOrCreateReferralCode(deviceHash);
  const rows = await qAll<{ status: string; n: number; earned: number }>(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(referrer_credits_awarded),0)::int AS earned
     FROM referrals WHERE referrer_device = $1 GROUP BY status`,
    [deviceHash]
  );
  let invited = 0;
  let completed = 0;
  let earned = 0;
  for (const r of rows) {
    invited += r.n;
    earned += r.earned;
    if (r.status === 'completed') completed += r.n;
  }
  return { code, invited, completed, earned };
}

/** 申请成为联盟伙伴（待人工审核） */
export async function applyAffiliate(
  deviceHash: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const existing = await qOne<{ status: string; code: string }>(
    `SELECT status, code FROM affiliates WHERE device_hash = $1 LIMIT 1`,
    [deviceHash]
  );
  if (existing) {
    return {
      ok: false,
      error: `already_${existing.status}`,
      code: existing.code,
    };
  }
  const code = await uniqueCode('affiliates');
  await qWrite(
    `INSERT INTO affiliates (device_hash, code, status, created_at)
     VALUES ($1, $2, 'pending', $3)`,
    [deviceHash, code, Date.now() / 1000]
  );
  return { ok: true, code };
}

/** 记录联盟链接点击 */
export async function trackAffiliateClick(
  code: string,
  ipHash: string
): Promise<void> {
  const row = await qOne(
    `SELECT 1 FROM affiliates WHERE code = $1 AND status = 'approved' LIMIT 1`,
    [code]
  );
  if (!row) return;
  await qWrite(
    `INSERT INTO affiliate_clicks (affiliate_code, ip_hash, created_at) VALUES ($1, $2, $3)`,
    [code, ipHash, Date.now() / 1000]
  );
}

/** 联盟转化：被推荐用户订阅后一次性结清赏金（按档位，不按金额比例） */
export async function recordAffiliateConversion(
  affiliateDevice: string,
  referredDevice: string,
  tier: string
): Promise<void> {
  const aff = await qOne(
    `SELECT 1 FROM affiliates WHERE device_hash = $1 AND status = 'approved' LIMIT 1`,
    [affiliateDevice]
  );
  if (!aff) return;
  const bounty = AFFILIATE_BOUNTIES[tier.toLowerCase()] ?? 0;
  if (bounty <= 0) return;
  // 同一被推荐人只结一次赏金（防重复）
  const dup = await qOne(
    `SELECT 1 FROM affiliate_conversions WHERE referred_device = $1 LIMIT 1`,
    [referredDevice]
  );
  if (dup) return;
  await qWrite(
    `INSERT INTO affiliate_conversions (id, affiliate_device, referred_device, subscription_tier, amount_cents, commission_cents, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [
      newId('ac'),
      affiliateDevice,
      referredDevice,
      tier,
      bounty,
      bounty,
      Date.now() / 1000,
    ]
  );
}

/** 联盟看板数据 */
export async function getAffiliateDashboard(deviceHash: string) {
  const aff = await qOne<{ code: string; status: string }>(
    `SELECT code, status FROM affiliates WHERE device_hash = $1 LIMIT 1`,
    [deviceHash]
  );
  if (!aff) return null;
  const clicks = await qOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM affiliate_clicks WHERE affiliate_code = $1 AND created_at > $2`,
    [aff.code, Date.now() / 1000 - 30 * 86400]
  );
  const conv = await qAll<{ status: string; n: number; total: number }>(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(commission_cents),0)::int AS total
     FROM affiliate_conversions WHERE affiliate_device = $1 GROUP BY status`,
    [deviceHash]
  );
  let conversions = 0;
  let pendingCents = 0;
  let paidCents = 0;
  for (const r of conv) {
    conversions += r.n;
    if (r.status === 'paid') paidCents += r.total;
    else pendingCents += r.total;
  }
  return {
    code: aff.code,
    status: aff.status,
    bounties: { ringside: 500, booker: 1500, promoter: 5000 },
    clicks30d: clicks?.n ?? 0,
    conversions,
    pendingCents,
    paidCents,
    minPayoutCents: AFFILIATE_MIN_PAYOUT_CENTS,
  };
}
