"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { deviceId } from "@/lib/device";

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
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function BetPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

  const load = useCallback(async () => {
    const me = deviceId();
    try {
      const [wr, mr, br] = await Promise.all([
        fetch(`/api/betting?op=wallet&device_id=${encodeURIComponent(me)}`),
        fetch("/api/betting?op=markets"),
        fetch("/api/betting?op=leaderboard"),
      ]);
      const w = (await wr.json()) as Wallet;
      const m = (await mr.json()) as { markets?: Market[] };
      const b = (await br.json()) as { leaderboard?: BoardRow[] };
      setWallet(w);
      setLeft(Number(w.next_claim_in_s) || 0);
      setMarkets(m.markets ?? []);
      setBoard(b.leaderboard ?? []);
    } catch {
      setErr("加载失败，刷新页面重试");
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 20000);
    const tick = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  async function claim() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/betting?op=claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setErr(j.error === "already claimed" ? "今天已经领过了，明天再来" : `领取失败：${j.error || r.status}`);
        return;
      }
      setMsg(`领到 ${j.claimed} 积分 · 余额 ${j.balance}`);
      await load();
    } catch {
      setErr("网络开小差，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function placeBet(m: Market) {
    const sel = pick[m.id];
    if (!sel) {
      setErr("先点一个选项");
      return;
    }
    const amt = Math.trunc(Number(amount[m.id] || "0"));
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("输入有效的下注额");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/betting?op=bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: m.id, selection: sel, amount: amt, device_id: deviceId() }),
      });
      const j = (await r.json()) as { error?: string; balance?: number; amount?: number };
      if (!r.ok) {
        if (j.error === "insufficient balance") setErr("余额不足，先领每日积分");
        else setErr(j.error === "market is locked" ? "这个市场已封盘" : `下注失败：${j.error || r.status}`);
        return;
      }
      setMsg(`下注成功：${sel} × ${j.amount} · 余额 ${j.balance}`);
      setAmount((a) => ({ ...a, [m.id]: "" }));
      await load();
    } catch {
      setErr("网络开小差，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopNav />
      <header className="hero small">
        <h1 className="logo">THE BOOK</h1>
        <p className="tagline">
          PICK A SIDE — <span>GET PAID</span>
        </p>
      </header>

      <section>
        <h2>YOUR WALLET</h2>
        <div className="panel">
          <div className="wallet">
            <div className="cell">
              <div className="k">BALANCE</div>
              <div className="v">{wallet ? wallet.balance.toLocaleString() : "…"}</div>
            </div>
            <div className="cell">
              <div className="k">DAILY CLAIM</div>
              <div className="v">{wallet ? wallet.daily_claim : "…"}</div>
            </div>
            <div className="cell">
              <div className="k">MAX BET</div>
              <div className="v">{wallet ? wallet.max_bet.toLocaleString() : "…"}</div>
            </div>
            <div className="cell">
              <div className="k">TIER</div>
              <div className="v" style={{ fontSize: 18 }}>
                {wallet ? wallet.tier.toUpperCase() : "…"}
              </div>
            </div>
          </div>
          <div className="row gap">
            <button className="btn" onClick={() => void claim()} disabled={busy || left > 0}>
              {left > 0 ? `明日再领 · ${fmtDur(left)}` : `领取 ${wallet ? wallet.daily_claim : 0} 积分`}
            </button>
            <button className="btn ghost" onClick={() => void load()} disabled={busy}>
              刷新
            </button>
          </div>
          {msg ? <p className="ok">{msg}</p> : null}
          {err ? <p className="warn">{err}</p> : null}
          <p className="note">纯娱乐虚拟积分，无现金价值、不可兑换。注册即送 1000 分，每天可再领一次。</p>
        </div>
      </section>

      <section>
        <h2>OPEN MARKETS</h2>
        {markets.length === 0 ? (
          <div className="panel">
            <h3>暂时没有开放的市场</h3>
            <p>新的赛程一开盘就会出现在这里。先去 EPISODES 看比赛、投战术票吧。</p>
          </div>
        ) : (
          markets.map((m) => (
            <div className="mkt" key={m.id}>
              <h3>{m.question}</h3>
              <p className="meta">
                {m.market_type.toUpperCase()} · {m.bout_id} · 总池 {m.total_pool.toLocaleString()}
                {m.status !== "open" ? " · 已封盘" : ""}
              </p>
              {m.selections.map((s) => {
                const odds = m.implied_odds[s];
                return (
                  <div
                    key={s}
                    className={"sel" + (pick[m.id] === s ? " on" : "")}
                    onClick={() => setPick((p) => ({ ...p, [m.id]: s }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setPick((p) => ({ ...p, [m.id]: s }));
                    }}
                  >
                    <span className="name">{s}</span>
                    <span>
                      <span className="odd">{odds === null ? "等待第一注" : `×${odds.toFixed(2)}`}</span>
                      <span className="pool"> 池 {Number(m.pools[s] || 0).toLocaleString()}</span>
                    </span>
                  </div>
                );
              })}
              <div className="row gap">
                <input
                  className="field"
                  style={{ width: 160 }}
                  inputMode="numeric"
                  placeholder={`下注额 1-${wallet ? wallet.max_bet : 100000}`}
                  value={amount[m.id] || ""}
                  onChange={(e) => setAmount((a) => ({ ...a, [m.id]: e.target.value }))}
                />
                <button
                  className="btn"
                  onClick={() => void placeBet(m)}
                  disabled={busy || m.status !== "open"}
                >
                  下注
                </button>
                <span className="note">赔率按同注分彩实时浮动 · 封盘后不可下注</span>
              </div>
            </div>
          ))
        )}
      </section>

      <section>
        <h2>LEADERBOARD</h2>
        {board.length === 0 ? (
          <p className="note">还没有人开户，第一注就是你的。</p>
        ) : (
          <table className="standings">
            <tbody>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Balance</th>
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
        <p className="note">玩家 ID 为设备指纹前 8 位 · 同一设备同一账户</p>
      </section>

      <footer>
        <p>BRAWLVERSE · Season 1 in production</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
