/** 梦幻联赛：组队 / 选人 / 排行榜。 */
import { qAll, qOne, qWrite } from '@/lib/brawlverse/db';
import { fantasyScore, validatePicks } from '@/lib/brawlverse/entitlements';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req);
  const season = new URL(req.url).searchParams.get('season') || 's1';

  if (op === 'my') {
    const deviceId = new URL(req.url).searchParams.get('device_id') || '';
    // 双轨身份:登录用户免 device_id,游客用设备指纹
    const identity = await resolveIdentity(req, deviceId);
    if (!identity) return json({ error: 'device_id required' }, 400, req);
    const t = await qOne<{ team_name: string; picks: string }>(
      'SELECT team_name, picks FROM fantasy_teams WHERE device_hash = $1 AND season = $2',
      [identity.key, season]
    );
    return json(
      {
        season,
        team: t ? { team_name: t.team_name, picks: JSON.parse(t.picks) } : null,
      },
      200,
      req
    );
  }

  if (op === 'teams') {
    const rows = await qAll<{
      team_name: string;
      picks: string;
      player: string;
    }>(
      'SELECT team_name, picks, substr(device_hash,1,8) AS player FROM fantasy_teams WHERE season = $1 ORDER BY created_at',
      [season]
    );
    return json(
      {
        season,
        teams: rows.map((r) => ({
          team_name: r.team_name,
          picks: JSON.parse(r.picks),
          player: r.player,
        })),
      },
      200,
      req
    );
  }

  if (op === 'leaderboard') {
    const teams = await qAll<{
      team_name: string;
      picks: string;
      player: string;
    }>(
      'SELECT team_name, picks, substr(device_hash,1,8) AS player FROM fantasy_teams WHERE season = $1',
      [season]
    );
    const recRows = await qAll<{ fighter: string; wins: number; kos: number }>(
      'SELECT fighter, wins, kos FROM fighter_records'
    );
    const recs: Record<string, { wins: number; kos: number }> = {};
    for (const r of recRows)
      recs[r.fighter.toUpperCase()] = { wins: r.wins, kos: r.kos };

    const board = teams.map((t) => {
      const picks: string[] = JSON.parse(t.picks);
      return {
        team_name: t.team_name,
        player: t.player,
        picks,
        score: fantasyScore(picks, recs),
      };
    });
    board.sort((a, b) => b.score - a.score);
    board.forEach((b, i) => {
      (b as any).rank = i + 1;
    });

    return json(
      { season, leaderboard: board, scoring: 'win=3, KO win=5, loss=0' },
      200,
      req
    );
  }

  return json({ error: 'unknown op' }, 400, req);
}

export async function POST(req: Request) {
  const op = opOf(req);
  if (op === 'teams') return createTeam(req);
  if (op === 'picks') return setPicks(req);
  return json({ error: 'unknown op' }, 400, req);
}

async function createTeam(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const teamName = String(v.team_name || '')
    .trim()
    .slice(0, 40);
  const season = String(v.season || 's1')
    .trim()
    .slice(0, 16);

  // 双轨身份:登录用户用账号,游客用设备指纹
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) {
    return json({ error: 'device_id required' }, 400, req);
  }
  if (!teamName) return json({ error: 'team_name required' }, 400, req);

  const dh = identity.key;
  await qWrite(
    `INSERT INTO fantasy_teams (device_hash, season, team_name, picks, created_at)
     VALUES ($1,$2,$3,'[]',$4)
     ON CONFLICT (device_hash, season) DO UPDATE SET team_name = EXCLUDED.team_name`,
    [dh, season, teamName, Date.now() / 1000]
  );

  return json({ ok: true, team_name: teamName, season }, 200, req);
}

async function setPicks(req: Request): Promise<Response> {
  let v: Record<string, any>;
  try {
    v = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const season = String(v.season || 's1')
    .trim()
    .slice(0, 16);
  const picks = v.picks;

  // 双轨身份:登录用户用账号,游客用设备指纹
  const identity = await resolveIdentity(req, String(v.device_id ?? ''));
  if (!identity) {
    return json({ error: 'device_id required' }, 400, req);
  }

  const [ok, err] = validatePicks(picks);
  if (!ok) return json({ error: err }, 400, req);

  const norm = (picks as unknown[]).map((p) => String(p).trim().toUpperCase());
  const dh = identity.key;
  const team = await qOne(
    'SELECT id FROM fantasy_teams WHERE device_hash = $1 AND season = $2',
    [dh, season]
  );
  if (!team) {
    return json(
      { error: 'create a team first (POST /api/fantasy?op=teams)' },
      409,
      req
    );
  }

  await qWrite(
    'UPDATE fantasy_teams SET picks = $1 WHERE device_hash = $2 AND season = $3',
    [JSON.stringify(norm), dh, season]
  );

  return json({ ok: true, picks: norm, season }, 200, req);
}
