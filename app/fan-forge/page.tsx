"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type ForgeEntry = { name: string; persona: string };

const KEY = "bv_forge_queue";

function loadQueue(): ForgeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as ForgeEntry[] | null;
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

export default function FanForgePage() {
  const [queue, setQueue] = useState<ForgeEntry[]>([]);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");

  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  function save(q: ForgeEntry[]) {
    localStorage.setItem(KEY, JSON.stringify(q));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = name.trim().toUpperCase();
    const p = persona.trim();
    if (!n || !p) return;
    const q = loadQueue();
    q.unshift({ name: n, persona: p });
    save(q);
    setQueue(q);
    setName("");
    setPersona("");
  }

  return (
    <>
      <nav className="topnav">
        <Link href="/">← BRAWLVERSE</Link>
      </nav>
      <header className="hero small">
        <h1 className="logo">FAN FORGE</h1>
        <p className="tagline">
          YOU INVENT THE FIGHTER — <span>AI BUILDS THEM</span>
        </p>
        <p className="sub">
          Drop a one-line persona. Our AI forges the name, backstory and fight card.
          <br />
          Top-voted fan fighters enter <b>Season 2</b>.
        </p>
      </header>

      <section className="forge-form">
        <h2>FORGE YOUR FIGHTER</h2>
        <form id="forgeForm" onSubmit={onSubmit}>
          <input
            id="fname"
            maxLength={24}
            placeholder="Fighter name — e.g. TURBO GRANNY"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            id="fpersona"
            maxLength={120}
            placeholder="One-line persona — e.g. a retired astronaut who boxes in zero-g boots"
            required
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          />
          <button type="submit">FORGE →</button>
        </form>
        <p className="note">Prototype: submissions are stored in your browser and shown below as queued for the Season 2 vote.</p>
      </section>

      <section>
        <h2>COMMUNITY QUEUE</h2>
        <div className="cards" id="queueGrid">
          {queue.length === 0 ? <p className="note">No fan submissions yet — be the first.</p> : null}
          {queue.map((f, i) => (
            <div className="card fan" key={`${f.name}-${i}`}>
              <div className="q">?</div>
              <h3>{f.name}</h3>
              <p className="style">Fan submission: &quot;{f.persona}&quot;</p>
              <p className="bio">Queued for Season 2 vote.</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>FORGED EXAMPLES</h2>
        <p className="note" style={{ marginBottom: 20 }}>
          What one line becomes — AI-generated cards from fan-style submissions.
        </p>
        <div className="cards">
          <div className="card yellow">
            <img src="/assets/fan-volt.jpg" alt="Volt" />
            <h3>VOLT</h3>
            <p className="style">Fan submission: &quot;a lightning spirit that boxes&quot;</p>
            <p className="bio">
              He doesn&apos;t dodge punches. He <i>is</i> the punch. Undefeated in thunderstorms.
            </p>
          </div>
          <div className="card yellow">
            <img src="/assets/fan-goliath7.jpg" alt="Goliath-7" />
            <h3>GOLIATH-7</h3>
            <p className="style">Fan submission: &quot;a decommissioned war mech who found peace in boxing&quot;</p>
            <p className="bio">Built for war. Rebuilt for the ring. Has never lost — has never wanted to win.</p>
          </div>
          <div className="card yellow">
            <img src="/assets/fan-lareina.jpg" alt="La Reina" />
            <h3>LA REINA</h3>
            <p className="style">Fan submission: &quot;a masked luchadora queen defending her crown&quot;</p>
            <p className="bio">The crown stays on. The opponents don&apos;t stay up. ¡Viva la Reina!</p>
          </div>
        </div>
      </section>

      <footer>
        <p>BRAWLVERSE · FAN FORGE</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
