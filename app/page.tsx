"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { deviceId } from "@/lib/device";

type RuleChoice = "rage" | "fair";
type RuleTally = { rage: number; fair: number };

// 服务端的常驻 exhibition 赛程，两套规则投票全站共享
const EX_BOUT = "ex1";
const EX_ROUND = 1;
const K = "bv_rulevote";

export default function HomePage() {
  const [tally, setTally] = useState<RuleTally>({ rage: 0, fair: 0 });
  const [mine, setMine] = useState<RuleChoice | "">("");
  const [msg, setMsg] = useState("");
  const [voting, setVoting] = useState(false);

  async function refreshTally() {
    try {
      const r = await fetch(`/api/votes?op=tally&bout_id=${EX_BOUT}&round_no=${EX_ROUND}`);
      const j = (await r.json()) as { tally?: Partial<RuleTally> };
      setTally({ rage: Number(j.tally?.rage) || 0, fair: Number(j.tally?.fair) || 0 });
    } catch {
      // 网络异常时保留上一次票数
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(K);
    if (saved === "rage" || saved === "fair") setMine(saved);
    void refreshTally();
    const t = window.setInterval(() => void refreshTally(), 15000);
    return () => window.clearInterval(t);
  }, []);

  async function vote(k: RuleChoice) {
    setVoting(true);
    try {
      const r = await fetch("/api/votes?op=cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bout_id: EX_BOUT, round_no: EX_ROUND, choice: k, device_id: deviceId() }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMsg(j.error === "voting is closed for this bout" ? "本轮规则投票已封盘" : "投票失败，稍后再试");
        return;
      }
      localStorage.setItem(K, k);
      setMine(k);
      setMsg("已投票，可随时改票");
      await refreshTally();
    } catch {
      setMsg("网络开小差，稍后再试");
    } finally {
      setVoting(false);
    }
  }

  const total = tally.rage + tally.fair;

  return (
    <>
      <TopNav />
      <header className="hero">
        <div className="burst" />
        <h1 className="logo">BRAWLVERSE</h1>
        <p className="tagline">
          THE AI BOXING LEAGUE — <span>YOU CALL THE FIGHT</span>
        </p>
        <p className="sub">
          Eight virtual fighters. One comic-book ring.
          <br />
          The audience votes. The story explodes.
        </p>
      </header>

      <section className="sample">
        <h2>▶ SAMPLE BOUT — IRON JAW vs VIPER</h2>
        <video controls preload="metadata" poster="/assets/viper-portrait.jpg">
          <source src="/brawlverse-sample-ep0.mp4" type="video/mp4" />
        </video>
        <p className="note">AI-generated sample · Season 1 coming soon</p>
      </section>

      <section className="training">
        <h2>
          <span className="live">● LIVE</span> TRAINING GROUND — 24/7
        </h2>
        <p className="note" style={{ marginBottom: 16 }}>
          No bout this week? The gym never sleeps. Our fighters spar around the clock — and <b>you set the rules</b>.
        </p>
        <video autoPlay muted loop playsInline preload="metadata">
          <source src="/training-sparring.mp4" type="video/mp4" />
        </video>
        <div className="rulevote">
          <h3>NEXT EXHIBITION — YOU PICK THE RULES</h3>
          <div className="rv-buttons">
            <button id="voteRage" onClick={() => void vote("rage")} disabled={voting}>
              RAGE MODE
              <br />
              <small>no defense, all power</small>
            </button>
            <button id="voteFair" onClick={() => void vote("fair")} disabled={voting}>
              FAIR PLAY
              <br />
              <small>classic 3-round rules</small>
            </button>
          </div>
          <div className="rv-bars">
            <div className="rv-row">
              <span>RAGE</span>
              <div className="bar">
                <div id="barRage" style={{ width: (total ? (tally.rage / total) * 100 : 0) + "%" }} />
              </div>
              <b id="nRage">{tally.rage}</b>
            </div>
            <div className="rv-row">
              <span>FAIR</span>
              <div className="bar">
                <div id="barFair" style={{ width: (total ? (tally.fair / total) * 100 : 0) + "%" }} />
              </div>
              <b id="nFair">{tally.fair}</b>
            </div>
          </div>
          <p className="note">
            {total} 票 · 全站实时共享
            {mine ? ` · 你投了 ${mine === "rage" ? "RAGE MODE" : "FAIR PLAY"}` : " · 点一下就投"}
            {msg ? ` · ${msg}` : ""}
          </p>
        </div>
      </section>

      <section className="fighters">
        <h2>THE FIGHTERS</h2>
        <div className="cards">
          <div className="card red">
            <img src="/assets/iron-jaw-portrait.jpg" alt="Iron Jaw" />
            <h3>IRON JAW</h3>
            <p className="style">Heavyweight Brawler</p>
            <p className="trash">
              &quot;VIPER&apos;s gonna need more than speed when my fist rearranges his face. See you in the ring,
              snake.&quot;
            </p>
            <p className="bio">
              &quot;He takes a punch like iron… and hits back like hell.&quot; Undefeated in street circuits. Zero
              finesse, all thunder.
            </p>
            <div className="stats">
              <span>0-0</span>
              <span>KO rate —</span>
            </div>
          </div>
          <div className="card green">
            <img src="/assets/viper-portrait.jpg" alt="Viper" />
            <h3>VIPER</h3>
            <p className="style">Lightweight Menace</p>
            <p className="trash">
              &quot;Jaw&apos;s got a chin of iron and a brain of rust. I&apos;ll be gone before his punch arrives — and
              he&apos;ll wake up on the canvas.&quot;
            </p>
            <p className="bio">
              &quot;Coiled. Ready. Lethal.&quot; A counter-punching phantom. You never see the punch that ends you.
            </p>
            <div className="stats">
              <span>0-0</span>
              <span>KO rate —</span>
            </div>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
          <div className="card locked">
            <div className="q">?</div>
            <h3>???</h3>
            <p className="style">Revealed soon</p>
          </div>
        </div>
        <p className="soon" style={{ marginTop: 26 }}>
          <Link href="/fan-forge" className="cta">
            FORGE YOUR OWN FIGHTER →
          </Link>
        </p>
      </section>

      <section className="vote">
        <h2>HOW IT WORKS</h2>
        <ol>
          <li>
            <b>Watch</b> — weekly 3-minute comic-book bouts
          </li>
          <li>
            <b>Vote</b> — pick each fighter&apos;s tactics, round by round
          </li>
          <li>
            <b>Decide</b> — energy votes trigger finishing moves; comeback votes fuel upsets
          </li>
        </ol>
        <p className="soon">Season 1 voting opens soon.</p>
      </section>

      <footer>
        <p>BRAWLVERSE · Season 1 in production</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
