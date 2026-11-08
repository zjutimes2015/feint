/**
 * AdaptLane webhook:HMAC 验签 → 事件级去重 → 落库。
 * 渲染完成只进 'review',永不自动发布;发布必须人工点。
 */
import { verifySignature } from '@/lib/brawlverse/adaptlane';
import { opsAlert } from '@/lib/brawlverse/alert';
import { episodeContentId, upsertContent } from '@/lib/brawlverse/content';
import { qOne, qWrite } from '@/lib/brawlverse/db';
import { json, preflight } from '@/lib/brawlverse/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DONE = new Set(['completed', 'job.completed', 'success', 'succeeded']);
const FAIL = new Set(['failed', 'job.failed', 'error']);
const PROGRESS = new Set(['progress', 'job.progress', 'rendering']);

type Row = { week_key: string; job_id: string; status: string };

const COLUMNS = 'week_key, job_id, status';

/** 从 brief 里取对阵名做标题;取不到就用周键。 */
async function episodeTitle(weekKey: string): Promise<string> {
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
    // brief 脏数据不影响落库
  }
  return weekKey;
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  const secret = process.env.ADAPTLANE_WEBHOOK_SECRET || '';
  if (!secret) return json({ error: 'webhook_not_configured' }, 503);

  const raw = await req.text();
  const sig =
    req.headers.get('x-adaptlane-signature') ||
    req.headers.get('x-signature') ||
    '';
  if (!verifySignature(raw, sig, secret)) {
    return json({ error: 'bad_signature' }, 401);
  }

  let p: Record<string, any>;
  try {
    p = JSON.parse(raw) as Record<string, any>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const event = String(p.event || p.type || '').toLowerCase();
  const jobId = String(p.job_id || p.id || '');
  const weekKey = String(p.week_key || '');
  if (!jobId && !weekKey) {
    return json({ error: 'week_key or job_id required' }, 400);
  }

  const now = Date.now() / 1000;

  // 事件级去重:重复投递直接吞掉(webhook_events 是现成的表)
  const eventId = String(p.event_id || '');
  if (eventId) {
    const n = await qWrite(
      `INSERT INTO webhook_events (event_id, created_at) VALUES ($1,$2)
       ON CONFLICT (event_id) DO NOTHING`,
      ['adaptlane:' + eventId, now]
    );
    if (!n) return json({ ok: true, duplicate: true }, 200);
  }

  const row = weekKey
    ? await qOne<Row>(
        `SELECT ${COLUMNS} FROM episode_renders WHERE week_key = $1`,
        [weekKey]
      )
    : await qOne<Row>(
        `SELECT ${COLUMNS} FROM episode_renders WHERE job_id = $1`,
        [jobId]
      );
  if (!row) return json({ ok: true, ignored: 'unknown_job' }, 200);
  if (weekKey && jobId && row.job_id && row.job_id !== jobId) {
    return json({ error: 'job_mismatch' }, 409);
  }

  if (DONE.has(event)) {
    if (row.status === 'published') {
      return json({ ok: true, idempotent: true, status: 'published' }, 200);
    }
    const videoUrl = String(p.video_url || '').slice(0, 500);
    const posterUrl = String(p.poster_url || '').slice(0, 500);
    await qWrite(
      `UPDATE episode_renders SET status='review', video_url=$2,
         poster_url=$3, credits_used=$4, error='',
         job_id = CASE WHEN job_id = '' THEN $5 ELSE job_id END,
         updated_at=$6
       WHERE week_key=$1 AND status <> 'published'`,
      [
        row.week_key,
        videoUrl,
        posterUrl,
        Number(p.credits_used || 0),
        jobId,
        now,
      ]
    );
    // 同步进统一内容库:发布后 /episodes 立即可播
    await upsertContent({
      id: episodeContentId(row.week_key),
      kind: 'episode',
      title: await episodeTitle(row.week_key),
      week_key: row.week_key,
      provider: 'adaptlane',
      video_url: videoUrl,
      poster_url: posterUrl,
      status: 'review',
      credits_used: Number(p.credits_used || 0),
      meta: { job_id: jobId, source: 'adaptlane-webhook' },
    });
    return json({ ok: true, week_key: row.week_key, status: 'review' }, 200);
  }

  if (FAIL.has(event)) {
    // 已进 review/published 的成片不被迟到事件打回
    if (row.status === 'review' || row.status === 'published') {
      return json({ ok: true, idempotent: true, status: row.status }, 200);
    }
    await qWrite(
      `UPDATE episode_renders SET status='failed', error=$2, updated_at=$3
       WHERE week_key=$1`,
      [row.week_key, String(p.error || 'render failed').slice(0, 300), now]
    );
    // P0-4:失败必须告警,不能只躺在一张表里。
    await opsAlert('weekly episode render FAILED', {
      week_key: row.week_key,
      job_id: jobId,
      error: String(p.error || 'render failed').slice(0, 300),
    });
    return json({ ok: true, week_key: row.week_key, status: 'failed' }, 200);
  }

  if (PROGRESS.has(event)) {
    if (row.status !== 'submitted') {
      return json({ ok: true, idempotent: true, status: row.status }, 200);
    }
    await qWrite(
      `UPDATE episode_renders SET status='rendering', updated_at=$2
       WHERE week_key=$1`,
      [row.week_key, now]
    );
    return json({ ok: true, week_key: row.week_key, status: 'rendering' }, 200);
  }

  return json({ ok: true, ignored: event || 'unknown_event' }, 200);
}
