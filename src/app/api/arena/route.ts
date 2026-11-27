/**
 * Arena 对战 API v0.2。
 * 模式照抄 src/app/api/votes/route.ts：opOf 取 op，resolveIdentity 双轨身份，
 * readJson 解析，json() 返回，checkRate 限流。不用 Turnstile（游戏内高频操作）。
 *
 * POST ?op=create {fighter, ai_fighter, device_id}       → 建房（普通模式，随机种子）
 * POST ?op=create {daily, device_id}                     → 建房（每日同题，日期种子）
 * POST ?op=create {challenge_code, device_id}            → 建房（挑战码，同 AI 种子/残局）
 * POST ?op=move   {match_id, move, device_id}            → 出招结算一回合
 * POST ?op=replay {match_id, device_id}                  → 复仇：同拳手、同种子、同残局重开
 * POST ?op=challenge {match_id, device_id}               → 生成分享挑战码
 * GET  ?op=state&match_id=                               → 对战状态 + 回合历史
 * GET  ?op=leaderboard                                   → 排位前 20
 * GET  ?op=daily[&device_id=]                            → 今日残局 + 今日榜 + 我的最佳
 * GET  ?op=challenge&code=                               → 挑战码信息（接受前预览）
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
import {
  dailyScenario,
  dayKey,
  fullStart,
  hashToInt,
  makeCode,
  normalizeCode,
  parseStart,
  randomSeed,
  roundRng,
  type MatchStart,
} from '@/lib/arena/rng';

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
  seed: number | string;
  mode: string;
  day_key: string;
  challenge_code: string;
  scenario_json: string;
  created_at: number;
  updated_at: number;
}

interface ChallengeRow {
  code: string;
  seed: number | string;
  fighter_a: string;
  fighter_b: string;
  start_json: string;
  source_mode: string;
  created_by: string;
  plays: number;
  wins: number;
  created_at: number;
}

interface DailyRow {
  player: string;
  wins: number;
  rounds: number;
  hp_left: number;
  attempts: number;
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
    mode: m.mode,
    day_key: m.day_key,
    seed: Number(m.seed) || 0,
    challenge_code: m.challenge_code,
  };
}

interface PlayerProgress {
  rating: number;
  rating_delta: number;
  streak: number;
  best_streak: number;
  wins: number;
  losses: number;
  /** 被终结的连胜数（>=3 才有情绪价值） */
  streak_broken: number;
}

/** 记录真人玩家进度：段位分、连胜、最佳连胜。AI 不入榜。 */
async function recordPlayerResult(
  player: string,
  won: boolean,
  ko: boolean
): Promise<PlayerProgress> {
  const now = Date.now() / 1000;
  const prev = await qOne<{
    wins: number;
    losses: number;
    rating: number;
    streak: number;
    best_streak: number;
  }>(
    'SELECT wins, losses, rating, streak, best_streak FROM arena_rankings WHERE player = $1',
    [player]
  );
  const prevStreak = prev?.streak ?? 0;
  const ratingDelta = won ? (ko ? 28 : 22) : -16;
  const rating = Math.max(0, (prev?.rating ?? 1000) + ratingDelta);
  const streak = won ? prevStreak + 1 : 0;
  const bestStreak = Math.max(prev?.best_streak ?? 0, streak);
  const wins = (prev?.wins ?? 0) + (won ? 1 : 0);
  const losses = (prev?.losses ?? 0) + (won ? 0 : 1);
  await qWrite(
    `INSERT INTO arena_rankings
       (player, wins, losses, kos, rating, streak, best_streak, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (player) DO UPDATE SET
       wins = $2, losses = $3, kos = arena_rankings.kos + $4,
       rating = $5, streak = $6, best_streak = $7, updated_at = $8`,
    [player, wins, losses, won && ko ? 1 : 0, rating, streak, bestStreak, now]
  );
  return {
    rating,
    rating_delta: ratingDelta,
    streak,
    best_streak: bestStreak,
    wins,
    losses,
    streak_broken: !won && prevStreak >= 3 ? prevStreak : 0,
  };
}

