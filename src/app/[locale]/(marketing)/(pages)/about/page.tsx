import Container from '@/components/layout/container';
import { Button, buttonVariants } from '@/components/ui/button';
import { constructMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';
import { LocaleLink } from '@/i18n/navigation';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Brawlverse.about' });

  return constructMetadata({
    title: `${pt('title')} | ${t('title')}`,
    description: pt('description'),
    locale,
    pathname: '/about',
  });
}

export default async function AboutPage() {
  const t = await getTranslations('Brawlverse.about');

  const facts = t.raw('facts') as { label: string; value: string }[];

  return (
    <Container className="py-16 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-lg text-muted-foreground">{t('tagline')}</p>
        </div>

        <p className="text-base text-muted-foreground leading-relaxed">
          {t('introduction')}
        </p>

        <div className="grid gap-6 sm:grid-cols-3">
          {facts.map((f) => (
            <div
              className="rounded-lg border border-border bg-card p-6 text-center"
              key={f.label}
            >
              <div className="text-2xl font-bold text-brawl-gold">
                {f.value}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {f.label}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">{t('missionTitle')}</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            {t('mission')}
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">{t('disclaimerTitle')}</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            {t('disclaimer')}
          </p>
        </div>

        <div className="flex justify-center gap-4 pt-4">
          <LocaleLink
            href="/tickets"
            className={cn(buttonVariants({ variant: 'default' }), 'rounded-lg')}
          >
            {t('cta')}
          </LocaleLink>
          <LocaleLink
            href="/contact"
            className={cn(buttonVariants({ variant: 'outline' }), 'rounded-lg')}
          >
            {t('contactCta')}
          </LocaleLink>
        </div>
      </div>
    </Container>
  );
}
