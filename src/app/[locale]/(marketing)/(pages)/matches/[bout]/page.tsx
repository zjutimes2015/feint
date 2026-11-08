import { JsonLd } from '@/components/seo/json-ld';
import { LocaleLink } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import {
  FIGHTER_SLUG_BY_KEY,
  MATCH_SLUGS,
  PORTRAIT_BY_KEY,
  QF_BOUTS,
} from '@/lib/brawlverse/seo';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    MATCH_SLUGS.map((bout) => ({ locale, bout }))
  );
}

interface MatchPageProps {
  params: Promise<{ locale: Locale; bout: string }>;
}

export async function generateMetadata({
  params,
}: MatchPageProps): Promise<Metadata | undefined> {
  const { locale, bout: boutId } = await params;
  const bout = QF_BOUTS.find((b) => b.id === boutId);
  if (!bout) return undefined;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const m = await getTranslations({
    locale,
    namespace: 'Brawlverse.matchDetail',
  });
  const f = await getTranslations({
    locale,
    namespace: 'Brawlverse.fighters',
  });
  const a = f(`list.${bout.fighterA}.name`);
  const b = f(`list.${bout.fighterB}.name`);

  return constructMetadata({
    title: `${a} vs ${b} — ${bout.title} | ${t('title')}`,
    description: m('metaDescription', { a, b }),
    locale,
    pathname: `/matches/${boutId}`,
  });
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { locale, bout: boutId } = await params;
  const bout = QF_BOUTS.find((b) => b.id === boutId);
  if (!bout) notFound();

  const t = await getTranslations('Brawlverse.matchDetail');
  const f = await getTranslations('Brawlverse.fighters');
  const c = await getTranslations('Brawlverse.common');

  const a = f(`list.${bout.fighterA}.name`);
  const b = f(`list.${bout.fighterB}.name`);

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: t('faqWhoQ', { a, b }),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faqWhoA', { a, b }),
        },
      },
      {
        '@type': 'Question',
        name: t('faqBetQ', { a, b }),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faqBetA', { a, b, bout: bout.title }),
        },
      },
      {
        '@type': 'Question',
        name: t('faqMoneyQ'),
        acceptedAnswer: { '@type': 'Answer', text: t('faqMoneyA') },
      },
    ],
  };

  const fighters = [bout.fighterA, bout.fighterB];

  return (
    <div className="brawl-page">
      <JsonLd data={faqJsonLd} />

      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">
          {a} <span>vs</span> {b}
        </h1>
        <p className="brawl-tagline">
          {t('quarterfinal')}
          <span> · {bout.title}</span>
        </p>
      </header>

      <section className="brawl-section">
        <h2>{t('fightersTitle')}</h2>
        <div className="brawl-cards">
          {fighters.map((key) => (
            <div className="brawl-card" key={key}>
              <img src={PORTRAIT_BY_KEY[key]} alt={f(`list.${key}.name`)} />
              <h3>{f(`list.${key}.name`)}</h3>
              <p className="brawl-style">{f(`list.${key}.style`)}</p>
              <p className="brawl-bio">{f(`list.${key}.bio`)}</p>
              <p>
                <LocaleLink href={`/fighters/${FIGHTER_SLUG_BY_KEY[key]}`}>
                  {f(`list.${key}.name`)} →
                </LocaleLink>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="brawl-section">
        <h2>{t('howContracts')}</h2>
        <p className="brawl-bio">{t('contractsBody')}</p>
        <p>
          <LocaleLink href="/how-prediction-markets-work">
            {t('learnMore')} →
          </LocaleLink>
        </p>
        <p>
          <LocaleLink href="/bet">{t('betCta')} →</LocaleLink>
        </p>
      </section>

      <footer className="brawl-footer">
        <p>
          <LocaleLink href="/fighters">
            {a} vs {b}
          </LocaleLink>
        </p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
