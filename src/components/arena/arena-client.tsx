'use client';

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
}

interface LeaderRow {
  player: string;
  wins: number;
  losses: number;
  kos: number;
}

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

async function api<T>(op: string, body?: Record<string, unknown>): Promise<T> {
  const url = `/api/arena?op=${op}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `request failed: ${res.status}`);
  }
  return data;
}

type Screen = 'select' | 'battle' | 'result';

export default function ArenaClient() {
  const t = useTranslations('Arena');
  const [screen, setScreen] = useState<Screen>('select');
  const [myFighter, setMyFighter] = useState<FighterSlug>('iron_jaw');
  const [aiFighter, setAiFighter] = useState<FighterSlug>('viper');
  const [match, setMatch] = useState<MatchState | null>(null);
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
  const logRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const startMatch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const deviceId = getDeviceId();
      const data = await api<{ match: MatchState }>('create', {
        fighter: myFighter,
        ai_fighter: aiFighter,
        device_id: deviceId,
      });
      setMatch(data.match);
      setLog([
        t('fightStart', {
          a: data.match.fighter_a_name,
          b: data.match.fighter_b_name,
        }),
      ]);
      setScreen('battle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [myFighter, aiFighter, t]);

  const doMove = useCallback(
    async (move: string) => {
      if (!match || loading || match.status !== 'active') return;
      setLoading(true);
      setError('');
      try {
        const deviceId = getDeviceId();
        const data = await api<{
          round: number;
          move_a: string;
          move_b: string;
          events: string[];
          finisher: string[];
          damageToA: number;
          damageToB: number;
          match: MatchState;
        }>('move', { match_id: match.id, move, device_id: deviceId });
        setMatch(data.match);
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
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed');
      } finally {
        setLoading(false);
      }
    },
    [match, loading, t]
  );

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

          {/* 招式按钮 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {MOVE_BUTTONS.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => doMove(m.id)}
                disabled={loading}
                style={{
                  padding: '10px 4px',
                  borderRadius: 10,
                  border:
                    m.id === 'feint' ? '2px solid #b47bff' : '1px solid #444',
                  background: m.id === 'feint' ? '#241a33' : '#1c1c1c',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {moveLabel(m.id)}
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: '#888',
                    fontWeight: 400,
                  }}
                >
                  [{m.key}]
                </span>
              </button>
            ))}
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
          style={{ maxWidth: 720, textAlign: 'center' }}
        >
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
          {match.winner !== 'draw' && (
            <div style={{ margin: '12px 0' }}>
              <img
                src={`/arena/fighters/${match.winner === 'A' ? match.fighter_a : match.fighter_b}_victory.png`}
                alt="winner"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.fbk) {
                    el.dataset.fbk = '1';
                    el.src = `/arena/fighters/${match.winner === 'A' ? match.fighter_a : match.fighter_b}.png`;
                  }
                }}
                style={{
                  width: 200,
                  height: 260,
                  objectFit: 'cover',
                  borderRadius: 12,
                  border: '2px solid #ffb400',
                }}
              />
            </div>
          )}
          <p style={{ color: '#999', fontSize: 14 }}>
            {t('rounds', { n: match.round_no })}
          </p>

          <div style={{ margin: '20px 0' }}>
            <button
              type="button"
              onClick={() => {
                setScreen('select');
                setMatch(null);
                setLog([]);
              }}
              style={{
                fontSize: 16,
                fontWeight: 800,
                padding: '12px 36px',
                borderRadius: 10,
                border: 'none',
                background: '#ffb400',
                color: '#111',
                cursor: 'pointer',
                marginRight: 12,
              }}
            >
              {t('rematch')}
            </button>
          </div>

          {leaderboard.length > 0 && (
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
                    <tr key={r.player} style={{ borderTop: '1px solid #222' }}>
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
          )}
        </section>
      )}
    </div>
  );
}
