import json as _json
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._betting import DAILY_CLAIM, DAY_S, MAX_BET, get_wallet, pool_totals
from lib._db import (check_rate, client_ip, q_all, q_one, q_write, read_json,
                     send, send_cors_preflight, sha)
from lib._entitlements import entitlements

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "").lower()

    def do_GET(self):
        op = self._op()
        if op == "markets":
            markets = q_all(
                "SELECT * FROM bet_markets WHERE status IN ('open','locked') ORDER BY created_at DESC"
            )
            out = []
            for m in markets:
                sels = _json.loads(m["selections"])
                pools = pool_totals(m["id"])
                total = sum(pools.values())
                odds = {s: (round(total / pools[s], 2) if pools.get(s) else None) for s in sels}
                try:
                    house = _json.loads(m.get("house_pool") or "{}")
                except Exception:
                    house = {}
                out.append({
                    "id": m["id"], "bout_id": m["bout_id"], "market_type": m["market_type"],
                    "question": m["question"], "selections": sels, "status": m["status"],
                    "pools": pools, "total_pool": total, "implied_odds": odds,
                    "house_seed": house,
                })
            send(self, 200, {"markets": out})
        elif op == "leaderboard":
            rows = q_all(
                "SELECT device_hash, balance FROM bet_wallets ORDER BY balance DESC LIMIT 20"
            )
            board = [{"rank": i + 1, "player": r["device_hash"][:8], "balance": r["balance"]}
                     for i, r in enumerate(rows)]
            send(self, 200, {"leaderboard": board})
        elif op == "records":
            rows = q_all("SELECT fighter, wins, losses, kos FROM fighter_records ORDER BY wins DESC, kos DESC")
            send(self, 200, {"records": [
                {"fighter": r["fighter"], "wins": r["wins"], "losses": r["losses"], "kos": r["kos"]}
                for r in rows]})
        else:
            send(self, 400, {"error": "unknown op"})

    def do_POST(self):
        op = self._op()
        if op == "bet":
            self._bet()
        elif op == "claim":
            self._claim()
        else:
            send(self, 400, {"error": "unknown op"})

    def _bet(self):
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        market_id = str(v.get("market_id", "")).strip()
        selection = str(v.get("selection", "")).strip()
        device_id = v.get("device_id")
        try:
            amount = int(v.get("amount", 0))
        except Exception:
            amount = 0
        if not market_id or not selection or not device_id or len(str(device_id)) < 8:
            send(self, 400, {"error": "market_id, selection, device_id required"})
            return
        dh = sha(str(device_id))
        cap = MAX_BET * entitlements(dh)["bet_max_mult"]
        if amount <= 0 or amount > cap:
            send(self, 400, {"error": "amount must be 1..%d" % cap})
            return
        ip = client_ip(self)
        if not check_rate(ip):
            send(self, 429, {"error": "rate limited: slow down"})
            return
        m = q_one("SELECT * FROM bet_markets WHERE id = %s", (market_id,))
        if not m:
            send(self, 404, {"error": "market not found"})
            return
        if m["status"] != "open":
            send(self, 409, {"error": "market is %s" % m["status"]})
            return
        if selection not in _json.loads(m["selections"]):
            send(self, 400, {"error": "invalid selection"})
            return
        dh = sha(str(device_id))
        w = get_wallet(dh)
        if w["balance"] < amount:
            send(self, 409, {"error": "insufficient balance", "balance": w["balance"]})
            return
        ua = self.headers.get("User-Agent", "")
        now = time.time()
        q_write("UPDATE bet_wallets SET balance = balance - %s WHERE device_hash = %s", (amount, dh))
        q_write(
            "INSERT INTO bets (market_id, device_hash, selection, amount, ip_ua, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s)",
            (market_id, dh, selection, amount, sha(ip + "|" + ua), now),
        )
        q_write(
            "INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES (%s,%s,%s,%s,%s)",
            (dh, -amount, "bet_placed", market_id, now),
        )
        send(self, 200, {"ok": True, "market_id": market_id, "selection": selection,
                         "amount": amount, "balance": w["balance"] - amount})

    def _claim(self):
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        device_id = v.get("device_id")
        if not device_id or len(str(device_id)) < 8:
            send(self, 400, {"error": "device_id required"})
            return
        ip = client_ip(self)
        if not check_rate(ip):
            send(self, 429, {"error": "rate limited: slow down"})
            return
        dh = sha(str(device_id))
        w = get_wallet(dh)
        now = time.time()
        claim = DAILY_CLAIM * entitlements(dh)["daily_mult"]
        if now - w["last_claim"] < DAY_S:
            send(self, 409, {"error": "already claimed",
                             "next_claim_in_s": int(DAY_S - (now - w["last_claim"])),
                             "balance": w["balance"]})
            return
        q_write("UPDATE bet_wallets SET balance = balance + %s, last_claim = %s WHERE device_hash = %s",
                (claim, now, dh))
        q_write(
            "INSERT INTO bet_ledger (device_hash, delta, reason, ref, created_at) VALUES (%s,%s,%s,%s,%s)",
            (dh, claim, "daily_claim", "", now),
        )
        send(self, 200, {"ok": True, "claimed": claim, "balance": w["balance"] + claim})
