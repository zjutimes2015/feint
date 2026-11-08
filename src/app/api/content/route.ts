/**
 * 内容库:统一消费两类产物。
 *
 *   kind=episode  周更正片(AdaptLane 周更 + 动作库对打镜头合成)
 *   kind=branch   回合战术分支(Friday Fight Night 投票后播胜者)
 *
 * 两类产物节奏不同(周更 vs 每回合),但都是"一条可播放的视频",
 * 所以进同一张表,让 /episodes 与 /live 共用一个内容源。
 */
import { qAll, qOne, qWrite } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { isAdmin } from '@/lib/brawlverse/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set(['episode', 'branch']);
const STATUSES = new Set(['draft', 'review', 'published', 'failed']);

type ContentRow = {
  id: string;
  kind: string;
  title: string;
  week_key: string;
  bout_id: string;
  round_no: number;
  tactic: string;
  provider: string;
  video_url: string;
  poster_url: string;
  status: string;
  credits_used: number;
  meta_json: string;
  created_at: number;
  updated_at: number;
};

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, 'list');
  if (op !== 'list') return json({ error: 'unknown op' }, 400, req);

  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') || '';
  const status = url.searchParams.get('status') || 'published';
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get('limit') || 20))
  );

  const where: string[] = [];
  const params: unknown[] = [];
  if (KINDS.has(kind)) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (STATUSES.has(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(limit);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await qAll<ContentRow>(
    `SELECT * FROM content_items ${clause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );

  return json(
    {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        week_key: r.week_key,
        bout_id: r.bout_id,
        round_no: r.round_no,
        tactic: r.tactic,
        provider: r.provider,
        video_url: r.video_url,
        poster_url: r.poster_url,
        status: r.status,
        credits_used: r.credits_used,
        updated_at: r.updated_at,
      })),
    },
    200,
    req
  );
}

/** 生产管线用服务令牌发布(P0-1):不依赖浏览器 admin 会话。 */
function machineAuthorized(req: Request): boolean {
  const token = process.env.CONTENT_PUBLISH_TOKEN || '';
  if (!token) return false;
  return req.headers.get('authorization') === `Bearer ${token}`;
}

export async function POST(req: Request) {
  const op = opOf(req, 'upsert');
  if (op !== 'upsert') return json({ error: 'unknown op' }, 400, req);
  const machine = machineAuthorized(req);
  if (!machine && !(await isAdmin(req))) {
    return json({ error: 'forbidden' }, 403, req);
  }

  let body: Record<string, any>;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const id = String(body.id || '').trim();
  const kind = String(body.kind || '').trim();
  if (!id) return json({ error: 'id required' }, 400, req);
  if (!KINDS.has(kind)) return json({ error: 'invalid kind' }, 400, req);

  const status = STATUSES.has(String(body.status || ''))
    ? String(body.status)
    : 'draft';
  const now = Date.now() / 1000;

  // P2-9:公开发布的正片必须带 AIGC 披露标记。
  // 自动管线(令牌)必须显式声明;人工发布由这里补上并记录审核人。
  const meta: Record<string, any> = { ...(body.meta ?? {}) };
  if (kind === 'episode' && status === 'published') {
    if (machine && meta.aigc_disclosed !== true) {
      return json(
        {
          error: 'aigc_disclosure_required',
          hint: 'meta.aigc_disclosed must be true',
        },
        409,
        req
      );
    }
    meta.aigc_disclosed = true;
    meta.aigc_label = 'AI-generated footage · synthetic performers';
    meta.reviewed_at = now;
    if (!machine) meta.reviewed_by = 'admin';
  }

  await qWrite(
    `INSERT INTO content_items
       (id, kind, title, week_key, bout_id, round_no, tactic, provider,
        video_url, poster_url, status, credits_used, meta_json,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       video_url = EXCLUDED.video_url,
       poster_url = EXCLUDED.poster_url,
       status = EXCLUDED.status,
       tactic = EXCLUDED.tactic,
       provider = EXCLUDED.provider,
       credits_used = EXCLUDED.credits_used,
       meta_json = EXCLUDED.meta_json,
       updated_at = EXCLUDED.updated_at`,
    [
      id,
      kind,
      String(body.title || ''),
      String(body.week_key || ''),
      String(body.bout_id || ''),
      Number(body.round_no || 0),
      String(body.tactic || ''),
      String(body.provider || ''),
      String(body.video_url || ''),
      String(body.poster_url || ''),
      status,
      Number(body.credits_used || 0),
      JSON.stringify(meta),
      now,
    ]
  );

  const after = await qOne<ContentRow>(
    'SELECT * FROM content_items WHERE id = $1',
    [id]
  );
  return json({ ok: true, item: after }, 200, req);
}
