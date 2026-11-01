"""Booker admin API: bouts / betting / captions / gates / live / subscriptions / votes / script."""
import json as _json
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib._betting import pool_totals, settle_market
from lib._db import (q_all, q_one, q_write, read_json, require_admin, send,
                     send_cors_preflight)
from lib._entitlements import TIERS
from lib._openrouter import configured as openrouter_configured, generate_text

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

MARKET_TYPES = {"winner", "method", "round"}
# p2-unlocked is code-blocked until p1-kill is done: the kill line lives in the
# database, not in someone's memory.
GUARD = {"p2-unlocked": "p1-kill"}
STATES = {"scheduled", "VOTING", "LOCKED", "REVEAL", "done"}
ACTIONS = {"approve", "reject", "pin", "unpin", "delete"}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _op(self):
        return (parse_qs(urlparse(self.path).query).get("op", [""])[0] or "").lower()

    def do_GET(self):
        op = self._op()
        if op == "betting":
            self._betting_get()
        elif op == "captions":
            self._captions_get()
        elif op == "gates":
            self._gates_get()
        elif op == "subscriptions":
            self._subscriptions_get()
        elif op == "votes":
            self._votes_get()
        else:
            send(self, 400, {"error": "unknown op"}, cors=False)

    def do_POST(self):
        op = self._op()
        if op == "bouts":
            self._bouts_post()
        elif op == "betting":
            self._betting_post()
        elif op == "live":
            self._live_post()
        elif op == "script":
            self._script_post()
        else:
            send(self, 400, {"error": "unknown op"}, cors=False)

    def do_PATCH(self):
        op = self._op()
        if op == "bouts":
            self._bouts_patch()
        elif op == "betting":
            self._betting_patch()
        elif op == "captions":
            self._captions_patch()
        elif op == "gates":
            self._gates_patch()
        elif op == "live":
            self._live_patch()
        elif op == "subscriptions":
            self._subscriptions_patch()
        else:
            send(self, 400, {"error": "unknown op"}, cors=False)

    # ---------- bouts ----------
    def _bouts_post(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        try:
            b = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"}, cors=False)
            return
        if not all(b.get(k) for k in ("id", "title", "fighter_a", "fighter_b")):
            send(self, 400, {"error": "id,title,fighter_a,fighter_b required"}, cors=False)
            return
        q_write(
            """INSERT INTO bouts (id,title,fighter_a,fighter_b,round_no,voting_open,created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET
                 title=EXCLUDED.title, fighter_a=EXCLUDED.fighter_a,
                 fighter_b=EXCLUDED.fighter_b, round_no=EXCLUDED.round_no,
                 voting_open=EXCLUDED.voting_open""",
            (b["id"], b["title"], b["fighter_a"], b["fighter_b"],
             int(b.get("round_no", 1)), 1 if b.get("voting_open") else 0, time.time()),
        )
        send(self, 200, {"ok": True, "id": b["id"]}, cors=False)

    def _bouts_patch(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        bout_id = qs.get("id", [None])[0]
        if not bout_id:
            send(self, 400, {"error": "missing ?id="}, cors=False)
            return
        try:
            p = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"}, cors=False)
            return
        sets, vals = [], []
        if "title" in p:
            sets.append("title = %s"); vals.append(p["title"])
        if "round_no" in p:
            sets.append("round_no = %s"); vals.append(int(p["round_no"]))
        if "voting_open" in p:
            sets.append("voting_open = %s"); vals.append(1 if p["voting_open"] else 0)
        if "tactic_note" in p:
            sets.append("tactic_note = %s"); vals.append(str(p["tactic_note"])[:300])
        if not sets:
            send(self, 400, {"error": "nothing to update"}, cors=False)
            return
        vals.append(bout_id)
        rc = q_write(f"UPDATE bouts SET {','.join(sets)} WHERE id = %s", vals)
        if not rc:
            send(self, 404, {"error": "bout not found"}, cors=False)
            return
        send(self, 200, {"ok": True, "id": bout_id}, cors=False)

    # ---------- betting ----------
    def _betting_get(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"})
            return
        ms = q_all("SELECT * FROM bet_markets ORDER BY created_at DESC")
        out = []
        for m in ms:
            pools = pool_totals(m["id"])
            out.append({"id": m["id"], "bout_id": m["bout_id"], "market_type": m["market_type"],
                        "question": m["question"], "selections": _json.loads(m["selections"]),
                        "status": m["status"], "pools": pools, "total_pool": sum(pools.values()),
                        "winning_selection": m["winning_selection"]})
        send(self, 200, {"markets": out})

    def _betting_post(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        mid = str(v.get("id", "")).strip()
        bout_id = str(v.get("bout_id", "")).strip()
        mtype = str(v.get("market_type", "")).strip()
        question = str(v.get("question", "")).strip()
        sels = v.get("selections")
        if not mid or not bout_id or mtype not in MARKET_TYPES or not question:
            send(self, 400, {"error": "id, bout_id, market_type(winner|method|round), question required"})
            return
        if not isinstance(sels, list) or len(sels) < 2:
            send(self, 400, {"error": "selections must be a list of 2+"})
            return
        if q_one("SELECT id FROM bet_markets WHERE id = %s", (mid,)):
            send(self, 409, {"error": "market id exists"})
            return
        house = v.get("house_pool") or {}
        if not isinstance(house, dict):
            send(self, 400, {"error": "house_pool must be an object {selection: amount}"})
            return
        for s, amt in house.items():
            if s not in sels:
                send(self, 400, {"error": "house_pool selection not in selections: " + s})
                return
            try:
                house[s] = int(amt)
            except Exception:
                send(self, 400, {"error": "house_pool amounts must be integers"})
                return
        now = time.time()
        q_write(
            "INSERT INTO bet_markets (id, bout_id, market_type, question, selections, house_pool, status, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,'open',%s)",
            (mid, bout_id, mtype, question, _json.dumps(sels), _json.dumps(house), now),
        )
        send(self, 200, {"ok": True, "id": mid})

    def _betting_patch(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"})
            return
        qs = self.path.split("?", 1)
        params = dict(p.split("=", 1) for p in qs[1].split("&") if "=" in p) if len(qs) > 1 else {}
        mid = params.get("id", "")
        try:
            v = read_json(self)
        except Exception:
            v = {}
        action = str(v.get("action", "")).strip()
        m = q_one("SELECT * FROM bet_markets WHERE id = %s", (mid,))
        if not m:
            send(self, 404, {"error": "market not found"})
            return
        if action == "lock":
            if m["status"] != "open":
                send(self, 409, {"error": "market is %s" % m["status"]})
                return
            q_write("UPDATE bet_markets SET status='locked' WHERE id=%s", (mid,))
            send(self, 200, {"ok": True, "id": mid, "status": "locked"})
        elif action == "settle":
            if m["status"] == "settled":
                send(self, 409, {"error": "already settled"})
                return
            winner = str(v.get("winning_selection", "")).strip()
            res = settle_market(mid, winner)
            if not res:
                send(self, 400, {"error": "invalid winning_selection"})
                return
            send(self, 200, {"ok": True, "id": mid, **res})
        else:
            send(self, 400, {"error": "action must be lock|settle"})

    # ---------- captions ----------
    def _captions_get(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        status = qs.get("status", ["pending"])[0]
        if status not in ("pending", "approved", "rejected"):
            status = "pending"
        rows = q_all(
            """SELECT id, text, nickname, device_hash, ip, status, pinned, created_at
               FROM fan_captions WHERE status = %s ORDER BY created_at DESC LIMIT 100""",
            (status,),
        )
        send(self, 200, [dict(r) for r in rows], cors=False)

    def _captions_patch(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        cid = qs.get("id", [None])[0]
        if not cid:
            send(self, 400, {"error": "missing ?id="}, cors=False)
            return
        try:
            p = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"}, cors=False)
            return
        action = p.get("action")
        if action not in ACTIONS:
            send(self, 400, {"error": "action must be approve|reject|pin|unpin|delete"},
                 cors=False)
            return
        if action == "delete":
            q_write("DELETE FROM fan_captions WHERE id = %s", (cid,))
        elif action == "pin":
            q_write("UPDATE fan_captions SET pinned = 0 WHERE pinned = 1")
            q_write("UPDATE fan_captions SET status='approved', pinned=1 WHERE id = %s", (cid,))
        elif action == "unpin":
            q_write("UPDATE fan_captions SET pinned = 0 WHERE id = %s", (cid,))
        elif action == "approve":
            q_write("UPDATE fan_captions SET status='approved' WHERE id = %s", (cid,))
        else:  # reject
            q_write("UPDATE fan_captions SET status='rejected', pinned=0 WHERE id = %s", (cid,))
        send(self, 200, {"ok": True, "id": cid, "action": action}, cors=False)

    # ---------- gates ----------
    def _gates_get(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"}, cors=False)
            return
        rows = q_all("SELECT id, label, status, note FROM ops_gates ORDER BY id")
        send(self, 200, {"gates": [dict(r) for r in rows]}, cors=False)

    def _gates_patch(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        gid = qs.get("id", [None])[0]
        if not gid:
            send(self, 400, {"error": "missing ?id="}, cors=False)
            return
        try:
            p = read_json(self)
        except Exception:
            p = {}
        status = str(p.get("status", "")).strip()
        note = str(p.get("note", ""))[:500]
        if status not in ("pending", "done", "killed"):
            send(self, 400, {"error": "status must be pending|done|killed"}, cors=False)
            return
        if status == "done" and gid in GUARD:
            dep = q_one("SELECT status FROM ops_gates WHERE id = %s", (GUARD[gid],))
            if not dep or dep["status"] != "done":
                send(self, 409, {"error": "blocked: %s must be done first" % GUARD[gid]}, cors=False)
                return
        rc = q_write("UPDATE ops_gates SET status=%s, note=%s, updated_at=%s WHERE id=%s",
                     (status, note, time.time(), gid))
        if not rc:
            send(self, 404, {"error": "gate not found"}, cors=False)
            return
        send(self, 200, {"ok": True, "id": gid, "status": status}, cors=False)

    # ---------- live ----------
    def _live_post(self):
        # 建回合：{bout_id, round_no, tactic_a, tactic_b, vote_minutes}
        if not require_admin(self):
            send(self, 403, {"error": "admin only"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        bout_id, round_no = v.get("bout_id"), v.get("round_no")
        ta, tb = str(v.get("tactic_a", "")).strip().lower(), str(v.get("tactic_b", "")).strip().lower()
        if not bout_id or not round_no or not ta or not tb or ta == tb:
            send(self, 400, {"error": "bout_id, round_no, two different tactics required"})
            return
        if not q_one("SELECT id FROM bouts WHERE id=%s", (bout_id,)):
            send(self, 404, {"error": "bout not found"})
            return
        rid = "%s-r%s-%d" % (bout_id, round_no, int(time.time()))
        now = time.time()
        q_write("INSERT INTO live_rounds (id,bout_id,round_no,tactic_a,tactic_b,state,created_at)"
                " VALUES (%s,%s,%s,%s,%s,'scheduled',%s)",
                (rid, bout_id, int(round_no), ta, tb, now))
        send(self, 200, {"ok": True, "round_id": rid})

    def _live_patch(self):
        # {round_id, branch_a_url?, branch_b_url?, state?, vote_minutes?}
        if not require_admin(self):
            send(self, 403, {"error": "admin only"})
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"})
            return
        rid = v.get("round_id")
        r = q_one("SELECT * FROM live_rounds WHERE id=%s", (rid,)) if rid else None
        if not r:
            send(self, 404, {"error": "round not found"})
            return
        sets, params = [], []
        for col in ("branch_a_url", "branch_b_url"):
            if v.get(col) is not None:
                sets.append(col + "=%s")
                params.append(str(v[col])[:500])
        if v.get("state") in STATES:
            sets.append("state=%s")
            params.append(v["state"])
            if v["state"] == "VOTING":
                minutes = float(v.get("vote_minutes", 10))
                sets.append("vote_deadline=%s")
                params.append(time.time() + minutes * 60)
        if not sets:
            send(self, 400, {"error": "nothing to update"})
            return
        params.append(rid)
        q_write("UPDATE live_rounds SET " + ",".join(sets) + " WHERE id=%s", tuple(params))
        send(self, 200, {"ok": True, "round_id": rid})

    # ---------- subscriptions ----------
    def _subscriptions_get(self):
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"}, cors=False)
            return
        rows = q_all(
            "SELECT device_hash, tier, status, current_period_end FROM subscriptions"
            " ORDER BY updated_at DESC LIMIT 100"
        )
        out = [{"player": r["device_hash"][:8], "tier": r["tier"], "status": r["status"],
                "period_end": time.strftime("%Y-%m-%d", time.gmtime(r["current_period_end"]))
                if r["current_period_end"] else "-"} for r in rows]
        send(self, 200, {"subscriptions": out, "tiers": list(TIERS)}, cors=False)

    def _subscriptions_patch(self):
        # manual grant / revoke (comps, testing): /api/admin?op=subscriptions&device_hash=<sha>
        if not require_admin(self):
            send(self, 403, {"error": "forbidden"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        dh = qs.get("device_hash", [None])[0]
        if not dh:
            send(self, 400, {"error": "missing ?device_hash="}, cors=False)
            return
        try:
            p = read_json(self)
        except Exception:
            p = {}
        tier = str(p.get("tier", "free")).strip()
        if tier not in TIERS:
            send(self, 400, {"error": "tier must be free|ringside|booker|promoter"}, cors=False)
            return
        now = time.time()
        q_write(
            """INSERT INTO subscriptions (device_hash, tier, status, created_at, updated_at)
               VALUES (%s,%s,'active',%s,%s)
               ON CONFLICT (device_hash) DO UPDATE SET tier = EXCLUDED.tier,
                 status = 'active', updated_at = EXCLUDED.updated_at""",
            (dh, tier, now, now),
        )
        send(self, 200, {"ok": True, "device_hash": dh[:8], "tier": tier}, cors=False)

    # ---------- votes ----------
    def _votes_get(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        qs = parse_qs(urlparse(self.path).query)
        bout_id = qs.get("bout_id", [None])[0]
        if bout_id:
            rows = q_all("SELECT * FROM votes WHERE bout_id = %s ORDER BY updated_at DESC LIMIT 500",
                         (bout_id,))
        else:
            rows = q_all("SELECT * FROM votes ORDER BY updated_at DESC LIMIT 500")
        send(self, 200, [dict(r) for r in rows], cors=False)

    # ---------- script (OpenRouter) ----------
    def _script_post(self):
        if not require_admin(self):
            send(self, 403, {"error": "bad admin token"}, cors=False)
            return
        try:
            v = read_json(self)
        except Exception:
            send(self, 400, {"error": "bad json"}, cors=False)
            return
        prompt = str(v.get("prompt", "")).strip()
        if not prompt or len(prompt) > 4000:
            send(self, 400, {"error": "prompt required, max 4000 chars"}, cors=False)
            return
        if not openrouter_configured():
            send(self, 501, {"error": "openrouter not configured"}, cors=False)
            return
        model = str(v.get("model", "")).strip()
        try:
            text, used = generate_text(prompt, model or None)
        except Exception as e:
            send(self, 502, {"error": str(e)[:200]}, cors=False)
            return
        send(self, 200, {"ok": True, "text": text, "model": used}, cors=False)
