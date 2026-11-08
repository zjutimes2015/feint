import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/urls';

/**
 * AI crawlers are named one by one (GEO): each gets an explicit Allow so
 * AI search / answer engines can fetch the site. The Disallow list applies
 * to every crawler, AI or not.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'cohere-ai',
  'Meta-ExternalAgent',
] as const;

const DISALLOW = ['/api/*', '/_next/*', '/settings/*', '/dashboard/*'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
