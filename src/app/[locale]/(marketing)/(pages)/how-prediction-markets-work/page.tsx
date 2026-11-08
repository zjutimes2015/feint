import { JsonLd } from '@/components/seo/json-ld';
import { LocaleLink } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface PredictionMarketsPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({
  params,
}: PredictionMarketsPageProps): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const p = await getTranslations({
    locale,
    namespace: 'Brawlverse.predictionMarkets',
  });

  return constructMetadata({
    title: `${p('metaTitle')} | ${t('title')}`,
    description: p('metaDescription'),
    locale,
    pathname: '/how-prediction-markets-work',
  });
}

export default async function PredictionMarketsPage({
  params,
}: PredictionMarketsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'Brawlverse.predictionMarkets',
  });
  const c = await getTranslations({ locale, namespace: 'Brawlverse.common' });

  const faqs = t.raw('faqs') as { q: string; a: string }[];
  const howBullets = t.raw('howBullets') as string[];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div className="brawl-page">
      <JsonLd data={faqJsonLd} />

      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
      </header>

      <section className="brawl-section">
        <h2>{t('whatIsTitle')}</h2>
        <p className="brawl-bio">{t('whatIsBody')}</p>
      </section>

      <section className="brawl-section">
        <h2>{t('howTitle')}</h2>
        <ul>
          {howBullets.map((item) => (
            <li key={item} className="brawl-bio">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="brawl-section">
        <h2>{t('pointsTitle')}</h2>
        <p className="brawl-bio">{t('pointsBody')}</p>
      </section>

      <section className="brawl-section">
        <h2>{t('settleTitle')}</h2>
        <p className="brawl-bio">{t('settleBody')}</p>
        <p>
          <LocaleLink href="/bet">The Book →</LocaleLink>
        </p>
      </section>

      <section className="brawl-section">
        <h2>{t('faqTitle')}</h2>
        {faqs.map(({ q, a }) => (
          <div key={q}>
            <h3>{q}</h3>
            <p className="brawl-bio">{a}</p>
          </div>
        ))}
      </section>

      <footer className="brawl-footer">
        <p>
          <LocaleLink href="/fighters">The Fighters →</LocaleLink>
        </p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
