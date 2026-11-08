import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import ArenaClient from '@/components/arena/arena-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Arena' });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/arena',
  });
}

export default async function ArenaPage() {
  return <ArenaClient />;
}
