import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import FightersGrid from '@/components/brawlverse/fighters-grid';
import { LocaleLink } from '@/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({
    locale,
    namespace: 'Brawlverse.fighters',
  });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/fighters',
  });
}

export default async function FightersPage() {
  const t = await getTranslations('Brawlverse.fighters');
  const c = await getTranslations('Brawlverse.common');

  return (
    <div className="brawl-page">
      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
      </header>
      <section className="brawl-section">
        <FightersGrid />
      </section>
      <footer className="brawl-footer">
        <p>
          BRAWLVERSE ·{' '}
          <LocaleLink href="/fan-forge">{t('forgeCta')}</LocaleLink>
        </p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
