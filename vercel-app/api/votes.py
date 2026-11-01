import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import (CHOICES, check_rate, client_ip, q_all, q_one, q_write,
                     read_json, send, send_cors_preflight, sha)
from lib._entitlements import entitlements

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self, default):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or default).lower()

    def do_GET(self):
        op = self._op("tally")
        if op != "tally":
            send(self, 400, {"error": "unknown op"})
            return
        qs = parse_qs(urlparse(self.path).query)
        bout_id = qs.get("bout_id", [None])[0]
        round_no = int(qs.get("round_no", ["1"])[0] or 1)
        rows = q_all(
            "SELECT choice, SUM(weight) AS n FROM votes WHERE bout_id = %s AND round_no = %s GROUP BY choice",
            (bout_id, round_no),
        )
        tally = {"heavy": 0, "dodge": 0, "guard": 0}
        for r in rows:
            tally[r["choice"]] = r["n"]
        send(self, 200, {"bout_id": bout_id, "round_no": round_no, "tally": tally,
                         "total": sum(tally.values())})

    def do_POST(self):
        op = self._op("cast")
        if op != "cast":
            send(self, 400, {"error": "unknown op"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        choice = str(v.get("choice", "")).strip().lower()
        if choice not in CHOICES:
            send(self, 400, {"error": "choice must be heavy|dodge|guard"})
            return
        bout_id, round_no, device_id = v.get("bout_id"), v.get("round_no"), v.get("device_id")
        if not bout_id or not round_no or not device_id or len(str(device_id)) < 8:
            send(self, 400, {"error": "bout_id, round_no, device_id required"})
            return
        ip = client_ip(self)
        if not check_rate(ip):
            send(self, 429, {"error": "rate limited: slow down"})
            return
        bout = q_one("SELECT * FROM bouts WHERE id = %s", (bout_id,))
        if not bout:
            send(self, 404, {"error": "bout not found"})
            return
        if not bout["voting_open"]:
            send(self, 409, {"error": "voting is closed for this bout"})
            return
        ua = self.headers.get("User-Agent", "")
        now = time.time()
        dh = sha(str(device_id))
        weight = entitlements(dh)["vote_weight"]
        q_write(
            """INSERT INTO votes (bout_id, round_no, choice, device_hash, ip, ip_ua, weight, created_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (bout_id, round_no, device_hash)
               DO UPDATE SET choice = EXCLUDED.choice, weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at""",
            (bout_id, int(round_no), choice, dh, ip, sha(ip + "|" + ua), weight, now, now),
        )
        send(self, 200, {"ok": True, "bout_id": bout_id, "round_no": int(round_no),
                         "choice": choice, "weight": weight})
