import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import FanForgeForm from '@/components/brawlverse/fan-forge-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({
    locale,
    namespace: 'Brawlverse.fanForge',
  });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/fan-forge',
  });
}

export default async function FanForgePage() {
  const t = await getTranslations('Brawlverse.fanForge');
  const c = await getTranslations('Brawlverse.common');

  const examples = t.raw('examples') as {
    name: string;
    persona: string;
    bio: string;
    img: string;
  }[];

  return (
    <div className="brawl-page">
      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
        <p className="brawl-sub">
          {t('sub1')}
          <br />
          {t('sub2Pre')}
          <b>{t('sub2Bold')}</b>
        </p>
      </header>

      <FanForgeForm />

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('examplesTitle')}</h2>
        <p className="brawl-note" style={{ marginBottom: 20 }}>
          {t('examplesNote')}
        </p>
        <div className="brawl-cards">
          {examples.map((e) => (
            <div className="brawl-card brawl-card--gold" key={e.name}>
              <img src={e.img} alt={e.name} />
              <h3>{e.name}</h3>
              <p className="brawl-style">
                {t('fanSubmission')} "{e.persona}"
              </p>
              <p className="brawl-bio">{e.bio}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="brawl-footer">
        <p>{t('footer')}</p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
