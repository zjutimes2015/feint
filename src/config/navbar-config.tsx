'use client';

import { Routes } from '@/routes';
import type { NestedMenuItem } from '@/types';
import {
  HandshakeIcon,
  LibraryIcon,
  ScrollTextIcon,
  SparklesIcon,
  TicketIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Get navbar config with translations
 *
 * NOTICE: used in client components only
 *
 * @returns The navbar config with translated titles and descriptions
 */
export function useNavbarLinks(): NestedMenuItem[] {
  const t = useTranslations('Brawlverse.nav');

  return [
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
    {
      title: t('play.title'),
      items: [
        {
          title: t('play.items.bet.title'),
          description: t('play.items.bet.description'),
          icon: <HandshakeIcon className="size-4 shrink-0" />,
          href: Routes.Bet,
          external: false,
        },
        {
          title: t('play.items.fantasy.title'),
          description: t('play.items.fantasy.description'),
          icon: <UsersIcon className="size-4 shrink-0" />,
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
          description: t('universe.items.forge.description'),
          icon: <SparklesIcon className="size-4 shrink-0" />,
          href: Routes.FanForge,
          external: false,
        },
        {
          title: t('universe.items.tickets.title'),
          description: t('universe.items.tickets.description'),
          icon: <TicketIcon className="size-4 shrink-0" />,
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
          description: t('more.items.about.description'),
          icon: <LibraryIcon className="size-4 shrink-0" />,
          href: Routes.About,
          external: false,
        },
        {
          title: t('more.items.contact.title'),
          description: t('more.items.contact.description'),
          icon: <ScrollTextIcon className="size-4 shrink-0" />,
          href: Routes.Contact,
          external: false,
        },
        {
          title: t('more.items.privacyPolicy.title'),
          description: t('more.items.privacyPolicy.description'),
          icon: <ScrollTextIcon className="size-4 shrink-0" />,
          href: Routes.PrivacyPolicy,
          external: false,
        },
        {
          title: t('more.items.termsOfService.title'),
          description: t('more.items.termsOfService.description'),
          icon: <ScrollTextIcon className="size-4 shrink-0" />,
          href: Routes.TermsOfService,
          external: false,
        },
        {
          title: t('more.items.cookiePolicy.title'),
          description: t('more.items.cookiePolicy.description'),
          icon: <ScrollTextIcon className="size-4 shrink-0" />,
          href: Routes.CookiePolicy,
          external: false,
        },
      ],
    },
  ];
}
