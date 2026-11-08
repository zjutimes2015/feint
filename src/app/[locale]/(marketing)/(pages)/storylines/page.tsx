import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import StorylineVoteResult from '@/components/brawlverse/storyline-vote-result';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({
    locale,
    namespace: 'Brawlverse.storylines',
  });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/storylines',
  });
}

export default async function StorylinesPage() {
  const t = await getTranslations('Brawlverse.storylines');
  const c = await getTranslations('Brawlverse.common');

  const feuds = t.raw('feuds') as {
    q: string;
    title: string;
    style: string;
    body: string;
    incident: string;
    escalation: string;
    blowoff: string;
    color: string;
  }[];
  const arcs = t.raw('arcs') as { fighter: string; arc: string }[];
  const anatomy = t.raw('anatomy') as {
    time: string;
    beat: string;
    what: string;
  }[];
  const programming = t.raw('programming') as {
    title: string;
    style: string;
    body: string;
  }[];

  return (
    <div className="brawl-page">
      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
        <p
          className="brawl-note"
          style={{ maxWidth: 640, margin: '10px auto' }}
        >
          {t('intro')}
        </p>
      </header>

      <StorylineVoteResult />

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('feudsTitle')}</h2>
        <div className="brawl-cards">
          {feuds.map((f) => (
            <div
              className={`brawl-card${f.color ? ` brawl-card--${f.color}` : ''}`}
              key={f.q}
            >
              <div className="brawl-q">{f.q}</div>
              <h3>{f.title}</h3>
              <p className="brawl-style">{f.style}</p>
              <p>{f.body}</p>
              <p className="brawl-bio">
                <b>{t('labels.incident')}</b> {f.incident}
                <br />
                <b>{t('labels.escalation')}</b> {f.escalation}
                <br />
                <b>{t('labels.blowoff')}</b> {f.blowoff}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('arcsTitle')}</h2>
        <table className="brawl-standings">
          <tbody>
            <tr>
              <th>{t('arcsHeader.fighter')}</th>
              <th>{t('arcsHeader.arc')}</th>
            </tr>
            {arcs.map((a) => (
              <tr key={a.fighter}>
                <td>{a.fighter}</td>
                <td>{a.arc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="brawl-note" style={{ textAlign: 'center' }}>
          {t('arcsNote')}
        </p>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('anatomyTitle')}</h2>
        <table className="brawl-standings">
          <tbody>
            <tr>
              <th>{t('anatomyHeader.time')}</th>
              <th>{t('anatomyHeader.beat')}</th>
              <th>{t('anatomyHeader.what')}</th>
            </tr>
            {anatomy.map((r) => (
              <tr key={r.time}>
                <td>{r.time}</td>
                <td>{r.beat}</td>
                <td>{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('programmingTitle')}</h2>
        <div className="brawl-cards">
          {programming.map((p) => (
            <div className="brawl-card" key={p.title}>
              <h3>{p.title}</h3>
              <p className="brawl-style">{p.style}</p>
              <p>{p.body}</p>
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
