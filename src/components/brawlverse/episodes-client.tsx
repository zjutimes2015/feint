'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';
import Turnstile from '@/components/brawlverse/turnstile';
import { LocaleLink } from '@/i18n/navigation';

type DanmakuInstance = { emit: (opts: { text: string }) => void };
type DanmakuCtor = new (opts: { container: HTMLElement }) => DanmakuInstance;

type Caption = { id: number; text: string; nickname: string };
type Pinned = { text: string; nickname: string };
type Tally = { heavy: number; dodge: number; guard: number };
type TallyResponse = { tally?: Partial<Tally>; total?: number };
type Bout = { id: string; tactic_note?: string };
type FighterRecord = {
  fighter: string;
  wins: number;
  losses: number;
  kos: number;
};

const BOUT_ID = 'qf1';
const ROUND_NO = 2;
const K = 'bv_tactics';
const FIGHTERS = [
  'IRON JAW',
  'VIPER',
  'VOLT',
  'GOLIATH-7',
  'LA REINA',
  'SLEDGE',
  'MONSOON',
  'THE PROFESSOR',
];

function readLocalTally(): Tally {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return { heavy: 0, dodge: 0, guard: 0 };
    const v = JSON.parse(raw) as Partial<Tally> | null;
    return {
      heavy: Number(v?.heavy) || 0,
      dodge: Number(v?.dodge) || 0,
      guard: Number(v?.guard) || 0,
    };
  } catch {
    return { heavy: 0, dodge: 0, guard: 0 };
  }
}

