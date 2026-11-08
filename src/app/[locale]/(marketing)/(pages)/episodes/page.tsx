import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import EpisodesClient from '@/components/brawlverse/episodes-client';
import { listContent, type ContentItem } from '@/lib/brawlverse/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublishedEpisode = {
  id: string;
  weekKey: string;
  title: string;
  airAt: string;
  videoUrl: string;
  posterUrl: string;
  kind: string;
  tactic: string;
};

/**
 * 已发布正片:统一读内容库(content_items)。
 * 正片(episode)与回合分支(branch)进同一张表,这里都算"可播放内容"。
 * 数据库不可用时返回空数组,页面仍能渲染演示内容。
 */
async function loadPublished(): Promise<PublishedEpisode[]> {
  try {
    const rows = await listContent(undefined, 'published', 12);
    return rows.map((r: ContentItem) => ({
      id: r.id,
      weekKey: r.week_key || r.id,
      title: r.title,
      airAt: '',
      videoUrl: r.video_url,
      posterUrl: r.poster_url,
      kind: r.kind,
      tactic: r.tactic,
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({
    locale,
    namespace: 'Brawlverse.episodes',
  });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/episodes',
  });
}

export default async function EpisodesPage() {
  const t = await getTranslations('Brawlverse.episodes');
  const c = await getTranslations('Brawlverse.common');
  const episodes = await loadPublished();

  return (
    <div className="brawl-page">
      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
      </header>

      {episodes.length > 0 ? (
        <section className="brawl-section">
          <h2 className="brawl-h2">{t('publishedTitle')}</h2>
          <p
            className="brawl-note"
            style={{ textAlign: 'center', marginBottom: 14 }}
          >
            {t('publishedNote')}
          </p>
          {episodes.map((ep) => (
            <div key={ep.id} style={{ marginBottom: 30 }}>
              <h3>{ep.title || ep.weekKey}</h3>
              <p className="brawl-style">
                {ep.weekKey}
                {ep.kind === 'branch' && ep.tactic ? ` · ${ep.tactic}` : ''}
              </p>
              <div className="brawl-videowrap">
                {/* biome-ignore lint/a11y/useMediaCaption: 出片不含字幕轨道 */}
                <video
                  className="brawl-video"
                  controls
                  preload="metadata"
                  poster={ep.posterUrl || undefined}
                >
                  <source src={ep.videoUrl} type="video/mp4" />
                </video>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <EpisodesClient />

      <footer className="brawl-footer">
        <p>{t('footer')}</p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
