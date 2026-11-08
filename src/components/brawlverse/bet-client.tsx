'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';

type Wallet = {
  balance: number;
  next_claim_in_s: number;
  daily_claim: number;
  max_bet: number;
  tier: string;
  vote_weight: number;
};

type Market = {
  id: string;
  bout_id: string;
  market_type: string;
  question: string;
  selections: string[];
  status: string;
  pools: Record<string, number>;
  total_pool: number;
  implied_odds: Record<string, number | null>;
};

type BoardRow = { rank: number; player: string; balance: number };

function fmtDur(s: number): string {
  const sec = Math.max(0, Math.trunc(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function BetClient() {
  const t = useTranslations('Brawlverse.bet');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

  const load = useCallback(async () => {
    const me = deviceId();
    try {
      const [wr, mr, br] = await Promise.all([
        fetch(`/api/betting?op=wallet&device_id=${encodeURIComponent(me)}`),
        fetch('/api/betting?op=markets'),
        fetch('/api/betting?op=leaderboard'),
      ]);
      const w = (await wr.json()) as Wallet;
      const m = (await mr.json()) as { markets?: Market[] };
      const b = (await br.json()) as { leaderboard?: BoardRow[] };
      setWallet(w);
      setLeft(Number(w.next_claim_in_s) || 0);
      setMarkets(m.markets ?? []);
      setBoard(b.leaderboard ?? []);
    } catch {
      setErr(t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 20000);
    const tick = window.setInterval(
      () => setLeft((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  async function claim() {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await fetch('/api/betting?op=claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId() }),
      });
      const j = (await r.json()) as {
        claimed?: number;
        balance?: number;
        error?: string;
        next_claim_in_s?: number;
      };
      if (!r.ok) {
        if (j.next_claim_in_s) setLeft(Number(j.next_claim_in_s));
        setErr(
          j.error === 'already claimed'
            ? t('alreadyClaimed')
            : t('claimFailed', { error: j.error || r.status })
        );
        return;
      }
      setMsg(
        t('claimed', {
          amount: j.claimed ?? 0,
          balance: j.balance ?? 0,
        })
      );
      await load();
    } catch {
      setErr(t('networkErr'));
    } finally {
      setBusy(false);
    }
  }

  async function placeBet(m: Market) {
    const sel = pick[m.id];
    if (!sel) {
      setErr(t('pickFirst'));
      return;
    }
    const amt = Math.trunc(Number(amount[m.id] || '0'));
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr(t('invalidAmount'));
      return;
    }
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await fetch('/api/betting?op=bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: m.id,
          selection: sel,
          amount: amt,
          device_id: deviceId(),
        }),
      });
      const j = (await r.json()) as {
        error?: string;
        balance?: number;
        amount?: number;
      };
      if (!r.ok) {
        if (j.error === 'insufficient balance') setErr(t('insufficient'));
        else if (j.error?.startsWith('market is')) setErr(t('marketLocked'));
        else setErr(t('betFailed', { error: j.error || r.status }));
        return;
      }
      setMsg(
        t('betOk', {
          sel,
          amount: j.amount ?? amt,
          balance: j.balance ?? 0,
        })
      );
      setAmount((a) => ({ ...a, [m.id]: '' }));
      await load();
    } catch {
      setErr(t('networkErr'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="brawl-section">
        <h2 className="brawl-h2">{t('walletTitle')}</h2>
        <div className="brawl-panel">
          <div className="brawl-wallet">
            <div className="brawl-cell">
              <div className="brawl-k">{t('kBalance')}</div>
              <div className="brawl-v">
                {wallet ? wallet.balance.toLocaleString() : '…'}
              </div>
            </div>
            <div className="brawl-cell">
              <div className="brawl-k">{t('kDaily')}</div>
              <div className="brawl-v">{wallet ? wallet.daily_claim : '…'}</div>
            </div>
            <div className="brawl-cell">
              <div className="brawl-k">{t('kMaxBet')}</div>
              <div className="brawl-v">
                {wallet ? wallet.max_bet.toLocaleString() : '…'}
              </div>
            </div>
            <div className="brawl-cell">
              <div className="brawl-k">{t('kTier')}</div>
              <div className="brawl-v" style={{ fontSize: 18 }}>
                {wallet ? wallet.tier.toUpperCase() : '…'}
              </div>
            </div>
          </div>
          <div className="brawl-row brawl-gap">
            <button
              type="button"
              className="brawl-btn"
              onClick={() => void claim()}
              disabled={busy || left > 0}
            >
              {left > 0
                ? `${t('claimTomorrow')} · ${fmtDur(left)}`
                : t('claimNow', { amount: wallet ? wallet.daily_claim : 0 })}
            </button>
            <button
              type="button"
              className="brawl-btn brawl-btn--ghost"
              onClick={() => void load()}
              disabled={busy}
            >
              {t('refresh')}
            </button>
          </div>
          {msg ? <p className="brawl-ok">{msg}</p> : null}
          {err ? <p className="brawl-warn">{err}</p> : null}
          <p className="brawl-note">{t('walletNote')}</p>
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('marketsTitle')}</h2>
        {markets.length === 0 ? (
          <div className="brawl-panel">
            <h3>{t('noMarkets')}</h3>
            <p>{t('noMarketsBody')}</p>
          </div>
        ) : (
          markets.map((m) => (
            <div className="brawl-mkt" key={m.id}>
              <h3>{m.question}</h3>
              <p className="brawl-meta">
                {m.market_type.toUpperCase()} · {m.bout_id} · {t('totalPool')}{' '}
                {m.total_pool.toLocaleString()}
                {m.status !== 'open' ? ` · ${t('locked')}` : ''}
              </p>
              {m.selections.map((s) => {
                const odds = m.implied_odds[s];
                return (
                  <button
                    key={s}
                    type="button"
                    className={`brawl-sel${pick[m.id] === s ? ' is-on' : ''}`}
                    onClick={() => setPick((p) => ({ ...p, [m.id]: s }))}
                  >
                    <span className="brawl-name">{s}</span>
                    <span>
                      <span className="brawl-odd">
                        {odds === null
                          ? t('waitingFirst')
                          : `×${odds.toFixed(2)}`}
                      </span>
                      <span className="brawl-pool">
                        {' '}
                        {t('pool')} {Number(m.pools[s] || 0).toLocaleString()}
                      </span>
                    </span>
                  </button>
                );
              })}
              <div className="brawl-row brawl-gap">
                <input
                  className="brawl-field"
                  style={{ width: 160 }}
                  inputMode="numeric"
                  placeholder={t('betAmountPlaceholder', {
                    max: wallet ? wallet.max_bet : 100000,
                  })}
                  value={amount[m.id] || ''}
                  onChange={(e) =>
                    setAmount((a) => ({ ...a, [m.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="brawl-btn"
                  onClick={() => void placeBet(m)}
                  disabled={busy || m.status !== 'open'}
                >
                  {t('placeBet')}
                </button>
                <span className="brawl-note">{t('betNote')}</span>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('leaderboardTitle')}</h2>
        {board.length === 0 ? (
          <p className="brawl-note">{t('noPlayers')}</p>
        ) : (
          <table className="brawl-standings">
            <tbody>
              <tr>
                <th>#</th>
                <th>{t('player')}</th>
                <th>{t('balance')}</th>
              </tr>
              {board.map((b) => (
                <tr key={b.player + b.rank}>
                  <td>{b.rank}</td>
                  <td>{b.player}</td>
                  <td>{b.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="brawl-note">{t('leaderboardNote')}</p>
      </section>
    </>
  );
}
