"use client";

import { useEffect, useState } from "react";

type Bout = {
  id: string;
  title: string;
  fighter_a: string;
  fighter_b: string;
  round_no: number;
  voting_open: boolean;
  tactic_note: string;
};

type BoutTally = { tally: Record<string, number>; total: number };

type Market = {
  id: string;
  bout_id: string;
  market_type: string;
  question: string;
  selections: string[];
  status: string;
  pools: Record<string, number>;
  total_pool: number;
  winning_selection: string | null;
};

type Sub = { player: string; tier: string; status: string; period_end: string };

type Gate = { id: string; label: string; status: string; note: string | null };

type Caption = {
  id: number;
  text: string;
  nickname: string;
  status: string;
  pinned: number | boolean;
  created_at: number;
};

type VoteRow = {
  id: number;
  bout_id: string;
  round_no: number;
  choice: string;
  weight: number;
  updated_at: number;
};

const TOKEN_KEY = "bv_admin_token";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function AdminPage() {
  const [token, setToken] = useState("");

  const [bouts, setBouts] = useState<Bout[]>([]);
  const [tallies, setTallies] = useState<Record<string, BoutTally>>({});

  const [markets, setMarkets] = useState<Market[]>([]);
  const [settleSel, setSettleSel] = useState<Record<string, string>>({});

  const [subs, setSubs] = useState<Sub[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);

  const [caps, setCaps] = useState<Caption[]>([]);
  const [capsStatus, setCapsStatus] = useState("");

  const [votes, setVotes] = useState<VoteRow[]>([]);

  const [liveRoundId, setLiveRoundId] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptModel, setScriptModel] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [nbId, setNbId] = useState("");
  const [nbTitle, setNbTitle] = useState("");
  const [nbA, setNbA] = useState("");
  const [nbB, setNbB] = useState("");

  const [mkId, setMkId] = useState("");
  const [mkBout, setMkBout] = useState("");
  const [mkQuestion, setMkQuestion] = useState("");
  const [mkType, setMkType] = useState("");
  const [mkSels, setMkSels] = useState("");

  const [subDh, setSubDh] = useState("");
  const [subTier, setSubTier] = useState("ringside");

  const [cpBout, setCpBout] = useState("");
  const [cpA, setCpA] = useState("");
  const [cpB, setCpB] = useState("");
  const [cpFeud, setCpFeud] = useState("");
  const [pack, setPack] = useState<{ title: string; prompt: string }[] | null>(null);

  const [liveBout, setLiveBout] = useState("");
  const [liveRound, setLiveRound] = useState("");
  const [liveTacticA, setLiveTacticA] = useState("");
  const [liveTacticB, setLiveTacticB] = useState("");
  const [liveBranchA, setLiveBranchA] = useState("");
  const [liveBranchB, setLiveBranchB] = useState("");
  const [liveState, setLiveState] = useState("VOTING");
  const [liveMinutes, setLiveMinutes] = useState("10");

  const [votesBout, setVotesBout] = useState("");
  const [scriptPrompt, setScriptPrompt] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "X-Admin-Token": token,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> | undefined),
    };
    const r = await fetch(path, { ...opts, headers });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as T;
  }

  async function loadBouts() {
    try {
      const list = await api<Bout[]>("/api/bouts");
      setBouts(list);
      const t: Record<string, BoutTally> = {};
      for (const b of list) {
        try {
          t[b.id] = await api<BoutTally>(`/api/votes?op=tally&bout_id=${b.id}&round_no=${b.round_no}`);
        } catch {
          // a bout without a tally is simply rendered without bars
        }
      }
      setTallies(t);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function loadMkts() {
    try {
      const d = await api<{ markets: Market[] }>("/api/admin?op=betting");
      setMarkets(d.markets ?? []);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function loadSubs() {
    try {
      const d = await api<{ subscriptions: Sub[] }>("/api/admin?op=subscriptions");
      setSubs(d.subscriptions ?? []);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function loadGates() {
    try {
      const d = await api<{ gates: Gate[] }>("/api/admin?op=gates");
      setGates(d.gates ?? []);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function loadCaps(status: string) {
    try {
      const rows = await api<Caption[]>(`/api/admin?op=captions&status=${status}`);
      setCaps(rows ?? []);
      setCapsStatus(status);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function loadVotes() {
    try {
      const q = votesBout ? `&bout_id=${encodeURIComponent(votesBout)}` : "";
      const rows = await api<VoteRow[]>(`/api/admin?op=votes${q}`);
      setVotes(rows ?? []);
    } catch (e) {
      alert("Load failed: " + errMsg(e));
    }
  }

  async function connect() {
    await loadBouts();
    localStorage.setItem(TOKEN_KEY, token);
    void loadMkts();
    void loadGates();
    void loadSubs();
  }

  async function toggleBout(id: string, open: boolean) {
    try {
      await api(`/api/admin?op=bouts&id=${id}`, { method: "PATCH", body: JSON.stringify({ voting_open: open }) });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadBouts();
  }

  async function nextRound(id: string, r: number) {
    try {
      await api(`/api/admin?op=bouts&id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({ round_no: r, voting_open: true }),
      });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadBouts();
  }

  async function addBout() {
    try {
      await api("/api/admin?op=bouts", {
        method: "POST",
        body: JSON.stringify({
          id: nbId,
          title: nbTitle,
          fighter_a: nbA,
          fighter_b: nbB,
          voting_open: false,
        }),
      });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadBouts();
  }

  async function addMarket() {
    const selections = mkSels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api("/api/admin?op=betting", {
        method: "POST",
        body: JSON.stringify({
          id: mkId,
          bout_id: mkBout,
          market_type: mkType || "winner",
          question: mkQuestion,
          selections,
        }),
      });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadMkts();
  }

  async function marketAction(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/admin?op=betting&id=${id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadMkts();
  }

  async function setSub() {
    try {
      await api(`/api/admin?op=subscriptions&device_hash=${encodeURIComponent(subDh)}`, {
        method: "PATCH",
        body: JSON.stringify({ tier: subTier }),
      });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadSubs();
  }

  async function setGate(id: string, status: string) {
    try {
      await api(`/api/admin?op=gates&id=${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch (e) {
      alert("Blocked: " + errMsg(e));
    }
    void loadGates();
  }

  async function captionAction(id: number, action: string) {
    try {
      await api(`/api/admin?op=captions&id=${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    } catch (e) {
      alert(errMsg(e));
    }
    void loadCaps(capsStatus);
  }

  async function createLiveRound() {
    try {
      const d = await api<{ round_id: string }>("/api/admin?op=live", {
        method: "POST",
        body: JSON.stringify({
          bout_id: liveBout,
          round_no: Number(liveRound) || 1,
          tactic_a: liveTacticA,
          tactic_b: liveTacticB,
        }),
      });
      setLiveRoundId(d.round_id);
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function updateLiveRound() {
    try {
      await api("/api/admin?op=live", {
        method: "PATCH",
        body: JSON.stringify({
          round_id: liveRoundId,
          branch_a_url: liveBranchA,
          branch_b_url: liveBranchB,
          state: liveState,
          vote_minutes: Number(liveMinutes) || 10,
        }),
      });
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function genScript() {
    try {
      const d = await api<{ text: string; model: string }>("/api/admin?op=script", {
        method: "POST",
        body: JSON.stringify({ prompt: scriptPrompt, model: scriptModel }),
      });
      setScriptText(d.text);
      setScriptModel(d.model);
    } catch (e) {
      setScriptText("生成失败：" + errMsg(e));
    }
  }

  function genPack() {
    const bout = cpBout.trim() || "qf1";
    const a = cpA.trim() || "FIGHTER_A";
    const b = cpB.trim() || "FIGHTER_B";
    const feud = cpFeud.trim() || "未填写恩怨线";
    setPack([
      {
        title: "⚖️ 称重仪式 (60s, 赛前48h)",
        prompt: `AI 视频 prompt: "${a} vs ${b} 官方称重仪式, face-to-face staredown, 美漫风, 数据条. 恩怨背景: ${feud}. 结尾字幕: 评论区押注胜者."`,
      },
      {
        title: "🎤 垃圾话采访 (30-45s 竖版)",
        prompt: `TTS 文案 (${a} 怼镜头): "恩怨: ${feud}. 放一句狠话, 15 字以内, 点名 ${b}." 定妆照 + SadTalker/cjwbw:sadtalker 生成.`,
      },
      {
        title: "📹 更衣室泄密 (30s)",
        prompt: `伪纪录片 prompt: 训练场"偷拍" ${a} 的弱点/秘密, 手持晃动, 为下集埋伏笔. 恩怨: ${feud}.`,
      },
      {
        title: "📰 赛后战报 (60s, 赛后24h)",
        prompt: `"你错过的 3 件事" + 3 个高光镜头 + EP0 同款 .vtt 字幕 + 积分榜更新 (${bout}).`,
      },
    ]);
  }

  function copyPrompt(i: number, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    window.setTimeout(() => setCopiedIndex(null), 1500);
  }

  return (
    <div className="admin-shell">
      <h1>🥊 BOOKER ADMIN</h1>

      <div className="adm-card">
        <div className="adm-row">
          <input
            id="token"
            type="password"
            placeholder="Admin token"
            className="adm-input"
            style={{ flex: 1 }}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="adm-btn" onClick={() => void connect()}>
            Connect
          </button>
        </div>
        <p className="adm-small">Token = ADMIN_TOKEN env var on Vercel.</p>
      </div>

      <div>
        {bouts.map((b) => {
          const t = tallies[b.id];
          return (
            <div className="adm-card" key={b.id}>
              <h3>
                {b.title}{" "}
                <span className="adm-small">
                  [{b.id}] R{b.round_no} {b.voting_open ? "🟢 OPEN" : "🔴 CLOSED"}
                </span>
              </h3>
              <p>
                {b.fighter_a} vs {b.fighter_b}
              </p>
              {t
                ? Object.entries(t.tally).map(([k, v]) => {
                    const p = t.total ? Math.round((v / t.total) * 100) : 0;
                    return (
                      <div key={k}>
                        {k.toUpperCase()} — {v} ({p}%)
                        <div className="adm-bar" style={{ width: p + "%" }} />
                      </div>
                    );
                  })
                : null}
              <div className="adm-row">
                <button className="adm-btn" onClick={() => void toggleBout(b.id, !b.voting_open)}>
                  {b.voting_open ? "Close voting" : "Open voting"}
                </button>
                <button className="adm-btn ghost" onClick={() => void nextRound(b.id, b.round_no + 1)}>
                  → Round {b.round_no + 1}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="adm-card">
        <h3>+ New bout</h3>
        <div className="adm-row">
          <input className="adm-input" placeholder="id (qf5)" value={nbId} onChange={(e) => setNbId(e.target.value)} />
          <input className="adm-input" placeholder="title" value={nbTitle} onChange={(e) => setNbTitle(e.target.value)} />
          <input className="adm-input" placeholder="fighter A" value={nbA} onChange={(e) => setNbA(e.target.value)} />
          <input className="adm-input" placeholder="fighter B" value={nbB} onChange={(e) => setNbB(e.target.value)} />
          <button className="adm-btn" onClick={() => void addBout()}>
            Create
          </button>
        </div>
      </div>

      <div className="adm-card">
        <h2>🎲 押注盘口</h2>
        <div>
          {markets.length === 0 ? <p className="adm-small">暂无盘口</p> : null}
          {markets.map((m) => {
            const pools = Object.entries(m.pools)
              .map(([k, v]) => k + ":" + v)
              .join(" ");
            const sel = settleSel[m.id] ?? m.selections[0] ?? "";
            return (
              <div className="adm-row adm-item" key={m.id}>
                <span>
                  [{m.id}] <b>{m.question}</b>{" "}
                  <span className="adm-small">
                    {m.status} · pool {m.total_pool} · {pools}
                  </span>
                </span>
                <span style={{ flex: 1 }} />
                {m.status === "open" ? (
                  <button className="adm-btn ghost" onClick={() => void marketAction(m.id, { action: "lock" })}>
                    锁盘
                  </button>
                ) : null}
                {m.status !== "settled" ? (
                  <>
                    <select
                      className="adm-select"
                      value={sel}
                      onChange={(e) => setSettleSel((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    >
                      {m.selections.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      className="adm-btn"
                      onClick={() => void marketAction(m.id, { action: "settle", winning_selection: sel })}
                    >
                      结算
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="adm-row">
          <input className="adm-input" placeholder="id (qf1-winner)" value={mkId} onChange={(e) => setMkId(e.target.value)} />
          <input className="adm-input" placeholder="bout_id (qf1)" value={mkBout} onChange={(e) => setMkBout(e.target.value)} />
          <input
            className="adm-input"
            placeholder="question"
            style={{ flex: 1 }}
            value={mkQuestion}
            onChange={(e) => setMkQuestion(e.target.value)}
          />
        </div>
        <div className="adm-row">
          <input
            className="adm-input"
            placeholder="winner|method|round"
            style={{ width: 150 }}
            value={mkType}
            onChange={(e) => setMkType(e.target.value)}
          />
          <input
            className="adm-input"
            placeholder="selections, comma separated"
            style={{ flex: 1 }}
            value={mkSels}
            onChange={(e) => setMkSels(e.target.value)}
          />
          <button className="adm-btn" onClick={() => void addMarket()}>
            开盘
          </button>
          <button className="adm-btn ghost" onClick={() => void loadMkts()}>
            刷新
          </button>
        </div>
        <p className="adm-small">winner=押胜负 · method=押KO/判定 · round=押第几回合结束。称重仪式开盘，正赛开场锁盘，赛后结算。</p>
      </div>

      <div className="adm-card">
        <h2>💳 订阅 — tiers &amp; 手动开/关</h2>
        <div>
          {subs.length === 0 ? <span className="adm-small">暂无订阅（Stripe 未接或无人订阅）</span> : null}
          {subs.map((s, i) => (
            <div className="adm-row" key={`${s.player}-${i}`}>
              <span>
                <b>{s.player}</b> {s.tier} [{s.status}] <span className="adm-small">到 {s.period_end}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="adm-row">
          <input
            className="adm-input"
            placeholder="device_hash (sha)"
            value={subDh}
            onChange={(e) => setSubDh(e.target.value)}
          />
          <select className="adm-select" value={subTier} onChange={(e) => setSubTier(e.target.value)}>
            <option value="ringside">ringside $4.99</option>
            <option value="booker">booker $14.99</option>
            <option value="promoter">promoter $49</option>
            <option value="free">free (revoke)</option>
          </select>
          <button className="adm-btn" onClick={() => void setSub()}>
            设置
          </button>
          <button className="adm-btn ghost" onClick={() => void loadSubs()}>
            刷新
          </button>
        </div>
        <p className="adm-small">Stripe webhook 自动写库；这里是手动补发/测试/撤销。device_hash 是 sha 值（非原始 device_id）。</p>
      </div>

      <div className="adm-card">
        <h2>🚦 P1 GATE — 杀线看板</h2>
        <div>
          {gates.map((g) => {
            const dot = g.status === "done" ? "🟢" : g.status === "killed" ? "🔴" : "⚪";
            return (
              <div className="adm-row adm-item" key={g.id}>
                <span>
                  {dot} <b>{g.id}</b> {g.label}
                  {g.note ? <span className="adm-small"> — {g.note}</span> : null}
                </span>
                <span style={{ flex: 1 }} />
                {g.status !== "done" ? (
                  <button className="adm-btn" onClick={() => void setGate(g.id, "done")}>
                    完成
                  </button>
                ) : null}
                {g.status !== "killed" ? (
                  <button className="adm-btn ghost" onClick={() => void setGate(g.id, "killed")}>
                    杀线
                  </button>
                ) : null}
                {g.status !== "pending" ? (
                  <button className="adm-btn ghost" onClick={() => void setGate(g.id, "pending")}>
                    重置
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="adm-small">杀线写进数据库，不进任何人的记忆。p2-unlocked 被代码锁死：p1-kill 未完成前点不开。</p>
      </div>

      <div className="adm-card">
        <h2>📋 Booker 副驾 — 本周升级包</h2>
        <div className="adm-row">
          <input
            className="adm-input"
            placeholder="bout_id (qf1)"
            style={{ width: 140 }}
            value={cpBout}
            onChange={(e) => setCpBout(e.target.value)}
          />
          <input className="adm-input" placeholder="fighter A" style={{ width: 150 }} value={cpA} onChange={(e) => setCpA(e.target.value)} />
          <input className="adm-input" placeholder="fighter B" style={{ width: 150 }} value={cpB} onChange={(e) => setCpB(e.target.value)} />
          <input className="adm-input" placeholder="恩怨一句话" style={{ flex: 1 }} value={cpFeud} onChange={(e) => setCpFeud(e.target.value)} />
          <button className="adm-btn" onClick={genPack}>
            生成
          </button>
        </div>
        <div>
          {pack?.map((item, i) => (
            <div
              key={item.title}
              style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: 10, margin: "8px 0" }}
            >
              <b>{item.title}</b>
              <p className="adm-small" style={{ whiteSpace: "pre-wrap" }}>
                {item.prompt}
              </p>
              <button className="adm-btn" onClick={() => copyPrompt(i, item.prompt)}>
                {copiedIndex === i ? "已复制" : "复制"}
              </button>
            </div>
          ))}
        </div>
        <p className="adm-small">AI 打草稿、人一键批准：称重/垃圾话/泄密/战报四件套 prompt，复制即用。booker 从全职降成 30 分钟审批。</p>
      </div>

      <div className="adm-card">
        <h2>💬 观众字幕审核</h2>
        <div className="adm-row">
          <button className="adm-btn" onClick={() => void loadCaps("pending")}>
            待审核
          </button>
          <button className="adm-btn ghost" onClick={() => void loadCaps("approved")}>
            已通过
          </button>
          <button className="adm-btn ghost" onClick={() => void loadCaps("rejected")}>
            已拒绝
          </button>
        </div>
        <div>
          {capsStatus && caps.length === 0 ? <p className="adm-small">空</p> : null}
          {caps.map((c) => (
            <div className="adm-row adm-item" key={c.id}>
              <span>
                [{c.id}] <b>{c.text}</b>{" "}
                <span className="adm-small">
                  — {c.nickname}
                  {c.pinned ? " 📌" : ""}
                </span>
              </span>
              <span style={{ flex: 1 }} />
              {capsStatus === "pending" ? (
                <>
                  <button className="adm-btn" onClick={() => void captionAction(c.id, "approve")}>
                    通过
                  </button>
                  <button className="adm-btn" onClick={() => void captionAction(c.id, "pin")}>
                    置顶
                  </button>
                  <button className="adm-btn ghost" onClick={() => void captionAction(c.id, "reject")}>
                    拒绝
                  </button>
                </>
              ) : capsStatus === "approved" ? (
                <>
                  <button className="adm-btn" onClick={() => void captionAction(c.id, c.pinned ? "unpin" : "pin")}>
                    {c.pinned ? "取消置顶" : "置顶"}
                  </button>
                  <button className="adm-btn ghost" onClick={() => void captionAction(c.id, "reject")}>
                    拒绝
                  </button>
                </>
              ) : (
                <button className="adm-btn" onClick={() => void captionAction(c.id, "approve")}>
                  恢复通过
                </button>
              )}
              <button className="adm-btn ghost" onClick={() => void captionAction(c.id, "delete")} >
                删除
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h2>📡 LIVE 回合</h2>
        <div className="adm-row">
          <input className="adm-input" placeholder="bout_id (qf1)" value={liveBout} onChange={(e) => setLiveBout(e.target.value)} />
          <input
            className="adm-input"
            placeholder="round_no"
            style={{ width: 100 }}
            value={liveRound}
            onChange={(e) => setLiveRound(e.target.value)}
          />
          <input className="adm-input" placeholder="tactic A" value={liveTacticA} onChange={(e) => setLiveTacticA(e.target.value)} />
          <input className="adm-input" placeholder="tactic B" value={liveTacticB} onChange={(e) => setLiveTacticB(e.target.value)} />
          <button className="adm-btn" onClick={() => void createLiveRound()}>
            创建回合
          </button>
        </div>
        {liveRoundId ? (
          <>
            <p className="adm-small">round_id: {liveRoundId}</p>
            <div className="adm-row">
              <input className="adm-input" placeholder="branch_a_url" value={liveBranchA} onChange={(e) => setLiveBranchA(e.target.value)} />
              <input className="adm-input" placeholder="branch_b_url" value={liveBranchB} onChange={(e) => setLiveBranchB(e.target.value)} />
            </div>
            <div className="adm-row">
              <select className="adm-select" value={liveState} onChange={(e) => setLiveState(e.target.value)}>
                <option value="scheduled">scheduled</option>
                <option value="VOTING">VOTING</option>
                <option value="LOCKED">LOCKED</option>
                <option value="REVEAL">REVEAL</option>
                <option value="done">done</option>
              </select>
              <input
                className="adm-input"
                placeholder="vote_minutes"
                style={{ width: 120 }}
                value={liveMinutes}
                onChange={(e) => setLiveMinutes(e.target.value)}
              />
              <button className="adm-btn" onClick={() => void updateLiveRound()}>
                更新回合
              </button>
            </div>
          </>
        ) : null}
        <p className="adm-small">创建回合 → 填分叉视频地址 → VOTING（自动开投票计时）→ LOCKED → REVEAL/done 放片。</p>
      </div>

      <div className="adm-card">
        <h2>🗳️ 投票明细</h2>
        <div className="adm-row">
          <input
            className="adm-input"
            placeholder="bout_id (留空=全部)"
            value={votesBout}
            onChange={(e) => setVotesBout(e.target.value)}
          />
          <button className="adm-btn" onClick={() => void loadVotes()}>
            刷新
          </button>
        </div>
        <table className="standings">
          <tbody>
            <tr>
              <th>时间</th>
              <th>对局</th>
              <th>回合</th>
              <th>选择</th>
              <th>权重</th>
            </tr>
            {votes.map((v) => (
              <tr key={v.id}>
                <td>{new Date(v.updated_at * 1000).toLocaleString()}</td>
                <td>{v.bout_id}</td>
                <td>{v.round_no}</td>
                <td>{v.choice}</td>
                <td>{v.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-card">
        <h2>🤖 脚本生成 (OpenRouter)</h2>
        <div className="adm-row">
          <input
            className="adm-input"
            placeholder="model (可选，留空用默认)"
            style={{ flex: 1 }}
            value={scriptModel}
            onChange={(e) => setScriptModel(e.target.value)}
          />
          <button className="adm-btn" onClick={() => void genScript()}>
            生成
          </button>
        </div>
        <textarea
          className="adm-input"
          placeholder="prompt (最多 4000 字)"
          style={{ width: "100%", minHeight: 90 }}
          value={scriptPrompt}
          onChange={(e) => setScriptPrompt(e.target.value)}
        />
        {scriptText ? (
          <p className="adm-small" style={{ whiteSpace: "pre-wrap" }}>
            {scriptText}
          </p>
        ) : null}
        <p className="adm-small">需配置 OPENROUTER_API_KEY；未配置时后端返回 501。</p>
      </div>
    </div>
  );
}
