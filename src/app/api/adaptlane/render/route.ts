/**
 * AdaptLane 出片入口:
 *   GET  ?op=status[&week_key=]  公开,只回状态与成片地址
 *   GET  ?op=list[&status=]      admin 待审/历史列表
 *   GET  ?op=submit[&week_key=]  Vercel Cron(需 CRON_SECRET)或 admin
 *   POST ?op=submit              admin 手动触发,可带 { week_key, force }
 *   POST ?op=publish             admin 发布 review 成片(人工闸门,不接受 Cron)
 * 幂等:week_key 是主键,同一周重复触发不会重复建任务。
 */
import {
  adaptlaneConfigured,
  autopilotEnabled,
  submitJob,
} from '@/lib/brawlverse/adaptlane';
import { opsAlert } from '@/lib/brawlverse/alert';
import { buildBrief, weekKeyOf } from '@/lib/brawlverse/brief';
import { episodeContentId, upsertContent } from '@/lib/brawlverse/content';
import { qAll, qOne, qWrite } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { isAdmin } from '@/lib/brawlverse/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEEK_RE = /^\d{4}-W\d{2}$/;
// 这些状态已占住本周,非 force 不重复提交
const BUSY = new Set(['submitted', 'rendering', 'review', 'published']);
const LIST_STATUS = new Set([
  'review',
  'draft',
  'failed',
  'submitted',
  'rendering',
  'published',
  'all',
]);

type RenderRow = {
  week_key: string;
  status: string;
  job_id: string;
  video_url: string;
  poster_url: string;
  error: string;
  updated_at: number;
};

type EpisodeListRow = RenderRow & {
  brief_json: string;
  credits_used: number;
  attempts: number;
};

/** 后台列表只需要展示信息,不把完整 brief 吐回浏览器。 */
function listView(r: EpisodeListRow) {
  let title = '';
  let airAt = '';
  try {
    const brief = JSON.parse(r.brief_json || '{}');
    const bout = brief?.bout;
    if (bout) title = `${bout.fighter_a} vs ${bout.fighter_b}`;
    airAt = String(brief?.air_at || '');
  } catch {
    // 历史脏数据:解析失败不影响列表
  }
  return {
    week_key: r.week_key,
    status: r.status,
    video_url: r.video_url,
    poster_url: r.poster_url,
    error: r.error,
    credits_used: r.credits_used,
    attempts: r.attempts,
    updated_at: r.updated_at,
    title,
    air_at: airAt,
  };
}

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function allowed(req: Request): Promise<boolean> {
  if (cronAuthorized(req)) return true;
  return isAdmin(req);
}

function publicView(r: RenderRow) {
  return {
    week_key: r.week_key,
    status: r.status,
    video_url: r.video_url,
    poster_url: r.poster_url,
    updated_at: r.updated_at,
  };
}

/** 从 brief 取对阵名做标题;取不到用周键。 */
async function briefTitleOf(weekKey: string): Promise<string> {
  try {
    const row = await qOne<{ brief_json: string }>(
      'SELECT brief_json FROM episode_renders WHERE week_key = $1',
      [weekKey]
    );
    if (!row) return weekKey;
    const brief = JSON.parse(row.brief_json || '{}');
    const bout = brief?.bout;
    if (bout?.fighter_a && bout?.fighter_b) {
      return `${bout.fighter_a} vs ${bout.fighter_b}`;
    }
  } catch {
    // brief 脏数据不影响发布
  }
  return weekKey;
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  if (op === 'submit') return submit(req, {}, true);
  if (op === 'list') return list(req);
  if (op === 'health') return health(req);
  if (op && op !== 'status') {
    return json({ error: 'unknown op' }, 400, req);
  }

  const weekKey = new URL(req.url).searchParams.get('week_key') || weekKeyOf();
  if (!WEEK_RE.test(weekKey)) {
    return json({ error: 'invalid week_key' }, 400, req);
  }
  const row = await qOne<RenderRow>(
    `SELECT week_key, status, job_id, video_url, poster_url, error, updated_at
     FROM episode_renders WHERE week_key = $1`,
    [weekKey]
  );
  if (!row) return json({ week_key: weekKey, status: 'none' }, 200, req);
  return json(publicView(row), 200, req);
}

