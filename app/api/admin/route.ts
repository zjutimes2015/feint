/** Booker 后台 API：bouts / betting / captions / gates / live / subscriptions / votes / script。 */
import { poolTotals, settleMarket } from "@/lib/betting";
import { qAll, qOne, qWrite } from "@/lib/db";
import { TIERS } from "@/lib/entitlements";
import { generateText, openrouterConfigured } from "@/lib/openrouter";
import { json, preflight, readJson, requireAdmin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKET_TYPES = new Set(["winner", "method", "round"]);
// p2-unlocked 代码级阻断，直到 p1-kill 完成：杀线在数据库里，不在某人记忆里。
const GUARD: Record<string, string> = { "p2-unlocked": "p1-kill" };
const STATES = new Set(["scheduled", "VOTING", "LOCKED", "REVEAL", "done"]);
const ACTIONS = new Set(["approve", "reject", "pin", "unpin", "delete"]);

function opOf(req: Request): string {
  return (new URL(req.url).searchParams.get("op") || "").toLowerCase();
}

function qn(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

// ---------------- GET ----------------
export async function GET(req: Request) {
  const op = opOf(req);

  if (op === "betting") {
    if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
    const rows = await qAll<Record<string, any>>("SELECT * FROM bet_markets ORDER BY created_at DESC");
    const out = [];
    for (const m of rows) {
      const pools = await poolTotals(m.id);
      out.push({
        id: m.id,
        bout_id: m.bout_id,
        market_type: m.market_type,
        question: m.question,
        selections: JSON.parse(m.selections),
        status: m.status,
        pools,
        total_pool: Object.values(pools).reduce((a, b) => a + b, 0),
        winning_selection: m.winning_selection,
      });
    }
    return json({ markets: out }, 200, req);
  }

  if (op === "captions") {
    if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
    let status = qn(req, "status") || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) status = "pending";
    const rows = await qAll<Record<string, any>>(
      `SELECT id, text, nickname, device_hash, ip, status, pinned, created_at
       FROM fan_captions WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
      [status],
    );
    return json(
      rows.map((r) => ({ ...r, id: Number(r.id) })),
      200,
    );
  }

  if (op === "gates") {
    if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
    const rows = await qAll("SELECT id, label, status, note FROM ops_gates ORDER BY id");
    return json({ gates: rows }, 200);
  }

  if (op === "subscriptions") {
    if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
    const rows = await qAll<Record<string, any>>(
      `SELECT device_hash, tier, status, current_period_end FROM subscriptions
       ORDER BY updated_at DESC LIMIT 100`,
    );
    const out = rows.map((r) => ({
      player: String(r.device_hash).slice(0, 8),
      tier: r.tier,
      status: r.status,
      period_end: r.current_period_end
        ? new Date(Number(r.current_period_end) * 1000).toISOString().slice(0, 10)
        : "-",
    }));
    return json({ subscriptions: out, tiers: Object.keys(TIERS) }, 200);
  }

  if (op === "votes") {
    if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
    const boutId = qn(req, "bout_id");
    const rows = boutId
      ? await qAll<Record<string, any>>(
          "SELECT * FROM votes WHERE bout_id = $1 ORDER BY updated_at DESC LIMIT 500",
          [boutId],
        )
      : await qAll<Record<string, any>>("SELECT * FROM votes ORDER BY updated_at DESC LIMIT 500");
    return json(
      rows.map((r) => ({ ...r, id: Number(r.id) })),
      200,
    );
  }

  return json({ error: "unknown op" }, 400);
}

// ---------------- POST ----------------
export async function POST(req: Request) {
  const op = opOf(req);
  if (op === "bouts") return boutsPost(req);
  if (op === "betting") return bettingPost(req);
  if (op === "live") return livePost(req);
  if (op === "script") return scriptPost(req);
  return json({ error: "unknown op" }, 400);
}

// ---------------- PATCH ----------------
export async function PATCH(req: Request) {
  const op = opOf(req);
  if (op === "bouts") return boutsPatch(req);
  if (op === "betting") return bettingPatch(req);
  if (op === "captions") return captionsPatch(req);
  if (op === "gates") return gatesPatch(req);
  if (op === "live") return livePatch(req);
  if (op === "subscriptions") return subscriptionsPatch(req);
  return json({ error: "unknown op" }, 400);
}

// ---------- bouts ----------
async function boutsPost(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
  let b: Record<string, any>;
  try {
    b = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (!b.id || !b.title || !b.fighter_a || !b.fighter_b) {
    return json({ error: "id,title,fighter_a,fighter_b required" }, 400);
  }

  await qWrite(
    `INSERT INTO bouts (id,title,fighter_a,fighter_b,round_no,voting_open,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title, fighter_a=EXCLUDED.fighter_a,
       fighter_b=EXCLUDED.fighter_b, round_no=EXCLUDED.round_no,
       voting_open=EXCLUDED.voting_open`,
    [
      b.id,
      b.title,
      b.fighter_a,
      b.fighter_b,
      Number(b.round_no ?? 1),
      b.voting_open ? 1 : 0,
      Date.now() / 1000,
    ],
  );
  return json({ ok: true, id: b.id }, 200);
}

async function boutsPatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
  const boutId = qn(req, "id");
  if (!boutId) return json({ error: "missing ?id=" }, 400);

  let p: Record<string, any>;
  try {
    p = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if ("title" in p) {
    sets.push(`title = $${vals.length + 1}`);
    vals.push(p.title);
  }
  if ("round_no" in p) {
    sets.push(`round_no = $${vals.length + 1}`);
    vals.push(Number(p.round_no));
  }
  if ("voting_open" in p) {
    sets.push(`voting_open = $${vals.length + 1}`);
    vals.push(p.voting_open ? 1 : 0);
  }
  if ("tactic_note" in p) {
    sets.push(`tactic_note = $${vals.length + 1}`);
    vals.push(String(p.tactic_note).slice(0, 300));
  }
  if (!sets.length) return json({ error: "nothing to update" }, 400);

  vals.push(boutId);
  const rc = await qWrite(`UPDATE bouts SET ${sets.join(",")} WHERE id = $${vals.length}`, vals);
  if (!rc) return json({ error: "bout not found" }, 404);
  return json({ ok: true, id: boutId }, 200);
}

// ---------- betting ----------
async function bettingPost(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const mid = String(v.id || "").trim();
  const boutId = String(v.bout_id || "").trim();
  const mtype = String(v.market_type || "").trim();
  const question = String(v.question || "").trim();
  const sels = v.selections;

  if (!mid || !boutId || !MARKET_TYPES.has(mtype) || !question) {
    return json({ error: "id, bout_id, market_type(winner|method|round), question required" }, 400);
  }
  if (!Array.isArray(sels) || sels.length < 2) {
    return json({ error: "selections must be a list of 2+" }, 400);
  }
  if (await qOne("SELECT id FROM bet_markets WHERE id = $1", [mid])) {
    return json({ error: "market id exists" }, 409);
  }

  const house = v.house_pool || {};
  if (typeof house !== "object" || Array.isArray(house)) {
    return json({ error: "house_pool must be an object {selection: amount}" }, 400);
  }
  for (const s of Object.keys(house)) {
    if (!sels.includes(s)) {
      return json({ error: "house_pool selection not in selections: " + s }, 400);
    }
    const n = Number(house[s]);
    if (!Number.isInteger(n)) {
      return json({ error: "house_pool amounts must be integers" }, 400);
    }
    house[s] = n;
  }

  await qWrite(
    `INSERT INTO bet_markets (id, bout_id, market_type, question, selections, house_pool, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7)`,
    [mid, boutId, mtype, question, JSON.stringify(sels), JSON.stringify(house), Date.now() / 1000],
  );
  return json({ ok: true, id: mid }, 200);
}

async function bettingPatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
  const mid = qn(req, "id") || "";

  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    v = {};
  }
  const action = String(v.action || "").trim();

  const m = await qOne<Record<string, any>>("SELECT * FROM bet_markets WHERE id = $1", [mid]);
  if (!m) return json({ error: "market not found" }, 404);

  if (action === "lock") {
    if (m.status !== "open") return json({ error: `market is ${m.status}` }, 409);
    await qWrite("UPDATE bet_markets SET status='locked' WHERE id=$1", [mid]);
    return json({ ok: true, id: mid, status: "locked" }, 200);
  }

  if (action === "settle") {
    if (m.status === "settled") return json({ error: "already settled" }, 409);
    const winner = String(v.winning_selection || "").trim();
    const res = await settleMarket(mid, winner);
    if (!res) return json({ error: "invalid winning_selection" }, 400);
    return json({ ok: true, id: mid, ...res }, 200);
  }

  return json({ error: "action must be lock|settle" }, 400);
}

// ---------- captions ----------
async function captionsPatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
  const cid = qn(req, "id");
  if (!cid) return json({ error: "missing ?id=" }, 400);

  let p: Record<string, any>;
  try {
    p = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const action = p.action;
  if (!ACTIONS.has(action)) {
    return json({ error: "action must be approve|reject|pin|unpin|delete" }, 400);
  }

  if (action === "delete") {
    await qWrite("DELETE FROM fan_captions WHERE id = $1", [cid]);
  } else if (action === "pin") {
    await qWrite("UPDATE fan_captions SET pinned = 0 WHERE pinned = 1");
    await qWrite("UPDATE fan_captions SET status='approved', pinned=1 WHERE id = $1", [cid]);
  } else if (action === "unpin") {
    await qWrite("UPDATE fan_captions SET pinned = 0 WHERE id = $1", [cid]);
  } else if (action === "approve") {
    await qWrite("UPDATE fan_captions SET status='approved' WHERE id = $1", [cid]);
  } else {
    await qWrite("UPDATE fan_captions SET status='rejected', pinned=0 WHERE id = $1", [cid]);
  }

  return json({ ok: true, id: cid, action }, 200);
}

// ---------- gates ----------
async function gatesPatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
  const gid = qn(req, "id");
  if (!gid) return json({ error: "missing ?id=" }, 400);

  let p: Record<string, any>;
  try {
    p = await readJson(req);
  } catch {
    p = {};
  }
  const status = String(p.status || "").trim();
  const note = String(p.note || "").slice(0, 500);
  if (!["pending", "done", "killed"].includes(status)) {
    return json({ error: "status must be pending|done|killed" }, 400);
  }

  if (status === "done" && gid in GUARD) {
    const dep = await qOne<{ status: string }>("SELECT status FROM ops_gates WHERE id = $1", [
      GUARD[gid],
    ]);
    if (!dep || dep.status !== "done") {
      return json({ error: `blocked: ${GUARD[gid]} must be done first` }, 409);
    }
  }

  const rc = await qWrite("UPDATE ops_gates SET status=$1, note=$2, updated_at=$3 WHERE id=$4", [
    status,
    note,
    Date.now() / 1000,
    gid,
  ]);
  if (!rc) return json({ error: "gate not found" }, 404);
  return json({ ok: true, id: gid, status }, 200);
}

// ---------- live ----------
async function livePost(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "admin only" }, 403);
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const boutId = v.bout_id;
  const roundNo = v.round_no;
  const ta = String(v.tactic_a || "").trim().toLowerCase();
  const tb = String(v.tactic_b || "").trim().toLowerCase();
  if (!boutId || !roundNo || !ta || !tb || ta === tb) {
    return json({ error: "bout_id, round_no, two different tactics required" }, 400);
  }
  if (!(await qOne("SELECT id FROM bouts WHERE id=$1", [boutId]))) {
    return json({ error: "bout not found" }, 404);
  }

  const now = Date.now() / 1000;
  const rid = `${boutId}-r${roundNo}-${Math.trunc(now)}`;
  await qWrite(
    `INSERT INTO live_rounds (id,bout_id,round_no,tactic_a,tactic_b,state,created_at)
     VALUES ($1,$2,$3,$4,$5,'scheduled',$6)`,
    [rid, boutId, Number(roundNo), ta, tb, now],
  );
  return json({ ok: true, round_id: rid }, 200);
}

async function livePatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "admin only" }, 403);
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const rid = v.round_id;
  const r = rid ? await qOne("SELECT * FROM live_rounds WHERE id=$1", [rid]) : null;
  if (!r) return json({ error: "round not found" }, 404);

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ["branch_a_url", "branch_b_url"]) {
    if (v[col] !== undefined && v[col] !== null) {
      sets.push(`${col}=$${params.length + 1}`);
      params.push(String(v[col]).slice(0, 500));
    }
  }
  if (STATES.has(v.state)) {
    sets.push(`state=$${params.length + 1}`);
    params.push(v.state);
    if (v.state === "VOTING") {
      const minutes = Number(v.vote_minutes ?? 10);
      sets.push(`vote_deadline=$${params.length + 1}`);
      params.push(Date.now() / 1000 + minutes * 60);
    }
  }
  if (!sets.length) return json({ error: "nothing to update" }, 400);

  params.push(rid);
  await qWrite(`UPDATE live_rounds SET ${sets.join(",")} WHERE id=$${params.length}`, params);
  return json({ ok: true, round_id: rid }, 200);
}

// ---------- subscriptions ----------
async function subscriptionsPatch(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "forbidden" }, 403);
  const dh = qn(req, "device_hash");
  if (!dh) return json({ error: "missing ?device_hash=" }, 400);

  let p: Record<string, any>;
  try {
    p = await readJson(req);
  } catch {
    p = {};
  }
  const tier = String(p.tier || "free").trim();
  if (!(tier in TIERS)) {
    return json({ error: "tier must be free|ringside|booker|promoter" }, 400);
  }

  const now = Date.now() / 1000;
  await qWrite(
    `INSERT INTO subscriptions (device_hash, tier, status, created_at, updated_at)
     VALUES ($1,$2,'active',$3,$4)
     ON CONFLICT (device_hash) DO UPDATE SET tier = EXCLUDED.tier,
       status = 'active', updated_at = EXCLUDED.updated_at`,
    [dh, tier, now, now],
  );
  return json({ ok: true, device_hash: dh.slice(0, 8), tier }, 200);
}

// ---------- script (OpenRouter) ----------
async function scriptPost(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "bad admin token" }, 403);
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const prompt = String(v.prompt || "").trim();
  if (!prompt || prompt.length > 4000) {
    return json({ error: "prompt required, max 4000 chars" }, 400);
  }
  if (!openrouterConfigured()) return json({ error: "openrouter not configured" }, 501);

  const model = String(v.model || "").trim();
  try {
    const [text, used] = await generateText(prompt, model || undefined);
    return json({ ok: true, text, model: used }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 200) }, 502);
  }
}
