'use client';

/** Phase 2: Kalshi 式合约市场前端（价格=概率、买卖、持仓、成交流）。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deviceId } from '@/lib/brawlverse/device';
import NearMissSettlement from './near-miss-settlement';
import LossCta from './loss-cta';

type CMarket = {
  id: string;
  bout_id: string;
  market_kind: string;
  question: string;
  rule_text: string;
  status: string;
  price_yes: number;
  winning_side: string | null;
};

type Position = {
  market_id: string;
  question: string;
  market_kind: string;
  status: string;
  yes_contracts: number;
  no_contracts: number;
  price_yes: number;
  current_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  winning_side: string | null;
};

type TapeRow = {
  side: string;
  action: string;
  contracts: number;
  credits: number;
  avg_price: number;
  created_at: number;
  player: string;
};

type PnlRow = {
  rank: number;
  player: string;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
};

const KIND_COLOR: Record<string, string> = {
  winner: '#ffb400',
  method: '#ff6b6b',
  round: '#4dabf7',
  storyline: '#b47bff',
};

function Sparkline({ ticks }: { ticks: number[] }) {
  if (ticks.length < 2) return null;
  const w = 120;
  const h = 32;
  const pts = ticks
    .map(
      (p, i) =>
        `${((i / (ticks.length - 1)) * w).toFixed(1)},${(h - ((p - 1) / 98) * (h - 4) - 2).toFixed(1)}`
    )
    .join(' ');
  const up = ticks[ticks.length - 1] >= ticks[0];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? '#37c26a' : '#ff6b6b'}
        strokeWidth="2"
      />
    </svg>
  );
}

export default function ContractClient() {
  const t = useTranslations('Brawlverse.bet.contract');
  const [markets, setMarkets] = useState<CMarket[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [board, setBoard] = useState<PnlRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, number[]>>({});
  const [tape, setTape] = useState<Record<string, TapeRow[]>>({});
  const [showRules, setShowRules] = useState<Record<string, boolean>>({});
  // 交易面板
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const quoteTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const me = deviceId();
    try {
      const [mr, pr, br, wr] = await Promise.all([
        fetch('/api/contract?op=markets'),
        fetch(`/api/contract?op=positions&device_id=${encodeURIComponent(me)}`),
        fetch('/api/contract?op=leaderboard'),
        fetch(`/api/betting?op=wallet&device_id=${encodeURIComponent(me)}`),
      ]);
      setMarkets(((await mr.json()) as any).markets ?? []);
      setPositions(((await pr.json()) as any).positions ?? []);
      setBoard(((await br.json()) as any).leaderboard ?? []);
      const w = (await wr.json()) as any;
      setBalance(Number(w.balance ?? 0));
    } catch {
      setErr(t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 15000);
    return () => window.clearInterval(poll);
  }, [load]);

  const toggleMarket = useCallback(
    async (id: string) => {
      const next = openId === id ? null : id;
      setOpenId(next);
      setAmount('');
      setQuote(null);
      setMsg('');
      if (next && !ticks[id]) {
        try {
          const [tr, tp] = await Promise.all([
            fetch(
              `/api/contract?op=ticks&market_id=${encodeURIComponent(id)}&limit=60`
            ),
            fetch(
              `/api/contract?op=tape&market_id=${encodeURIComponent(id)}&limit=12`
            ),
          ]);
          const tk = (await tr.json()) as any;
          const ta = (await tp.json()) as any;
          setTicks((p) => ({
            ...p,
            [id]: (tk.ticks ?? []).map((x: any) => Number(x.price_yes)),
          }));
          setTape((p) => ({ ...p, [id]: ta.tape ?? [] }));
        } catch {
          /* 忽略 */
        }
      }
    },
    [openId, ticks]
  );

  // 试算（防抖）
  useEffect(() => {
    if (quoteTimer.current) window.clearTimeout(quoteTimer.current);
    if (!openId || !amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    quoteTimer.current = window.setTimeout(async () => {
      try {
        const q = new URLSearchParams({
          op: 'quote',
          market_id: openId,
          side,
          action,
          ...(action === 'buy' ? { credits: amount } : { contracts: amount }),
        });
        const r = await fetch(`/api/contract?${q.toString()}`);
        const d = (await r.json()) as any;
        setQuote(r.ok ? d.quote : null);
      } catch {
        setQuote(null);
      }
    }, 400);
    return () => {
      if (quoteTimer.current) window.clearTimeout(quoteTimer.current);
    };
  }, [openId, side, action, amount]);

  const doTrade = useCallback(async () => {
    if (!openId || !amount || Number(amount) <= 0 || busy) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await fetch('/api/contract?op=trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId(),
          market_id: openId,
          side,
          action,
          ...(action === 'buy'
            ? { credits: Math.trunc(Number(amount)) }
            : { contracts: Number(amount) }),
        }),
      });
      const d = (await r.json()) as any;
      if (!r.ok) throw new Error(d.error || t('tradeFailed'));
      setMsg(
        t('tradeOk', {
          n: Number(d.contracts).toFixed(2),
          side: side.toUpperCase(),
          fee: d.fee,
        })
      );
      setAmount('');
      setQuote(null);
      await load();
      // 刷新 tape
      try {
        const tp = await fetch(
          `/api/contract?op=tape&market_id=${encodeURIComponent(openId)}&limit=12`
        );
        const ta = (await tp.json()) as any;
        setTape((p) => ({ ...p, [openId]: ta.tape ?? [] }));
      } catch {
        /* 忽略 */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('tradeFailed'));
    } finally {
      setBusy(false);
    }
  }, [openId, amount, side, action, busy, load, t]);

  const sellAll = useCallback(
    async (p: Position, s: 'yes' | 'no') => {
      const c = s === 'yes' ? p.yes_contracts : p.no_contracts;
      if (c <= 0 || busy) return;
      setBusy(true);
      setErr('');
      try {
        const r = await fetch('/api/contract?op=trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId(),
            market_id: p.market_id,
            side: s,
            action: 'sell',
            contracts: c,
          }),
        });
        const d = (await r.json()) as any;
        if (!r.ok) throw new Error(d.error || t('tradeFailed'));
        setMsg(t('soldOk', { n: Number(d.contracts).toFixed(2) }));
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : t('tradeFailed'));
      } finally {
        setBusy(false);
      }
    },
    [busy, load, t]
  );

  const fillMax = useCallback((p: Position, s: 'yes' | 'no') => {
    setOpenId(p.market_id);
    setSide(s);
    setAction('sell');
    setAmount(String(s === 'yes' ? p.yes_contracts : p.no_contracts));
  }, []);

  return (
    <section className="brawl-section" style={{ maxWidth: 900, marginTop: 24 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 4 }}>📈 {t('title')}</h2>
      <p
        style={{
          textAlign: 'center',
          color: '#999',
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        {t('subtitle')}
      </p>
      <p
        style={{
          textAlign: 'center',
          color: '#666',
          fontSize: 12,
          marginBottom: 16,
        }}
      >
        {t('feeNote')}
        {balance !== null && (
          <span style={{ color: '#ffb400', marginLeft: 12 }}>
            💰 {balance.toLocaleString()}
          </span>
        )}
      </p>
      {err && (
        <div
          style={{
            background: '#3a1111',
            color: '#ffb4b4',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}
      {msg && (
        <div
          style={{
            background: '#0f2f1a',
            color: '#9be29b',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      {markets.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666' }}>{t('noMarkets')}</p>
      )}
      {markets.map((m) => {
        const open = openId === m.id;
        const kc = KIND_COLOR[m.market_kind] || '#999';
        return (
          <div
            key={m.id}
            style={{
              border: '1px solid #333',
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
              background: '#141414',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: kc,
                    border: `1px solid ${kc}`,
                    borderRadius: 4,
                    padding: '1px 6px',
                    marginRight: 8,
                  }}
                >
                  {t(`kind_${m.market_kind}` as any)}
                </span>
                <span style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
                  {m.question}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: m.price_yes >= 50 ? '#37c26a' : '#ff6b6b',
                  }}
                >
                  {m.price_yes}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>YES ¢</div>
              </div>
            </div>
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}
            >
              {ticks[m.id] && ticks[m.id].length > 1 && (
                <Sparkline ticks={ticks[m.id]} />
              )}
              <button
                type="button"
                onClick={() => toggleMarket(m.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4dabf7',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {open ? t('collapse') : t('trade')}
              </button>
              <button
                type="button"
                onClick={() =>
                  setShowRules((p) => ({ ...p, [m.id]: !p[m.id] }))
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                📜 {t('rules')}
              </button>
              {m.status !== 'open' && (
                <span style={{ fontSize: 11, color: '#ffb400' }}>
                  {m.status === 'locked'
                    ? t('locked')
                    : `${t('settled')}: ${m.winning_side?.toUpperCase()}`}
                </span>
              )}
            </div>
            {showRules[m.id] && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#aaa',
                  background: '#1c1c1c',
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                {m.rule_text}
              </div>
            )}

            {open && m.status === 'open' && (
              <div
                style={{
                  marginTop: 12,
                  borderTop: '1px solid #2a2a2a',
                  paddingTop: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {(['yes', 'no'] as const).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setSide(s)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 8,
                        border:
                          side === s
                            ? `2px solid ${s === 'yes' ? '#37c26a' : '#ff6b6b'}`
                            : '1px solid #444',
                        background: side === s ? '#1c1c1c' : '#101010',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                  {(['buy', 'sell'] as const).map((a) => (
                    <button
                      type="button"
                      key={a}
                      onClick={() => setAction(a)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 8,
                        border:
                          action === a ? '2px solid #ffb400' : '1px solid #444',
                        background: action === a ? '#1c1c1c' : '#101010',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {t(a)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ''))
                    }
                    placeholder={
                      action === 'buy'
                        ? t('amountCredits')
                        : t('amountContracts')
                    }
                    inputMode="decimal"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #444',
                      background: '#0d0d0d',
                      color: '#fff',
                      fontSize: 15,
                    }}
                  />
                  <button
                    type="button"
                    onClick={doTrade}
                    disabled={busy || !amount || Number(amount) <= 0}
                    style={{
                      padding: '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#ffb400',
                      color: '#111',
                      fontWeight: 800,
                      cursor: busy ? 'wait' : 'pointer',
                    }}
                  >
                    {t('execute')}
                  </button>
                </div>
                {quote && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                    ≈ {Number(quote.contracts).toFixed(2)} {t('contracts')} @{' '}
                    {quote.avg_price}¢ · {t('fee')} {quote.fee}
                    {quote.credits_out !== undefined &&
                      ` · ${t('receive')} ${quote.credits_out}`}
                  </div>
                )}
                {tape[m.id] && tape[m.id].length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{ fontSize: 12, color: '#666', marginBottom: 4 }}
                    >
                      ⚡ {t('tape')}
                    </div>
                    {tape[m.id].slice(0, 6).map((row, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          color: '#888',
                          display: 'flex',
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            color: row.side === 'yes' ? '#37c26a' : '#ff6b6b',
                            fontWeight: 700,
                          }}
                        >
                          {row.side.toUpperCase()}
                        </span>
                        <span>
                          {row.action === 'buy' ? t('buy') : t('sell')}
                        </span>
                        <span>
                          {Number(row.contracts).toFixed(1)} @ {row.avg_price}¢
                        </span>
                        <span style={{ color: '#555' }}>{row.player}…</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {positions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>💼 {t('positions')}</h3>
          {positions.map((p) => (
            <div
              key={p.market_id}
              style={{
                border: '1px solid #2a2a2a',
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                background: '#101010',
              }}
            >
              <div style={{ fontSize: 13, color: '#ddd', marginBottom: 6 }}>
                {p.question}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 12,
                  color: '#999',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {p.yes_contracts > 0 && (
                  <span>
                    YES {p.yes_contracts.toFixed(1)} @ {p.price_yes}¢
                    {p.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => sellAll(p, 'yes')}
                        disabled={busy}
                        style={{
                          marginLeft: 6,
                          background: '#3a1111',
                          color: '#ff8888',
                          border: 'none',
                          borderRadius: 6,
                          padding: '3px 10px',
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        {t('sellAll')}
                      </button>
                    )}
                  </span>
                )}
                {p.no_contracts > 0 && (
                  <span>
                    NO {p.no_contracts.toFixed(1)} @ {100 - p.price_yes}¢
                    {p.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => sellAll(p, 'no')}
                        disabled={busy}
                        style={{
                          marginLeft: 6,
                          background: '#3a1111',
                          color: '#ff8888',
                          border: 'none',
                          borderRadius: 6,
                          padding: '3px 10px',
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        {t('sellAll')}
                      </button>
                    )}
                  </span>
                )}
                <span
                  style={{
                    color: p.unrealized_pnl >= 0 ? '#37c26a' : '#ff6b6b',
                    fontWeight: 700,
                  }}
                >
                  {p.unrealized_pnl >= 0 ? '+' : ''}
                  {p.unrealized_pnl}
                </span>
              </div>
              {/* 裂变三机制：已结算仓位 → 近失结算页（机制一）+ 翻盘 CTA（机制三），组件内部自判定是否展示 */}
              {p.status === 'settled' && (
                <>
                  <NearMissSettlement marketId={p.market_id} />
                  <LossCta marketId={p.market_id} />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {board.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>🏆 {t('pnlBoard')}</h3>
          <table
            style={{
              width: '100%',
              fontSize: 13,
              color: '#ddd',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ color: '#888' }}>
                <th style={{ padding: 6 }}>#</th>
                <th style={{ padding: 6 }}>{t('player')}</th>
                <th style={{ padding: 6, textAlign: 'right' }}>P&L</th>
              </tr>
            </thead>
            <tbody>
              {board.slice(0, 10).map((r) => (
                <tr key={r.player} style={{ borderTop: '1px solid #222' }}>
                  <td style={{ padding: 6, textAlign: 'center' }}>{r.rank}</td>
                  <td style={{ padding: 6 }}>{r.player}…</td>
                  <td
                    style={{
                      padding: 6,
                      textAlign: 'right',
                      color: r.total_pnl >= 0 ? '#37c26a' : '#ff6b6b',
                      fontWeight: 700,
                    }}
                  >
                    {r.total_pnl >= 0 ? '+' : ''}
                    {r.total_pnl.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
