"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { deviceId } from "@/lib/device";

const FIGHTERS = [
  "IRON JAW",
  "VIPER",
  "SLEDGE",
  "MONSOON",
  "VOLT",
  "THE PROFESSOR",
  "GOLIATH-7",
  "LA REINA",
];

type MyTeam = { team_name: string; picks: string[] } | null;

type LeaderRow = {
  rank: number;
  team_name: string;
  player: string;
  picks: string[];
  score: number;
};

export default function FantasyPage() {
  const [team, setTeam] = useState<MyTeam>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = deviceId();
    try {
      const [mr, br] = await Promise.all([
        fetch(`/api/fantasy?op=my&device_id=${encodeURIComponent(me)}`),
        fetch("/api/fantasy?op=leaderboard"),
      ]);
      const m = (await mr.json()) as { team?: MyTeam };
      const b = (await br.json()) as { leaderboard?: LeaderRow[] };
      setTeam(m.team ?? null);
      if (m.team) {
        setPicks(m.team.picks ?? []);
        setName(m.team.team_name);
      }
      setBoard(b.leaderboard ?? []);
    } catch {
      setErr("加载失败，刷新页面重试");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(f: string) {
    setPicks((p) => {
      if (p.includes(f)) return p.filter((x) => x !== f);
      if (p.length >= 3) return p;
      return [...p, f];
    });
    setMsg("");
  }

  async function createTeam() {
    const n = name.trim();
    if (!n) {
      setErr("先给队伍起个名字");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/fantasy?op=teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId(), team_name: n }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(j.error || `建队失败 ${r.status}`);
        return;
      }
      setMsg("建队成功，现在选 3 名选手");
      await load();
    } catch {
      setErr("网络开小差，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function savePicks() {
    if (picks.length !== 3) {
      setErr("必须正好选 3 名选手");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/fantasy?op=picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId(), picks }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(j.error || `保存失败 ${r.status}`);
        return;
      }
      setMsg("阵容已保存 · 积分随真实战绩实时更新");
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
        <h1 className="logo">FANTASY LEAGUE</h1>
        <p className="tagline">
          BUILD A STABLE — <span>RIDE THE WINS</span>
        </p>
      </header>

      <section>
        <h2>YOUR STABLE</h2>
        <div className="panel">
          {team ? (
            <>
              <h3>{team.team_name}</h3>
              <p className="note">当前阵容：{team.picks.length ? team.picks.join(" · ") : "空（还没选人）"}</p>
            </>
          ) : (
            <>
              <h3>先建一支队伍</h3>
              <p>一个设备一支队伍。建队后从下面 8 名 S1 选手里挑 3 人。</p>
              <div className="row gap">
                <input
                  className="field"
                  maxLength={40}
                  placeholder="队伍名，例如 CAGE KINGS"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="btn" onClick={() => void createTeam()} disabled={busy}>
                  建队
                </button>
              </div>
            </>
          )}

          {team ? (
            <>
              <div className="chips">
                {FIGHTERS.map((f) => (
                  <button key={f} className={"chip" + (picks.includes(f) ? " on" : "")} onClick={() => toggle(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="row gap">
                <button className="btn" onClick={() => void savePicks()} disabled={busy || picks.length !== 3}>
                  保存阵容（{picks.length}/3）
                </button>
                <span className="note">胜=3 分 · KO 胜=5 分 · 负=0 分</span>
              </div>
            </>
          ) : null}

          {msg ? <p className="ok">{msg}</p> : null}
          {err ? <p className="warn">{err}</p> : null}
        </div>
      </section>

      <section>
        <h2>SEASON 1 LEADERBOARD</h2>
        {board.length === 0 ? (
          <p className="note">还没有人组队，第一个上场的就是榜首。</p>
        ) : (
          <table className="standings">
            <tbody>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Picks</th>
                <th>Pts</th>
              </tr>
              {board.map((b) => (
                <tr key={b.team_name + b.player}>
                  <td>{b.rank}</td>
                  <td>
                    {b.team_name}
                    <span className="pool"> · {b.player}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{b.picks.join(", ")}</td>
                  <td>{b.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="note">积分由赛后写入的真实战绩计算，赛季结束按榜首派奖。</p>
      </section>

      <footer>
        <p>BRAWLVERSE · Season 1 in production</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
