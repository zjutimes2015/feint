import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import LiveClient from '@/components/brawlverse/live-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Brawlverse.live' });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/live',
  });
}

export default async function LivePage() {
  const t = await getTranslations('Brawlverse.live');
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

      <LiveClient />

      <footer className="brawl-footer">
        <p>{t('footer')}</p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
