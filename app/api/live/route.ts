/** Friday Fight Night 直播状态 / 回合投票 / 回合结算。 */
import { checkRate, clientIp, qAll, qOne, qWrite, sha } from "@/lib/db";
import { entitlements } from "@/lib/entitlements";
import { json, opOf, preflight, readJson, requireAdmin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

type LiveRound = {
  id: string;
  bout_id: string;
  round_no: number;
  tactic_a: string;
  tactic_b: string;
  branch_a_url: string;
  branch_b_url: string;
  winning_branch: string;
  state: string;
  vote_deadline: number;
};

async function tallyOf(boutId: string, roundNo: number): Promise<Record<string, number>> {
  const rows = await qAll<{ choice: string; w: string | null }>(
    "SELECT choice, SUM(weight) AS w FROM votes WHERE bout_id = $1 AND round_no = $2 GROUP BY choice",
    [boutId, roundNo],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.choice] = Number(r.w || 0);
  return out;
}

async function publicState(r: LiveRound) {
  const now = Date.now() / 1000;
  const d: Record<string, any> = {
    id: r.id,
    bout_id: r.bout_id,
    round_no: r.round_no,
    tactic_a: r.tactic_a,
    tactic_b: r.tactic_b,
    state: r.state,
    seconds_left: r.state === "VOTING" ? Math.max(0, Math.trunc(r.vote_deadline - now)) : 0,
    winning_branch: r.state === "REVEAL" || r.state === "done" ? r.winning_branch : "",
    video_url: "",
  };
  if ((r.state === "REVEAL" || r.state === "done") && (r.winning_branch === "a" || r.winning_branch === "b")) {
    d.video_url = r.winning_branch === "a" ? r.branch_a_url : r.branch_b_url;
  }
  if (["VOTING", "LOCKED", "REVEAL", "done"].includes(r.state)) {
    d.tally = await tallyOf(r.bout_id, r.round_no);
  }
  return d;
}

export async function GET(req: Request) {
  const op = opOf(req);
  if (op !== "state") return json({ error: "unknown op" }, 400, req);

  const rid = new URL(req.url).searchParams.get("round_id");
  const r = rid
    ? await qOne<LiveRound>("SELECT * FROM live_rounds WHERE id = $1", [rid])
    : await qOne<LiveRound>("SELECT * FROM live_rounds ORDER BY created_at DESC LIMIT 1");
  if (!r) return json({ error: "no live round yet" }, 404, req);

  const d = await publicState(r);
  const b = await qOne<{ fighter_a: string; fighter_b: string; title: string }>(
    "SELECT fighter_a, fighter_b, title FROM bouts WHERE id = $1",
    [r.bout_id],
  );
  if (b) {
    d.fighter_a = b.fighter_a;
    d.fighter_b = b.fighter_b;
    d.title = b.title;
  }
  return json(d, 200, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op === "vote") return vote(req);
  if (op === "tally") return tally(req);
  return json({ error: "unknown op" }, 400, req);
}

async function vote(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400, req);
  }

  const rid = v.round_id;
  const choice = String(v.choice || "").trim().toLowerCase();
  const deviceId = v.device_id;
  if (!rid || !deviceId || String(deviceId).length < 8) {
    return json({ error: "round_id, device_id required" }, 400, req);
  }

  const r = await qOne<LiveRound>("SELECT * FROM live_rounds WHERE id = $1", [rid]);
  if (!r) return json({ error: "round not found" }, 404, req);
  if (r.state !== "VOTING" || Date.now() / 1000 > r.vote_deadline) {
    return json({ error: "voting is not open for this round" }, 409, req);
  }
  if (choice !== r.tactic_a && choice !== r.tactic_b) {
    return json({ error: "choice must be one of the two tactics" }, 400, req);
  }

  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: "rate limited: slow down" }, 429, req);
  }

  const dh = sha(String(deviceId));
  const e = await entitlements(dh);
  const weight = e.vote_weight;
  const now = Date.now() / 1000;
  const ua = req.headers.get("user-agent") || "";

  await qWrite(
    `INSERT INTO votes (bout_id, round_no, choice, device_hash, ip, ip_ua, weight, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (bout_id, round_no, device_hash)
     DO UPDATE SET choice = EXCLUDED.choice, weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at`,
    [r.bout_id, r.round_no, choice, dh, ip, sha(ip + "|" + ua), weight, now, now],
  );

  return json({ ok: true, round_id: rid, choice, weight }, 200, req);
}

async function tally(req: Request): Promise<Response> {
  if (!requireAdmin(req)) return json({ error: "admin only" }, 403, req);

  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400, req);
  }

  const rid = v.round_id;
  const r = rid ? await qOne<LiveRound>("SELECT * FROM live_rounds WHERE id = $1", [rid]) : null;
  if (!r) return json({ error: "round not found" }, 404, req);
  if (r.state !== "VOTING" && r.state !== "LOCKED") {
    return json({ error: `round is not awaiting tally (state=${r.state})` }, 409, req);
  }

  const rows = await qAll<{ choice: string; w: string | null }>(
    `SELECT choice, SUM(weight) AS w FROM votes
     WHERE bout_id = $1 AND round_no = $2 AND choice IN ($3,$4) GROUP BY choice`,
    [r.bout_id, r.round_no, r.tactic_a, r.tactic_b],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.choice] = Number(row.w || 0);

  const wa = counts[r.tactic_a] || 0;
  const wb = counts[r.tactic_b] || 0;
  // 平票 → tactic_a（确定性；admin 可在 REVEAL 前手动覆盖）
  const winner = wa >= wb ? "a" : "b";
  const now = Date.now() / 1000;

  await qWrite("UPDATE live_rounds SET winning_branch=$1, state='REVEAL' WHERE id=$2", [winner, rid]);
  const url = winner === "a" ? r.branch_a_url : r.branch_b_url;

  return json(
    {
      ok: true,
      round_id: rid,
      tally: counts,
      winning_branch: winner,
      winning_tactic: winner === "a" ? r.tactic_a : r.tactic_b,
      video_url: url,
      settled_at: now,
    },
    200,
    req,
  );
}
