'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { websiteConfig } from '@/config/website';
import { deviceId } from '@/lib/brawlverse/device';

export default function TicketsClient() {
  const t = useTranslations('Brawlverse.tickets');
  const [currentTier, setCurrentTier] = useState('free');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  // 权益数字直接读 TIERS,避免"文案说 3×、系统其实 2×"的错位
  const [perks, setPerks] = useState<
    Record<
      string,
      { vote_weight: number; bet_max_mult: number; early_access: boolean }
    >
  >({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/subscription?op=tiers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.tiers) return;
        const map: Record<string, any> = {};
        for (const x of j.tiers) map[x.name] = x.perks;
        setPerks(map);
      })
      .catch(() => {
        // 兜底:拿不到数字就只展示文案权益,不阻断购买
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tiers = t.raw('tiers') as {
    id: string;
    name: string;
    price: number;
    tagline: string;
    perks: string[];
  }[];
  const tierLabels = t.raw('tierLabels') as Record<string, string>;
  // 只展示已配置 Waffo 商品的档位:商品没建的档位点了也只会报错
  const purchasable = new Set(
    Object.values(websiteConfig.price.plans)
      .filter((plan) => !plan.disabled)
      .map((plan) => plan.id)
  );

  useEffect(() => {
    let cancelled = false;
    const fetchTier = async () => {
      try {
        const r = await fetch(
          `/api/subscription?op=status&device_id=${encodeURIComponent(deviceId())}`
        );
        const j = (await r.json()) as { entitlements?: { tier?: string } };
        return j.entitlements?.tier || 'free';
      } catch {
        // 未登录状态按 free 显示
        return 'free';
      }
    };
    (async () => {
      const paid = new URLSearchParams(window.location.search).get('paid');
      // 刚付完款时 webhook 可能还在路上：带退避轮询几次再定档位
      const delays = paid ? [0, 1500, 3000, 6000] : [0];
      let tier = 'free';
      for (const d of delays) {
        if (d) await new Promise((res) => setTimeout(res, d));
        if (cancelled) return;
        tier = await fetchTier();
        if (tier !== 'free' || !paid) break;
      }
      if (!cancelled) setCurrentTier(tier);
      if (paid) setMsg(t('paidDone'));
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function buy(id: string) {
    setBusy(id);
    setMsg('');
    try {
      const r = await fetch('/api/subscription?op=checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: id,
          device_id: deviceId(),
          success_url: `${window.location.origin}/tickets?paid=1`,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (r.status === 501) {
        setMsg(t('notConfigured'));
        return;
      }
      if (!r.ok || !j.url) {
        setMsg(j.error || t('checkoutFailed'));
        return;
      }
      window.location.href = j.url;
    } catch {
      setMsg(t('networkErr'));
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="brawl-section">
      <p className="brawl-sub" style={{ marginBottom: 20 }}>
        {t('currentTier')}: <b>{tierLabels[currentTier] || currentTier}</b>
      </p>
      <div className="brawl-cards">
        {tiers.map((tier) => {
          const active = currentTier === tier.id;
          // 商品没建的档位不能下单:价格仍然展示,但按钮置灰
          const available = purchasable.has(tier.id);
          // annual 是按年付费
          const yearly = tier.id === 'annual';
          const price = yearly
            ? `$${tier.price.toFixed(2)}/yr`
            : `$${tier.price.toFixed(2)}/mo`;
          return (
            <div
              className={`brawl-card${active ? ' brawl-card--gold' : ''}`}
              key={tier.id}
            >
              <div className="brawl-q">{active ? t('yourPass') : price}</div>
              <h3>{tier.name}</h3>
              <p className="brawl-style">{tier.tagline}</p>
              <p className="brawl-bio">
                {tier.perks.map((p) => (
                  <span key={p}>
                    · {p}
                    <br />
                  </span>
                ))}
              </p>
              {perks[tier.id] ? (
                <p className="brawl-q" style={{ fontSize: 13, marginTop: 8 }}>
                  {t('voteWeight')} ×{perks[tier.id].vote_weight} ·{' '}
                  {t('betCap')} ×{perks[tier.id].bet_max_mult} ·{' '}
                  {t('earlyAccess')} {perks[tier.id].early_access ? '✓' : '—'}
                </p>
              ) : null}
              <div className="brawl-gap" />
              <button
                type="button"
                className="brawl-btn brawl-btn--ghost"
                disabled={busy === tier.id || active || !available}
                onClick={() => void buy(tier.id)}
              >
                {active
                  ? t('active')
                  : busy === tier.id
                    ? t('opening')
                    : available
                      ? t('getPass')
                      : t('notAvailable')}
              </button>
            </div>
          );
        })}
      </div>
      <p className="brawl-note" style={{ textAlign: 'center' }}>
        {msg || t('legalNote')}
      </p>
    </section>
  );
}
