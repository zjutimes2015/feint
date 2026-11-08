import type { Locale } from 'next-intl';
import { getUrlWithLocale } from './urls';

export function serializeStructuredData(data: object): string {
  // Keep content from closing the script element, including MDX frontmatter.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function getSchemaUrl(pathname: string, locale: Locale): string {
  return getUrlWithLocale(pathname, locale).replace(/\/$/, '');
}
