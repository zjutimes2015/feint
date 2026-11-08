/** 订阅：状态查询 + Waffo 收银台。 */
import { PAID_TIERS, TIERS, entitlements } from '@/lib/brawlverse/entitlements';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import {
  createCheckoutSession,
  productId,
  waffoConfigured,
} from '@/lib/brawlverse/waffo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  // P1-7:公开的权益对照表。价格与权益同源(TIERS),不靠文案各写一份。
  if (op === 'tiers') {
    return json(
      {
        tiers: Object.entries(TIERS).map(([name, v]) => ({
          name,
          price_monthly: v.price_monthly,
          price_yearly: (v as any).price_yearly ?? 0,
          perks: {
            vote_weight: v.vote_weight,
            bet_max_mult: v.bet_max_mult,
            early_access: v.early_access,
            led_name: v.led_name,
            booker_night: v.booker_night,
            fantasy: v.fantasy,
          },
        })),
      },
      200,
      req
    );
  }
  if (op !== 'status') return json({ error: 'unknown op' }, 400, req);

  const deviceId = new URL(req.url).searchParams.get('device_id') || '';
  // 双轨身份:登录用户免 device_id,游客用设备指纹
  const identity = await resolveIdentity(req, deviceId);
  if (!identity) {
    return json({ error: 'device_id required' }, 400, req);
  }

  const e = await entitlements(identity.key);
  const tiers: Record<string, { price_monthly: number }> = {};
  for (const [k, v] of Object.entries(TIERS))
    tiers[k] = { price_monthly: v.price_monthly };

  return json({ entitlements: e, tiers }, 200, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op !== 'checkout') return json({ error: 'unknown op' }, 400, req);

  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const tier = String(v.tier || '').trim();
  if (!PAID_TIERS.includes(tier as any)) {
    return json(
      { error: 'tier must be ringside|booker|promoter|annual' },
      400,
      req
    );
  }

  // 双轨身份:登录用户用账号,游客用设备指纹;metadata 写身份键,webhook 据此开通
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) {
    return json({ error: 'device_id required' }, 400, req);
  }
  if (!waffoConfigured()) {
    return json(
      {
        error:
          'waffo not configured (WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY missing)',
      },
      501,
      req
    );
  }

  const pid = productId(tier);
  if (!pid)
    return json({ error: 'product not configured for tier ' + tier }, 501, req);

  const successUrl: string = v.success_url || '/episodes?sub=ok';

  try {
    const url = await createCheckoutSession(
      pid,
      { device_hash: identity.key, tier },
      successUrl
    );
    return json({ ok: true, url, tier }, 200, req);
  } catch (e: any) {
    return json(
      { error: 'waffo error: ' + String(e?.message ?? e).slice(0, 200) },
      502,
      req
    );
  }
}
