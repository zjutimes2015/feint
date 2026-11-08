'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { websiteConfig } from '@/config/website';
import { getLocalePathname, useLocalePathname } from '@/i18n/navigation';
import { useLocaleStore } from '@/stores/locale-store';
import { Languages } from 'lucide-react';
import { type Locale, useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * LocaleSwitcher component
 *
 * Allows users to switch between available locales using a dropdown menu.
 *
 * Based on next-intl's useLocaleRouter and useLocalePathname for locale navigation.
 * https://next-intl.dev/docs/routing/navigation#userouter
 */
export default function LocaleSwitcher() {
  const pathname = useLocalePathname();
  const params = useParams();
  const locale = useLocale();
  const { currentLocale, setCurrentLocale } = useLocaleStore();
  const t = useTranslations('Common');

  // Return null if there's only one locale available
  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1;
  if (!showLocaleSwitch) {
    return null;
  }

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale, setCurrentLocale]);

  const setLocale = (nextLocale: Locale) => {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="locale-switcher-trigger"
          variant="ghost"
          size="sm"
          className="size-8 p-0.5 border border-border rounded-full"
        >
          <Languages className="size-3" />
          <span className="sr-only">{t('language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(websiteConfig.i18n.locales).map(
          ([localeOption, data]) => (
            <DropdownMenuItem
              key={localeOption}
              data-testid={`locale-switcher-option-${localeOption}`}
              onClick={() => setLocale(localeOption)}
            >
              {data.flag && <span className="mr-2 text-md">{data.flag}</span>}
              <span className="text-sm">{data.name}</span>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
