import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import read_json, send, send_cors_preflight, sha
from lib._entitlements import PAID_TIERS, TIERS, entitlements
from lib._waffo import create_checkout_session, product_id, waffo_configured

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "").lower()

    def do_GET(self):
        op = self._op()
        if op != "status":
            send(self, 400, {"error": "unknown op"})
            return
        qs = parse_qs(urlparse(self.path).query)
        device_id = qs.get("device_id", [None])[0]
        if not device_id or len(device_id) < 8:
            send(self, 400, {"error": "device_id required"})
            return
        e = entitlements(sha(device_id))
        send(self, 200, {"entitlements": e,
                         "tiers": {k: {"price_monthly": v["price_monthly"]} for k, v in TIERS.items()}})

    def do_POST(self):
        op = self._op()
        if op != "checkout":
            send(self, 400, {"error": "unknown op"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        tier = str(v.get("tier", "")).strip()
        device_id = v.get("device_id")
        if tier not in PAID_TIERS:
            send(self, 400, {"error": "tier must be ringside|booker|promoter"})
            return
        if not device_id or len(str(device_id)) < 8:
            send(self, 400, {"error": "device_id required"})
            return
        if not waffo_configured():
            send(self, 501, {"error": "waffo not configured (WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY missing)"})
            return
        pid = product_id(tier)
        if not pid:
            send(self, 501, {"error": "product not configured for tier " + tier})
            return
        success_url = v.get("success_url") or "https://zjutimes2015.github.io/hook/episodes.html?sub=ok"
        try:
            url = create_checkout_session(
                pid,
                {"device_hash": sha(str(device_id)), "tier": tier},
                success_url,
            )
        except Exception as e:
            send(self, 502, {"error": "waffo error: " + str(e)[:200]})
            return
        send(self, 200, {"ok": True, "url": url, "tier": tier})
