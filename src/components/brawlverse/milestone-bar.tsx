'use client';

/** 裂变机制二：里程碑进度条（G2 全站投票解锁）。 */
import { useTranslations } from 'next-intl';

export default function MilestoneBar({
  current,
  threshold,
  unlocked,
}: {
  current: number;
  threshold: number;
  unlocked: boolean;
}) {
  const t = useTranslations('Brawlverse.viral.gated');
  const pct = Math.min(
    100,
    Math.round((current / Math.max(1, threshold)) * 100)
  );

  if (unlocked) {
    return (
      <div className="mt-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 px-3 py-2 text-sm font-bold text-emerald-300">
        {t('milestoneDone')}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-zinc-400">
        {t('milestoneProgress', {
          current: current.toLocaleString(),
          threshold: threshold.toLocaleString(),
        })}
      </div>
    </div>
  );
}
