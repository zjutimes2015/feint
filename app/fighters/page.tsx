"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";

type RawRecord = { fighter: string; wins: number; losses: number; kos: number };
type RecordMap = Record<string, RawRecord>;

export default function FightersPage() {
  const [records, setRecords] = useState<RecordMap>({});

  // Legacy ledger: every settled bout permanently writes W-L-KO here.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/betting?op=records");
        const j = (await r.json()) as { records?: RawRecord[] };
        const map: RecordMap = {};
        for (const x of j.records ?? []) map[x.fighter.toUpperCase()] = x;
        setRecords(map);
      } catch {
        // legacy silently ignored network errors
      }
    })();
  }, []);

  function stat(name: string): string {
    const rec = records[name.toUpperCase()];
    return rec ? `${rec.wins}-${rec.losses} (${rec.kos} KO)` : "0-0";
  }

  return (
    <>
      <TopNav />
      <header className="hero small">
        <h1 className="logo">THE FIGHTERS</h1>
        <p className="tagline">
          SEASON 1 — <span>EIGHT ENTER. ONE REIGNS.</span>
        </p>
      </header>
      <section>
        <div className="cards">
          <div className="card red">
            <img src="/assets/iron-jaw-portrait.jpg" alt="Iron Jaw" />
            <h3>IRON JAW</h3>
            <p className="style">Heavyweight Brawler</p>
            <p className="trash">
              &quot;VIPER&apos;s gonna need more than speed when my fist rearranges his face.&quot;
            </p>
            <p className="bio">
              Takes a punch like iron, hits back like hell. Street-circuit legend. Zero finesse, all thunder.
            </p>
            <div className="stats">
              <span>{stat("IRON JAW")}</span>
              <span>Stance: Orthodox</span>
            </div>
          </div>
          <div className="card green">
            <img src="/assets/viper-portrait.jpg" alt="Viper" />
            <h3>VIPER</h3>
            <p className="style">Lightweight Menace</p>
            <p className="trash">
              &quot;Jaw&apos;s got a chin of iron and a brain of rust. He&apos;ll wake up on the canvas.&quot;
            </p>
            <p className="bio">
              Coiled. Ready. Lethal. A counter-punching phantom — you never see the punch that ends you.
            </p>
            <div className="stats">
              <span>{stat("VIPER")}</span>
              <span>Stance: Southpaw</span>
            </div>
          </div>
          <div className="card yellow">
            <img src="/assets/fan-volt.jpg" alt="Volt" />
            <h3>VOLT</h3>
            <p className="style">Fan-forged · Elemental</p>
            <p className="trash">&quot;I don&apos;t dodge punches. I AM the punch.&quot;</p>
            <p className="bio">A lightning spirit in gloves. Undefeated in thunderstorms. Refuses to fight indoors.</p>
            <div className="stats">
              <span>{stat("VOLT")}</span>
              <span>Stance: ???</span>
            </div>
          </div>
          <div className="card yellow">
            <img src="/assets/fan-goliath7.jpg" alt="Goliath-7" />
            <h3>GOLIATH-7</h3>
            <p className="style">Fan-forged · Heavyweight</p>
            <p className="trash">&quot;I was built for war. I choose the ring.&quot;</p>
            <p className="bio">Decommissioned war mech, gentle soul. Has never lost — has never wanted to win.</p>
            <div className="stats">
              <span>{stat("GOLIATH-7")}</span>
              <span>Stance: Orthodox</span>
            </div>
          </div>
          <div className="card yellow">
            <img src="/assets/fan-lareina.jpg" alt="La Reina" />
            <h3>LA REINA</h3>
            <p className="style">Fan-forged · Luchadora</p>
            <p className="trash">&quot;The crown stays on. You won&apos;t.&quot;</p>
            <p className="bio">Masked queen of lucha. ¡Viva la Reina! Opponents don&apos;t stay up.</p>
            <div className="stats">
              <span>{stat("LA REINA")}</span>
              <span>Stance: Orthodox</span>
            </div>
          </div>
          <div className="card orange">
            <img src="/assets/fighter-sledge.jpg" alt="Sledge" />
            <h3>SLEDGE</h3>
            <p className="style">Demolition Brawler</p>
            <p className="trash">&quot;Everything breaks. You&apos;re just next in line.&quot;</p>
            <p className="bio">
              Swings like a wrecking ball. Once demolished three buildings before breakfast. The ring is smaller.
            </p>
            <div className="stats">
              <span>{stat("SLEDGE")}</span>
              <span>Stance: Orthodox</span>
            </div>
          </div>
          <div className="card teal">
            <img src="/assets/fighter-monsoon.jpg" alt="Monsoon" />
            <h3>MONSOON</h3>
            <p className="style">Muay Thai Storm</p>
            <p className="trash">&quot;You can&apos;t block the weather.&quot;</p>
            <p className="bio">Elbows like typhoon winds. Fights best in the rain — brings his own.</p>
            <div className="stats">
              <span>{stat("MONSOON")}</span>
              <span>Stance: Southpaw</span>
            </div>
          </div>
          <div className="card purple">
            <img src="/assets/fighter-professor.jpg" alt="The Professor" />
            <h3>THE PROFESSOR</h3>
            <p className="style">Chess-Boxer · Tactician</p>
            <p className="trash">&quot;I&apos;ve already won. You&apos;re just catching up to move 14.&quot;</p>
            <p className="bio">Sees twelve moves ahead. The only fighter who takes notes mid-round.</p>
            <div className="stats">
              <span>{stat("THE PROFESSOR")}</span>
              <span>Stance: Orthodox</span>
            </div>
          </div>
        </div>
      </section>
      <footer>
        <p>
          BRAWLVERSE ·{" "}
          <Link href="/fan-forge" style={{ color: "#ffcc00" }}>
            Forge your own fighter →
          </Link>
        </p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
