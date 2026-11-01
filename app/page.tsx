"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RuleVote = { rage: number; fair: number };

const K = "bv_rulevote";

function readVotes(): RuleVote {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return { rage: 0, fair: 0 };
    const v = JSON.parse(raw) as Partial<RuleVote> | null;
    return { rage: Number(v?.rage) || 0, fair: Number(v?.fair) || 0 };
  } catch {
    return { rage: 0, fair: 0 };
  }
}

export default function HomePage() {
  const [votes, setVotes] = useState<RuleVote>({ rage: 0, fair: 0 });

  useEffect(() => {
    setVotes(readVotes());
  }, []);

  function vote(k: "rage" | "fair") {
    const v = readVotes();
    v[k]++;
    localStorage.setItem(K, JSON.stringify(v));
    setVotes(v);
  }

  const total = votes.rage + votes.fair || 1;

  return (
    <>
      <nav className="topnav">
        <Link href="/fighters">FIGHTERS</Link> · <Link href="/episodes">EPISODES</Link> ·{" "}
        <Link href="/storylines">STORYLINES</Link> · <Link href="/fan-forge">FAN FORGE →</Link>
      </nav>
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
            <button id="voteRage" onClick={() => vote("rage")}>
              RAGE MODE
              <br />
              <small>no defense, all power</small>
            </button>
            <button id="voteFair" onClick={() => vote("fair")}>
              FAIR PLAY
              <br />
              <small>classic 3-round rules</small>
            </button>
          </div>
          <div className="rv-bars">
            <div className="rv-row">
              <span>RAGE</span>
              <div className="bar">
                <div id="barRage" style={{ width: (votes.rage / total) * 100 + "%" }} />
              </div>
              <b id="nRage">{votes.rage}</b>
            </div>
            <div className="rv-row">
              <span>FAIR</span>
              <div className="bar">
                <div id="barFair" style={{ width: (votes.fair / total) * 100 + "%" }} />
              </div>
              <b id="nFair">{votes.fair}</b>
            </div>
          </div>
          <p className="note">Prototype: votes stored in your browser.</p>
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
