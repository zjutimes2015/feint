import { opOf, json, preflight, readJson } from "@/lib/http";
import { checkRate, clientIp, qAll, qOne, qWrite, sha } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 关键词初筛：命中明显垃圾/广告/脏话直接 rejected，其余即时上屏（不再人工排队）
const BLOCK_RE = new RegExp(
  "加微信|微信号|兼职|贷款|赌博|博彩|六合彩|时时彩|代购|客服|代理|日结|赚钱|" +
    "http|www\\.|\\.com|\\.cn|fuck|shit|bitch|asshole|damn",
  "i",
);

const FEED_LIMIT = 50;

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, "");
  const url = new URL(req.url);

  if (op === "feed") {
    const sinceId = parseInt(url.searchParams.get("since_id") || "0", 10) || 0;
    if (sinceId > 0) {
      const rows = await qAll(
        `SELECT id, text, nickname, created_at FROM fan_captions
         WHERE status = 'approved' AND id > $1
         ORDER BY id ASC LIMIT $2`,
        [sinceId, FEED_LIMIT],
      );
      return json({ captions: rows }, 200, req);
    }
    // 首次进入：给最近 20 条做背景弹幕，避免整屏历史刷屏
    const rows = await qAll<{ id: number; text: string; nickname: string; created_at: number }>(
      `SELECT id, text, nickname, created_at FROM fan_captions
       WHERE status = 'approved' ORDER BY id DESC LIMIT 20`,
    );
    return json({ captions: rows.slice().reverse() }, 200, req);
  }

  if (op === "pinned") {
    const row = await qOne(
      `SELECT id, text, nickname, created_at FROM fan_captions
       WHERE status = 'approved' AND pinned = 1
       ORDER BY created_at DESC LIMIT 1`,
    );
    return json({ pinned: row ?? null }, 200, req);
  }

  return json({ error: "unknown op" }, 400, req);
}

export async function POST(req: Request) {
  const op = opOf(req, "post");
  if (op !== "post") return json({ error: "unknown op" }, 400, req);

  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: "bad json" }, 400, req);
  }

  const text = String(body.text ?? "").trim();
  if (!text || text.length > 40) return json({ error: "text required, max 40 chars" }, 400, req);

  const nickname = String(body.nickname ?? "").trim().slice(0, 12) || "匿名拳迷";
  const deviceId = String(body.device_id ?? "");
  if (deviceId.length < 8) return json({ error: "device_id required" }, 400, req);

  const ip = clientIp(req);
  if (!(await checkRate(ip))) return json({ error: "rate limited: slow down" }, 429, req);

  const ua = req.headers.get("user-agent") || "";
  const status = BLOCK_RE.test(text) ? "rejected" : "approved";

  await qWrite(
    `INSERT INTO fan_captions (text, nickname, device_hash, ip, ip_ua, status, pinned, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7)`,
    [text, nickname, sha(deviceId), ip, sha(ip + "|" + ua), status, Date.now() / 1000],
  );

  return json(
    { ok: status === "approved", status, msg: status === "approved" ? "已上屏，马上飘过！" : "内容未通过初筛" },
    200,
    req,
  );
}
