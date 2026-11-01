import json
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import q_one, q_write, send, send_cors_preflight
from lib._entitlements import PAID_TIERS
from lib._waffo import verify_webhook, waffo_configured

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def _upsert_sub(device_hash, tier, status, waffo_sub_id="", period_end=0):
    now = time.time()
    q_write(
        """INSERT INTO subscriptions
             (device_hash, tier, status, waffo_subscription_id,
              current_period_end, created_at, updated_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (device_hash) DO UPDATE SET
             tier = EXCLUDED.tier, status = EXCLUDED.status,
             waffo_subscription_id = EXCLUDED.waffo_subscription_id,
             current_period_end = EXCLUDED.current_period_end,
             updated_at = EXCLUDED.updated_at""",
        (device_hash, tier, status, waffo_sub_id, period_end, now, now),
    )


def _period_end(data):
    for k in ("currentPeriodEnd", "current_period_end", "expiresAt", "expires_at"):
        v = data.get(k)
        if v:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
            try:
                from datetime import datetime
                return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
            except Exception:
                pass
    return 0


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "waffo").lower()

    def do_POST(self):
        if self._op() != "waffo":
            send(self, 400, {"error": "unknown op"}, cors=False)
            return
        if not waffo_configured():
            send(self, 501, {"error": "waffo not configured"}, cors=False)
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        payload = self.rfile.read(length) if length else b""
        sig = self.headers.get("x-waffo-signature", "")
        try:
            event = verify_webhook(payload, sig)
        except ValueError as e:
            send(self, 401, {"error": "invalid signature: " + str(e)[:120]}, cors=False)
            return
        # env guard: test events must not touch prod logic
        want_env = os.environ.get("WAFFO_ENV", "")
        if want_env and event.get("mode", "") and event["mode"] != want_env:
            send(self, 200, {"ok": True, "ignored": "env mismatch"}, cors=False)
            return
        # idempotency
        eid = str(event.get("id", ""))
        if eid:
            try:
                q_write("INSERT INTO webhook_events (event_id, created_at) VALUES (%s,%s)",
                        (eid, time.time()))
            except Exception:
                send(self, 200, {"ok": True, "deduped": True}, cors=False)
                return
        etype = event.get("eventType", "")
        data = event.get("data", {}) or {}
        md = data.get("metadata", {}) or {}
        dh = md.get("device_hash", "")
        tier = md.get("tier", "")
        try:
            if etype == "subscription.activated" or (
                    etype == "order.completed" and tier in PAID_TIERS and dh):
                sub_id = str(data.get("subscriptionId") or data.get("id") or "")
                _upsert_sub(dh, tier, "active", sub_id, _period_end(data))
            elif etype == "subscription.past_due":
                if dh:
                    _upsert_sub(dh, tier if tier in PAID_TIERS else "ringside",
                                "past_due", str(data.get("subscriptionId") or ""),
                                _period_end(data))
            elif etype == "subscription.canceled":
                if dh:
                    _upsert_sub(dh, "free", "canceled")
        except Exception as e:
            send(self, 500, {"error": "handler failed: " + str(e)[:160]}, cors=False)
            return
        send(self, 200, {"ok": True, "type": etype}, cors=False)
