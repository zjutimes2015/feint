'use client';

import { LocaleLink } from '@/i18n/navigation';
import {
  MAX_ROUNDS,
  MOVES,
  resolveRound,
  type FighterState,
  type MoveId,
} from '@/lib/arena/engine';
import { FIGHTERS, chooseAiMove } from '@/lib/arena/fighters';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

const FIGHTER_ORDER = [
  'iron_jaw',
  'viper',
  'sledge',
  'monsoon',
  'volt',
  'the_professor',
  'la_reina',
  'goliath-7',
] as const;

type FighterSlug = (typeof FIGHTER_ORDER)[number];

const FIGHTER_NAMES: Record<FighterSlug, string> = {
  iron_jaw: 'IRON JAW',
  viper: 'VIPER',
  sledge: 'SLEDGE',
  monsoon: 'MONSOON',
  volt: 'VOLT',
  the_professor: 'THE PROFESSOR',
  la_reina: 'LA REINA',
  'goliath-7': 'GOLIATH-7',
};

function fighterName(slug: string): string {
  return FIGHTER_NAMES[slug as FighterSlug] ?? slug;
}

interface MoveButton {
  id: string;
  key: string;
}

const MOVE_BUTTONS: MoveButton[] = [
  { id: 'jab', key: 'J' },
  { id: 'cross', key: 'K' },
  { id: 'hook', key: 'L' },
  { id: 'uppercut', key: 'U' },
  { id: 'body', key: 'B' },
  { id: 'block', key: 'I' },
  { id: 'dodge', key: 'O' },
  { id: 'duck', key: 'D' },
  { id: 'feint', key: 'F' },
  { id: 'taunt', key: 'Space' },
];

interface MatchState {
  id: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_name: string;
  fighter_b_name: string;
  status: string;
  round_no: number;
  hp_a: number;
  hp_b: number;
  hype_a: number;
  hype_b: number;
  stamina_a: number;
  stamina_b: number;
  winner: string | null;
  mode: 'casual' | 'daily' | 'challenge';
  day_key: string;
  seed: number;
  challenge_code: string;
}

interface LeaderRow {
  player: string;
  wins: number;
  losses: number;
  kos: number;
}

interface StartState {
  hp_a: number;
  hp_b: number;
  stamina_a: number;
  stamina_b: number;
  hype_a: number;
  hype_b: number;
}

interface DailyInfo {
  day_key: string;
  seed: number;
  fighter_a: string;
  fighter_b: string;
  start: StartState;
}

interface DailyBoardRow {
  rank: number;
  wins: number;
  hp_left: number;
  rounds: number;
  attempts: number;
  is_you: boolean;
}

interface DailyYou {
  rank: number;
  wins: number;
  hp_left: number;
  rounds: number;
  attempts: number;
}

interface ChallengeInfo {
  code: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_name: string;
  fighter_b_name: string;
  start: StartState;
  source_mode: string;
  plays: number;
  wins: number;
}

interface PlayerProgress {
  rating: number;
  rating_delta: number;
  streak: number;
  best_streak: number;
  wins: number;
  losses: number;
  streak_broken: number;
}

interface Profile {
  rating: number;
  streak: number;
  best_streak: number;
  wins: number;
  losses: number;
  kos: number;
  recent: string[];
  daily_streak: { days: number; best: number; played_today: boolean };
}

/** 每回合决策读条：10 秒内没出招就自动格挡。 */
const ROUND_SECONDS = 10;

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem('bv_device_id');
  if (!id || id.length < 8) {
    id =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    window.localStorage.setItem('bv_device_id', id);
  }
  return id;
}

