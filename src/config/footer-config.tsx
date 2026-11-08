'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import { useTranslations } from 'next-intl';

/**
 * Get footer config with translations
 *
 * NOTICE: used in client components only
 *
 * @returns The footer config with translated titles
 */
export function useFooterLinks(): NestedMenuItem[] {
  const t = useTranslations('Brawlverse.nav');

  return [
    {
      title: t('episodes.title'),
      items: [
        {
          title: t('episodes.title'),
          href: Routes.Episodes,
          external: false,
        },
        {
          title: t('fighters.title'),
          href: Routes.Fighters,
          external: false,
        },
        {
          title: t('storylines.title'),
          href: Routes.Storylines,
          external: false,
        },
        {
          title: t('live.title'),
          href: Routes.Live,
          external: false,
        },
      ],
    },
    {
      title: t('play.title'),
      items: [
        {
          title: t('play.items.bet.title'),
          href: Routes.Bet,
          external: false,
        },
        {
          title: t('play.items.fantasy.title'),
          href: Routes.Fantasy,
          external: false,
        },
      ],
    },
    {
      title: t('universe.title'),
      items: [
        {
          title: t('universe.items.forge.title'),
          href: Routes.FanForge,
          external: false,
        },
        {
          title: t('universe.items.tickets.title'),
          href: Routes.Tickets,
          external: false,
        },
      ],
    },
    {
      title: t('more.title'),
      items: [
        {
          title: t('more.items.about.title'),
          href: Routes.About,
          external: false,
        },
        {
          title: t('more.items.contact.title'),
          href: Routes.Contact,
          external: false,
        },
        {
          title: t('more.items.cookiePolicy.title'),
          href: Routes.CookiePolicy,
          external: false,
        },
        {
          title: t('more.items.privacyPolicy.title'),
          href: Routes.PrivacyPolicy,
          external: false,
        },
        {
          title: t('more.items.termsOfService.title'),
          href: Routes.TermsOfService,
          external: false,
        },
      ],
    },
  ];
}
