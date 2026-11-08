import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import TicketsClient from '@/components/brawlverse/tickets-client';
import { JsonLd } from '@/components/seo/json-ld';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'Brawlverse.tickets' });

  return constructMetadata({
    title: `${pt('metaTitle')} | ${t('title')}`,
    description: pt('metaDescription'),
    locale,
    pathname: '/tickets',
  });
}

/**
 * FAQ structured data (EN): mirrors the Tawk.to knowledge base articles and
 * public/llms.txt so search engines and AI assistants answer consistently.
 * Update all three places when pricing or rules change.
 */
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is BRAWLVERSE?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'BRAWLVERSE (feint.tv) is an AI-generated virtual boxing league. Eight original fighter characters — IRON JAW, VIPER, SLEDGE, MONSOON, VOLT, THE PROFESSOR, LA REINA and GOLIATH-7 — compete in cinematic bouts with trash talk, storylines, fan voting and prediction markets. All visuals are AI-generated and labeled as such.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much do BRAWLVERSE passes cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Five tiers in USD: FREE FAN ($0), RINGSIDE ($4.99/month), BOOKER ($14.99/month), PROMOTER ($49/month), and ANNUAL ($199/year, same perks as PROMOTER billed yearly). Monthly passes auto-renew and can be cancelled anytime, effective at the end of the billing period.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does betting work on BRAWLVERSE?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Fans trade YES/NO contracts (priced 1–99) on fight outcomes; each winning contract pays 100 fight coins. Prices are set by an LMSR automated market maker, early sell-back is allowed, and a 2% fee on winnings is recycled. Fight coins are virtual with no cash value and cannot be withdrawn or exchanged — entertainment only, not gambling.',
      },
    },
    {
      '@type': 'Question',
      name: 'When and where can I watch BRAWLVERSE fights?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All episodes are published free on feint.tv — no account needed to watch. Season 1 runs quarterfinals (QF1–QF4), semifinals and a championship, each released as a cinematic episode with pre-fight trash talk and post-fight storylines.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I create a BRAWLVERSE account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Click Sign In on feint.tv and register with email + password, or continue with Google or GitHub. Your account holds your pass, fight coins, votes and prediction positions across devices.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel my pass or get a refund?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You can cancel anytime; access continues to the end of the billing period with no partial refunds. Refunds are granted only for duplicate charges, charges after cancellation took effect, or full-period outages caused by us — request within 14 days via the contact page. Fight coins and prediction entries are never refundable.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is BRAWLVERSE available in my country?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Watching, collecting and voting are available worldwide. Prediction markets are geo-fenced and not available to visitors connecting from mainland China.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are props and stables?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Props are custom prediction markets you create for other fans to trade on; stables are branded teams of fighters competing on a creator leaderboard. Both are included with BOOKER and above.',
      },
    },
  ],
};

export default async function TicketsPage() {
  const t = await getTranslations('Brawlverse.tickets');
  const c = await getTranslations('Brawlverse.common');

  return (
    <div className="brawl-page">
      <JsonLd data={faqSchema} />
      <header className="brawl-hero brawl-hero--small">
        <h1 className="brawl-logo">{t('title')}</h1>
        <p className="brawl-tagline">
          {t('taglinePre')}
          <span>{t('taglineHighlight')}</span>
        </p>
        <p className="brawl-sub">
          {t('currentTier')}
          <br />
          {t('tierNote')}
        </p>
      </header>

      <TicketsClient />

      <footer className="brawl-footer">
        <p>{t('footer')}</p>
        <p className="brawl-aigc">{c('aigc')}</p>
      </footer>
    </div>
  );
}
