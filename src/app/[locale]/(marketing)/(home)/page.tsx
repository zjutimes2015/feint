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

const HOME_ROSTER = [
  {
    key: 'ironJaw',
    arenaSlug: 'iron_jaw',
    color: 'red',
    img: '/brawlverse/assets/iron-jaw-portrait.jpg',
  },
  {
    key: 'viper',
    arenaSlug: 'viper',
    color: 'green',
    img: '/brawlverse/assets/viper-portrait.jpg',
  },
  {
    key: 'sledge',
    arenaSlug: 'sledge',
    color: 'orange',
    img: '/brawlverse/assets/fighter-sledge.jpg',
  },
  {
    key: 'monsoon',
    arenaSlug: 'monsoon',
    color: 'cyan',
    img: '/brawlverse/assets/fighter-monsoon.jpg',
  },
  {
    key: 'volt',
    arenaSlug: 'volt',
    color: 'gold',
    img: '/brawlverse/assets/fan-volt.jpg',
  },
  {
    key: 'professor',
    arenaSlug: 'the_professor',
    color: 'purple',
    img: '/brawlverse/assets/fighter-professor.jpg',
  },
  {
    key: 'laReina',
    arenaSlug: 'la_reina',
    color: 'gold',
    img: '/brawlverse/assets/fan-lareina.jpg',
  },
  {
    key: 'goliath7',
    arenaSlug: 'goliath-7',
    color: 'gold',
    img: '/brawlverse/assets/fan-goliath7.jpg',
  },
] as const;

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
      href: key === 'free' ? Routes.Arena : Routes.Tickets,
    })
  );
  const organizationId = `${getBaseUrl().replace(/\/$/, '')}/#organization`;
  const quickActions = [
    {
      key: 'arena',
      href: Routes.Arena,
      badge: h('badgePlayNow'),
      title: h('quickArenaTitle'),
      body: h('quickArenaBody'),
      cta: h('quickArenaCta'),
    },
    {
      key: 'forge',
      href: Routes.FanForge,
      badge: h('badgePlayNow'),
      title: h('quickForgeTitle'),
      body: h('quickForgeBody'),
      cta: h('quickForgeCta'),
    },
    {
      key: 'vote',
      href: '#rule-vote',
      badge: h('badgePlayNow'),
      title: h('quickVoteTitle'),
      body: h('quickVoteBody'),
      cta: h('quickVoteCta'),
    },
    {
      key: 'live',
      href: Routes.Live,
      badge: h('badgeWeekly'),
      title: h('quickLiveTitle'),
      body: h('quickLiveBody'),
      cta: h('quickLiveCta'),
    },
  ] as const;

  const startSteps = [
    { num: '01', title: h('step1Title'), body: h('step1Body') },
    { num: '02', title: h('step2Title'), body: h('step2Body') },
    { num: '03', title: h('step3Title'), body: h('step3Body') },
  ] as const;

  const homeFighters = HOME_ROSTER.map((item) => ({
    ...item,
    name: f(`list.${item.key}.name`),
    style: f(`list.${item.key}.style`),
    trash: f(`list.${item.key}.trash`),
    bio: f(`list.${item.key}.bio`),
  }));

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
        <header className="brawl-hero" style={{ position: 'relative' }}>
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
          <div
            className="brawl-row"
            style={{ justifyContent: 'center', marginTop: 26, gap: 14 }}
          >
            <LocaleLink href={Routes.Arena} className="brawl-cta">
              {h('heroPrimaryCta')}
            </LocaleLink>
            <LocaleLink
              href={Routes.Register}
              className="brawl-btn brawl-btn--ghost"
              style={{ textDecoration: 'none', padding: '12px 24px' }}
            >
              {h('heroSecondaryCta')}
            </LocaleLink>
          </div>
          <p className="brawl-note" style={{ marginTop: 14 }}>
            {h('heroGuestNote')}
          </p>
        </header>

        {/* 首屏正下方：3 步上手说明，新用户 5 秒看懂怎么玩 */}
        <section className="brawl-section" id="how-to-play">
          <h2 className="brawl-h2">{h('howTitle')}</h2>
          <div className="brawl-cards">
            {startSteps.map((s) => (
              <div
                className="brawl-card brawl-card--gold"
                key={s.num}
                style={{ textAlign: 'left' }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 2,
                    color: '#ffcc00',
                  }}
                >
                  STEP {s.num}
                </div>
                <h3 style={{ fontSize: 20, marginTop: 8 }}>{s.title}</h3>
                <p className="brawl-bio" style={{ minHeight: 0 }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 现在就能玩 vs 每周节目：清晰区分入口 */}
        <section className="brawl-section">
          <h2 className="brawl-h2">{h('quickTitle')}</h2>
          <div className="brawl-cards">
            {quickActions.map((a) => (
              <div className="brawl-card brawl-card--gold" key={a.key}>
                <span className="brawl-tag" style={{ marginLeft: 0 }}>
                  {a.badge}
                </span>
                <h3>{a.title}</h3>
                <p className="brawl-style">{a.body}</p>
                <p className="brawl-soon" style={{ marginTop: 16 }}>
                  {a.href.startsWith('#') ? (
                    <a href={a.href} className="brawl-cta">
                      {a.cta}
                    </a>
                  ) : (
                    <LocaleLink href={a.href} className="brawl-cta">
                      {a.cta}
                    </LocaleLink>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>

        <HomeNextEvent />

        {/* 全部 8 名已上线可玩拳手，点击直接带入竞技场 */}
        <section className="brawl-section">
          <h2 className="brawl-h2">{h('fightersTitle')}</h2>
          <p className="brawl-note" style={{ marginBottom: 22 }}>
            {h('fightersSub')}
          </p>
          <div className="brawl-cards">
            {homeFighters.map((fighter) => (
              <div
                className={`brawl-card brawl-card--${fighter.color}`}
                key={fighter.key}
              >
                <img src={fighter.img} alt={fighter.name} />
                <h3>{fighter.name}</h3>
                <p className="brawl-style">{fighter.style}</p>
                <p className="brawl-trash">{fighter.trash}</p>
                <p className="brawl-bio">{fighter.bio}</p>
                <div style={{ marginTop: 14 }}>
                  <LocaleLink
                    href={`${Routes.Arena}?fighter=${fighter.arenaSlug}`}
                    className="brawl-btn"
                    style={{
                      display: 'inline-block',
                      textDecoration: 'none',
                      fontSize: 13,
                      padding: '8px 14px',
                    }}
                  >
                    {h('duelAsFighter', { name: fighter.name })}
                  </LocaleLink>
                </div>
              </div>
            ))}
          </div>
          <p className="brawl-soon" style={{ marginTop: 26 }}>
            <LocaleLink href={Routes.FanForge} className="brawl-cta">
              {h('forgeCta')}
            </LocaleLink>
          </p>
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

        <section className="brawl-section" id="rule-vote">
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
            poster="/brawlverse/assets/iron-jaw-portrait.jpg"
          >
            <source src="/brawlverse/training-sparring.mp4" type="video/mp4" />
          </video>
          <RuleVote />
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
