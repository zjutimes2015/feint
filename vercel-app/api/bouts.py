import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import send, send_cors_preflight, q_all

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "").lower()

    def do_GET(self):
        op = self._op()
        if op in ("", "bouts"):
            rows = q_all("SELECT * FROM bouts ORDER BY created_at")
            send(self, 200, [
                {"id": r["id"], "title": r["title"], "fighter_a": r["fighter_a"],
                 "fighter_b": r["fighter_b"], "round_no": r["round_no"],
                 "voting_open": bool(r["voting_open"]),
                 "tactic_note": r.get("tactic_note") or ""}
                for r in rows
            ])
        elif op == "health":
            send(self, 200, {"ok": True})
        else:
            send(self, 400, {"error": "unknown op"})
