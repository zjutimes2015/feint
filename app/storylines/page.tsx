import TopNav from "@/components/TopNav";

export default function StorylinesPage() {
  return (
    <>
      <TopNav />
      <header className="hero small">
        <h1 className="logo">THE STORY BIBLE</h1>
        <p className="tagline">
          EVERY PUNCH HAS A <span>REASON.</span>
        </p>
        <p className="note" style={{ maxWidth: 640, margin: "10px auto", color: "#999" }}>
          You don&apos;t follow matches. You follow people. Five feuds, eight arcs, one throne — this is the script
          every episode grows out of.
        </p>
      </header>

      <section>
        <h2>THE FIVE FEUDS</h2>
        <div className="cards">
          <div className="card red">
            <div className="q">QF1</div>
            <h3>IRON JAW vs VIPER</h3>
            <p className="style">Heavy Artillery vs The Venomous Fang</p>
            <p>
              JAW promised a three-round demolition. VIPER smiled: &quot;I only need one counter.&quot; EP0 proved the
              fang deadlier — the revenge starts at second zero.
            </p>
            <p className="bio">
              <b>Incident:</b> EP0&apos;s K.O. — VIPER&apos;s counter left JAW staring at the lights.
              <br />
              <b>Escalation:</b> JAW storms VIPER&apos;s training session; VIPER posts the K.O. frame captioned
              &quot;again?&quot;
              <br />
              <b>Blowoff:</b> JAW swings for revenge. VIPER waits for the one punch.
            </p>
          </div>
          <div className="card orange">
            <div className="q">QF2</div>
            <h3>SLEDGE vs MONSOON</h3>
            <p className="style">Demolition vs The Storm</p>
            <p>
              SLEDGE vows to level the ring. MONSOON answers: &quot;You demolish buildings. I demolish people.&quot;
            </p>
            <p className="bio">
              <b>Incident:</b> weigh-in shove — SLEDGE cracks the stage floor.
              <br />
              <b>Escalation:</b> MONSOON trains inside a hurricane simulator; SLEDGE flattens a car stenciled
              &quot;MONSOON&quot;.
              <br />
              <b>Blowoff:</b> pure power vs pure speed. Who falls first.
            </p>
          </div>
          <div className="card purple">
            <div className="q">QF3</div>
            <h3>VOLT vs THE PROFESSOR</h3>
            <p className="style">Chaos vs Order</p>
            <p>
              &quot;Plans? I AM the lightning.&quot; The Professor has written a 14-step victory script. When the
              unpredictable meets the all-knowing — does the script get torn up?
            </p>
            <p className="bio">
              <b>Incident:</b> the Professor publishes his round-by-round prediction; VOLT does the exact opposite, on
              camera.
              <br />
              <b>Escalation:</b> the script grows to 28 steps; VOLT fries the whiteboard in a promo.
              <br />
              <b>Blowoff:</b> fourteen steps of logic against one bolt of chaos.
            </p>
          </div>
          <div className="card yellow">
            <div className="q">QF4</div>
            <h3>GOLIATH-7 vs LA REINA</h3>
            <p className="style">The Gentle Giant vs The Queen</p>
            <p>
              He never wants to win — only to hurt no one. She declares: &quot;No one leaves alive under the crown.&quot;
              The one who least wants to fight vs the one who most wants to win — who betrays their nature first?
            </p>
            <p className="bio">
              <b>Incident:</b> locker-room leak — GOLIATH-7 caught handing water to an opponent.
              <br />
              <b>Escalation:</b> LA REINA mocks &quot;a weapon that refuses to fire&quot;; his engineer friend begs him
              to fight for real.
              <br />
              <b>Blowoff:</b> mercy vs the crown.
            </p>
          </div>
          <div className="card">
            <div className="q">F</div>
            <h3>THE THRONE — GRAND FINAL</h3>
            <p className="style">Season 1 Championship</p>
            <p>
              Two feud lines settle their accounts here. Every round&apos;s tactics are voted by the audience —{" "}
              <b>YOU CALL THE FIGHT</b>. The script is co-written by 100,000 people.
            </p>
            <p className="bio">
              <b>Incident:</b> the bracket.
              <br />
              <b>Escalation:</b> the semifinals.
              <br />
              <b>Blowoff:</b> live. One throne.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>SEASON ARCS — EIGHT FIGHTERS, EIGHT JOURNEYS</h2>
        <table className="standings">
          <tbody>
            <tr>
              <th>Fighter</th>
              <th>Arc</th>
            </tr>
            <tr>
              <td>IRON JAW</td>
              <td>Revenge — the jaw that got cracked comes back harder</td>
            </tr>
            <tr>
              <td>VIPER</td>
              <td>Hubris — the fang grows bolder until someone pulls it</td>
            </tr>
            <tr>
              <td>SLEDGE</td>
              <td>The immovable object — first thing he can&apos;t demolish</td>
            </tr>
            <tr>
              <td>MONSOON</td>
              <td>Coronation of the storm</td>
            </tr>
            <tr>
              <td>VOLT</td>
              <td>Chaos unchained — refuses every script, including his own</td>
            </tr>
            <tr>
              <td>THE PROFESSOR</td>
              <td>The first miscalculation</td>
            </tr>
            <tr>
              <td>GOLIATH-7</td>
              <td>Redemption — from &quot;won&apos;t win&quot; to &quot;fights for a friend&quot;</td>
            </tr>
            <tr>
              <td>LA REINA</td>
              <td>The crown or nothing</td>
            </tr>
          </tbody>
        </table>
        <p className="note" style={{ textAlign: "center", color: "#888" }}>
          One arc. One step per episode. That&apos;s the whole trick.
        </p>
      </section>

      <section>
        <h2>ANATOMY OF AN EPISODE — 3 MINUTES</h2>
        <table className="standings">
          <tbody>
            <tr>
              <th>Time</th>
              <th>Beat</th>
              <th>What happens</th>
            </tr>
            <tr>
              <td>0:00</td>
              <td>The Hook</td>
              <td>3 highlights from last episode + one line on the feud</td>
            </tr>
            <tr>
              <td>0:30</td>
              <td>The Staredown</td>
              <td>Trash-talk + tale-of-the-tape data bar</td>
            </tr>
            <tr>
              <td>1:00</td>
              <td>Round 1</td>
              <td>Feeling-out — plants one hook (he got hit... and smiled)</td>
            </tr>
            <tr>
              <td>1:30</td>
              <td>Round 2</td>
              <td>
                <b>Tactics vote window</b> — the audience steers the fight
              </td>
            </tr>
            <tr>
              <td>2:00</td>
              <td>Round 3</td>
              <td>Climax — comeback-buff trigger keeps it alive</td>
            </tr>
            <tr>
              <td>2:30</td>
              <td>The Payoff</td>
              <td>K.O./decision → winner&apos;s one-liner → next bout teaser</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>BEYOND THE RING — THE PROGRAMMING</h2>
        <div className="cards">
          <div className="card">
            <h3>⚖️ WEIGH-IN FACEOFF</h3>
            <p className="style">60s · 48h before the bout</p>
            <p>
              Two fighters, one stare, one data bar. Ends with a comment-section bet on the winner. Zero new assets.
            </p>
          </div>
          <div className="card">
            <h3>🎤 TRASH-TALK INTERVIEW</h3>
            <p className="style">30–45s vertical · Shorts/Reels</p>
            <p>One fighter, straight to camera, one killer line. The follower-growth engine.</p>
          </div>
          <div className="card">
            <h3>📰 FIGHT RECAP</h3>
            <p className="style">60s · within 24h after</p>
            <p>&quot;3 things you missed&quot; — highlights + subtitles + updated standings.</p>
          </div>
          <div className="card">
            <h3>📹 LOCKER-ROOM LEAK</h3>
            <p className="style">30s · pseudo-documentary</p>
            <p>
              &quot;Stolen&quot; footage of a weakness or a secret — plants next episode&apos;s hook. Cheapest
              cliffhanger on the menu.
            </p>
          </div>
        </div>
      </section>

      <footer>
        <p>BRAWLVERSE · The Story Bible v1.0</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
