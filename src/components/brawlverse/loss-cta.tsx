'use client';

/** 裂变机制三：翻盘 CTA 模块（spec §3）。结果页直接渲染。 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';

type LossCtaData = {
  show: boolean;
  loser_slug: string | null;
  loser_name: string | null;
  next_market_url: string;
};

export default function LossCta({
  boutId,
  marketId,
}: {
  boutId?: string;
  marketId?: string;
}) {
  const t = useTranslations('Brawlverse.viral.lossCta');
  const [data, setData] = useState<LossCtaData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = marketId
          ? `market=${encodeURIComponent(marketId)}`
          : `bout=${encodeURIComponent(boutId || '')}`;
        const r = await fetch(
          `/api/brawlverse/viral/loss-cta?${qs}&device_id=${encodeURIComponent(deviceId())}`,
          { cache: 'no-store' }
        );
        const j = (await r.json()) as LossCtaData;
        if (alive) setData(j);
      } catch {
        /* 静默失败：不渲染 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [boutId, marketId]);

  if (!data?.show || dismissed) return null;

  const title = data.loser_name
    ? t('titleFighter', { fighter: data.loser_name.toUpperCase() })
    : t('titleGeneric');

  return (
    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/30 p-4">
      <div className="text-xl font-black tracking-tight text-red-300">
        {title}
      </div>
      <p className="mt-1 text-sm text-red-100/80">{t('subtitle')}</p>
      <div className="mt-3 flex gap-2">
        <a
          href={data.next_market_url}
          className="rounded-lg bg-red-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-red-400"
        >
          {t('betRematch')}
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-900/40"
        >
          {t('walkAway')}
        </button>
      </div>
    </div>
  );
}
