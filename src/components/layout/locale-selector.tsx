'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { websiteConfig } from '@/config/website';
import { getLocalePathname, useLocalePathname } from '@/i18n/navigation';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import { useLocaleStore } from '@/stores/locale-store';
import { type Locale, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * 1. LocaleSelector
 *
 * By combining useLocaleRouter with useLocalePathname, you can change the locale for the current page
 * programmatically by navigating to the same pathname, while overriding the locale.
 * Depending on if you're using the pathnames setting, you optionally have to forward params
 * to potentially resolve an internal pathname.
 *
 * https://next-intl.dev/docs/routing/navigation#userouter
 */
export default function LocaleSelector() {
  const pathname = useLocalePathname();
  const params = useParams();
  const locale = useLocale();
  const { currentLocale, setCurrentLocale } = useLocaleStore();

  // Return null if there's only one locale available
  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1;
  if (!showLocaleSwitch) {
    return null;
  }

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale, setCurrentLocale]);

  const onSelectChange = (nextLocale: Locale) => {
    setCurrentLocale(nextLocale);

    const nextPathname = getLocalePathname({
      locale: nextLocale,
      // @ts-expect-error -- The current pathname and params always describe the same route.
      href: { pathname, params },
    });
    window.location.assign(
      `${nextPathname}${window.location.search}${window.location.hash}`
    );
  };

  return (
    <Select
      defaultValue={locale}
      value={currentLocale}
      onValueChange={onSelectChange}
    >
      <SelectTrigger className="w-fit">
        <SelectValue
          placeholder={
            <div className="flex items-center gap-2">
              {websiteConfig.i18n.locales[DEFAULT_LOCALE].flag && (
                <span className="text-lg">
                  {websiteConfig.i18n.locales[DEFAULT_LOCALE].flag}
                </span>
              )}
              <span>{websiteConfig.i18n.locales[DEFAULT_LOCALE].name}</span>
            </div>
          }
        >
          {currentLocale && (
            <div className="flex items-center gap-2">
              {websiteConfig.i18n.locales[currentLocale].flag && (
                <span className="text-lg">
                  {websiteConfig.i18n.locales[currentLocale].flag}
                </span>
              )}
              <span>{websiteConfig.i18n.locales[currentLocale].name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="bottom" align="start">
        {Object.entries(websiteConfig.i18n.locales).map(([cur, data]) => (
          <SelectItem key={cur} value={cur} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {data.flag && <span className="text-md">{data.flag}</span>}
              <span>{data.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
