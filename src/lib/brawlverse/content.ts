/**
 * 内容库 helper:正片与回合分支的入库/读取。
 *
 * id 规则(保证同一产物重复提交幂等):
 *   episode:<week_key>
 *   branch:<bout_id>:r<round_no>:<tactic>
 */
import { qAll, qOne, qWrite } from './db';

export type ContentKind = 'episode' | 'branch';

export type ContentItem = {
  id: string;
  kind: ContentKind;
  title: string;
  week_key: string;
  bout_id: string;
  round_no: number;
  tactic: string;
  provider: string;
  video_url: string;
  poster_url: string;
  status: 'draft' | 'review' | 'published' | 'failed';
  credits_used: number;
  meta_json: string;
  created_at: number;
  updated_at: number;
};

export function episodeContentId(weekKey: string): string {
  return `episode:${weekKey}`;
}

export function branchContentId(
  boutId: string,
  roundNo: number,
  tactic: string
): string {
  return `branch:${boutId}:r${roundNo}:${tactic}`;
}

/**
 * 视频地址必须是绝对 URL。
 * 相对路径(public/xxx.mp4)只在 demo 期能用,成片一律走对象存储绝对地址。
 */
export function absoluteMediaUrl(url: string): string {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

export async function upsertContent(item: {
  id: string;
  kind: ContentKind;
  title?: string;
  week_key?: string;
  bout_id?: string;
  round_no?: number;
  tactic?: string;
  provider?: string;
  video_url?: string;
  poster_url?: string;
  status?: ContentItem['status'];
  credits_used?: number;
  meta?: Record<string, unknown>;
}): Promise<ContentItem | null> {
  const now = Date.now() / 1000;
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
      item.id,
      item.kind,
      item.title ?? '',
      item.week_key ?? '',
      item.bout_id ?? '',
      item.round_no ?? 0,
      item.tactic ?? '',
      item.provider ?? '',
      absoluteMediaUrl(item.video_url ?? ''),
      absoluteMediaUrl(item.poster_url ?? ''),
      item.status ?? 'draft',
      item.credits_used ?? 0,
      JSON.stringify(item.meta ?? {}),
      now,
    ]
  );
  return qOne<ContentItem>('SELECT * FROM content_items WHERE id = $1', [
    item.id,
  ]);
}

export async function listContent(
  kind?: ContentKind,
  status?: ContentItem['status'],
  limit = 20
): Promise<ContentItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(Math.min(50, Math.max(1, limit)));
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return qAll<ContentItem>(
    `SELECT * FROM content_items ${clause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
}

/** 上一期的战术投票倾向,供下一集编排参考(投票回流)。 */
export async function lastTacticBias(
  boutId: string
): Promise<{ tactic: string; count: number } | null> {
  const row = await qOne<{ choice: string; n: string }>(
    `SELECT choice, SUM(weight)::text AS n FROM votes
     WHERE bout_id = $1 GROUP BY choice ORDER BY SUM(weight) DESC LIMIT 1`,
    [boutId]
  );
  if (!row) return null;
  return { tactic: row.choice, count: Number(row.n || 0) };
}