export default function EpisodesClient() {
  const t = useTranslations('Brawlverse.episodes');
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [danmakuOn, setDanmakuOn] = useState(false);
  const [nick, setNick] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [tally, setTally] = useState<Tally>({ heavy: 0, dodge: 0, guard: 0 });
  const [tacticNote, setTacticNote] = useState('');
  const [records, setRecords] = useState<Record<string, FighterRecord>>({});
  const [capToken, setCapToken] = useState('');
  const [capReset, setCapReset] = useState(0);
  const [voteToken, setVoteToken] = useState('');
  const [voteReset, setVoteReset] = useState(0);

  const danmakuRef = useRef<DanmakuInstance | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const sinceIdRef = useRef(0);

  // Load danmaku.min.js on the client only; silently disable the fan box when it is unavailable.
  useEffect(() => {
    let cancelled = false;

    const boot = () => {
      if (cancelled) return;
      const Ctor = (window as unknown as { Danmaku?: DanmakuCtor }).Danmaku;
      if (typeof Ctor === 'undefined' || !layerRef.current) return;
      danmakuRef.current = new Ctor({ container: layerRef.current });
      setDanmakuOn(true);
    };

    if (
      typeof (window as unknown as { Danmaku?: DanmakuCtor }).Danmaku !==
      'undefined'
    ) {
      boot();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>(
      'script[data-bv-danmaku]'
    );
    if (!script) {
      script = document.createElement('script');
      script.src = '/brawlverse/assets/danmaku.min.js';
      script.async = true;
      script.dataset.bvDanmaku = '1';
      document.body.appendChild(script);
    }
    script.addEventListener('load', boot);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', boot);
    };
  }, []);

  // Poll feed + pinned once the danmaku layer is live.
  useEffect(() => {
    if (!danmakuOn) return;
    const danmaku = danmakuRef.current;
    if (!danmaku) return;
    let cancelled = false;

    const pollFeed = async () => {
      try {
        const r = await fetch(
          `/api/captions?op=feed&since_id=${sinceIdRef.current}`
        );
        const j = (await r.json()) as { captions?: Caption[] };
        if (cancelled) return;
        for (const c of j.captions ?? []) {
          danmaku.emit({ text: `${c.nickname}: ${c.text}` });
          if (c.id > sinceIdRef.current) sinceIdRef.current = c.id;
        }
      } catch {
        // legacy silently ignored network errors
      }
    };

    const pollPinned = async () => {
      try {
        const r = await fetch('/api/captions?op=pinned');
        const j = (await r.json()) as { pinned?: Pinned | null };
        if (cancelled) return;
        setPinned(j.pinned ?? null);
      } catch {
        // legacy silently ignored network errors
      }
    };

    void pollFeed();
    void pollPinned();
    const t1 = window.setInterval(pollFeed, 10000);
    const t2 = window.setInterval(pollPinned, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
  }, [danmakuOn]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/votes?op=tally&bout_id=${BOUT_ID}&round_no=${ROUND_NO}`
      );
      const j = (await r.json()) as TallyResponse;
      setTally({
        heavy: Number(j.tally?.heavy) || 0,
        dodge: Number(j.tally?.dodge) || 0,
        guard: Number(j.tally?.guard) || 0,
      });
      const b = (await fetch('/api/bouts').then((res) => res.json())) as Bout[];
      const bout = (b || []).find((x) => x.id === BOUT_ID);
      const note = bout?.tactic_note;
      setTacticNote(note ? `${t('tacticNotePrefix')}${note}` : '');
    } catch {
      setTally(readLocalTally());
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // 战绩由结算真实写入,没有记录就显示 0-0
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/betting?op=records');
        const j = (await r.json()) as { records?: FighterRecord[] };
        const map: Record<string, FighterRecord> = {};
        for (const x of j.records ?? []) map[x.fighter.toUpperCase()] = x;
        setRecords(map);
      } catch {
        // 网络异常时保持 0-0
      }
    })();
  }, []);

  async function vote(k: keyof Tally) {
    try {
      const r = await fetch('/api/votes?op=cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bout_id: BOUT_ID,
          round_no: ROUND_NO,
          choice: k,
          device_id: deviceId(),
          turnstile_token: voteToken,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    } catch {
      const v = readLocalTally();
      v[k]++;
      localStorage.setItem(K, JSON.stringify(v));
    }
    setVoteToken('');
    setVoteReset((n) => n + 1);
    await refresh();
  }

  async function sendCaption() {
    const body = text.trim();
    if (!body) {
      setMsg(t('emptyText'));
      return;
    }
    try {
      const r = await fetch('/api/captions?op=post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          nickname: nick.trim(),
          device_id: deviceId(),
          turnstile_token: capToken,
        }),
      });
      const j = (await r.json()) as { msg?: string };
      setMsg(j.msg || (r.ok ? t('sent') : t('sendFailed')));
      if (r.ok) setText('');
      setCapToken('');
      setCapReset((n) => n + 1);
    } catch {
      setMsg(t('networkErr'));
    }
  }

  const total = tally.heavy + tally.dodge + tally.guard || 1;
  const upcoming = t.raw('upcoming') as {
    q: string;
    title: string;
    style: string;
  }[];

  return (
    <>
      <section className="brawl-section">
        <h2 className="brawl-h2">{t('sampleTitle')}</h2>
        {pinned ? (
          <div className="brawl-pinned">
            <span className="brawl-fire">{t('pinnedBadge')}</span>
            <span>{pinned.text}</span>
            <span className="brawl-nick">— {pinned.nickname}</span>
          </div>
        ) : null}
        <div className="brawl-videowrap">
          <video
            className="brawl-video"
            controls
            preload="metadata"
            poster="/brawlverse/assets/viper-portrait.jpg"
          >
            <source
              src="/brawlverse/brawlverse-sample-ep0.mp4"
              type="video/mp4"
            />
            <track
              default
              kind="captions"
              label="English"
              src="/brawlverse/ep0.vtt"
              srcLang="en"
            />
          </video>
          <div
            id="danmaku-layer"
            className="brawl-danmaku-layer"
            ref={layerRef}
          />
        </div>
        {danmakuOn ? (
          <div className="brawl-fanbox">
            <input
              id="fan-nick"
              maxLength={12}
              placeholder={t('nickPlaceholder')}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
            />
            <input
              id="fan-text"
              maxLength={40}
              placeholder={t('textPlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              id="fan-send"
              type="button"
              onClick={() => void sendCaption()}
            >
              {t('send')}
            </button>
            <span id="fan-msg" className="brawl-note">
              {msg}
            </span>
            <Turnstile onToken={setCapToken} resetKey={capReset} />
          </div>
        ) : null}
        <div className="brawl-rulevote" style={{ marginTop: 22 }}>
          <h3>{t('tacticsTitle')}</h3>
          {tacticNote ? (
            <p style={{ color: '#ffcc00', fontSize: 14 }}>{tacticNote}</p>
          ) : null}
          <div className="brawl-rv-buttons">
            <button
              id="tHeavy"
              type="button"
              onClick={() => void vote('heavy')}
            >
              {t('heavy')}
              <br />
              <small>{t('heavyHint')}</small>
            </button>
            <button
              id="tDodge"
              type="button"
              onClick={() => void vote('dodge')}
            >
              {t('dodge')}
              <br />
              <small>{t('dodgeHint')}</small>
            </button>
            <button
              id="tGuard"
              type="button"
              onClick={() => void vote('guard')}
            >
              {t('guard')}
              <br />
              <small>{t('guardHint')}</small>
            </button>
          </div>
          <div className="brawl-rv-bars">
            <div className="brawl-rv-row">
              <span>{t('heavy')}</span>
              <div className="brawl-bar">
                <div
                  id="bHeavy"
                  className="is-rage"
                  style={{ width: `${(tally.heavy / total) * 100}%` }}
                />
              </div>
              <b id="nHeavy">{tally.heavy}</b>
            </div>
            <div className="brawl-rv-row">
              <span>{t('dodge')}</span>
              <div className="brawl-bar">
                <div
                  id="bDodge"
                  className="is-fair"
                  style={{ width: `${(tally.dodge / total) * 100}%` }}
                />
              </div>
              <b id="nDodge">{tally.dodge}</b>
            </div>
            <div className="brawl-rv-row">
              <span>{t('guard')}</span>
              <div className="brawl-bar">
                <div
                  id="bGuard"
                  className="is-rage"
                  style={{ width: `${(tally.guard / total) * 100}%` }}
                />
              </div>
              <b id="nGuard">{tally.guard}</b>
            </div>
          </div>
          <p className="brawl-note">{t('tacticsNote')}</p>
          <Turnstile onToken={setVoteToken} resetKey={voteReset} />
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('upcomingTitle')}</h2>
        <p
          className="brawl-note"
          style={{ textAlign: 'center', marginBottom: 14 }}
        >
          <LocaleLink href="/storylines" style={{ color: '#ffcc00' }}>
            {t('readFeuds')}
          </LocaleLink>
        </p>
        <div className="brawl-cards">
          {upcoming.map((u) => (
            <div className="brawl-card brawl-card--locked" key={u.q}>
              <div className="brawl-q">{u.q}</div>
              <h3>{u.title}</h3>
              <p className="brawl-style">{u.style}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('standingsTitle')}</h2>
        <table className="brawl-standings">
          <tbody>
            <tr>
              <th>Fighter</th>
              <th>W</th>
              <th>L</th>
              <th>KO</th>
            </tr>
            {FIGHTERS.map((f) => {
              const r = records[f];
              return (
                <tr key={f}>
                  <td>{f}</td>
                  <td>{r?.wins ?? 0}</td>
                  <td>{r?.losses ?? 0}</td>
                  <td>{r?.kos ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="brawl-note">{t('standingsNote')}</p>
      </section>
    </>
  );
}
