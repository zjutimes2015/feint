"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { deviceId } from "@/lib/device";

type LiveState = {
  id: string;
  bout_id: string;
  round_no: number;
  tactic_a: string;
  tactic_b: string;
  state: string;
  seconds_left: number;
  winning_branch: string;
  video_url: string;
  tally?: Record<string, number>;
  fighter_a?: string;
  fighter_b?: string;
  title?: string;
};

function mmss(s: number): string {
  const sec = Math.max(0, Math.trunc(s));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default function LivePage() {
  const [state, setState] = useState<LiveState | null>(null);
  const [noRound, setNoRound] = useState(false);
  const [secs, setSecs] = useState(0);
  const [voted, setVoted] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live?op=state", { cache: "no-store" });
      if (r.status === 404) {
        setNoRound(true);
        setState(null);
        return;
      }
      const j = (await r.json()) as LiveState;
      setNoRound(false);
      setState(j);
      setSecs(Number(j.seconds_left) || 0);
    } catch {
      setErr("连接直播服务失败，正在重试…");
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 5000);
    const tick = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  async function vote(choice: string) {
    if (!state) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/live?op=vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: state.id, choice, device_id: deviceId() }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(
          j.error === "voting is not open for this round"
            ? "本回合已封盘，等下一回合"
            : `投票失败：${j.error || r.status}`,
        );
        await load();
        return;
      }
      setVoted(choice);
      setMsg("已投票 · 可改票");
      await load();
    } catch {
      setErr("网络开小差，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  const tally = state?.tally ?? {};
  const wa = Number(tally[state?.tactic_a ?? ""] || 0);
  const wb = Number(tally[state?.tactic_b ?? ""] || 0);
  const total = wa + wb;
  const isVoting = state?.state === "VOTING" && secs > 0;
  const isReveal = state?.state === "REVEAL" || state?.state === "done";
  const winnerTactic =
    state && state.winning_branch === "a" ? state.tactic_a : state?.winning_branch === "b" ? state.tactic_b : "";

  return (
    <>
      <TopNav />
      <header className="hero small">
        <h1 className="logo">FRIDAY FIGHT NIGHT</h1>
        <p className="tagline">
          THE CROWD CALLS THE NEXT MOVE — <span>LIVE</span>
        </p>
      </header>

      <section>
        {noRound ? (
          <div className="panel">
            <h3>本周暂无直播回合</h3>
            <p>
              每个回合开场时，这里会出现两套打法。票数高的那套会在下一回合真的执行，并放出对应的分支视频。
              先去看 EPISODES，或在首页投出你想要的 exhibition 规则。
            </p>
          </div>
        ) : state ? (
          <>
            <h2>
              {state.title || state.bout_id} · ROUND {state.round_no}
              <span className="tag">{state.state}</span>
            </h2>
            <div className="panel">
              <h3>
                {state.fighter_a || "FIGHTER A"} vs {state.fighter_b || "FIGHTER B"}
              </h3>

              {isVoting ? (
                <div className="countdown">⏱ {mmss(secs)}</div>
              ) : null}

              <div className="rv-bars">
                <div className="rv-row">
                  <span style={{ width: 110, textAlign: "left" }}>{state.tactic_a}</span>
                  <div className="bar">
                    <div
                      style={{
                        width: (total ? (wa / total) * 100 : 0) + "%",
                        background: "#ff3333",
                        height: "100%",
                        transition: "width .4s",
                      }}
                    />
                  </div>
                  <b>{wa}</b>
                </div>
                <div className="rv-row">
                  <span style={{ width: 110, textAlign: "left" }}>{state.tactic_b}</span>
                  <div className="bar">
                    <div
                      style={{
                        width: (total ? (wb / total) * 100 : 0) + "%",
                        background: "#39ff6a",
                        height: "100%",
                        transition: "width .4s",
                      }}
                    />
                  </div>
                  <b>{wb}</b>
                </div>
              </div>

              {isVoting ? (
                <div className="rv-buttons" style={{ marginTop: 16 }}>
                  <button
                    id="voteRage"
                    onClick={() => void vote(state.tactic_a)}
                    disabled={busy}
                    style={{ borderColor: "#ff3333" }}
                  >
                    {state.tactic_a}
                    <br />
                    <small>A 方案</small>
                  </button>
                  <button
                    id="voteFair"
                    onClick={() => void vote(state.tactic_b)}
                    disabled={busy}
                    style={{ borderColor: "#39ff6a" }}
                  >
                    {state.tactic_b}
                    <br />
                    <small>B 方案</small>
                  </button>
                </div>
              ) : null}

              {voted ? <p className="ok">你的选择：{voted}</p> : null}
              {msg ? <p className="ok">{msg}</p> : null}
              {err ? <p className="warn">{err}</p> : null}

              {state.state === "LOCKED" || (state.state === "VOTING" && secs === 0) ? (
                <p className="warn">已封盘，等主播揭晓结果…</p>
              ) : null}

              {isReveal ? (
                <div className="gap">
                  <p className="ok">
                    结果：{winnerTactic || "（未设置）"} 胜出（{state.winning_branch.toUpperCase() || "?"} 分支）
                  </p>
                  {state.video_url ? (
                    <video controls preload="metadata" style={{ maxWidth: "100%", borderColor: "#ff3333" }}>
                      <source src={state.video_url} type="video/mp4" />
                    </video>
                  ) : (
                    <p className="warn">这一分支的视频还没上传，等下回合。</p>
                  )}
                </div>
              ) : null}

              {state.state === "scheduled" ? <p className="note">回合还没开始投票，请稍等。</p> : null}
              <p className="note">票数每 5 秒刷新 · 投票权重随会员档位提升 · 封盘后不可改票</p>
            </div>
          </>
        ) : (
          <p className="note">正在连接直播…</p>
        )}
      </section>

      <footer>
        <p>BRAWLVERSE · Season 1 in production</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