/** 每日连击：同一天重复打不重复计；断一天归 1。 */
async function recordDailyStreak(
  player: string,
  day: string
): Promise<{ days: number; best: number }> {
  const prev = await qOne<{ days: number; best: number; last_day: string }>(
    'SELECT days, best, last_day FROM arena_daily_streaks WHERE player = $1',
    [player]
  );
  let days = 1;
  if (prev) {
    if (prev.last_day === day) {
      days = Math.max(1, prev.days);
    } else {
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      days = prev.last_day === yesterday ? prev.days + 1 : 1;
    }
  }
  const best = Math.max(prev?.best ?? 0, days);
  await qWrite(
    `INSERT INTO arena_daily_streaks (player, days, best, last_day, updated_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (player) DO UPDATE SET
       days = $2, best = $3, last_day = $4, updated_at = $5`,
    [player, days, best, day, Date.now() / 1000]
  );
  return { days, best };
}

/** 记每日成绩：每人每天只保留最好一局；attempts 累加。 */
async function recordDailyRun(
  day: string,
  player: string,
  won: number,
  rounds: number,
  hpLeft: number
): Promise<void> {
  const prev = await qOne<DailyRow>(
    'SELECT player, wins, rounds, hp_left, attempts FROM arena_daily_runs WHERE day_key = $1 AND player = $2',
    [day, player]
  );
  const prevWins = prev?.wins ?? 0;
  const prevHp = prev?.hp_left ?? -1;
  const prevRounds = prev?.rounds ?? Number.MAX_SAFE_INTEGER;
  const better =
    won > prevWins ||
    (won === prevWins &&
      (hpLeft > prevHp || (hpLeft === prevHp && rounds < prevRounds)));
  const wins = Math.max(prevWins, won);
  const bestRounds = better ? rounds : prevRounds;
  const bestHp = better ? hpLeft : prevHp;
  const attempts = (prev?.attempts ?? 0) + 1;
  await qWrite(
    `INSERT INTO arena_daily_runs
       (day_key, player, wins, rounds, hp_left, attempts, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (day_key, player) DO UPDATE SET
       wins = $3, rounds = $4, hp_left = $5, attempts = $6, updated_at = $7`,
    [day, player, wins, bestRounds, bestHp, attempts, Date.now() / 1000]
  );
}

interface CreateCfg {
  fighter_a: string;
  fighter_b: string;
  seed: number;
  mode: 'casual' | 'daily' | 'challenge';
  day_key?: string;
  challenge_code?: string;
  start: MatchStart;
}

