import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { LocaleLink } from '@/i18n/navigation';
import { qOne } from '@/lib/brawlverse/db';
import { getTier, type TierName } from '@/lib/brawlverse/entitlements';
import { getSession } from '@/lib/server';
import { Routes } from '@/routes';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

type UpgradeTier = 'ringside' | 'booker' | 'promoter';

const NEXT_TIER: Record<TierName, UpgradeTier | null> = {
  free: 'ringside',
  ringside: 'booker',
  booker: 'promoter',
  promoter: null,
  annual: null,
};

function rankOf(
  score: number
): 'rookie' | 'contender' | 'ringsworn' | 'champion' {
  if (score >= 300) return 'champion';
  if (score >= 100) return 'ringsworn';
  if (score >= 25) return 'contender';
  return 'rookie';
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect(Routes.Login);

  const t = await getTranslations('Dashboard.myRecord');
  const header = await getTranslations('Dashboard.dashboard');
  const identityKey = `u:${session.user.id}`;

  const votes = await qOne<{ n: string; w: string | null }>(
    'SELECT COUNT(*) AS n, COALESCE(SUM(weight),0) AS w FROM votes WHERE device_hash = $1',
    [identityKey]
  );
  const predictions = await qOne<{ n: string; wins: string }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE
              WHEN (r.winning_branch = 'a' AND v.choice = r.tactic_a)
                OR (r.winning_branch = 'b' AND v.choice = r.tactic_b)
              THEN 1 ELSE 0 END),0) AS wins
     FROM votes v
     JOIN live_rounds r
       ON r.bout_id = v.bout_id AND r.round_no = v.round_no
     WHERE v.device_hash = $1
       AND r.state IN ('REVEAL','done')
       AND r.winning_branch IN ('a','b')`,
    [identityKey]
  );
  const credits = await qOne<{ balance: string }>(
    'SELECT balance FROM player_credits WHERE device_hash = $1',
    [identityKey]
  );
  const arena = await qOne<{ wins: string; losses: string; kos: string }>(
    `SELECT COALESCE(SUM(wins),0) AS wins,
            COALESCE(SUM(losses),0) AS losses,
            COALESCE(SUM(kos),0) AS kos
     FROM arena_rankings WHERE player = $1`,
    [identityKey]
  );

  const voteCount = Number(votes?.n || 0);
  const voteWeight = Number(votes?.w || 0);
  const settledTotal = Number(predictions?.n || 0);
  const settledWins = Number(predictions?.wins || 0);
  const accuracy = settledTotal
    ? Math.round((settledWins / settledTotal) * 100)
    : 0;
  const balance = Number(credits?.balance || 0);
  const arenaWins = Number(arena?.wins || 0);
  const arenaLosses = Number(arena?.losses || 0);
  const arenaKos = Number(arena?.kos || 0);

  const score = voteCount + settledWins * 5 + arenaWins * 2;
  const rank = rankOf(score);
  const tier = await getTier(identityKey);
  const next = NEXT_TIER[tier];

  const breadcrumbs = [{ label: header('title'), isCurrentPage: true }];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
          <header>
            <h1 className="brawl-display text-3xl text-brawl-gold">
              {t('title')}
            </h1>
            <p className="brawl-note">
              {t('subtitle', { name: session.user.name || 'FAN' })}
            </p>
          </header>

          <section className="brawl-panel">
            <h3>{t('statsTitle')}</h3>
            <div className="brawl-wallet">
              <div className="brawl-cell">
                <div className="brawl-k">{t('votesLabel')}</div>
                <div className="brawl-v">{voteCount}</div>
                <div className="brawl-k">
                  {t('weightLabel', { weight: voteWeight })}
                </div>
              </div>
              <div className="brawl-cell">
                <div className="brawl-k">{t('accuracyLabel')}</div>
                <div className="brawl-v">
                  {settledTotal ? `${accuracy}%` : '—'}
                </div>
                <div className="brawl-k">
                  {settledTotal
                    ? t('accuracyDetail', {
                        wins: settledWins,
                        total: settledTotal,
                      })
                    : t('noPredictions')}
                </div>
              </div>
              <div className="brawl-cell">
                <div className="brawl-k">{t('creditsLabel')}</div>
                <div className="brawl-v">{balance}</div>
                <div className="brawl-k">
                  {arenaWins || arenaLosses
                    ? t('arenaDetail', {
                        wins: arenaWins,
                        losses: arenaLosses,
                        kos: arenaKos,
                      })
                    : t('noArena')}
                </div>
              </div>
              <div className="brawl-cell">
                <div className="brawl-k">{t('rankLabel')}</div>
                <div className="brawl-v">{t(`ranks.${rank}`)}</div>
                <div className="brawl-k">{t('scoreLabel', { score })}</div>
              </div>
            </div>
          </section>

          <section className="brawl-panel">
            <h3>{t('unlockTitle')}</h3>
            {next ? (
              <p>
                {t('unlockBody', {
                  tier: t(`tiers.${next}.name`),
                  perk: t(`tiers.${next}.perk`),
                })}
              </p>
            ) : (
              <p>{t('unlockMax')}</p>
            )}
            <div className="brawl-row brawl-gap">
              <LocaleLink href={Routes.Live} className="brawl-cta">
                {t('ctaLive')}
              </LocaleLink>
              <LocaleLink href={Routes.Arena} className="brawl-cta">
                {t('ctaArena')}
              </LocaleLink>
              <LocaleLink href={Routes.FanForge} className="brawl-cta">
                {t('ctaForge')}
              </LocaleLink>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