/** Cron 就绪自检:key / 总开关 / 告警通道 / 本周状态,一眼看出周更能不能跑。 */
async function health(req: Request): Promise<Response> {
  if (!(await allowed(req))) return json({ error: 'forbidden' }, 403, req);
  const weekKey = weekKeyOf();
  const row = await qOne<RenderRow>(
    `SELECT week_key, status, job_id, video_url, poster_url, error, updated_at
     FROM episode_renders WHERE week_key = $1`,
    [weekKey]
  );
  return json(
    {
      ok: true,
      week_key: weekKey,
      adaptlane_key: adaptlaneConfigured(),
      autopilot: autopilotEnabled(),
      cron_secret: Boolean(process.env.CRON_SECRET),
      alert_webhook: Boolean(process.env.OPS_ALERT_WEBHOOK),
      status: row?.status ?? 'none',
      error: row?.error ?? '',
    },
    200,
    req
  );
}

/** 后台待审列表:默认只回 review,status=all 回全部。 */
async function list(req: Request): Promise<Response> {
  if (!(await isAdmin(req))) {
    return json({ error: 'forbidden' }, 403, req);
  }

  const raw = (
    new URL(req.url).searchParams.get('status') || 'review'
  ).toLowerCase();
  const status = LIST_STATUS.has(raw) ? raw : 'review';

  const cols = `week_key, status, job_id, video_url, poster_url, brief_json,
                credits_used, attempts, error, updated_at`;
  const rows =
    status === 'all'
      ? await qAll<EpisodeListRow>(
          `SELECT ${cols} FROM episode_renders
           ORDER BY updated_at DESC LIMIT 50`
        )
      : await qAll<EpisodeListRow>(
          `SELECT ${cols} FROM episode_renders
           WHERE status = $1 ORDER BY updated_at DESC LIMIT 50`,
          [status]
        );

  return json({ status, episodes: rows.map(listView) }, 200, req);
}

export async function POST(req: Request) {
  const op = opOf(req, 'submit');
  if (op !== 'submit' && op !== 'publish') {
    return json({ error: 'unknown op' }, 400, req);
  }

  let body: Record<string, any>;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }
  if (op === 'publish') return publish(req, body);
  return submit(req, body, false);
}

/**
 * review -> published。只认 admin,不给 Cron 自动发布的口子。
 * 要求成片地址已就绪,且当前状态正好是 review。
 */
async function publish(
  req: Request,
  body: Record<string, any>
): Promise<Response> {
  if (!(await isAdmin(req))) {
    return json({ error: 'forbidden' }, 403, req);
  }

  const url = new URL(req.url);
  const weekKey = String(
    body.week_key || url.searchParams.get('week_key') || ''
  ).trim();
  if (!WEEK_RE.test(weekKey)) {
    return json({ error: 'invalid week_key' }, 400, req);
  }

  const row = await qOne<RenderRow>(
    `SELECT week_key, status, job_id, video_url, poster_url, error, updated_at
     FROM episode_renders WHERE week_key = $1`,
    [weekKey]
  );
  if (!row) return json({ error: 'not_found' }, 404, req);
  if (!row.video_url) return json({ error: 'no_video' }, 409, req);
  if (row.status === 'published') {
    return json({ ok: true, ...publicView(row), idempotent: true }, 200, req);
  }
  if (row.status !== 'review') {
    return json({ error: 'not_in_review', status: row.status }, 409, req);
  }

  await qWrite(
    `UPDATE episode_renders
     SET status='published', updated_at=$2
     WHERE week_key=$1 AND status='review'`,
    [weekKey, Date.now() / 1000]
  );
  const after = await qOne<RenderRow>(
    `SELECT week_key, status, job_id, video_url, poster_url, error, updated_at
     FROM episode_renders WHERE week_key = $1`,
    [weekKey]
  );
  // 同步进统一内容库:/episodes 读 content_items
  await upsertContent({
    id: episodeContentId(weekKey),
    kind: 'episode',
    title: await briefTitleOf(weekKey),
    week_key: weekKey,
    provider: 'adaptlane',
    video_url: after?.video_url ?? row.video_url,
    poster_url: after?.poster_url ?? row.poster_url,
    status: 'published',
    meta: { source: 'adaptlane' },
  });
  return json({ ok: true, ...publicView(after ?? row) }, 200, req);
}

