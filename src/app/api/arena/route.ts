/**
 * Arena 对战 API v0.1。
 * 模式照抄 src/app/api/votes/route.ts：opOf 取 op，resolveIdentity 双轨身份，
 * readJson 解析，json() 返回，checkRate 限流。不用 Turnstile（游戏内高频操作）。
 *
 * POST ?op=create {fighter, ai_fighter, device_id} → 建房
 * POST ?op=move   {match_id, move, device_id}     → 出招结算一回合
 * GET  ?op=state&match_id=                        → 对战状态 + 回合历史
 * GET  ?op=leaderboard                            → 排位前 20
 */
import crypto from 'node:crypto';
import { checkRate, clientIp, qAll, qOne, qWrite } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import {
  MAX_ROUNDS,
  isValidMove,
  resolveRound,
  type FighterState,
  type MoveId,
} from '@/lib/arena/engine';
import { FIGHTERS, chooseAiMove, isValidFighter } from '@/lib/arena/fighters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

interface MatchRow {
  id: string;
  player_a: string;
  player_b: string;
  fighter_a: string;
  fighter_b: string;
  status: string;
  round_no: number;
  hp_a: number;
  hp_b: number;
  hype_a: number;
  hype_b: number;
  stamina_a: number;
  stamina_b: number;
  read_a: number;
  read_b: number;
  winner: string | null;
  created_at: number;
  updated_at: number;
}

function toState(m: MatchRow, tag: 'A' | 'B'): FighterState {
  return tag === 'A'
    ? { hp: m.hp_a, stamina: m.stamina_a, hype: m.hype_a, read: m.read_a === 1 }
    : {
        hp: m.hp_b,
        stamina: m.stamina_b,
        hype: m.hype_b,
        read: m.read_b === 1,
      };
}

function matchJson(m: MatchRow) {
  return {
    id: m.id,
    fighter_a: m.fighter_a,
    fighter_b: m.fighter_b,
    fighter_a_name: FIGHTERS[m.fighter_a]?.name ?? m.fighter_a,
    fighter_b_name: FIGHTERS[m.fighter_b]?.name ?? m.fighter_b,
    status: m.status,
    round_no: m.round_no,
    hp_a: m.hp_a,
    hp_b: m.hp_b,
    hype_a: m.hype_a,
    hype_b: m.hype_b,
    stamina_a: m.stamina_a,
    stamina_b: m.stamina_b,
    winner: m.winner,
  };
}

async function recordRanking(
  winnerKey: string | null,
  loserKey: string | null,
  ko: boolean
): Promise<void> {
  const now = Date.now() / 1000;
  if (winnerKey) {
    await qWrite(
      `INSERT INTO arena_rankings (player, wins, losses, kos, updated_at)
       VALUES ($1, 1, 0, $2, $3)
       ON CONFLICT (player) DO UPDATE SET
         wins = arena_rankings.wins + 1,
         kos = arena_rankings.kos + $2,
         updated_at = $3`,
      [winnerKey, ko ? 1 : 0, now]
    );
  }
  if (loserKey) {
    await qWrite(
      `INSERT INTO arena_rankings (player, wins, losses, kos, updated_at)
       VALUES ($1, 0, 1, 0, $2)
       ON CONFLICT (player) DO UPDATE SET
         losses = arena_rankings.losses + 1,
         updated_at = $2`,
      [loserKey, now]
    );
  }
}

export async function GET(req: Request) {
  const op = opOf(req, '');
  const url = new URL(req.url);

  if (op === 'leaderboard') {
    const rows = await qAll<{
      player: string;
      wins: number;
      losses: number;
      kos: number;
    }>(
      `SELECT player, wins, losses, kos FROM arena_rankings
       ORDER BY wins DESC, kos DESC LIMIT 20`
    );
    return json({ leaderboard: rows }, 200, req);
  }

  if (op === 'state') {
    const matchId = url.searchParams.get('match_id') || '';
    if (!matchId) return json({ error: 'match_id required' }, 400, req);
    const m = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [matchId]
    );
    if (!m) return json({ error: 'match not found' }, 404, req);
    const rounds = await qAll(
      `SELECT round_no, move_a, move_b, log_json, hp_a, hp_b, hype_a, hype_b
       FROM arena_rounds WHERE match_id = $1 ORDER BY round_no ASC`,
      [matchId]
    );
    return json({ match: matchJson(m), rounds }, 200, req);
  }

  return json({ error: 'unknown op' }, 400, req);
}

