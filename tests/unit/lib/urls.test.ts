import {
  getBaseUrl,
  getImageUrl,
  getMarkdownUrlWithLocale,
  getPathWithLocale,
  getUrlWithLocale,
  getUrlWithLocaleInCallbackUrl,
  shouldAppendLocale,
} from '@/lib/urls';
import { describe, expect, test } from 'vitest';

describe('localized URL helpers', () => {
  test('uses the configured application origin', () => {
    expect(getBaseUrl()).toBe('http://localhost:3000');
  });

  test.each([
    ['en', false],
    ['zh', true],
    ['default', false],
    [null, false],
  ] as const)(
    'decides whether %s needs a locale prefix',
    (locale, expected) => {
      expect(shouldAppendLocale(locale)).toBe(expected);
    }
  );

  test('builds relative and absolute localized URLs', () => {
    expect(getPathWithLocale('/dashboard', 'en')).toBe('/dashboard');
    expect(getPathWithLocale('/dashboard', 'zh')).toBe('/zh/dashboard');
    expect(getUrlWithLocale('/pricing', 'en')).toBe(
      'http://localhost:3000/pricing'
    );
    expect(getUrlWithLocale('/pricing', 'zh')).toBe(
      'http://localhost:3000/zh/pricing'
    );
  });

  test('localizes an authentication callback exactly once', () => {
    const original =
      'http://localhost:3000/api/auth/verify-email?token=test&callbackURL=/dashboard';
    const localized = getUrlWithLocaleInCallbackUrl(original, 'zh');
    const alreadyLocalized = getUrlWithLocaleInCallbackUrl(localized, 'zh');

    expect(new URL(localized).searchParams.get('callbackURL')).toBe(
      '/zh/dashboard'
    );
    expect(alreadyLocalized).toBe(localized);
    expect(getUrlWithLocaleInCallbackUrl(original, 'en')).toBe(original);
  });

  test('normalizes locale prefixes for markdown endpoints', () => {
    expect(getMarkdownUrlWithLocale('/zh/docs/intro', 'en')).toBe(
      '/en/docs/intro.mdx'
    );
    expect(getMarkdownUrlWithLocale('docs/intro', 'zh')).toBe(
      '/zh/docs/intro.mdx'
    );
  });

  test('keeps absolute image URLs and expands relative ones', () => {
    expect(getImageUrl('https://cdn.example.com/image.png')).toBe(
      'https://cdn.example.com/image.png'
    );
    expect(getImageUrl('/og.png')).toBe('http://localhost:3000/og.png');
    expect(getImageUrl('og.png')).toBe('http://localhost:3000/og.png');
  });
});