async function submit(
  req: Request,
  body: Record<string, any>,
  fromCron: boolean
): Promise<Response> {
  if (!(await allowed(req))) {
    return json({ error: 'forbidden' }, 403, req);
  }
  // Cron 受总开关保护;admin 手动触发不受限
  if (fromCron && !autopilotEnabled()) {
    return json({ ok: true, skipped: 'autopilot_off' }, 200, req);
  }

  const url = new URL(req.url);
  const raw = String(
    body.week_key || url.searchParams.get('week_key') || ''
  ).trim();
  if (raw && !WEEK_RE.test(raw)) {
    return json({ error: 'invalid week_key' }, 400, req);
  }
  const weekKey = raw || weekKeyOf();
  const force = body.force === true || url.searchParams.get('force') === '1';

  const existing = await qOne<RenderRow>(
    `SELECT week_key, status, job_id, video_url, poster_url, error, updated_at
     FROM episode_renders WHERE week_key = $1`,
    [weekKey]
  );
  if (existing && BUSY.has(existing.status) && !force) {
    return json(
      {
        ok: true,
        week_key: weekKey,
        status: existing.status,
        job_id: existing.job_id,
        idempotent: true,
      },
      200,
      req
    );
  }

  const brief = await buildBrief(weekKey);
  const now = Date.now() / 1000;
  await qWrite(
    `INSERT INTO episode_renders
       (week_key, bout_id, status, brief_json, created_at, updated_at)
     VALUES ($1,$2,'draft',$3,$4,$4)
     ON CONFLICT (week_key) DO UPDATE SET
       bout_id = EXCLUDED.bout_id,
       brief_json = EXCLUDED.brief_json,
       updated_at = EXCLUDED.updated_at`,
    [weekKey, brief.bout?.id ?? '', JSON.stringify(brief), now]
  );

  // 没配 API Key:只产出 Brief(M1 手工流程),不算失败
  if (!adaptlaneConfigured()) {
    return json(
      { ok: true, week_key: weekKey, status: 'draft', brief },
      200,
      req
    );
  }

  try {
    const job = await submitJob(brief);
    await qWrite(
      `UPDATE episode_renders
       SET status='submitted', job_id=$2, error='', attempts=attempts+1,
           updated_at=$3
       WHERE week_key=$1`,
      [weekKey, job.job_id, Date.now() / 1000]
    );
    return json(
      {
        ok: true,
        week_key: weekKey,
        status: 'submitted',
        job_id: job.job_id,
      },
      200,
      req
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    await qWrite(
      `UPDATE episode_renders
       SET status='failed', error=$2, attempts=attempts+1, updated_at=$3
       WHERE week_key=$1`,
      [weekKey, msg, Date.now() / 1000]
    );
    // P0-4:周更提交失败必须外发告警,否则没人知道本周断更。
    await opsAlert('weekly episode submit FAILED', {
      week_key: weekKey,
      error: msg,
    });
    return json(
      { ok: false, week_key: weekKey, status: 'failed', error: msg },
      502,
      req
    );
  }
}
