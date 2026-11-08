'use client';

/** 裂变机制二：上锁/解锁内容卡片（G1–G4）。 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';
import {
  BACKSTORIES,
  BACKSTORY_FIGHTER_NAMES,
  BACKSTORY_TITLES,
} from '@/data/viral-gated-content';
import MilestoneBar from './milestone-bar';

export type GatedItemVM = {
  content_id: string;
  type: 'share' | 'milestone' | 'tier' | 'achievement';
  title: string;
  locked: boolean;
  lock_reason: 'share' | 'milestone' | 'tier' | 'unlocked';
  milestone?: { current: number; threshold: number };
};

function fighterSlugOf(contentId: string): string | null {
  return contentId.startsWith('backstory:')
    ? contentId.slice('backstory:'.length)
    : null;
}

export default function GatedContentCard({ item }: { item: GatedItemVM }) {
  const t = useTranslations('Brawlverse.viral.gated');
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(!item.locked);

  const slug = fighterSlugOf(item.content_id);
  const fighterName = slug ? (BACKSTORY_FIGHTER_NAMES[slug] ?? slug) : null;

  const doShare = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/brawlverse/viral/share-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_id: item.content_id,
          device_id: deviceId(),
          pick: fighterName ? `${fighterName} to win` : undefined,
        }),
      });
      const j = (await r.json()) as { intent_url?: string };
      if (j.intent_url)
        window.open(j.intent_url, '_blank', 'noopener,width=550,height=420');
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/brawlverse/viral/share-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_id: item.content_id,
          device_id: deviceId(),
        }),
      });
      const j = (await r.json()) as { unlocked?: boolean };
      if (j.unlocked) setUnlocked(true);
    } finally {
      setBusy(false);
    }
  };

  // ---- 已解锁：展示正文（G1）或通用已解锁态 ----
  if (unlocked) {
    const body = slug ? BACKSTORIES[slug] : null;
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-4">
        <div className="text-sm font-black tracking-wide text-emerald-300">
          {t('unlockedTitle')}
        </div>
        <div className="mt-1 text-lg font-extrabold text-white">
          {slug ? BACKSTORY_TITLES[slug] : item.title}
        </div>
        {body ? (
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-300">
            {body.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">{t('unlockedBody')}</p>
        )}
      </div>
    );
  }

  // ---- 上锁态 ----
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
      <div className="text-sm font-black tracking-wide text-zinc-400">
        {t('lockedTitle')}
      </div>
      <div className="mt-1 text-base font-bold text-white">{item.title}</div>

      {item.lock_reason === 'share' && (
        <>
          <p className="mt-2 text-sm text-zinc-400">
            {fighterName
              ? t('lockedShareFighter', { fighter: fighterName })
              : t('lockedShare')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={doShare}
              disabled={busy}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {t('shareOnX')}
            </button>
            <button
              type="button"
              onClick={doConfirm}
              disabled={busy}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {t('iveShared')}
            </button>
          </div>
        </>
      )}

      {item.lock_reason === 'milestone' && item.milestone && (
        <>
          <MilestoneBar
            current={item.milestone.current}
            threshold={item.milestone.threshold}
            unlocked={false}
          />
          <p className="mt-2 text-xs text-zinc-500">{t('milestoneHint')}</p>
        </>
      )}

      {item.lock_reason === 'tier' && (
        <p className="mt-2 text-sm text-amber-200/80">{t('tierHint')}</p>
      )}
    </div>
  );
}
