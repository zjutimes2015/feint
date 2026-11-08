'use client';

import { LocaleLink } from '@/i18n/navigation';
import { FIGHTER_SLUG_BY_KEY } from '@/lib/brawlverse/seo';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type RawRecord = { fighter: string; wins: number; losses: number; kos: number };
type RecordMap = Record<string, RawRecord>;

type FighterKey =
  | 'ironJaw'
  | 'viper'
  | 'volt'
  | 'goliath7'
  | 'laReina'
  | 'sledge'
  | 'monsoon'
  | 'professor';

const FIGHTERS: { key: FighterKey; color: string; img: string }[] = [
  {
    key: 'ironJaw',
    color: 'red',
    img: '/brawlverse/assets/iron-jaw-portrait.jpg',
  },
  {
    key: 'viper',
    color: 'green',
    img: '/brawlverse/assets/viper-portrait.jpg',
  },
  { key: 'volt', color: 'gold', img: '/brawlverse/assets/fan-volt.jpg' },
  {
    key: 'goliath7',
    color: 'gold',
    img: '/brawlverse/assets/fan-goliath7.jpg',
  },
  { key: 'laReina', color: 'gold', img: '/brawlverse/assets/fan-lareina.jpg' },
  {
    key: 'sledge',
    color: 'orange',
    img: '/brawlverse/assets/fighter-sledge.jpg',
  },
  {
    key: 'monsoon',
    color: 'cyan',
    img: '/brawlverse/assets/fighter-monsoon.jpg',
  },
  {
    key: 'professor',
    color: 'purple',
    img: '/brawlverse/assets/fighter-professor.jpg',
  },
];

export default function FightersGrid() {
  const t = useTranslations('Brawlverse.fighters');
  const [records, setRecords] = useState<RecordMap>({});

  // Legacy ledger: every settled bout permanently writes W-L-KO here.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/betting?op=records');
        const j = (await r.json()) as { records?: RawRecord[] };
        const map: RecordMap = {};
        for (const x of j.records ?? []) map[x.fighter.toUpperCase()] = x;
        setRecords(map);
      } catch {
        // legacy silently ignored network errors
      }
    })();
  }, []);

  function stat(name: string): string {
    const rec = records[name.toUpperCase()];
    return rec ? `${rec.wins}-${rec.losses} (${rec.kos} KO)` : '0-0';
  }

  return (
    <div className="brawl-cards">
      {FIGHTERS.map(({ key, color, img }) => {
        const name = t(`list.${key}.name`);
        return (
          <div className={`brawl-card brawl-card--${color}`} key={key}>
            <img src={img} alt={name} />
            <h3>
              <LocaleLink href={`/fighters/${FIGHTER_SLUG_BY_KEY[key]}`}>
                {name}
              </LocaleLink>
            </h3>
            <p className="brawl-style">{t(`list.${key}.style`)}</p>
            <p className="brawl-trash">{t(`list.${key}.trash`)}</p>
            <p className="brawl-bio">{t(`list.${key}.bio`)}</p>
            <div className="brawl-stats">
              <span>{stat(name)}</span>
              <span>
                {t('stance')}: {t(`list.${key}.stance`)}
              </span>
            </div>
            <p>
              <LocaleLink href={`/fighters/${FIGHTER_SLUG_BY_KEY[key]}`}>
                {t('viewProfile')}
              </LocaleLink>
            </p>
          </div>
        );
      })}
    </div>
  );
}
