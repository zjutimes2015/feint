'use client';

/** 裂变机制一：近失结算页分支 UI（spec §1）。无动画，大字排版。 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';

type NearMissData = {
  user_side: 'yes' | 'no' | null;
  winning_side: string | null;
  near_miss: {
    triggered: boolean;
    peak_price: number | null;
    final_price: number | null;
  };
};

export default function NearMissSettlement({ marketId }: { marketId: string }) {
  const t = useTranslations('Brawlverse.viral.nearMiss');
  const [data, setData] = useState<NearMissData | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/brawlverse/viral/settlement?market=${encodeURIComponent(marketId)}&device_id=${encodeURIComponent(deviceId())}`,
          { cache: 'no-store' }
        );
        const j = (await r.json()) as NearMissData;
        if (alive) setData(j);
      } catch {
        /* 静默失败：不渲染 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [marketId]);

  if (!data?.near_miss.triggered) return null;

  const peak = data.near_miss.peak_price;

  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
      <div className="text-2xl font-black tracking-tight text-amber-300">
        {t('title')}
      </div>
      <p className="mt-1 text-sm text-amber-100/80">
        {peak !== null
          ? t('subtitlePrice', { price: peak })
          : t('subtitleClose')}
      </p>
      <div className="mt-3 flex gap-2">
        <a
          href="/bet"
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-extrabold text-black hover:bg-amber-300"
        >
          {t('runItBack')}
        </a>
        <a
          href="/bet"
          className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-900/40"
        >
          {t('seeAll')}
        </a>
      </div>
    </div>
  );
}
