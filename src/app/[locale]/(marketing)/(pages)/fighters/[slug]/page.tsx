import { JsonLd } from '@/components/seo/json-ld';
import { LocaleLink } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import {
  FIGHTER_KEY_BY_SLUG,
  FIGHTER_SLUGS,
  MOVE_LABELS,
  PORTRAIT_BY_KEY,
  boutForFighter,
  engineStats,
  opponentOf,
} from '@/lib/brawlverse/seo';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    FIGHTER_SLUGS.map((slug) => ({ locale, slug }))
  );
}

interface FighterDetailPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({
  params,
}: FighterDetailPageProps): Promise<Metadata | undefined> {
  const { locale, slug } = await params;
  const key = FIGHTER_KEY_BY_SLUG[slug];
  if (!key) return undefined;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const f = await getTranslations({
    locale,
    namespace: 'Brawlverse.fighters',
  });
  const name = f(`list.${key}.name`);
  const style = f(`list.${key}.style`);
  const bio = f(`list.${key}.bio`);

  return constructMetadata({
    title: `${name} — ${style} | ${t('title')}`,
    description: bio,
    locale,
    pathname: `/fighters/${slug}`,
  });
}

export default async function FighterDetailPage({
  params,
}: FighterDetailPageProps) {
  const { locale, slug } = await params;
  const key = FIGHTER_KEY_BY_SLUG[slug];
  if (!key) notFound();

  const t = await getTranslations('Brawlverse.fighterDetail');
  const f = await getTranslations('Brawlverse.fighters');
  const c = await getTranslations('Brawlverse.common');

  const name = f(`list.${key}.name`);
  const style = f(`list.${key}.style`);
  const bio = f(`list.${key}.bio`);
  const trash = f(`list.${key}.trash`);
  const stance = f(`list.${key}.stance`);
  const stats = engineStats(key);
  const bout = boutForFighter(key);
  const opponentKey = bout ? opponentOf(bout, key) : undefined;
  const opponentName = opponentKey ? f(`list.${opponentKey}.name`) : undefined;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: t('faqStyleQ', { name }),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faqStyleA', { name, style, bio }),
        },
      },
      {
        '@type': 'Question',
        name: t('faqRecordQ', { name }),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faqRecordA', { name }),
        },
      },
      ...(bout && opponentName
        ? [
            {
              '@type': 'Question',
              name: t('faqNextQ', { name }),
              acceptedAnswer: {
                '@type': 'Answer',
                text: t('faqNextA', {
                  name,
                  opponent: opponentName,
                  bout: bout.title,
                }),
              },
            },
          ]
        : []),
    ],
  };

  const statRows: { label: string; value: number }[] = [
    { label: t('aggression'), value: stats.aggression },
    { label: t('feintRate'), value: stats.feintRate },
    { label: t('tauntRate'), value: stats.tauntRate },
    { label: t('dodgeRate'), value: stats.dodgeRate },
  ];

  return (
    <div className="brawl-page">
      <JsonLd data={faqJsonLd} />

      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{name}</h1>
        <p className="brawl-tagline">
          {style}
          <span>
            {' '}
            · {t('stance')}: {stance}
          </span>
        </p>
      </header>

      <section className="brawl-section">
        <div className="brawl-cards">
          <div className="brawl-card">
            <img src={PORTRAIT_BY_KEY[key]} alt={name} />
            <h3>{name}</h3>
            <p className="brawl-style">{style}</p>
            <p className="brawl-bio">{bio}</p>
            <p className="brawl-trash">{trash}</p>
            <div className="brawl-stats">
              <span>{t('record')}: 0–0</span>
              <span>
                {t('stance')}: {stance}
              </span>
            </div>
            <p className="brawl-bio">{t('noBoutsYet')}</p>
          </div>
        </div>
      </section>

      <section className="brawl-section">
        <h2>{t('engineStats')}</h2>
        <div className="brawl-cards">
          {statRows.map((row) => (
            <div className="brawl-card" key={row.label}>
              <h3>{row.label}</h3>
              <p className="brawl-bio">{Math.round(row.value * 100)}%</p>
              <div
                style={{
                  height: 8,
                  background: '#2a2a2a',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(row.value * 100)}%`,
                    height: '100%',
                    background: '#ffcc00',
                  }}
                />
              </div>
            </div>
          ))}
          <div className="brawl-card">
            <h3>{t('favoredMoves')}</h3>
            <p className="brawl-bio">
              {stats.favored
                .map((move) => MOVE_LABELS[locale][move])
                .join(' · ')}
            </p>
          </div>
        </div>
      </section>

      {bout && opponentName && (
        <section className="brawl-section">
          <h2>{t('nextFight')}</h2>
          <p className="brawl-bio">
            <LocaleLink href={`/matches/${bout.id}`}>
              {bout.title}: {name} vs {opponentName}
            </LocaleLink>
          </p>
          <p>
            <LocaleLink href="/bet">{t('betCta')} →</LocaleLink>
          </p>
        </section>
      )}

      <footer className="brawl-footer">
        <p>
          <LocaleLink href="/fighters">{t('rosterCta')}</LocaleLink>
        </p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
