import { constructMetadata } from '@/lib/metadata';
import { getSession } from '@/lib/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import AdminClient from '@/components/brawlverse/admin-client';
import { Routes } from '@/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Brawlverse.admin' });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    noIndex: true,
    locale,
    pathname: '/admin',
  });
}

export default async function BrawlAdminPage() {
  // 双重守卫:protected layout 已校验 session,这里再校验 admin 角色
  const session = await getSession();
  if (!session?.user) redirect(Routes.Login);
  if (session.user.role !== 'admin') redirect(Routes.Dashboard);

  const t = await getTranslations('Brawlverse.admin');

  return (
    <div className="px-4 lg:px-6 py-6">
      <div className="mx-auto max-w-(--breakpoint-lg)">
        <header className="mb-4">
          <h1 className="brawl-display text-3xl text-brawl-gold">
            {t('title')}
          </h1>
          <p className="brawl-note">
            {t('taglinePre')}
            <span className="text-brawl-gold">{t('taglineHighlight')}</span>
          </p>
        </header>
        <AdminClient />
      </div>
    </div>
  );
}
