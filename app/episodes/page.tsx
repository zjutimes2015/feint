"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceId } from "@/lib/device";

type DanmakuInstance = { emit: (opts: { text: string }) => void };
type DanmakuCtor = new (opts: { container: HTMLElement }) => DanmakuInstance;

type Caption = { id: number; text: string; nickname: string };
type Pinned = { text: string; nickname: string };
type Tally = { heavy: number; dodge: number; guard: number };
type TallyResponse = { tally?: Partial<Tally>; total?: number };
type Bout = { id: string; tactic_note?: string };

const BOUT_ID = "qf1";
const ROUND_NO = 2;
const K = "bv_tactics";

function readLocalTally(): Tally {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return { heavy: 0, dodge: 0, guard: 0 };
    const v = JSON.parse(raw) as Partial<Tally> | null;
    return {
      heavy: Number(v?.heavy) || 0,
      dodge: Number(v?.dodge) || 0,
      guard: Number(v?.guard) || 0,
    };
  } catch {
    return { heavy: 0, dodge: 0, guard: 0 };
  }
}

export default function EpisodesPage() {
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [danmakuOn, setDanmakuOn] = useState(false);
  const [nick, setNick] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [tally, setTally] = useState<Tally>({ heavy: 0, dodge: 0, guard: 0 });
  const [tacticNote, setTacticNote] = useState("");

  const danmakuRef = useRef<DanmakuInstance | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const sinceIdRef = useRef(0);

  // Load danmaku.min.js on the client only; silently disable the fan box when it is unavailable.
  useEffect(() => {
    let cancelled = false;

    const boot = () => {
      if (cancelled) return;
      const Ctor = (window as unknown as { Danmaku?: DanmakuCtor }).Danmaku;
      if (typeof Ctor === "undefined" || !layerRef.current) return;
      danmakuRef.current = new Ctor({ container: layerRef.current });
      setDanmakuOn(true);
    };

    if (typeof (window as unknown as { Danmaku?: DanmakuCtor }).Danmaku !== "undefined") {
      boot();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>("script[data-bv-danmaku]");
    if (!script) {
      script = document.createElement("script");
      script.src = "/assets/danmaku.min.js";
      script.async = true;
      script.dataset.bvDanmaku = "1";
      document.body.appendChild(script);
    }
    script.addEventListener("load", boot);

    return () => {
      cancelled = true;
      script?.removeEventListener("load", boot);
    };
  }, []);

  // Poll feed + pinned once the danmaku layer is live.
  useEffect(() => {
    if (!danmakuOn) return;
    const danmaku = danmakuRef.current;
    if (!danmaku) return;
    let cancelled = false;

    const pollFeed = async () => {
      try {
        const r = await fetch(`/api/captions?op=feed&since_id=${sinceIdRef.current}`);
        const j = (await r.json()) as { captions?: Caption[] };
        if (cancelled) return;
        for (const c of j.captions ?? []) {
          danmaku.emit({ text: `${c.nickname}: ${c.text}` });
          if (c.id > sinceIdRef.current) sinceIdRef.current = c.id;
        }
      } catch {
        // legacy silently ignored network errors
      }
    };

    const pollPinned = async () => {
      try {
        const r = await fetch("/api/captions?op=pinned");
        const j = (await r.json()) as { pinned?: Pinned | null };
        if (cancelled) return;
        setPinned(j.pinned ?? null);
      } catch {
        // legacy silently ignored network errors
      }
    };

    void pollFeed();
    void pollPinned();
    const t1 = window.setInterval(pollFeed, 10000);
    const t2 = window.setInterval(pollPinned, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
  }, [danmakuOn]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/votes?op=tally&bout_id=${BOUT_ID}&round_no=${ROUND_NO}`);
      const j = (await r.json()) as TallyResponse;
      setTally({
        heavy: Number(j.tally?.heavy) || 0,
        dodge: Number(j.tally?.dodge) || 0,
        guard: Number(j.tally?.guard) || 0,
      });
      const b = (await fetch("/api/bouts").then((res) => res.json())) as Bout[];
      const bout = (b || []).find((x) => x.id === BOUT_ID);
      const note = bout && bout.tactic_note;
      setTacticNote(note ? "📢 上回合观众投票已执行：" + note : "");
    } catch {
      setTally(readLocalTally());
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 10000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function vote(k: keyof Tally) {
    try {
      const r = await fetch("/api/votes?op=cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bout_id: BOUT_ID, round_no: ROUND_NO, choice: k, device_id: deviceId() }),
      });
      if (!r.ok) throw new Error(await r.text());
    } catch {
      const v = readLocalTally();
      v[k]++;
      localStorage.setItem(K, JSON.stringify(v));
    }
    await refresh();
  }

  async function sendCaption() {
    const t = text.trim();
    if (!t) {
      setMsg("先写一句话！");
      return;
    }
    try {
      const r = await fetch("/api/captions?op=post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, nickname: nick.trim(), device_id: deviceId() }),
      });
      const j = (await r.json()) as { msg?: string };
      setMsg(j.msg || (r.ok ? "已提交！" : "发送失败"));
      if (r.ok) setText("");
    } catch {
      setMsg("网络开小差，稍后再试");
    }
  }

  const total = tally.heavy + tally.dodge + tally.guard || 1;

  return (
    <>
      <nav className="topnav">
        <Link href="/">HOME</Link> · <Link href="/fighters">FIGHTERS</Link> ·{" "}
        <Link href="/fan-forge">FAN FORGE →</Link>
      </nav>
      <header className="hero small">
        <h1 className="logo">EPISODES</h1>
        <p className="tagline">
          SEASON 1 — <span>QUARTERFINALS</span>
        </p>
      </header>

      <section className="sample">
        <h2>EP0 — SAMPLE BOUT: IRON JAW vs VIPER</h2>
        {pinned ? (
          <div className="pinned">
            <span className="fire">🔥 观众精选</span>
            <span>{pinned.text}</span>
            <span className="nick">— {pinned.nickname}</span>
          </div>
        ) : null}
        <div className="videowrap">
          <video controls preload="metadata" poster="/assets/viper-portrait.jpg">
            <source src="/brawlverse-sample-ep0.mp4" type="video/mp4" />
            <track kind="subtitles" src="/ep0.vtt" srcLang="en" label="English" default />
          </video>
          <div id="danmaku-layer" ref={layerRef} />
        </div>
        {danmakuOn ? (
          <div className="fanbox">
            <input
              id="fan-nick"
              maxLength={12}
              placeholder="昵称（默认匿名拳迷）"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
            />
            <input
              id="fan-text"
              maxLength={40}
              placeholder="发一句解说/玩梗，40字内，精选后全场可见"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button id="fan-send" onClick={() => void sendCaption()}>
              发送弹幕
            </button>
            <span id="fan-msg" className="note">
              {msg}
            </span>
          </div>
        ) : null}
        <div className="rulevote" style={{ marginTop: 22 }}>
          <h3>TACTICS VOTE (DEMO) — ROUND 2: WHAT SHOULD VIPER DO?</h3>
          {tacticNote ? <p style={{ color: "#ffcc00", fontSize: 14 }}>{tacticNote}</p> : null}
          <div className="rv-buttons">
            <button id="tHeavy" onClick={() => void vote("heavy")}>
              HEAVY
              <br />
              <small>go for the KO</small>
            </button>
            <button id="tDodge" onClick={() => void vote("dodge")}>
              DODGE
              <br />
              <small>slip and counter</small>
            </button>
            <button id="tGuard" onClick={() => void vote("guard")}>
              GUARD
              <br />
              <small>weather the storm</small>
            </button>
          </div>
          <div className="rv-bars">
            <div className="rv-row">
              <span>HEAVY</span>
              <div className="bar">
                <div id="bHeavy" style={{ width: (tally.heavy / total) * 100 + "%" }} />
              </div>
              <b id="nHeavy">{tally.heavy}</b>
            </div>
            <div className="rv-row">
              <span>DODGE</span>
              <div className="bar">
                <div id="bDodge" style={{ width: (tally.dodge / total) * 100 + "%" }} />
              </div>
              <b id="nDodge">{tally.dodge}</b>
            </div>
            <div className="rv-row">
              <span>GUARD</span>
              <div className="bar">
                <div id="bGuard" style={{ width: (tally.guard / total) * 100 + "%" }} />
              </div>
              <b id="nGuard">{tally.guard}</b>
            </div>
          </div>
          <p className="note">Prototype: Season 1 voting opens with the first official bout. Votes stored in your browser.</p>
        </div>
      </section>

      <section>
        <h2>UPCOMING BOUTS</h2>
        <p className="note" style={{ textAlign: "center", marginBottom: 14 }}>
          <Link href="/storylines" style={{ color: "#ffcc00" }}>
            Read the feuds — every punch has a reason →
          </Link>
        </p>
        <div className="cards">
          <div className="card locked">
            <div className="q">QF2</div>
            <h3>SLEDGE vs MONSOON</h3>
            <p className="style">Power meets storm</p>
          </div>
          <div className="card locked">
            <div className="q">QF3</div>
            <h3>VOLT vs THE PROFESSOR</h3>
            <p className="style">Chaos meets calculation</p>
          </div>
          <div className="card locked">
            <div className="q">QF4</div>
            <h3>GOLIATH-7 vs LA REINA</h3>
            <p className="style">Gentle giant meets queen</p>
          </div>
          <div className="card locked">
            <div className="q">SF</div>
            <h3>SEMIFINALS</h3>
            <p className="style">TBD</p>
          </div>
          <div className="card locked">
            <div className="q">F</div>
            <h3>GRAND FINAL</h3>
            <p className="style">TBD · live on Kick</p>
          </div>
        </div>
      </section>

      <section>
        <h2>STANDINGS</h2>
        <table className="standings">
          <tbody>
            <tr>
              <th>Fighter</th>
              <th>W</th>
              <th>L</th>
              <th>KO</th>
            </tr>
            <tr>
              <td>IRON JAW</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>VIPER</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>VOLT</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>GOLIATH-7</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>LA REINA</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>SLEDGE</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>MONSOON</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
            <tr>
              <td>THE PROFESSOR</td>
              <td>0</td>
              <td>0</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer>
        <p>BRAWLVERSE · Season 1 in production</p>
        <p className="aigc">All fighters, footage and artwork are AI-generated.</p>
      </footer>
    </>
  );
}
