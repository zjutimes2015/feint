'use client';

import { LocaleLink } from '@/i18n/navigation';
import { Routes } from '@/routes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type LiveState = {
  state?: string;
  seconds_left?: number;
  round_no?: number;
  fighter_a?: string;
  fighter_b?: string;
};

function clock(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export default function HomeNextEvent() {
  const t = useTranslations('Brawlverse.home');
  const [live, setLive] = useState<LiveState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch('/api/live?op=state', { cache: 'no-store' });
        if (r.ok) {
          const j = (await r.json()) as LiveState;
          if (alive) setLive(j);
        }
      } catch {
        // 没有直播回合时走固定档期文案
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (live?.state !== 'VOTING') return;
    const timer = window.setInterval(() => {
      setLive((prev) =>
        prev
          ? { ...prev, seconds_left: Math.max(0, (prev.seconds_left ?? 0) - 1) }
          : prev
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [live?.state]);

  const isLive = live?.state === 'VOTING';
  const isReveal = live?.state === 'REVEAL' || live?.state === 'done';
  const round = live?.round_no ?? 1;

  let status = t('nextEventIdle');
  if (!ready) status = t('nextEventStarting');
  else if (isLive) status = t('nextEventLive', { round });
  else if (isReveal) status = t('nextEventReveal', { round });

  return (
    <section className="brawl-section">
      <div className="brawl-panel">
        <h3>{t('nextEventTitle')}</h3>
        <p>{status}</p>
        {(isLive || isReveal) && live?.fighter_a && live?.fighter_b ? (
          <p className="brawl-gap">
            {t('nextEventFighters', {
              a: live.fighter_a,
              b: live.fighter_b,
            })}
            {isLive ? ` · ${clock(live.seconds_left ?? 0)}` : ''}
          </p>
        ) : null}
        <div className="brawl-row brawl-gap">
          <LocaleLink href={Routes.Live} className="brawl-cta">
            {t('nextEventCta')}
          </LocaleLink>
        </div>
      </div>
    </section>
  );
}
