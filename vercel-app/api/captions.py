import os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import (check_rate, client_ip, q_all, q_one, q_write, read_json,
                     send, send_cors_preflight, sha)

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# keyword pre-screen: obvious spam/scam/profanity -> auto-reject.
# Final say belongs to the human booker in /admin.html.
BLOCK_RE = re.compile(
    r"加微信|微信号|兼职|贷款|赌博|博彩|六合彩|时时彩|代购|客服|代理|日结|赚钱|"
    r"http|www\.|\.com|\.cn|fuck|shit|bitch|asshole|damn",
    re.I,
)

FEED_WINDOW_S = 30 * 60
FEED_LIMIT = 50


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self, default):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or default).lower()

    def do_GET(self):
        op = self._op("")
        if op == "feed":
            qs = parse_qs(urlparse(self.path).query)
            since_id = int(qs.get("since_id", ["0"])[0] or 0)
            rows = q_all(
                """SELECT id, text, nickname, created_at FROM fan_captions
                   WHERE status = 'approved' AND created_at > %s AND id > %s
                   ORDER BY id ASC LIMIT %s""",
                (time.time() - FEED_WINDOW_S, since_id, FEED_LIMIT),
            )
            send(self, 200, {"captions": [dict(r) for r in rows]})
        elif op == "pinned":
            row = q_one(
                """SELECT id, text, nickname, created_at FROM fan_captions
                   WHERE status = 'approved' AND pinned = 1
                   ORDER BY created_at DESC LIMIT 1"""
            )
            send(self, 200, {"pinned": dict(row) if row else None})
        else:
            send(self, 400, {"error": "unknown op"})

    def do_POST(self):
        op = self._op("post")
        if op != "post":
            send(self, 400, {"error": "unknown op"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        text = str(v.get("text", "")).strip()
        if not text or len(text) > 40:
            send(self, 400, {"error": "text required, max 40 chars"})
            return
        nickname = str(v.get("nickname", "")).strip()[:12] or "匿名拳迷"
        device_id = str(v.get("device_id", ""))
        if len(device_id) < 8:
            send(self, 400, {"error": "device_id required"})
            return
        ip = client_ip(self)
        if not check_rate(ip):
            send(self, 429, {"error": "rate limited: slow down"})
            return
        ua = self.headers.get("User-Agent", "")
        status = "rejected" if BLOCK_RE.search(text) else "pending"
        q_write(
            """INSERT INTO fan_captions
               (text, nickname, device_hash, ip, ip_ua, status, pinned, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,0,%s)""",
            (text, nickname, sha(device_id), ip, sha(ip + "|" + ua), status, time.time()),
        )
        send(self, 200, {"ok": True, "status": status,
                         "msg": "已提交，待精选！" if status == "pending" else "内容未通过初筛"})