async function createMatch(
  playerKey: string,
  cfg: CreateCfg
): Promise<MatchRow | null> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  const s = cfg.start;
  await qWrite(
    `INSERT INTO arena_matches
     (id, player_a, player_b, fighter_a, fighter_b, status, round_no,
      hp_a, hp_b, hype_a, hype_b, stamina_a, stamina_b,
      seed, mode, day_key, challenge_code, scenario_json,
      created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'active',0,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)`,
    [
      id,
      playerKey,
      'ai:' + cfg.fighter_b,
      cfg.fighter_a,
      cfg.fighter_b,
      s.hp_a,
      s.hp_b,
      s.hype_a,
      s.hype_b,
      s.stamina_a,
      s.stamina_b,
      cfg.seed,
      cfg.mode,
      cfg.day_key ?? '',
      cfg.challenge_code ?? '',
      JSON.stringify(s),
      now,
    ]
  );
  return await qOne<MatchRow>('SELECT * FROM arena_matches WHERE id = $1', [
    id,
  ]);
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
      rating: number;
      streak: number;
    }>(
      `SELECT player, wins, losses, kos, rating, streak FROM arena_rankings
       WHERE player NOT LIKE 'ai:%'
       ORDER BY rating DESC, wins DESC LIMIT 20`
    );
    return json({ leaderboard: rows }, 200, req);
  }

  if (op === 'daily') {
    const daily = dailyScenario();
    const rows = await qAll<DailyRow>(
      `SELECT player, wins, rounds, hp_left, attempts FROM arena_daily_runs
       WHERE day_key = $1
       ORDER BY wins DESC, hp_left DESC, rounds ASC, updated_at ASC
       LIMIT 20`,
      [daily.day_key]
    );
    const stats = await qOne<{ players: string; clears: string }>(
      `SELECT COUNT(*) AS players,
              COUNT(*) FILTER (WHERE wins > 0) AS clears
       FROM arena_daily_runs WHERE day_key = $1`,
      [daily.day_key]
    );

    const deviceId = url.searchParams.get('device_id') || '';
    const identity = deviceId ? await resolveIdentity(req, deviceId) : null;
    let you: {
      rank: number;
      wins: number;
      hp_left: number;
      rounds: number;
      attempts: number;
    } | null = null;
    let streak: {
      days: number;
      best: number;
      played_today: boolean;
    } | null = null;
    if (identity) {
      const mine = await qOne<DailyRow>(
        'SELECT player, wins, rounds, hp_left, attempts FROM arena_daily_runs WHERE day_key = $1 AND player = $2',
        [daily.day_key, identity.key]
      );
      if (mine) {
        const ahead = await qOne<{ n: string }>(
          `SELECT COUNT(*) AS n FROM arena_daily_runs
           WHERE day_key = $1 AND (
             wins > $2 OR (wins = $2 AND hp_left > $3)
             OR (wins = $2 AND hp_left = $3 AND rounds < $4))`,
          [daily.day_key, mine.wins, mine.hp_left, mine.rounds]
        );
        you = {
          rank: Number(ahead?.n ?? 0) + 1,
          wins: mine.wins,
          hp_left: mine.hp_left,
          rounds: mine.rounds,
          attempts: mine.attempts,
        };
      }
      const st = await qOne<{ days: number; best: number; last_day: string }>(
        'SELECT days, best, last_day FROM arena_daily_streaks WHERE player = $1',
        [identity.key]
      );
      const y = new Date(`${daily.day_key}T00:00:00Z`);
      y.setUTCDate(y.getUTCDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      const live =
        st && (st.last_day === daily.day_key || st.last_day === yesterday)
          ? st.days
          : 0;
      streak = {
        days: live,
        best: st?.best ?? 0,
        played_today: !!you,
      };
    }

    return json(
      {
        daily,
        leaderboard: rows.map((r, i) => ({
          rank: i + 1,
          wins: r.wins,
          hp_left: r.hp_left,
          rounds: r.rounds,
          attempts: r.attempts,
          is_you: !!identity && r.player === identity.key,
        })),
        you,
        streak,
        stats: {
          players: Number(stats?.players ?? 0),
          clears: Number(stats?.clears ?? 0),
        },
      },
      200,
      req
    );
  }

  if (op === 'profile') {
    const deviceId = url.searchParams.get('device_id') || '';
    const identity = deviceId ? await resolveIdentity(req, deviceId) : null;
    if (!identity) return json({ profile: null }, 200, req);
    const row = await qOne<{
      wins: number;
      losses: number;
      kos: number;
      rating: number;
      streak: number;
      best_streak: number;
    }>(
      'SELECT wins, losses, kos, rating, streak, best_streak FROM arena_rankings WHERE player = $1',
      [identity.key]
    );
    const recent = await qAll<{ winner: string | null }>(
      `SELECT winner FROM arena_matches
       WHERE player_a = $1 AND status = 'done'
       ORDER BY updated_at DESC LIMIT 5`,
      [identity.key]
    );
    const day = dayKey();
    const st = await qOne<{ days: number; best: number; last_day: string }>(
      'SELECT days, best, last_day FROM arena_daily_streaks WHERE player = $1',
      [identity.key]
    );
    const played = await qOne(
      'SELECT 1 AS x FROM arena_daily_runs WHERE day_key = $1 AND player = $2',
      [day, identity.key]
    );
    const y = new Date(`${day}T00:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const live =
      st && (st.last_day === day || st.last_day === yesterday) ? st.days : 0;
    return json(
      {
        profile: {
          rating: row?.rating ?? 1000,
          streak: row?.streak ?? 0,
          best_streak: row?.best_streak ?? 0,
          wins: row?.wins ?? 0,
          losses: row?.losses ?? 0,
          kos: row?.kos ?? 0,
          recent: recent.map((r) =>
            r.winner === 'A' ? 'W' : r.winner === 'draw' ? 'D' : 'L'
          ),
          daily_streak: {
            days: live,
            best: st?.best ?? 0,
            played_today: !!played,
          },
        },
      },
      200,
      req
    );
  }

  if (op === 'challenge') {
    const code = normalizeCode(url.searchParams.get('code') || '');
    if (!code) return json({ error: 'code required' }, 400, req);
    const ch = await qOne<ChallengeRow>(
      'SELECT * FROM arena_challenges WHERE code = $1',
      [code]
    );
    if (!ch) return json({ error: 'challenge not found' }, 404, req);
    return json(
      {
        challenge: {
          code: ch.code,
          fighter_a: ch.fighter_a,
          fighter_b: ch.fighter_b,
          fighter_a_name: FIGHTERS[ch.fighter_a]?.name ?? ch.fighter_a,
          fighter_b_name: FIGHTERS[ch.fighter_b]?.name ?? ch.fighter_b,
          start: parseStart(ch.start_json),
          source_mode: ch.source_mode,
          plays: ch.plays,
          wins: ch.wins,
        },
      },
      200,
      req
    );
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
  // 出招是核心高频操作（10 秒读条下一局 15 次），只依赖比赛归属校验；
  // 建房 / 复仇 / 挑战码仍按 IP 限流，防止刷局。
  if (op !== 'move' && !(await checkRate(ip)))
    return json({ error: 'rate limited: slow down' }, 429, req);

  // --- 建房：每日同题 / 挑战码 / 普通 ---
  if (op === 'create') {
    if (body.daily === true) {
      const d = dailyScenario();
      const created = await createMatch(identity.key, {
        fighter_a: d.fighter_a,
        fighter_b: d.fighter_b,
        seed: d.seed,
        mode: 'daily',
        day_key: d.day_key,
        start: d.start,
      });
      return json(
        { ok: true, match: created ? matchJson(created) : null },
        200,
        req
      );
    }

    const code = normalizeCode(String(body.challenge_code ?? ''));
    if (code) {
      const ch = await qOne<ChallengeRow>(
        'SELECT * FROM arena_challenges WHERE code = $1',
        [code]
      );
      if (!ch) return json({ error: 'challenge not found' }, 404, req);
      const created = await createMatch(identity.key, {
        fighter_a: ch.fighter_a,
        fighter_b: ch.fighter_b,
        seed: Number(ch.seed) || 0,
        mode: 'challenge',
        challenge_code: ch.code,
        start: parseStart(ch.start_json),
      });
      await qWrite(
        'UPDATE arena_challenges SET plays = plays + 1 WHERE code = $1',
        [ch.code]
      );
      return json(
        { ok: true, match: created ? matchJson(created) : null },
        200,
        req
      );
    }

    const fighter = String(body.fighter ?? '');
    const aiFighter = String(body.ai_fighter ?? '');
    if (!isValidFighter(fighter) || !isValidFighter(aiFighter)) {
      return json({ error: 'invalid fighter' }, 400, req);
    }
    const created = await createMatch(identity.key, {
      fighter_a: fighter,
      fighter_b: aiFighter,
      seed: randomSeed(),
      mode: 'casual',
      start: fullStart(),
    });
    return json(
      { ok: true, match: created ? matchJson(created) : null },
      200,
      req
    );
  }

  // --- 复仇：同拳手、同 AI 种子、同残局重开 ---
  if (op === 'replay') {
    const matchId = String(body.match_id ?? '');
    if (!matchId) return json({ error: 'match_id required' }, 400, req);
    const m = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [matchId]
    );
    if (!m) return json({ error: 'match not found' }, 404, req);
    if (m.player_a !== identity.key)
      return json({ error: 'not your match' }, 403, req);
    const created = await createMatch(identity.key, {
      fighter_a: m.fighter_a,
      fighter_b: m.fighter_b,
      seed: Number(m.seed) || 0,
      mode: 'casual',
      start: parseStart(m.scenario_json),
    });
    return json(
      { ok: true, match: created ? matchJson(created) : null },
      200,
      req
    );
  }

  // --- 生成挑战码 ---
  if (op === 'challenge') {
    const matchId = String(body.match_id ?? '');
    if (!matchId) return json({ error: 'match_id required' }, 400, req);
    const m = await qOne<MatchRow>(
      'SELECT * FROM arena_matches WHERE id = $1',
      [matchId]
    );
    if (!m) return json({ error: 'match not found' }, 404, req);
    if (m.player_a !== identity.key)
      return json({ error: 'not your match' }, 403, req);
    if (m.status !== 'done')
      return json({ error: 'finish the fight first' }, 409, req);

    const startJson = m.scenario_json || JSON.stringify(parseStart(''));
    let code = '';
    for (let i = 0; i < 5; i++) {
      const candidate = makeCode();
      const inserted = await qWrite(
        `INSERT INTO arena_challenges
         (code, seed, fighter_a, fighter_b, start_json, source_mode,
          created_by, plays, wins, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8)
         ON CONFLICT (code) DO NOTHING`,
        [
          candidate,
          Number(m.seed) || 0,
          m.fighter_a,
          m.fighter_b,
          startJson,
          m.mode,
          identity.key,
          Date.now() / 1000,
        ]
      );
      if (inserted > 0) {
        code = candidate;
        break;
      }
    }
    if (!code) return json({ error: 'could not create code' }, 500, req);
    return json({ ok: true, code }, 200, req);
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
    const nextRound = m.round_no + 1;

    // AI 选招：读最近 5 回合玩家出招；种子保证每日同题/挑战可复现
    const hist = await qAll<{ move_a: string }>(
      `SELECT move_a FROM arena_rounds WHERE match_id = $1
       ORDER BY round_no DESC LIMIT 5`,
      [matchId]
    );
    const playerHistory = hist
      .reverse()
      .map((r) => r.move_a)
      .filter((x): x is MoveId => isValidMove(x));
    const seed = Number(m.seed) || hashToInt(m.id);
    const aiMove = chooseAiMove(
      FIGHTERS[m.fighter_b],
      playerHistory,
      stateB,
      stateA,
      roundRng(seed, nextRound)
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

    let progress: PlayerProgress | null = null;
    let dailyStreak: { days: number; best: number } | null = null;

    if (status === 'done') {
      // 进度：段位分 / 连胜 / 每日连击 / 每日榜 / 挑战胜场
      try {
        if (winner === 'A' || winner === 'B') {
          progress = await recordPlayerResult(
            m.player_a,
            winner === 'A',
            result.ko !== null
          );
        }
        if (m.mode === 'daily' && m.day_key) {
          await recordDailyRun(
            m.day_key,
            m.player_a,
            winner === 'A' ? 1 : 0,
            nextRound,
            result.stateA.hp
          );
          dailyStreak = await recordDailyStreak(m.player_a, m.day_key);
        }
        if (m.mode === 'challenge' && m.challenge_code && winner === 'A') {
          await qWrite(
            'UPDATE arena_challenges SET wins = wins + 1 WHERE code = $1',
            [m.challenge_code]
          );
        }
      } catch {
        // 榜单写入失败不影响对战结算
      }

      // 邀请奖励：对战结束即算完成首场，被邀请人的邀请人得积分（幂等）
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
        progress,
        daily_streak: dailyStreak,
        match: updated ? matchJson(updated) : null,
      },
      200,
      req
    );
  }

  return json({ error: 'unknown op' }, 400, req);
}