async function api<T>(
  op: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams({ op, ...(params ?? {}) });
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`/api/arena?${qs.toString()}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok || data.error) {
      throw new Error(data.error || `request failed: ${res.status}`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function localHashToInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function localMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLocalDaily(): DailyInfo {
  const key = new Date().toISOString().slice(0, 10);
  const seed = localHashToInt(`daily:${key}`);
  const r = localMulberry32(seed);
  const ia = Math.floor(r() * FIGHTER_ORDER.length);
  let ib = Math.floor(r() * FIGHTER_ORDER.length);
  if (ib === ia) ib = (ib + 1) % FIGHTER_ORDER.length;
  return {
    day_key: key,
    seed,
    fighter_a: FIGHTER_ORDER[ia],
    fighter_b: FIGHTER_ORDER[ib],
    start: {
      hp_a: 55 + Math.floor(r() * 20),
      hp_b: 55 + Math.floor(r() * 20),
      stamina_a: 100,
      stamina_b: 100,
      hype_a: Math.floor(r() * 30),
      hype_b: Math.floor(r() * 30),
    },
  };
}

function poseSrc(slug: string, pose: string): string {
  return pose === 'idle'
    ? `/arena/fighters/${slug}.png`
    : `/arena/fighters/${slug}_${pose}.png`;
}

type Screen = 'select' | 'battle' | 'result';

export default function ArenaClient() {
  const t = useTranslations('Arena');
  const { data: authSession } = authClient.useSession();
  const isSignedIn = Boolean(authSession?.user);
  const [screen, setScreen] = useState<Screen>('select');
  const [myFighter, setMyFighter] = useState<FighterSlug>('iron_jaw');
  const [aiFighter, setAiFighter] = useState<FighterSlug>('viper');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const localReadRef = useRef<{ a: boolean; b: boolean }>({
    a: false,
    b: false,
  });
  const localHistoryRef = useRef<MoveId[]>([]);
  const localStartRef = useRef<StartState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [hitA, setHitA] = useState(false);
  const [hitB, setHitB] = useState(false);
  const [dmgA, setDmgA] = useState<number | null>(null);
  const [dmgB, setDmgB] = useState<number | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [koFlash, setKoFlash] = useState(false);
  const [flashA, setFlashA] = useState(false);
  const [flashB, setFlashB] = useState(false);
  const [poseA, setPoseA] = useState('idle');
  const [poseB, setPoseB] = useState('idle');
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [dailyBoard, setDailyBoard] = useState<DailyBoardRow[]>([]);
  const [dailyYou, setDailyYou] = useState<DailyYou | null>(null);
  const [dailyStats, setDailyStats] = useState<{
    players: number;
    clears: number;
  } | null>(null);
  const [pendingChallenge, setPendingChallenge] =
    useState<ChallengeInfo | null>(null);
  const [share, setShare] = useState<{ code: string; url: string } | null>(
    null
  );
  const [shareNote, setShareNote] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [autoNote, setAutoNote] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerFiredRef = useRef(false);

  // 粒子爆发：在画布上画打击火花
  const burstParticles = useCallback((xRatio: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const cx = rect.width * xRatio;
    const cy = rect.height * 0.35;
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      color: string;
      size: number;
    }[] = [];
    const colors = ['#ffb400', '#ff6b00', '#ff4444', '#fff'];
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 4,
      });
    }
    let frames = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.life -= 0.03;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (alive && frames++ < 40) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    tick();
  }, []);

  const triggerScreenShake = useCallback(() => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 400);
  }, []);

  const refreshDaily = useCallback(async () => {
    try {
      const data = await api<{
        daily: DailyInfo;
        leaderboard: DailyBoardRow[];
        you: DailyYou | null;
        stats: { players: number; clears: number };
      }>('daily', undefined, { device_id: getDeviceId() });
      setDaily(data.daily);
      setDailyBoard(data.leaderboard);
      setDailyYou(data.you);
      setDailyStats(data.stats);
    } catch {
      // 数据库未就绪时在本地生成同一套每日残局，保证立即可玩
      setDaily((prev) => prev ?? buildLocalDaily());
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api<{ profile: Profile | null }>(
        'profile',
        undefined,
        { device_id: getDeviceId() }
      );
      setProfile(data.profile);
    } catch {
      // 没有进度时界面自动降级
    }
  }, []);

  // 首屏：拉今日同题 + 今日统计 + 我的进度 + 识别 ?fighter= 预选 + ?c= 挑战链接
  useEffect(() => {
    void refreshDaily();
    void refreshProfile();
    const params = new URLSearchParams(window.location.search);
    const preFighter = params.get('fighter');
    if (
      preFighter &&
      (FIGHTER_ORDER as readonly string[]).includes(preFighter)
    ) {
      const slug = preFighter as FighterSlug;
      setMyFighter(slug);
      setAiFighter(slug === 'viper' ? 'iron_jaw' : 'viper');
    }
    const code = params.get('c');
    if (!code) return;
    let alive = true;
    (async () => {
      try {
        const r = await api<{ challenge: ChallengeInfo }>(
          'challenge',
          undefined,
          { code }
        );
        if (alive) setPendingChallenge(r.challenge);
      } catch {
        if (alive) setError(t('challengeNotFound'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshDaily, refreshProfile, t]);

  // 结算倒计时（距 UTC 零点换题）每分钟刷新一次
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const beginBattle = useCallback(
    (m: MatchState) => {
      setMatch(m);
      setLog([t('fightStart', { a: m.fighter_a_name, b: m.fighter_b_name })]);
      setScreen('battle');
      setShare(null);
      setShareNote('');
      setProgress(null);
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    },
    [t]
  );

  const startLocalBattle = useCallback(
    (
      fighterA: string,
      fighterB: string,
      mode: 'casual' | 'daily',
      start?: StartState,
      seed?: number,
      dayKey?: string
    ) => {
      const st: StartState = start ?? {
        hp_a: 100,
        hp_b: 100,
        stamina_a: 100,
        stamina_b: 100,
        hype_a: 0,
        hype_b: 0,
      };
      localReadRef.current = { a: false, b: false };
      localHistoryRef.current = [];
      localStartRef.current = st;
      setLocalMode(true);
      beginBattle({
        id: `local-${Date.now()}`,
        fighter_a: fighterA,
        fighter_b: fighterB,
        fighter_a_name: fighterName(fighterA),
        fighter_b_name: fighterName(fighterB),
        status: 'active',
        round_no: 0,
        hp_a: st.hp_a,
        hp_b: st.hp_b,
        hype_a: st.hype_a,
        hype_b: st.hype_b,
        stamina_a: st.stamina_a,
        stamina_b: st.stamina_b,
        winner: null,
        mode,
        day_key: dayKey ?? '',
        seed: seed ?? Math.floor(Math.random() * 2147483647),
        challenge_code: '',
      });
    },
    [beginBattle]
  );

  const startMatch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ match: MatchState | null }>('create', {
        fighter: myFighter,
        ai_fighter: aiFighter,
        device_id: getDeviceId(),
      });
      if (!data.match) throw new Error('no match');
      setLocalMode(false);
      beginBattle(data.match);
    } catch {
      // 后端不可用或超时时无缝切到本地引擎，保证立即可玩
      startLocalBattle(myFighter, aiFighter, 'casual');
    } finally {
      setLoading(false);
    }
  }, [myFighter, aiFighter, beginBattle, startLocalBattle]);

  const startDaily = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ match: MatchState | null }>('create', {
        daily: true,
        device_id: getDeviceId(),
      });
      if (!data.match) throw new Error('no match');
      setLocalMode(false);
      beginBattle(data.match);
    } catch {
      const d = daily ?? buildLocalDaily();
      startLocalBattle(
        d.fighter_a,
        d.fighter_b,
        'daily',
        d.start,
        d.seed,
        d.day_key
      );
    } finally {
      setLoading(false);
    }
  }, [beginBattle, daily, startLocalBattle]);

  const acceptChallenge = useCallback(async () => {
    if (!pendingChallenge) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ match: MatchState | null }>('create', {
        challenge_code: pendingChallenge.code,
        device_id: getDeviceId(),
      });
      if (!data.match) throw new Error('no match');
      setPendingChallenge(null);
      beginBattle(data.match);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [pendingChallenge, beginBattle]);

  const dismissChallenge = useCallback(() => {
    setPendingChallenge(null);
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const doMove = useCallback(
    async (move: string) => {
      if (!match || loading || match.status !== 'active') return;
      setLoading(true);
      setError('');
      try {
        let data: {
          round: number;
          move_a: string;
          move_b: string;
          events: string[];
          finisher: string[];
          damageToA: number;
          damageToB: number;
          progress: PlayerProgress | null;
          daily_streak: { days: number; best: number } | null;
          match: MatchState;
        };
        if (localMode) {
          const nextRound = match.round_no + 1;
          const stateA: FighterState = {
            hp: match.hp_a,
            stamina: match.stamina_a,
            hype: match.hype_a,
            read: localReadRef.current.a,
          };
          const stateB: FighterState = {
            hp: match.hp_b,
            stamina: match.stamina_b,
            hype: match.hype_b,
            read: localReadRef.current.b,
          };
          const aiProfile = FIGHTERS[match.fighter_b] ?? FIGHTERS.viper;
          const rand = localMulberry32(
            localHashToInt(`${match.seed}:${nextRound}`)
          );
          const aiMove = chooseAiMove(
            aiProfile,
            localHistoryRef.current.slice(-5),
            stateB,
            stateA,
            rand
          );
          const res = resolveRound(
            stateA,
            stateB,
            move as MoveId,
            aiMove,
            match.fighter_a_name,
            match.fighter_b_name
          );
          localHistoryRef.current.push(move as MoveId);
          localReadRef.current = { a: res.stateA.read, b: res.stateB.read };
          let winner: string | null = res.ko;
          let status = 'active';
          if (res.ko) {
            status = 'finished';
          } else if (nextRound >= MAX_ROUNDS) {
            status = 'finished';
            winner =
              res.stateA.hp > res.stateB.hp
                ? 'A'
                : res.stateB.hp > res.stateA.hp
                  ? 'B'
                  : 'draw';
          }
          data = {
            round: nextRound,
            move_a: move,
            move_b: aiMove,
            events: res.events,
            finisher: res.finisher,
            damageToA: res.damageToA,
            damageToB: res.damageToB,
            progress: null,
            daily_streak: null,
            match: {
              ...match,
              round_no: nextRound,
              hp_a: res.stateA.hp,
              hp_b: res.stateB.hp,
              stamina_a: res.stateA.stamina,
              stamina_b: res.stateB.stamina,
              hype_a: res.stateA.hype,
              hype_b: res.stateB.hype,
              status,
              winner,
            },
          };
        } else {
          const deviceId = getDeviceId();
          data = await api<typeof data>('move', {
            match_id: match.id,
            move,
            device_id: deviceId,
          });
        }
        setMatch(data.match);
        setProgress(data.progress);
        setLog((prev) => [
          ...prev,
          `—— ${t('round')} ${data.round} ——`,
          ...data.events,
        ]);
        // 姿态切换：出招 → 被击 → 回 idle
        const ATK_MOVES = ['jab', 'cross', 'hook', 'uppercut', 'body'];
        const poseFor = (mv: string) =>
          ATK_MOVES.includes(mv)
            ? 'punch'
            : mv === 'block'
              ? 'block'
              : mv === 'taunt'
                ? 'taunt'
                : 'idle';
        const pA = poseFor(data.move_a);
        const pB = poseFor(data.move_b);
        if (pA !== 'idle') setPoseA(pA);
        if (pB !== 'idle') setPoseB(pB);
        if (data.damageToA > 0) setPoseA('hit');
        if (data.damageToB > 0) setPoseB('hit');
        setTimeout(() => {
          setPoseA('idle');
          setPoseB('idle');
        }, 950);
        if (data.damageToA > 0) {
          setHitA(true);
          setDmgA(data.damageToA);
          setFlashA(true);
          triggerScreenShake();
          burstParticles(0.25);
          setTimeout(() => {
            setHitA(false);
            setDmgA(null);
            setFlashA(false);
          }, 900);
        }
        if (data.damageToB > 0) {
          setHitB(true);
          setDmgB(data.damageToB);
          setFlashB(true);
          triggerScreenShake();
          burstParticles(0.75);
          setTimeout(() => {
            setHitB(false);
            setDmgB(null);
            setFlashB(false);
          }, 900);
        }
        if (data.match.status !== 'active') {
          // KO 慢动作：全屏闪 + 定格 + 胜负姿态
          if (data.match.hp_a <= 0 || data.match.hp_b <= 0) {
            setKoFlash(true);
            setPoseA(data.match.hp_a <= 0 ? 'knockdown' : 'victory');
            setPoseB(data.match.hp_b <= 0 ? 'knockdown' : 'victory');
            setTimeout(() => setKoFlash(false), 1500);
          }
          setScreen('result');
          try {
            const lb = await api<{ leaderboard: LeaderRow[] }>('leaderboard');
            setLeaderboard(lb.leaderboard);
          } catch {
            /* leaderboard optional */
          }
          if (data.match.mode === 'daily') void refreshDaily();
          void refreshProfile();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed');
      } finally {
        setLoading(false);
      }
    },
    [
      match,
      loading,
      t,
      triggerScreenShake,
      burstParticles,
      refreshDaily,
      refreshProfile,
      localMode,
    ]
  );

  // 每回合 10 秒读条：超时自动格挡
  useEffect(() => {
    if (screen !== 'battle' || !match || match.status !== 'active' || loading)
      return;
    timerFiredRef.current = false;
    const startedAt = Date.now();
    setTimeLeft(ROUND_SECONDS);
    const id = window.setInterval(() => {
      const left = Math.max(0, ROUND_SECONDS - (Date.now() - startedAt) / 1000);
      setTimeLeft(left);
      if (left <= 0 && !timerFiredRef.current) {
        timerFiredRef.current = true;
        window.clearInterval(id);
        setAutoNote(true);
        window.setTimeout(() => setAutoNote(false), 1400);
        void doMove('block');
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [screen, match, loading, doMove]);

  // 复仇：同拳手、同 AI 种子、同残局重开
  const replay = useCallback(async () => {
    if (!match) return;
    if (localMode) {
      startLocalBattle(
        match.fighter_a,
        match.fighter_b,
        match.mode === 'daily' ? 'daily' : 'casual',
        localStartRef.current ?? undefined,
        match.seed,
        match.day_key
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ match: MatchState | null }>('replay', {
        match_id: match.id,
        device_id: getDeviceId(),
      });
      if (!data.match) throw new Error('no match');
      beginBattle(data.match);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [match, localMode, beginBattle, startLocalBattle]);

  // 分享挑战：把本局残局 + 种子变成 6 位码
  const createShare = useCallback(async () => {
    if (!match) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ code: string }>('challenge', {
        match_id: match.id,
        device_id: getDeviceId(),
      });
      const url = `${window.location.origin}${window.location.pathname}?c=${data.code}`;
      setShare({ code: data.code, url });
      setShareNote(t('shareReady'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [match, t]);

  const copyShare = useCallback(async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setShareNote(t('shareCopied'));
    } catch {
      setShareNote(t('shareManual'));
    }
  }, [share, t]);

  // 键盘操控
  useEffect(() => {
    if (screen !== 'battle') return;
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      let move: string | null = null;
      if (k === 'j') move = 'jab';
      else if (k === 'k') move = 'cross';
      else if (k === 'l') move = 'hook';
      else if (k === 'u') move = 'uppercut';
      else if (k === 'b') move = 'body';
      else if (k === 'i') move = 'block';
      else if (k === 'o') move = 'dodge';
      else if (k === 'd') move = 'duck';
      else if (k === 'f') move = 'feint';
      else if (k === ' ') {
        move = 'taunt';
        e.preventDefault();
      }
      if (move) doMove(move);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, doMove]);

  // 日志自动滚到底
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const moveLabel = (id: string): string => {
    try {
      return t(`moves.${id}` as Parameters<typeof t>[0]);
    } catch {
      return id;
    }
  };

  const modeLabel = (mode: MatchState['mode']): string =>
    mode === 'daily'
      ? t('modeDaily')
      : mode === 'challenge'
        ? t('modeChallenge')
        : t('modeCasual');

  const labelStyle = {
    fontSize: 10,
    letterSpacing: 1,
    color: '#888',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  };

  // 距下一个 UTC 零点（每日换题）的倒计时
  const resetLabel = (() => {
    const now = new Date(clock);
    const next = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    );
    const totalMin = Math.max(0, Math.floor((next - clock) / 60000));
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
  })();

  const dailyClearRate =
    dailyStats && dailyStats.players > 0
      ? Math.round((dailyStats.clears / dailyStats.players) * 100)
      : 0;

  // 结果页三格高光：用现有姿态图拼漫画
  const highlightFrames = (() => {
    if (!match) return [];
    const events = log.filter(
      (line, i) => i > 0 && line && !line.trim().startsWith('——')
    );
    const last = events.slice(-3);
    const winnerSlug = match.winner === 'B' ? match.fighter_b : match.fighter_a;
    return [
      {
        slug: match.fighter_a,
        pose: 'punch',
        caption: last[0] ?? '',
      },
      {
        slug: match.fighter_b,
        pose: 'hit',
        caption: last[1] ?? '',
      },
      {
        slug: match.winner === 'draw' ? match.fighter_a : winnerSlug,
        pose: match.winner === 'draw' ? 'idle' : 'victory',
        caption:
          last[2] ??
          (match.winner === 'draw'
            ? t('draw')
            : `${winnerSlug === match.fighter_a ? match.fighter_a_name : match.fighter_b_name} ${t('wins')}`),
      },
    ];
  })();

  return (
    <div className="brawl-page">
      <style>{`
        @keyframes arena-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-12px) rotate(-2deg); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(4px); }
        }
        .arena-hit { animation: arena-shake 0.45s ease; }
        /* 全屏震屏 */
        @keyframes arena-screen-shake {
          0%,100% { transform: translate(0,0); }
          15% { transform: translate(-8px, 4px); }
          30% { transform: translate(7px, -5px); }
          45% { transform: translate(-5px, -3px); }
          60% { transform: translate(4px, 3px); }
          75% { transform: translate(-2px, 1px); }
        }
        .arena-screen-shake { animation: arena-screen-shake 0.4s ease; }
        /* 被击中红闪 */
        @keyframes arena-red-flash {
          0% { filter: brightness(2.2) sepia(1) hue-rotate(-50deg) saturate(4); }
          100% { filter: none; }
        }
        .arena-red-flash { animation: arena-red-flash 0.5s ease; }
        /* 被击中倾斜 */
        .arena-tilt-hit { transform: rotate(-8deg) scale(0.94); transition: transform 0.15s; }
        @keyframes arena-dmg {
          0% { opacity: 0; transform: translateY(8px) scale(0.8); }
          20% { opacity: 1; transform: translateY(0) scale(1.15); }
          100% { opacity: 0; transform: translateY(-28px) scale(1); }
        }
        .arena-dmg { animation: arena-dmg 0.9s ease forwards; }
        @keyframes arena-hype-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,180,0,.5); }
          50% { box-shadow: 0 0 18px 4px rgba(255,180,0,.8); }
        }
        .arena-finisher-ready { animation: arena-hype-pulse 1.2s infinite; }
        /* KO 慢动作闪屏 */
        @keyframes arena-ko-flash {
          0% { opacity: 0.9; transform: scale(1.3); }
          100% { opacity: 0; transform: scale(1); }
        }
        .arena-ko-flash {
          animation: arena-ko-flash 1.5s ease forwards;
          pointer-events: none;
        }
        /* HP 平滑掉血（更丝滑） */
        .arena-hp-bar { transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
        /* 每日同题卡片 */
        .arena-daily {
          border: 1px solid #4a3a12;
          background: linear-gradient(180deg, #241b06 0%, #161616 100%);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 28px;
        }
        .arena-daily-btn {
          font-size: 16px; font-weight: 800; padding: 12px 28px;
          border-radius: 10px; border: none; background: #ffb400; color: #111;
          cursor: pointer;
        }
        .arena-ghost-btn {
          font-size: 14px; font-weight: 700; padding: 10px 20px;
          border-radius: 10px; border: 1px solid #555; background: transparent;
          color: #ddd; cursor: pointer;
        }
        .arena-cta {
          font-size: 15px; font-weight: 800; padding: 12px 26px;
          border-radius: 10px; border: none; background: #ffb400; color: #111;
          cursor: pointer;
        }
        .arena-cta--ghost {
          background: transparent; color: #ffb400; border: 1px solid #ffb400;
        }
      `}</style>

      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">{t('tagline')}</p>
      </header>

      {error && (
        <div
          style={{
            maxWidth: 720,
            margin: '12px auto',
            padding: '10px 16px',
            background: '#3a1111',
            color: '#ffb4b4',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {screen === 'select' && (
        <section className="brawl-section" style={{ maxWidth: 900 }}>
          {/* 新手 3 步速览：进门即懂怎么打 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 24,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                border: '1px solid #333',
                background: '#141414',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#ffb400',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t('guideStrikeTitle')}
              </div>
              <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
                {t('guideStrikeBody')}
              </div>
            </div>
            <div
              style={{
                border: '1px solid #333',
                background: '#141414',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#39ff6a',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t('guideDefenseTitle')}
              </div>
              <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
                {t('guideDefenseBody')}
              </div>
            </div>
            <div
              style={{
                border: '1px solid #333',
                background: '#141414',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#b47bff',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t('guideMindTitle')}
              </div>
              <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
                {t('guideMindBody')}
              </div>
            </div>
          </div>

          {pendingChallenge && (
            <div className="arena-daily" style={{ borderColor: '#7a2c2c' }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: 1,
                  color: '#ff8888',
                  fontWeight: 800,
                }}
              >
                {t('challengeBanner')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, margin: '6px 0' }}>
                {t('challengeVs', {
                  a: pendingChallenge.fighter_a_name,
                  b: pendingChallenge.fighter_b_name,
                })}
              </div>
              <div style={{ fontSize: 13, color: '#bbb', marginBottom: 12 }}>
                {t('challengeSub')}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                {t('challengeStats', {
                  plays: pendingChallenge.plays,
                  wins: pendingChallenge.wins,
                })}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="arena-daily-btn"
                  onClick={acceptChallenge}
                  disabled={loading}
                >
                  {t('acceptChallenge')}
                </button>
                <button
                  type="button"
                  className="arena-ghost-btn"
                  onClick={dismissChallenge}
                >
                  {t('dismiss')}
                </button>
              </div>
            </div>
          )}

          {daily && (
            <div className="arena-daily">
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: 1,
                  color: '#ffb400',
                  fontWeight: 800,
                }}
              >
                {t('dailyTitle')} · {daily.day_key}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, margin: '6px 0' }}>
                {fighterName(daily.fighter_a)} vs {fighterName(daily.fighter_b)}
              </div>
              <div style={{ fontSize: 13, color: '#bbb', marginBottom: 4 }}>
                {t('dailySub')}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                {t('dailyHpLine', {
                  a: daily.start.hp_a,
                  b: daily.start.hp_b,
                })}{' '}
                · {t('dailySeed', { seed: daily.seed })}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  fontSize: 12,
                  color: '#bbb',
                  marginBottom: 12,
                }}
              >
                <span>
                  {t('dailySocial', {
                    players: dailyStats?.players ?? 0,
                    rate: dailyClearRate,
                  })}
                </span>
                <span style={{ color: '#ffb400' }}>
                  {t('dailyReset', { time: resetLabel })}
                </span>
                {profile?.daily_streak && (
                  <span
                    style={{
                      color:
                        profile.daily_streak.days > 0 &&
                        !profile.daily_streak.played_today
                          ? '#ff7b7b'
                          : '#7bd88f',
                    }}
                  >
                    {profile.daily_streak.played_today
                      ? t('streakDone', { n: profile.daily_streak.days })
                      : profile.daily_streak.days > 0
                        ? t('streakRisk', { n: profile.daily_streak.days })
                        : t('streakStart')}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="arena-daily-btn"
                  onClick={startDaily}
                  disabled={loading}
                >
                  {t('dailyFight')}
                </button>
                <div style={{ fontSize: 12, color: '#bbb' }}>
                  {dailyYou ? (
                    <>
                      <span style={{ color: '#ffb400', fontWeight: 800 }}>
                        {t('dailyRank', { rank: dailyYou.rank })}
                      </span>
                      <span style={{ color: '#888' }}>
                        {' '}
                        ·{' '}
                        {t('dailyLine', {
                          wins: dailyYou.wins,
                          hp: dailyYou.hp_left,
                          rounds: dailyYou.rounds,
                        })}{' '}
                        · {t('attempts', { n: dailyYou.attempts })}
                      </span>
                    </>
                  ) : (
                    t('dailyNone')
                  )}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: '#888',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  {t('dailyLb')}
                </div>
                {dailyBoard.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {t('dailyLbEmpty')}
                  </div>
                ) : (
                  <table
                    style={{
                      width: '100%',
                      fontSize: 12,
                      color: '#ddd',
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr style={{ color: '#888' }}>
                        <th style={{ padding: 4, textAlign: 'left' }}>#</th>
                        <th style={{ padding: 4, textAlign: 'left' }}>
                          {t('winsCol')}
                        </th>
                        <th style={{ padding: 4, textAlign: 'right' }}>HP</th>
                        <th style={{ padding: 4, textAlign: 'right' }}>R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyBoard.slice(0, 5).map((row) => (
                        <tr
                          key={row.rank}
                          style={{
                            borderTop: '1px solid #262626',
                            color: row.is_you ? '#ffb400' : '#ddd',
                          }}
                        >
                          <td style={{ padding: 4 }}>
                            {row.rank}
                            {row.is_you && (
                              <span style={{ fontSize: 10 }}>
                                {' '}
                                {t('youTag')}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: 4 }}>{row.wins}</td>
                          <td style={{ padding: 4, textAlign: 'right' }}>
                            {row.hp_left}
                          </td>
                          <td style={{ padding: 4, textAlign: 'right' }}>
                            {row.rounds}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {profile && (
            <div
              style={{
                border: '1px solid #2a2a2a',
                background: '#141414',
                borderRadius: 14,
                padding: '14px 18px',
                marginBottom: 24,
                display: 'flex',
                gap: 28,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={labelStyle}>{t('profileTitle')}</div>
                <div
                  style={{ fontSize: 26, fontWeight: 900, color: '#ffb400' }}
                >
                  {profile.rating}
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>
                    {t('ratingUnit')}
                  </span>
                </div>
              </div>
              <div>
                <div style={labelStyle}>{t('streakLabel')}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  🔥 {profile.streak}{' '}
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {t('bestStreak', { n: profile.best_streak })}
                  </span>
                </div>
              </div>
              <div>
                <div style={labelStyle}>{t('recentLabel')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {profile.recent.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#666' }}>—</span>
                  ) : (
                    profile.recent.map((r, i) => (
                      <span
                        key={`${r}-${i}`}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          background:
                            r === 'W'
                              ? '#1f3a26'
                              : r === 'L'
                                ? '#3a1f1f'
                                : '#2a2a2a',
                          color:
                            r === 'W'
                              ? '#7bd88f'
                              : r === 'L'
                                ? '#ff7b7b'
                                : '#bbb',
                        }}
                      >
                        {r}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div style={labelStyle}>{t('recordLabel')}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {profile.wins}W · {profile.losses}L
                </div>
              </div>
            </div>
          )}

          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>
            {t('chooseFighter')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {FIGHTER_ORDER.map((slug) => (
              <button
                type="button"
                key={slug}
                onClick={() => setMyFighter(slug)}
                style={{
                  border:
                    myFighter === slug ? '2px solid #ffb400' : '2px solid #333',
                  borderRadius: 12,
                  background: '#141414',
                  padding: 8,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={`/arena/fighters/${slug}.png`}
                  alt={FIGHTER_NAMES[slug]}
                  style={{
                    width: '100%',
                    aspectRatio: '3/4',
                    objectFit: 'cover',
                    borderRadius: 8,
                  }}
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {FIGHTER_NAMES[slug]}
                </div>
              </button>
            ))}
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>
            {t('chooseOpponent')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {FIGHTER_ORDER.map((slug) => (
              <button
                type="button"
                key={slug}
                onClick={() => setAiFighter(slug)}
                style={{
                  border:
                    aiFighter === slug ? '2px solid #ff4444' : '2px solid #333',
                  borderRadius: 12,
                  background: '#141414',
                  padding: 8,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={`/arena/fighters/${slug}.png`}
                  alt={FIGHTER_NAMES[slug]}
                  style={{
                    width: '100%',
                    aspectRatio: '3/4',
                    objectFit: 'cover',
                    borderRadius: 8,
                  }}
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {FIGHTER_NAMES[slug]}
                </div>
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={startMatch}
              disabled={loading}
              style={{
                fontSize: 18,
                fontWeight: 800,
                padding: '14px 48px',
                borderRadius: 12,
                border: 'none',
                background: '#ffb400',
                color: '#111',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? '…' : t('startFight')}
            </button>
          </div>
        </section>
      )}

      {screen === 'battle' && match && (
        <section
          className={`brawl-section${screenShake ? ' arena-screen-shake' : ''}`}
          style={{ maxWidth: 900, position: 'relative' }}
        >
          {/* 打击粒子画布 */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          {/* KO 全屏闪 */}
          {koFlash && (
            <div
              className="arena-ko-flash"
              style={{
                position: 'fixed',
                inset: 0,
                background:
                  'radial-gradient(circle, #fff 0%, #ffb400 40%, transparent 70%)',
                zIndex: 50,
              }}
            />
          )}
          {/* 对战双方 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              marginBottom: 16,
            }}
          >
            {(['A', 'B'] as const).map((tag) => {
              const slug = tag === 'A' ? match.fighter_a : match.fighter_b;
              const name =
                tag === 'A' ? match.fighter_a_name : match.fighter_b_name;
              const hp = tag === 'A' ? match.hp_a : match.hp_b;
              const hype = tag === 'A' ? match.hype_a : match.hype_b;
              const stamina = tag === 'A' ? match.stamina_a : match.stamina_b;
              const hit = tag === 'A' ? hitA : hitB;
              const dmg = tag === 'A' ? dmgA : dmgB;
              const finisherReady = hype >= 100;
              const pose = tag === 'A' ? poseA : poseB;
              const flash = tag === 'A' ? flashA : flashB;
              const imgSrc =
                pose === 'idle'
                  ? `/arena/fighters/${slug}.png`
                  : `/arena/fighters/${slug}_${pose}.png`;
              return (
                <div
                  key={tag}
                  style={{ flex: 1, textAlign: tag === 'A' ? 'left' : 'right' }}
                >
                  <div
                    style={{ position: 'relative', display: 'inline-block' }}
                  >
                    <img
                      src={imgSrc}
                      alt={name}
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (!el.dataset.fbk) {
                          el.dataset.fbk = '1';
                          el.src = `/arena/fighters/${slug}.png`;
                        }
                      }}
                      className={`${hit ? 'arena-hit' : ''}${flash ? ' arena-red-flash arena-tilt-hit' : ''}`}
                      style={{
                        width: 120,
                        height: 160,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: finisherReady
                          ? '3px solid #ffb400'
                          : '2px solid #333',
                      }}
                    />
                    {dmg !== null && (
                      <div
                        className="arena-dmg"
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: 28,
                          fontWeight: 900,
                          color: '#ff4444',
                          textShadow: '0 2px 8px #000',
                        }}
                      >
                        -{dmg}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, color: '#fff', marginTop: 6 }}>
                    {name}{' '}
                    {tag === 'B' && (
                      <span style={{ fontSize: 11, color: '#ff8888' }}>AI</span>
                    )}
                  </div>
                  {/* HP */}
                  <div
                    style={{
                      height: 14,
                      background: '#2a2a2a',
                      borderRadius: 7,
                      overflow: 'hidden',
                      marginTop: 6,
                    }}
                  >
                    <div
                      className="arena-hp-bar"
                      style={{
                        width: `${hp}%`,
                        height: '100%',
                        background:
                          hp > 50 ? '#37c26a' : hp > 25 ? '#ffb400' : '#ff4444',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>HP {hp}/100</div>
                  {/* 人气 */}
                  <div
                    className={finisherReady ? 'arena-finisher-ready' : ''}
                    style={{
                      height: 10,
                      background: '#2a2a2a',
                      borderRadius: 5,
                      overflow: 'hidden',
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        width: `${hype}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg,#ff8800,#ffb400)',
                        transition: 'width .4s',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    🔥 {hype}/100
                    {finisherReady && ` ${t('finisherReady')}`}
                  </div>
                  {/* 体力 */}
                  <div style={{ fontSize: 11, color: '#999' }}>
                    ⚡ {stamina}/100
                  </div>
                </div>
              );
            })}
            <div
              style={{
                alignSelf: 'center',
                fontSize: 28,
                fontWeight: 900,
                color: '#666',
              }}
            >
              VS
              <div style={{ fontSize: 14, color: '#999', marginTop: 4 }}>
                R{match.round_no + 1}
              </div>
            </div>
          </div>

          {/* 10 秒读条：慢一拍就被读穿 */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: timeLeft <= 3 ? '#ff6b6b' : '#999',
                marginBottom: 4,
                letterSpacing: 1,
              }}
            >
              <span>
                {autoNote
                  ? t('autoBlocked')
                  : timeLeft <= 3
                    ? t('decideNow')
                    : t('decideHint')}
              </span>
              <span style={{ fontWeight: 800 }}>{timeLeft.toFixed(1)}s</span>
            </div>
            <div
              style={{
                height: 8,
                background: '#222',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(timeLeft / ROUND_SECONDS) * 100}%`,
                  height: '100%',
                  background:
                    timeLeft <= 3
                      ? '#ff4444'
                      : timeLeft <= 6
                        ? '#ffb400'
                        : '#37c26a',
                  transition: 'width 0.1s linear, background 0.2s',
                }}
              />
            </div>
          </div>

          {/* 招式按钮：按 打击 / 防御 / 心理 区分并标注伤害与体力消耗 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {MOVE_BUTTONS.map((m) => {
              const def = MOVES[m.id as MoveId];
              const lowStamina = match.stamina_a < def.stamina;
              const borderColor =
                m.id === 'feint'
                  ? '2px solid #b47bff'
                  : def.kind === 'defense'
                    ? '1px solid #2b6b3e'
                    : def.kind === 'mind'
                      ? '1px solid #6b4b9c'
                      : '1px solid #5a3a1a';
              const bgColor =
                m.id === 'feint'
                  ? '#241a33'
                  : def.kind === 'defense'
                    ? '#122218'
                    : '#1c1c1c';
              const subHint =
                def.kind === 'strike'
                  ? `${def.damage} DMG · ⚡${def.stamina}`
                  : m.id === 'feint'
                    ? `${t('moveHintFeint')} · ⚡${def.stamina}`
                    : m.id === 'taunt'
                      ? `${t('moveHintTaunt')} · ⚡0`
                      : `${t('moveHintDef')} · ⚡${def.stamina}`;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => doMove(m.id)}
                  disabled={loading}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 10,
                    border: borderColor,
                    background: bgColor,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: lowStamina ? 0.45 : 1,
                    cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  {moveLabel(m.id)}{' '}
                  <span
                    style={{ fontSize: 10, color: '#888', fontWeight: 400 }}
                  >
                    [{m.key}]
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10,
                      color: lowStamina ? '#ff7b7b' : '#aaa',
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {subHint}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              fontSize: 11,
              color: '#888',
            }}
          >
            <span>
              {localMode ? t('localModeBadge') : t('rankedModeBadge')}
            </span>
            <button
              type="button"
              onClick={() => {
                setScreen('select');
                setMatch(null);
                setLog([]);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#999',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {t('leaveMatch')}
            </button>
          </div>

          {/* 战报 */}
          <div
            ref={logRef}
            style={{
              height: 220,
              overflowY: 'auto',
              background: '#101010',
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              lineHeight: 1.7,
              color: '#ddd',
            }}
          >
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#666',
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            {t('keyboardHint')}
          </div>
        </section>
      )}

      {screen === 'result' && match && (
        <section
          className="brawl-section"
          style={{ maxWidth: 760, textAlign: 'center' }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: '#ffb400',
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            {modeLabel(match.mode)} · {t('seedShort', { seed: match.seed })}
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 8 }}>
            {match.winner === 'draw'
              ? t('draw')
              : match.winner === 'A'
                ? `🏆 ${match.fighter_a_name} ${t('wins')}`
                : `🏆 ${match.fighter_b_name} ${t('wins')}`}
          </h2>
          {(match.hp_a <= 0 || match.hp_b <= 0) && match.winner !== 'draw' && (
            <div
              style={{
                display: 'inline-block',
                background: '#ff4444',
                color: '#fff',
                fontWeight: 900,
                padding: '4px 16px',
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              KO
            </div>
          )}

          {/* 进度反馈：段位分 / 连胜 / 连胜被终结 */}
          {progress && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  background: '#1c1c1c',
                  border: '1px solid #333',
                  borderRadius: 999,
                  padding: '6px 14px',
                }}
              >
                {t('ratingLabel')} {progress.rating}{' '}
                <b
                  style={{
                    color: progress.rating_delta > 0 ? '#7bd88f' : '#ff7b7b',
                  }}
                >
                  {progress.rating_delta > 0 ? '+' : ''}
                  {progress.rating_delta}
                </b>
              </span>
              {progress.streak >= 2 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    background: '#3a2a08',
                    border: '1px solid #7a5a12',
                    color: '#ffb400',
                    borderRadius: 999,
                    padding: '6px 14px',
                  }}
                >
                  🔥 {t('streakOn', { n: progress.streak })}
                </span>
              )}
              {progress.streak_broken > 0 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    background: '#3a1111',
                    border: '1px solid #7a2c2c',
                    color: '#ff9b9b',
                    borderRadius: 999,
                    padding: '6px 14px',
                  }}
                >
                  {t('streakBroken', { n: progress.streak_broken })}
                </span>
              )}
            </div>
          )}

          {/* 差一点 / 惨胜：把结果推到情绪边缘 */}
          {match.winner === 'B' && match.hp_b > 0 && match.hp_b <= 15 && (
            <div style={{ fontSize: 13, color: '#ffb400', marginBottom: 6 }}>
              {t('nearMiss', { hp: match.hp_b })}
            </div>
          )}
          {match.winner === 'A' && match.hp_a > 0 && match.hp_a <= 15 && (
            <div style={{ fontSize: 13, color: '#7bd88f', marginBottom: 6 }}>
              {t('closeWin', { hp: match.hp_a })}
            </div>
          )}
          {match.mode === 'daily' &&
            profile?.daily_streak?.played_today &&
            profile.daily_streak.days > 0 && (
              <div style={{ fontSize: 13, color: '#7bd88f', marginBottom: 6 }}>
                {t('dailyStreakNow', { n: profile.daily_streak.days })}
              </div>
            )}

          {/* 三格高光：现有姿态图拼成漫画 */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2,
                color: '#888',
                marginBottom: 10,
              }}
            >
              {t('highlight')}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {highlightFrames.map((f, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  <img
                    src={poseSrc(f.slug, f.pose)}
                    alt={fighterName(f.slug)}
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fbk) {
                        el.dataset.fbk = '1';
                        el.src = poseSrc(f.slug, 'idle');
                      }
                    }}
                    style={{
                      width: '100%',
                      height: 170,
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: '1px solid #333',
                      background: '#141414',
                    }}
                  />
                  <figcaption
                    style={{
                      fontSize: 10,
                      color: '#999',
                      marginTop: 6,
                      lineHeight: 1.45,
                      minHeight: 28,
                    }}
                  >
                    {f.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          <p style={{ color: '#999', fontSize: 14, marginTop: 12 }}>
            {t('rounds', { n: match.round_no })}
          </p>

          <div
            style={{
              margin: '20px 0',
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="arena-cta"
              onClick={replay}
              disabled={loading}
            >
              {t('replay')}
            </button>
            <button
              type="button"
              className="arena-cta arena-cta--ghost"
              onClick={() => {
                setScreen('select');
                setMatch(null);
                setLog([]);
                setShare(null);
                setShareNote('');
              }}
            >
              {t('rematch')}
            </button>
            {!localMode && (
              <button
                type="button"
                className="arena-cta arena-cta--ghost"
                onClick={createShare}
                disabled={loading}
              >
                {t('shareChallenge')}
              </button>
            )}
          </div>

          {!isSignedIn && (
            <div
              style={{
                border: '1px solid #4a3a12',
                background: '#1a1508',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, color: '#e5d4a1' }}>
                {t('guestSaveHint')}
              </span>
              <LocaleLink
                href={Routes.Register}
                className="arena-daily-btn"
                style={{
                  fontSize: 13,
                  padding: '8px 16px',
                  textDecoration: 'none',
                }}
              >
                {t('guestSaveCta')}
              </LocaleLink>
            </div>
          )}

          {share && (
            <div
              style={{
                textAlign: 'left',
                background: '#141414',
                border: '1px solid #333',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ffb400' }}>
                {t('shareCode', { code: share.code })}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  wordBreak: 'break-all',
                  marginTop: 6,
                }}
              >
                {share.url}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="arena-ghost-btn"
                  onClick={copyShare}
                >
                  {t('copyLink')}
                </button>
                <span style={{ fontSize: 12, color: '#37c26a' }}>
                  {shareNote}
                </span>
              </div>
            </div>
          )}

          {match.mode === 'daily' ? (
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <h3 style={{ textAlign: 'center' }}>{t('dailyLb')}</h3>
              {dailyBoard.length === 0 ? (
                <div
                  style={{ textAlign: 'center', fontSize: 13, color: '#666' }}
                >
                  {t('dailyLbEmpty')}
                </div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    fontSize: 13,
                    color: '#ddd',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ color: '#888' }}>
                      <th style={{ padding: 6 }}>#</th>
                      <th style={{ padding: 6 }}>{t('winsCol')}</th>
                      <th style={{ padding: 6 }}>HP</th>
                      <th style={{ padding: 6 }}>R</th>
                      <th style={{ padding: 6 }}>{t('attemptsCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyBoard.map((row) => (
                      <tr
                        key={row.rank}
                        style={{
                          borderTop: '1px solid #222',
                          color: row.is_you ? '#ffb400' : '#ddd',
                        }}
                      >
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {row.rank}
                          {row.is_you && (
                            <span style={{ fontSize: 10 }}> {t('youTag')}</span>
                          )}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {row.wins}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {row.hp_left}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {row.rounds}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {row.attempts}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            leaderboard.length > 0 && (
              <div style={{ marginTop: 24, textAlign: 'left' }}>
                <h3 style={{ textAlign: 'center' }}>{t('leaderboard')}</h3>
                <table
                  style={{
                    width: '100%',
                    fontSize: 13,
                    color: '#ddd',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ color: '#888' }}>
                      <th style={{ padding: 6 }}>#</th>
                      <th style={{ padding: 6 }}>{t('player')}</th>
                      <th style={{ padding: 6 }}>{t('winsCol')}</th>
                      <th style={{ padding: 6 }}>{t('lossesCol')}</th>
                      <th style={{ padding: 6 }}>KO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((r, i) => (
                      <tr
                        key={r.player}
                        style={{ borderTop: '1px solid #222' }}
                      >
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: 6 }}>
                          {r.player.startsWith('u:')
                            ? t('fighterAnon', { n: i + 1 })
                            : r.player.slice(0, 8) + '…'}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {r.wins}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {r.losses}
                        </td>
                        <td style={{ padding: 6, textAlign: 'center' }}>
                          {r.kos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}
