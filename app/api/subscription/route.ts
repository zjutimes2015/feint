/** 订阅：状态查询 + Waffo 收银台。 */
import { sha } from "@/lib/db";
import { PAID_TIERS, TIERS, entitlements } from "@/lib/entitlements";
import { createCheckoutSession, productId, waffoConfigured } from "@/lib/waffo";
import { json, opOf, preflight, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  if (op !== "status") return json({ error: "unknown op" }, 400, req);

  const deviceId = new URL(req.url).searchParams.get("device_id");
  if (!deviceId || deviceId.length < 8) {
    return json({ error: "device_id required" }, 400, req);
  }

  const e = await entitlements(sha(deviceId));
  const tiers: Record<string, { price_monthly: number }> = {};
  for (const [k, v] of Object.entries(TIERS)) tiers[k] = { price_monthly: v.price_monthly };

  return json({ entitlements: e, tiers }, 200, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op !== "checkout") return json({ error: "unknown op" }, 400, req);

  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400, req);
  }

  const tier = String(v.tier || "").trim();
  const deviceId = v.device_id;
  if (!PAID_TIERS.includes(tier as any)) {
    return json({ error: "tier must be ringside|booker|promoter" }, 400, req);
  }
  if (!deviceId || String(deviceId).length < 8) {
    return json({ error: "device_id required" }, 400, req);
  }
  if (!waffoConfigured()) {
    return json({ error: "waffo not configured (WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY missing)" }, 501, req);
  }

  const pid = productId(tier);
  if (!pid) return json({ error: "product not configured for tier " + tier }, 501, req);

  const successUrl: string =
    v.success_url || "/episodes?sub=ok";

  try {
    const url = await createCheckoutSession(
      pid,
      { device_hash: sha(String(deviceId)), tier },
      successUrl,
    );
    return json({ ok: true, url, tier }, 200, req);
  } catch (e: any) {
    return json({ error: "waffo error: " + String(e?.message ?? e).slice(0, 200) }, 502, req);
  }
}