export async function POST(req: Request) {
  const op = opOf(req, '');

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const identity = await resolveIdentity(req, String(body.device_id ?? ''));
  if (!identity) return json({ error: 'device_id required' }, 400, req);

  const ip = clientIp(req);
  if (!(await checkRate(ip)))
    return json({ error: 'rate limited: slow down' }, 429, req);

  // --- 建房 ---
  if (op === 'create') {
    const fighter = String(body.fighter ?? '');
    const aiFighter = String(body.ai_fighter ?? '');
    if (!isValidFighter(fighter) || !isValidFighter(aiFighter)) {
      return json({ error: 'invalid fighter' }, 400, req);
    }
    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    await qWrite(
      `INSERT INTO arena_matches
       (id, player_a, player_b, fighter_a, fighter_b, status, round_no,
        hp_a, hp_b, hype_a, hype_b, stamina_a, stamina_b,
        created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'active',0,100,100,0,0,100,100,$6,$6)`,
      [id, identity.key, 'ai:' + aiFighter, fighter, aiFighter, now]
    );
    const m = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [id]
    );
    return json({ ok: true, match: m ? matchJson(m) : null }, 200, req);
  }

  // --- 出招 ---
  if (op === 'move') {
    const matchId = String(body.match_id ?? '');
    const move = String(body.move ?? '');
    if (!matchId || !isValidMove(move)) {
      return json({ error: 'match_id and valid move required' }, 400, req);
    }
    const m = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [matchId]
    );
    if (!m) return json({ error: 'match not found' }, 404, req);
    if (m.status !== 'active')
      return json({ error: 'match is over' }, 409, req);
    if (m.player_a !== identity.key)
      return json({ error: 'not your match' }, 403, req);

    const nameA = FIGHTERS[m.fighter_a]?.name ?? m.fighter_a;
    const nameB = FIGHTERS[m.fighter_b]?.name ?? m.fighter_b;
    const stateA = toState(m, 'A');
    const stateB = toState(m, 'B');

    // AI 选招：读最近 5 回合玩家出招
    const hist = await qAll<{ move_a: string }>(
      `SELECT move_a FROM arena_rounds WHERE match_id = $1
       ORDER BY round_no DESC LIMIT 5`,
      [matchId]
    );
    const playerHistory = hist
      .reverse()
      .map((r) => r.move_a)
      .filter((x): x is MoveId => isValidMove(x));
    const aiMove = chooseAiMove(
      FIGHTERS[m.fighter_b],
      playerHistory,
      stateB,
      stateA
    );

    const result = resolveRound(
      stateA,
      stateB,
      move as MoveId,
      aiMove,
      nameA,
      nameB
    );
    const now = Date.now() / 1000;
    const nextRound = m.round_no + 1;

    await qWrite(
      `INSERT INTO arena_rounds
       (match_id, round_no, move_a, move_b, log_json, hp_a, hp_b, hype_a, hype_b, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        matchId,
        nextRound,
        move,
        aiMove,
        JSON.stringify(result.events),
        result.stateA.hp,
        result.stateB.hp,
        result.stateA.hype,
        result.stateB.hype,
        now,
      ]
    );

    // 终局判定：KO 或 15 回合按 HP
    let status = 'active';
    let winner: string | null = null;
    if (result.ko === 'A') {
      status = 'done';
      winner = 'A';
    } else if (result.ko === 'B') {
      status = 'done';
      winner = 'B';
    } else if (result.ko === 'draw') {
      status = 'done';
      winner = 'draw';
    } else if (nextRound >= MAX_ROUNDS) {
      status = 'done';
      winner =
        result.stateA.hp > result.stateB.hp
          ? 'A'
          : result.stateB.hp > result.stateA.hp
            ? 'B'
            : 'draw';
      result.events.push(
        `⏱️ 15 回合战满！${winner === 'draw' ? '平局' : (winner === 'A' ? nameA : nameB) + ' 以剩余体力获胜'}`
      );
    }

    await qWrite(
      `UPDATE arena_matches SET
         round_no = $1, hp_a = $2, hp_b = $3,
         hype_a = $4, hype_b = $5,
         stamina_a = $6, stamina_b = $7,
         read_a = $8, read_b = $9,
         status = $10, winner = $11, updated_at = $12
       WHERE id = $13`,
      [
        nextRound,
        result.stateA.hp,
        result.stateB.hp,
        result.stateA.hype,
        result.stateB.hype,
        result.stateA.stamina,
        result.stateB.stamina,
        result.stateA.read ? 1 : 0,
        result.stateB.read ? 1 : 0,
        status,
        winner,
        now,
        matchId,
      ]
    );

    if (status === 'done' && winner !== 'draw') {
      const koWin = result.ko !== null;
      await recordRanking(
        winner === 'A' ? m.player_a : m.player_b,
        winner === 'A' ? m.player_b : m.player_a,
        koWin
      );
    }

    // 邀请奖励：对战结束即算完成首场，被邀请人的邀请人得积分（幂等）
    if (status === 'done') {
      try {
        const { completeReferralOnFirstBattle } = await import(
          '@/lib/growth/logic'
        );
        await completeReferralOnFirstBattle(m.player_a);
        if (m.player_b !== m.player_a)
          await completeReferralOnFirstBattle(m.player_b);
      } catch {
        // 邀请奖励失败不影响对战结算
      }
    }

    const updated = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [matchId]
    );
    return json(
      {
        ok: true,
        round: nextRound,
        move_a: move,
        move_b: aiMove,
        events: result.events,
        finisher: result.finisher,
        damageToA: result.damageToA,
        damageToB: result.damageToB,
        match: updated ? matchJson(updated) : null,
      },
      200,
      req
    );
  }

  return json({ error: 'unknown op' }, 400, req);
}
