'use client';

import { LocaleLink } from '@/i18n/navigation';
import { Routes } from '@/routes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Tally = { rage: number; fair: number };

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

export default function StorylineVoteResult() {
  const t = useTranslations('Brawlverse.storylines');
  const [tally, setTally] = useState<Tally>({ rage: 0, fair: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch('/api/votes?op=tally&bout_id=ex1&round_no=1', {
          cache: 'no-store',
        });
        if (r.ok) {
          const j = (await r.json()) as { tally?: Partial<Tally> };
          if (alive) {
            setTally({
              rage: Number(j.tally?.rage) || 0,
              fair: Number(j.tally?.fair) || 0,
            });
          }
        }
      } catch {
        // 拉取失败时保留 0,页面仍有空态文案
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const total = tally.rage + tally.fair;

  return (
    <section className="brawl-section">
      <div className="brawl-panel">
        <h3>{t('liveResultTitle')}</h3>
        <p>{t('liveResultSub')}</p>
        {ready && total === 0 ? <p>{t('liveResultEmpty')}</p> : null}
        {total > 0 ? (
          <>
            <div className="brawl-rv-bars brawl-gap">
              <div className="brawl-rv-row">
                <span>{t('liveRage')}</span>
                <div className="brawl-bar">
                  <div
                    className="is-rage"
                    style={{ width: `${pct(tally.rage, total)}%` }}
                  />
                </div>
                <b>{pct(tally.rage, total)}%</b>
              </div>
              <div className="brawl-rv-row">
                <span>{t('liveFair')}</span>
                <div className="brawl-bar">
                  <div
                    className="is-fair"
                    style={{ width: `${pct(tally.fair, total)}%` }}
                  />
                </div>
                <b>{pct(tally.fair, total)}%</b>
              </div>
            </div>
            <p>{t('liveResultTotal', { count: total })}</p>
          </>
        ) : null}
        <div className="brawl-row brawl-gap">
          <LocaleLink href={Routes.Live} className="brawl-cta">
            {t('liveResultCta')}
          </LocaleLink>
        </div>
      </div>
    </section>
  );
}
