/**
 * 双轨身份:登录用户绑定 Better Auth userId,游客用设备指纹。
 * 数据表主键列(device_hash)统一存 identity key:
 *   游客:sha256(device_id) —— 与原站行为完全一致
 *   登录用户:'u:' + userId
 */
import { auth } from '@/lib/auth';
import { qWrite, sha } from './db';

export interface Identity {
  /** 写入 device_hash 列的值 */
  key: string;
  /** 是否已登录 */
  authed: boolean;
  /** Better Auth userId(游客为 null) */
  userId: string | null;
}

const GUEST_KEY_MIN_LEN = 8;

/**
 * 解析请求身份。登录态优先;否则要求客户端带 device_id(>=8 位)。
 * 返回 null 表示连游客身份都不合法,接口应拒绝。
 */
export async function resolveIdentity(
  req: Request,
  deviceId?: string
): Promise<Identity | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user?.id) {
      return {
        key: 'u:' + session.user.id,
        authed: true,
        userId: session.user.id,
      };
    }
  } catch {
    // session 解析失败按游客处理
  }
  const d = (deviceId || '').trim();
  if (d.length < GUEST_KEY_MIN_LEN) return null;
  return { key: sha(d), authed: false, userId: null };
}

/**
 * 是否管理员。
 * 1) 机器令牌:X-Admin-Token 命中 ADMIN_OPS_TOKEN(供生产管线 / Cron 调用,不依赖浏览器会话)
 * 2) 浏览器:Better Auth admin 插件角色
 */
export async function isAdmin(req: Request): Promise<boolean> {
  const ops = process.env.ADMIN_OPS_TOKEN || '';
  if (ops) {
    const got = req.headers.get('x-admin-token') || '';
    if (got.length === ops.length && got === ops) return true;
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    return session?.user?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * 登录后把游客数据归并到账号:重写各业务表的 device_hash。
 * 幂等;bet_wallets 主键冲突时保留余额较高一行并迁移流水。
 */
export async function claimGuestData(
  userId: string,
  deviceId: string
): Promise<void> {
  const d = (deviceId || '').trim();
  if (!userId || d.length < GUEST_KEY_MIN_LEN) return;
  const from = sha(d);
  const to = 'u:' + userId;
  if (from === to) return;

  // 钱包:若用户键已存在,合并余额后删除游客钱包;否则直接改键
  // 注意:$1 必须被引用,否则 Postgres 无法推断参数类型(could not determine data type of parameter $1)
  await qWrite(
    `INSERT INTO bet_wallets (device_hash, balance, last_claim, created_at)
     SELECT $2, 0, 0, $3
     WHERE NOT EXISTS (SELECT 1 FROM bet_wallets WHERE device_hash = $2)
       AND $1 <> ''`,
    [from, to, Date.now() / 1000]
  );
  await qWrite(
    `UPDATE bet_wallets SET
       balance = (SELECT balance FROM bet_wallets WHERE device_hash = $1)
              + (SELECT balance FROM bet_wallets WHERE device_hash = $2),
       last_claim = GREATEST(
         (SELECT last_claim FROM bet_wallets WHERE device_hash = $1),
         (SELECT last_claim FROM bet_wallets WHERE device_hash = $2))
     WHERE device_hash = $2 AND EXISTS (SELECT 1 FROM bet_wallets WHERE device_hash = $1)`,
    [from, to]
  );
  await qWrite('DELETE FROM bet_wallets WHERE device_hash = $1', [from]);

  await qWrite('UPDATE votes SET device_hash = $2 WHERE device_hash = $1', [
    from,
    to,
  ]);
  await qWrite(
    'UPDATE bet_ledger SET device_hash = $2 WHERE device_hash = $1',
    [from, to]
  );
  await qWrite('UPDATE bets SET device_hash = $2 WHERE device_hash = $1', [
    from,
    to,
  ]);
  await qWrite(
    'UPDATE fan_captions SET device_hash = $2 WHERE device_hash = $1',
    [from, to]
  );
  // fantasy_teams 有 (device_hash, season) 唯一约束:冲突时保留用户键已有行
  await qWrite(
    'DELETE FROM fantasy_teams WHERE device_hash = $1 AND season IN (SELECT season FROM fantasy_teams WHERE device_hash = $2)',
    [from, to]
  );
  await qWrite(
    'UPDATE fantasy_teams SET device_hash = $2 WHERE device_hash = $1',
    [from, to]
  );
  // subscriptions 主键冲突时保留用户键已有记录(付费记录以支付侧为准)
  await qWrite(
    'DELETE FROM subscriptions WHERE device_hash = $1 AND EXISTS (SELECT 1 FROM subscriptions WHERE device_hash = $2)',
    [from, to]
  );
  await qWrite(
    'UPDATE subscriptions SET device_hash = $2 WHERE device_hash = $1',
    [from, to]
  );
}
