/**
 * 身份归并：登录成功后由前端调用,把游客(设备指纹)数据并入账号。
 * POST /api/identity?op=claim  body: { device_id }
 */
import { auth } from '@/lib/auth';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { claimGuestData } from '@/lib/brawlverse/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  const op = opOf(req, 'claim');
  if (op !== 'claim') return json({ error: 'unknown op' }, 400, req);

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) return json({ error: 'login required' }, 401, req);

  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const deviceId = String(v.device_id || '').trim();
  if (deviceId.length < 8)
    return json({ error: 'device_id required' }, 400, req);

  await claimGuestData(session.user.id, deviceId);
  return json({ ok: true }, 200, req);
}
