'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';
import { LocaleLink } from '@/i18n/navigation';

type LiveResult = {
  total: number;
  pct_a: number;
  pct_b: number;
  winning_pct: number;
};

type LiveState = {
  id: string;
  bout_id: string;
  round_no: number;
  tactic_a: string;
  tactic_b: string;
  state: string;
  seconds_left: number;
  winning_branch: string;
  video_url: string;
  tally?: Record<string, number>;
  result?: LiveResult;
  schedule?: { every: string; next_at: string; seconds_left: number };
  fighter_a?: string;
  fighter_b?: string;
  title?: string;
};

function mmss(s: number): string {
  const sec = Math.max(0, Math.trunc(s));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export default function LiveClient() {
  const t = useTranslations('Brawlverse.live');
  const [state, setState] = useState<LiveState | null>(null);
  const [noRound, setNoRound] = useState(false);
  const [secs, setSecs] = useState(0);
  const [voted, setVoted] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live?op=state', { cache: 'no-store' });
      if (r.status === 404) {
        setNoRound(true);
        setState(null);
        return;
      }
      const j = (await r.json()) as LiveState;
      setNoRound(false);
      setState(j);
      setSecs(Number(j.seconds_left) || 0);
    } catch {
      setErr(t('connectFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 5000);
    const tick = window.setInterval(
      () => setSecs((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  async function vote(choice: string) {
    if (!state) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await fetch('/api/live?op=vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: state.id,
          choice,
          device_id: deviceId(),
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(
          j.error === 'voting is not open for this round'
            ? t('voteClosed')
            : t('voteFailed', { error: j.error || r.status })
        );
        await load();
        return;
      }
      setVoted(choice);
      setMsg(t('voted'));
      await load();
    } catch {
      setErr(t('networkErr'));
    } finally {
      setBusy(false);
    }
  }

  const tally = state?.tally ?? {};
  const wa = Number(tally[state?.tactic_a ?? ''] || 0);
  const wb = Number(tally[state?.tactic_b ?? ''] || 0);
  const total = wa + wb;
  const pctA = total ? Math.round((wa / total) * 100) : 0;
  const pctB = total ? 100 - pctA : 0;
  const isVoting = state?.state === 'VOTING' && secs > 0;
  const isReveal = state?.state === 'REVEAL' || state?.state === 'done';
  const winnerTactic =
    state && state.winning_branch === 'a'
      ? state.tactic_a
      : state?.winning_branch === 'b'
        ? state.tactic_b
        : '';

  return (
    <section className="brawl-section">
      {noRound ? (
        <div className="brawl-panel">
          <h3>{t('noRound')}</h3>
          <p>{t('noRoundBody')}</p>
        </div>
      ) : state ? (
        <>
          <h2 className="brawl-h2">
            {state.title || state.bout_id} · ROUND {state.round_no}
            <span className="brawl-tag">{state.state}</span>
          </h2>
          <div className="brawl-panel">
            <h3>
              {state.fighter_a || 'FIGHTER A'} vs{' '}
              {state.fighter_b || 'FIGHTER B'}
            </h3>

            {isVoting ? (
              <div className="brawl-countdown">⏱ {mmss(secs)}</div>
            ) : null}

            <div className="brawl-rv-bars">
              <div className="brawl-rv-row">
                <span style={{ width: 110, textAlign: 'left' }}>
                  {state.tactic_a}
                </span>
                <div className="brawl-bar">
                  <div
                    className="is-rage"
                    style={{ width: `${total ? (wa / total) * 100 : 0}%` }}
                  />
                </div>
                <b>{pctA}%</b>
              </div>
              <div className="brawl-rv-row">
                <span style={{ width: 110, textAlign: 'left' }}>
                  {state.tactic_b}
                </span>
                <div className="brawl-bar">
                  <div
                    className="is-fair"
                    style={{ width: `${total ? (wb / total) * 100 : 0}%` }}
                  />
                </div>
                <b>{pctB}%</b>
              </div>
            </div>

            {isVoting ? (
              <div className="brawl-rv-buttons" style={{ marginTop: 16 }}>
                <button
                  id="voteRage"
                  type="button"
                  className="is-rage"
                  onClick={() => void vote(state.tactic_a)}
                  disabled={busy}
                >
                  {state.tactic_a}
                  <br />
                  <small>{t('optionA')}</small>
                </button>
                <button
                  id="voteFair"
                  type="button"
                  className="is-fair"
                  onClick={() => void vote(state.tactic_b)}
                  disabled={busy}
                >
                  {state.tactic_b}
                  <br />
                  <small>{t('optionB')}</small>
                </button>
              </div>
            ) : null}

            {voted ? (
              <p className="brawl-ok">
                {t('yourChoice')}: {voted}
              </p>
            ) : null}
            {msg ? <p className="brawl-ok">{msg}</p> : null}
            {err ? <p className="brawl-warn">{err}</p> : null}

            {state.state === 'LOCKED' ||
            (state.state === 'VOTING' && secs === 0) ? (
              <p className="brawl-warn">{t('closed')}</p>
            ) : null}

            {isReveal ? (
              <div className="brawl-gap">
                <p className="brawl-ok">
                  {t('revealResult')}: {winnerTactic || t('noWinner')}{' '}
                  {t('winner', {
                    branch: state.winning_branch.toUpperCase() || '?',
                  })}
                </p>
                {state.result && state.result.total > 0 ? (
                  <p className="brawl-ok">
                    {t('winningShare', { pct: state.result.winning_pct })}
                  </p>
                ) : null}
                {state.video_url ? (
                  // biome-ignore lint/a11y/useMediaCaption: 分支视频由管理员上传,字幕文件随视频另行提供
                  <video
                    className="brawl-video"
                    controls
                    preload="metadata"
                    style={{ borderColor: '#ff3333' }}
                  >
                    <source src={state.video_url} type="video/mp4" />
                  </video>
                ) : (
                  <p className="brawl-warn">{t('videoMissing')}</p>
                )}
              </div>
            ) : null}

            {state.state === 'scheduled' ? (
              <p className="brawl-note">{t('scheduled')}</p>
            ) : null}
            {state.schedule ? (
              <p className="brawl-note">
                {t('nextFightNight')}: {state.schedule.every}
              </p>
            ) : null}
            <p className="brawl-note">{t('pollNote')}</p>
            {/* P1-7:把投票权重和会员权益挂上,商业入口长在玩法里而不是单独一张价目表 */}
            <p className="brawl-note">
              {t('ticketsCta')}{' '}
              <LocaleLink href="/tickets" className="brawl-link">
                {t('ticketsLink')}
              </LocaleLink>
            </p>
          </div>
        </>
      ) : (
        <p className="brawl-note">{t('connecting')}</p>
      )}
    </section>
  );
}
