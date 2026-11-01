/** Waffo 支付回调：验签 + 幂等 + 写入订阅。 */
import { qWrite } from "@/lib/db";
import { PAID_TIERS } from "@/lib/entitlements";
import { verifyWebhook, waffoConfigured } from "@/lib/waffo";
import { json, opOf, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

async function upsertSub(
  deviceHash: string,
  tier: string,
  status: string,
  waffoSubId = "",
  periodEnd = 0,
): Promise<void> {
  const now = Date.now() / 1000;
  await qWrite(
    `INSERT INTO subscriptions
       (device_hash, tier, status, waffo_subscription_id, current_period_end, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (device_hash) DO UPDATE SET
       tier = EXCLUDED.tier, status = EXCLUDED.status,
       waffo_subscription_id = EXCLUDED.waffo_subscription_id,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = EXCLUDED.updated_at`,
    [deviceHash, tier, status, waffoSubId, periodEnd, now, now],
  );
}

function periodEnd(data: Record<string, any>): number {
  for (const k of ["currentPeriodEnd", "current_period_end", "expiresAt", "expires_at"]) {
    const v = data[k];
    if (!v) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(String(v).replace("Z", "+00:00"));
    if (Number.isFinite(d)) return d / 1000;
  }
  return 0;
}

export async function POST(req: Request) {
  if (opOf(req, "waffo") !== "waffo") {
    return json({ error: "unknown op" }, 400);
  }
  if (!waffoConfigured()) {
    return json({ error: "waffo not configured" }, 501);
  }

  const raw = await req.text();
  const sig = req.headers.get("x-waffo-signature") || "";

  let event: any;
  try {
    event = verifyWebhook(raw, sig);
  } catch (e: any) {
    return json({ error: "invalid signature: " + String(e?.message ?? e).slice(0, 120) }, 401);
  }

  // test 环境的事件不得触碰生产逻辑
  const wantEnv = process.env.WAFFO_ENV || "";
  if (wantEnv && event.mode && event.mode !== wantEnv) {
    return json({ ok: true, ignored: "env mismatch" }, 200);
  }

  // 幂等：event_id 主键冲突即视为重复
  const eid = String(event.id || "");
  if (eid) {
    try {
      await qWrite("INSERT INTO webhook_events (event_id, created_at) VALUES ($1,$2)", [
        eid,
        Date.now() / 1000,
      ]);
    } catch {
      return json({ ok: true, deduped: true }, 200);
    }
  }

  const etype = String(event.eventType || "");
  const data = event.data || {};
  const md = data.metadata || {};
  const dh = String(md.device_hash || "");
  const tier = String(md.tier || "");

  try {
    if (
      etype === "subscription.activated" ||
      (etype === "order.completed" && PAID_TIERS.includes(tier as any) && dh)
    ) {
      const subId = String(data.subscriptionId || data.id || "");
      await upsertSub(dh, tier, "active", subId, periodEnd(data));
    } else if (etype === "subscription.past_due") {
      if (dh) {
        await upsertSub(
          dh,
          PAID_TIERS.includes(tier as any) ? tier : "ringside",
          "past_due",
          String(data.subscriptionId || ""),
          periodEnd(data),
        );
      }
    } else if (etype === "subscription.canceled") {
      if (dh) await upsertSub(dh, "free", "canceled");
    }
  } catch (e: any) {
    return json({ error: "handler failed: " + String(e?.message ?? e).slice(0, 160) }, 500);
  }

  return json({ ok: true, type: etype }, 200);
}
