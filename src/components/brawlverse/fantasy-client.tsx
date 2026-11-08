'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';

const FIGHTERS = [
  'IRON JAW',
  'VIPER',
  'SLEDGE',
  'MONSOON',
  'VOLT',
  'THE PROFESSOR',
  'GOLIATH-7',
  'LA REINA',
];

type MyTeam = { team_name: string; picks: string[] } | null;

type LeaderRow = {
  rank: number;
  team_name: string;
  player: string;
  picks: string[];
  score: number;
};

export default function FantasyClient() {
  const t = useTranslations('Brawlverse.fantasy');
  const [team, setTeam] = useState<MyTeam>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = deviceId();
    try {
      const [mr, br] = await Promise.all([
        fetch(`/api/fantasy?op=my&device_id=${encodeURIComponent(me)}`),
        fetch('/api/fantasy?op=leaderboard'),
      ]);
      const m = (await mr.json()) as { team?: MyTeam };
      const b = (await br.json()) as { leaderboard?: LeaderRow[] };
      setTeam(m.team ?? null);
      if (m.team) {
        setPicks(m.team.picks ?? []);
        setName(m.team.team_name);
      }
      setBoard(b.leaderboard ?? []);
    } catch {
      setErr(t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(f: string) {
    setPicks((p) => {
      if (p.includes(f)) return p.filter((x) => x !== f);
      if (p.length >= 3) return p;
      return [...p, f];
    });
    setMsg('');
  }

  async function createTeam() {
    const n = name.trim();
    if (!n) {
      setErr(t('createFirst'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/fantasy?op=teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId(), team_name: n }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(t('teamFailed', { error: j.error || r.status }));
        return;
      }
      setMsg(t('teamCreated'));
      await load();
    } catch {
      setErr(t('networkErr'));
    } finally {
      setBusy(false);
    }
  }

  async function savePicks() {
    if (picks.length !== 3) {
      setErr(t('mustPickThree'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/fantasy?op=picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId(), picks }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(t('picksFailed', { error: j.error || r.status }));
        return;
      }
      setMsg(t('picksSaved'));
      await load();
    } catch {
      setErr(t('networkErr'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="brawl-section">
        <h2 className="brawl-h2">{t('stableTitle')}</h2>
        <div className="brawl-panel">
          {team ? (
            <>
              <h3>{team.team_name}</h3>
              <p className="brawl-note">
                {t('currentTeam')}:{' '}
                {team.picks.length ? team.picks.join(' · ') : t('emptyPicks')}
              </p>
            </>
          ) : (
            <>
              <h3>{t('createFirst')}</h3>
              <p>{t('createFirstBody')}</p>
              <div className="brawl-row brawl-gap">
                <input
                  className="brawl-field"
                  maxLength={40}
                  placeholder={t('teamPlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  className="brawl-btn"
                  onClick={() => void createTeam()}
                  disabled={busy}
                >
                  {t('createTeam')}
                </button>
              </div>
            </>
          )}

          {team ? (
            <>
              <div className="brawl-chips">
                {FIGHTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`brawl-chip${picks.includes(f) ? ' is-on' : ''}`}
                    onClick={() => toggle(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="brawl-row brawl-gap">
                <button
                  type="button"
                  className="brawl-btn"
                  onClick={() => void savePicks()}
                  disabled={busy || picks.length !== 3}
                >
                  {t('savePicks', { count: picks.length })}
                </button>
                <span className="brawl-note">{t('scoring')}</span>
              </div>
            </>
          ) : null}

          {msg ? <p className="brawl-ok">{msg}</p> : null}
          {err ? <p className="brawl-warn">{err}</p> : null}
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('leaderboardTitle')}</h2>
        {board.length === 0 ? (
          <p className="brawl-note">{t('noTeams')}</p>
        ) : (
          <table className="brawl-standings">
            <tbody>
              <tr>
                <th>#</th>
                <th>{t('team')}</th>
                <th>{t('picks')}</th>
                <th>{t('pts')}</th>
              </tr>
              {board.map((b) => (
                <tr key={b.team_name + b.player}>
                  <td>{b.rank}</td>
                  <td>
                    {b.team_name}
                    <span className="brawl-pool"> · {b.player}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{b.picks.join(', ')}</td>
                  <td>{b.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="brawl-note">{t('leaderboardNote')}</p>
      </section>
    </>
  );
}
