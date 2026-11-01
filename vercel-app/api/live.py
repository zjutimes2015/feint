"""Friday Fight Night 直播状态 / 回合投票 / 回合结算。"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._db import (check_rate, client_ip, q_all, q_one, q_write, read_json,
                     require_admin, send, send_cors_preflight, sha)
from lib._entitlements import entitlements

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def public_state(r):
    now = time.time()
    d = {"id": r["id"], "bout_id": r["bout_id"], "round_no": r["round_no"],
         "tactic_a": r["tactic_a"], "tactic_b": r["tactic_b"],
         "state": r["state"],
         "seconds_left": max(0, int(r["vote_deadline"] - now)) if r["state"] == "VOTING" else 0,
         "winning_branch": r["winning_branch"] if r["state"] in ("REVEAL", "done") else "",
         "video_url": ""}
    if r["state"] in ("REVEAL", "done") and r["winning_branch"] in ("a", "b"):
        d["video_url"] = r["branch_a_url"] if r["winning_branch"] == "a" else r["branch_b_url"]
    if r["state"] in ("VOTING", "LOCKED", "REVEAL", "done"):
        rows = q_all("SELECT choice, SUM(weight) AS w FROM votes WHERE bout_id=%s AND round_no=%s"
                     " GROUP BY choice", (r["bout_id"], r["round_no"]))
        d["tally"] = {row["choice"]: int(row["w"] or 0) for row in rows}
    return d


def get_state(round_id=None):
    if round_id:
        r = q_one("SELECT * FROM live_rounds WHERE id=%s", (round_id,))
    else:
        r = q_one("SELECT * FROM live_rounds ORDER BY created_at DESC LIMIT 1")
    if not r:
        return 404, {"error": "no live round yet"}
    b = q_one("SELECT fighter_a, fighter_b, title FROM bouts WHERE id=%s", (r["bout_id"],))
    d = public_state(r)
    if b:
        d.update({"fighter_a": b["fighter_a"], "fighter_b": b["fighter_b"],
                  "title": b["title"]})
    return 200, d


def cast_live_vote(rid, choice, device_id, ip, ua):
    if not rid or not device_id or len(str(device_id)) < 8:
        return 400, {"error": "round_id, device_id required"}
    r = q_one("SELECT * FROM live_rounds WHERE id=%s", (rid,))
    if not r:
        return 404, {"error": "round not found"}
    if r["state"] != "VOTING" or time.time() > r["vote_deadline"]:
        return 409, {"error": "voting is not open for this round"}
    if choice not in (r["tactic_a"], r["tactic_b"]):
        return 400, {"error": "choice must be one of the two tactics"}
    if not check_rate(ip):
        return 429, {"error": "rate limited: slow down"}
    dh = sha(str(device_id))
    weight = entitlements(dh)["vote_weight"]
    now = time.time()
    q_write(
        """INSERT INTO votes (bout_id, round_no, choice, device_hash, ip, ip_ua, weight, created_at, updated_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (bout_id, round_no, device_hash)
           DO UPDATE SET choice = EXCLUDED.choice, weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at""",
        (r["bout_id"], r["round_no"], choice, dh, ip, sha(ip + "|" + ua), weight, now, now),
    )
    return 200, {"ok": True, "round_id": rid, "choice": choice, "weight": weight}


def settle_round(rid):
    r = q_one("SELECT * FROM live_rounds WHERE id=%s", (rid,)) if rid else None
    if not r:
        return 404, {"error": "round not found"}
    if r["state"] not in ("VOTING", "LOCKED"):
        return 409, {"error": "round is not awaiting tally (state=%s)" % r["state"]}
    rows = q_all("SELECT choice, SUM(weight) AS w FROM votes WHERE bout_id=%s AND round_no=%s"
                 " AND choice IN (%s,%s) GROUP BY choice",
                 (r["bout_id"], r["round_no"], r["tactic_a"], r["tactic_b"]))
    tally = {row["choice"]: int(row["w"] or 0) for row in rows}
    wa = tally.get(r["tactic_a"], 0)
    wb = tally.get(r["tactic_b"], 0)
    # 平票 → tactic_a（确定性；admin 可在 REVEAL 前手动覆盖）
    winner = "a" if wa >= wb else "b"
    now = time.time()
    q_write("UPDATE live_rounds SET winning_branch=%s, state='REVEAL' WHERE id=%s",
            (winner, rid))
    url = r["branch_a_url"] if winner == "a" else r["branch_b_url"]
    return 200, {"ok": True, "round_id": rid, "tally": tally,
                 "winning_branch": winner,
                 "winning_tactic": r["tactic_a"] if winner == "a" else r["tactic_b"],
                 "video_url": url, "settled_at": now}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "").lower()

    def do_GET(self):
        op = self._op()
        if op == "state":
            qs = parse_qs(urlparse(self.path).query)
            rid = qs.get("round_id", [None])[0]
            status, d = get_state(rid)
            send(self, status, d)
        else:
            send(self, 400, {"error": "unknown op"})

    def do_POST(self):
        op = self._op()
        if op == "vote":
            try:
                v = read_json(self)
            except Exception:
                send(self, 400, {"error": "bad json"})
                return
            choice = str(v.get("choice", "")).strip().lower()
            status, d = cast_live_vote(v.get("round_id"), choice, v.get("device_id"),
                                       client_ip(self), self.headers.get("User-Agent", ""))
            send(self, status, d)
        elif op == "tally":
            if not require_admin(self):
                send(self, 403, {"error": "admin only"})
                return
            try:
                v = read_json(self)
            except Exception:
                send(self, 400, {"error": "bad json"})
                return
            status, d = settle_round(v.get("round_id"))
            send(self, status, d)
        else:
            send(self, 400, {"error": "unknown op"})
