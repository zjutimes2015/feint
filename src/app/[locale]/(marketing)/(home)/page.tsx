import { getSchemaUrl } from '@/lib/structured-data';
import { JsonLd } from '@/components/seo/json-ld';
import { websiteConfig } from '@/config/website';
import { getBaseUrl, getImageUrl } from '@/lib/urls';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { LocaleLink } from '@/i18n/navigation';
import RuleVote from '@/components/brawlverse/rule-vote';
import HomeNextEvent from '@/components/brawlverse/home-next-event';
import { Routes } from '@/routes';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * https://next-intl.dev/docs/environments/actions-metadata-route-handlers#metadata-api
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const h = await getTranslations({ locale, namespace: 'Brawlverse.home' });

  // home.metaTitle 本身就是站名（BRAWLVERSE — The AI Boxing League），
  // 不再拼 `| Metadata.title`——两者是同一个字符串，拼了就是双后缀。
  return constructMetadata({
    title: h('metaTitle'),
    description: h('metaDescription'),
    locale,
    pathname: '',
  });
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const h = await getTranslations({ locale, namespace: 'Brawlverse.home' });
  const c = await getTranslations({ locale, namespace: 'Brawlverse.common' });
  const f = await getTranslations({ locale, namespace: 'Brawlverse.fighters' });
  const p = await getTranslations({
    locale,
    namespace: 'Brawlverse.home.pricing',
  });
  const tiers = (['free', 'ringside', 'booker', 'promoter'] as const).map(
    (key) => ({
      key,
      name: p(`tiers.${key}.name`),
      price: p(`tiers.${key}.price`),
      tagline: p(`tiers.${key}.tagline`),
      features: p.raw(`tiers.${key}.features`) as string[],
      popular: key === 'ringside',
      cta: key === 'free' ? p('ctaFree') : p('ctaPaid'),
      href: key === 'free' ? '/arena' : '/pricing',
    })
  );
  const organizationId = `${getBaseUrl().replace(/\/$/, '')}/#organization`;
  const quickActions = [
    {
      key: 'live',
      href: Routes.Live,
      title: h('quickLiveTitle'),
      body: h('quickLiveBody'),
      cta: h('quickLiveCta'),
    },
    {
      key: 'vote',
      href: Routes.Live,
      title: h('quickVoteTitle'),
      body: h('quickVoteBody'),
      cta: h('quickVoteCta'),
    },
    {
      key: 'forge',
      href: Routes.FanForge,
      title: h('quickForgeTitle'),
      body: h('quickForgeBody'),
      cta: h('quickForgeCta'),
    },
  ] as const;
  const homeFighters = [
    {
      key: 'ironJaw',
      color: 'red',
      img: '/brawlverse/iron-jaw-portrait.jpg',
      name: f('list.ironJaw.name'),
      style: f('list.ironJaw.style'),
      trash: f('list.ironJaw.trash'),
      bio: f('list.ironJaw.bio'),
    },
    {
      key: 'viper',
      color: 'green',
      img: '/brawlverse/viper-portrait.jpg',
      name: f('list.viper.name'),
      style: f('list.viper.style'),
      trash: f('list.viper.trash'),
      bio: f('list.viper.bio'),
    },
  ];

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': organizationId,
              name: t('name'),
              url: getBaseUrl(),
              logo: websiteConfig.metadata.images?.logoLight
                ? getImageUrl(websiteConfig.metadata.images.logoLight)
                : undefined,
              sameAs: Object.values(websiteConfig.metadata.social ?? {}).filter(
                Boolean
              ),
            },
            {
              '@type': 'WebSite',
              url: getSchemaUrl('', locale),
              name: t('name'),
              inLanguage:
                websiteConfig.i18n.locales[locale]?.hreflang ?? locale,
              publisher: { '@id': organizationId },
            },
          ],
        }}
      />
      <div className="brawl-page">
        <header className="brawl-hero">
          <div className="brawl-burst" />
          <h1 className="brawl-logo">{h('heroTitle')}</h1>
          <p className="brawl-tagline">
            {h('heroTaglinePre')}
            <span>{h('heroTaglineHighlight')}</span>
          </p>
          <p className="brawl-sub">
            {h('heroSub1')}
            <br />
            {h('heroSub2')}
          </p>
        </header>

        <HomeNextEvent />

        <section className="brawl-section">
          <h2 className="brawl-h2">{h('quickTitle')}</h2>
          <div className="brawl-cards">
            {quickActions.map((a) => (
              <div className="brawl-card brawl-card--gold" key={a.key}>
                <h3>{a.title}</h3>
                <p className="brawl-style">{a.body}</p>
                <p className="brawl-soon" style={{ marginTop: 16 }}>
                  <LocaleLink href={a.href} className="brawl-cta">
                    {a.cta}
                  </LocaleLink>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="brawl-section">
          <h2 className="brawl-h2">{h('sampleTitle')}</h2>
          <video
            className="brawl-video"
            controls
            preload="metadata"
            poster="/brawlverse/assets/viper-portrait.jpg"
          >
            <source
              src="/brawlverse/brawlverse-sample-ep0.mp4"
              type="video/mp4"
            />
            <track
              default
              kind="captions"
              label="English"
              src="/brawlverse/ep0.vtt"
              srcLang="en"
            />
          </video>
          <p className="brawl-note">{h('sampleNote')}</p>
        </section>

        <section className="brawl-section">
          <h2 className="brawl-h2">
            <span className="brawl-live">● LIVE</span> {h('trainingTitle')}
          </h2>
          <p className="brawl-note" style={{ marginBottom: 16 }}>
            {h('trainingNote')}
          </p>
          <video
            className="brawl-video brawl-video--training"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src="/brawlverse/training-sparring.mp4" type="video/mp4" />
          </video>
          <RuleVote />
        </section>

        <section className="brawl-section">
          <h2 className="brawl-h2">{h('fightersTitle')}</h2>
          <div className="brawl-cards">
            {homeFighters.map((f) => (
              <div className={`brawl-card brawl-card--${f.color}`} key={f.key}>
                <img src={f.img} alt={f.name} />
                <h3>{f.name}</h3>
                <p className="brawl-style">{f.style}</p>
                <p className="brawl-trash">{f.trash}</p>
                <p className="brawl-bio">{f.bio}</p>
                <div className="brawl-stats">
                  <span>0-0</span>
                  <span>{h('lockedStat')}</span>
                </div>
              </div>
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="brawl-card brawl-card--locked" key={i}>
                <div className="brawl-q">?</div>
                <h3>{h('lockedName')}</h3>
                <p className="brawl-style">{h('lockedStyle')}</p>
              </div>
            ))}
          </div>
          <p className="brawl-soon" style={{ marginTop: 26 }}>
            <LocaleLink href="/fan-forge" className="brawl-cta">
              {h('forgeCta')}
            </LocaleLink>
          </p>
        </section>

        <section className="brawl-section">
          <h2 className="brawl-h2">{h('howTitle')}</h2>
          <ol className="brawl-howto">
            <li>
              <b>{h('how1')}</b>
            </li>
            <li>
              <b>{h('how2')}</b>
            </li>
            <li>
              <b>{h('how3')}</b>
            </li>
          </ol>
          <p className="brawl-soon">{h('seasonSoon')}</p>
        </section>

        <section className="brawl-section" id="pricing">
          <h2 className="brawl-h2">{p('title')}</h2>
          <p className="brawl-note" style={{ marginBottom: 26 }}>
            {p('subtitle')}
          </p>
          <div className="brawl-pricing">
            {tiers.map((tier) => (
              <div
                key={tier.key}
                className={`brawl-price${tier.popular ? ' brawl-price--popular' : ''}`}
              >
                {tier.popular && (
                  <span className="brawl-price-badge">{p('mostPopular')}</span>
                )}
                <h3>{tier.name}</h3>
                <div className="brawl-price-amount">
                  {tier.price}
                  {tier.key !== 'free' && <span>{p('perMonth')}</span>}
                </div>
                <p className="brawl-price-tagline">{tier.tagline}</p>
                <ul>
                  {tier.features.map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
                <LocaleLink href={tier.href} className="brawl-cta">
                  {tier.cta}
                </LocaleLink>
              </div>
            ))}
          </div>
          <p className="brawl-note" style={{ marginTop: 18 }}>
            {p('cancelNote')}
          </p>
        </section>

        <footer className="brawl-footer">
          <p>{h('footer')}</p>
          <p className="brawl-aigc">{c('aigc')}</p>
        </footer>
      </div>
    </>
  );
}
