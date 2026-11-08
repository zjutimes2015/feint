import { LocaleLink } from '@/i18n/navigation';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import BetClient from '@/components/brawlverse/bet-client';
import ContractClient from '@/components/brawlverse/contract-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Brawlverse.bet' });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/bet',
  });
}

export default async function BetPage() {
  const t = await getTranslations('Brawlverse.bet');
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

      <BetClient />

      <ContractClient />

      <footer className="brawl-footer">
        <p>{t('footer')}</p>
        <p>
          <LocaleLink href="/how-prediction-markets-work">
            {t('howItWorks')} →
          </LocaleLink>
        </p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
