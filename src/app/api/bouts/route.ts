import { qAll } from '@/lib/brawlverse/db';
import { json, opOf, preflight } from '@/lib/brawlverse/http';
import { fightNightInfo } from '@/lib/brawlverse/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, '');

  if (op === '' || op === 'bouts') {
    const rows = await qAll<any>('SELECT * FROM bouts ORDER BY created_at');
    return json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        fighter_a: r.fighter_a,
        fighter_b: r.fighter_b,
        round_no: r.round_no,
        voting_open: Boolean(r.voting_open),
        tactic_note: r.tactic_note || '',
        winner: r.winner || '',
        result_method: r.result_method || '',
        settled: Boolean(Number(r.settled_at || 0)),
        scheduled_at: Number(r.scheduled_at || 0),
      })),
      200,
      req
    );
  }
  // P1-5:固定档期查询,前端"等下一集"的倒计时读这里。
  if (op === 'schedule') return json(fightNightInfo(), 200, req);
  if (op === 'health') return json({ ok: true }, 200, req);
  return json({ error: 'unknown op' }, 400, req);
}
