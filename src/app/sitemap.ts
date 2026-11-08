import { getLocalePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { FIGHTER_SLUGS, MATCH_SLUGS } from '@/lib/brawlverse/seo';
import { generateHreflangUrls } from '@/lib/hreflang';
import type { MetadataRoute } from 'next';
import type { Locale } from 'next-intl';
import { getBaseUrl } from '@/lib/urls';

type Href = Parameters<typeof getLocalePathname>[0]['href'];

/**
 * static routes for sitemap
 */
const staticRoutes = [
  '/',
  '/episodes',
  '/fighters',
  '/storylines',
  '/bet',
  '/fantasy',
  '/live',
  '/fan-forge',
  '/tickets',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/cookie',
  '/auth/login',
  '/auth/register',
] as const;

/**
 * SEO routes: one page per fighter, one per Season 1 quarterfinal,
 * plus the prediction-market education page.
 */
const seoRoutes = [
  ...FIGHTER_SLUGS.map((slug) => `/fighters/${slug}`),
  ...MATCH_SLUGS.map((id) => `/matches/${id}`),
  '/how-prediction-markets-work',
] as const;

/**
 * Generate a sitemap for the website with hreflang support
 *
 * https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
 * https://ahrefs.com/blog/hreflang-tags/
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapList: MetadataRoute.Sitemap = []; // final result

  // add static routes
  sitemapList.push(
    ...staticRoutes.flatMap((route) => {
      return routing.locales.map((locale) => ({
        url: getUrl(route, locale),
        alternates: {
          languages: generateHreflangUrls(route),
        },
      }));
    })
  );

  // add SEO routes (fighters, matches, education)
  sitemapList.push(
    ...seoRoutes.flatMap((route) => {
      return routing.locales.map((locale) => ({
        url: getUrl(route, locale),
        alternates: {
          languages: generateHreflangUrls(route),
        },
      }));
    })
  );

  return sitemapList;
}

function getUrl(href: Href, locale: Locale) {
  const pathname = getLocalePathname({ locale, href: href as never });
  return getBaseUrl() + pathname;
}
