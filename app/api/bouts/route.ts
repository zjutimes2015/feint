import { opOf, json, preflight } from "@/lib/http";
import { qAll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, "");

  if (op === "" || op === "bouts") {
    const rows = await qAll<any>("SELECT * FROM bouts ORDER BY created_at");
    return json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        fighter_a: r.fighter_a,
        fighter_b: r.fighter_b,
        round_no: r.round_no,
        voting_open: Boolean(r.voting_open),
        tactic_note: r.tactic_note || "",
      })),
      200,
      req,
    );
  }
  if (op === "health") return json({ ok: true }, 200, req);
  return json({ error: "unknown op" }, 400, req);
}
