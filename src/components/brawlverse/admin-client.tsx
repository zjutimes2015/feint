'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

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

type EpisodeRow = {
  week_key: string;
  status: string;
  video_url: string;
  error: string;
  attempts: number;
  updated_at: number;
  title: string;
  air_at: string;
};

type ContentRow = {
  id: string;
  kind: string;
  title: string;
  week_key: string;
  bout_id: string;
  round_no: number;
  tactic: string;
  provider: string;
  video_url: string;
  status: string;
  credits_used: number;
  updated_at: number;
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function AdminClient() {
  const t = useTranslations('Brawlverse.admin');

  const [bouts, setBouts] = useState<Bout[]>([]);
  const [tallies, setTallies] = useState<Record<string, BoutTally>>({});

  const [markets, setMarkets] = useState<Market[]>([]);
  const [settleSel, setSettleSel] = useState<Record<string, string>>({});

  const [subs, setSubs] = useState<Sub[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);

  const [caps, setCaps] = useState<Caption[]>([]);
  const [capsStatus, setCapsStatus] = useState('');

  const [votes, setVotes] = useState<VoteRow[]>([]);

  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [epStatus, setEpStatus] = useState('review');

  const [contents, setContents] = useState<ContentRow[]>([]);
  const [contentStatus, setContentStatus] = useState('published');

  const [liveRoundId, setLiveRoundId] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [scriptModel, setScriptModel] = useState('');

  const [nbId, setNbId] = useState('');
  const [nbTitle, setNbTitle] = useState('');
  const [nbA, setNbA] = useState('');
  const [nbB, setNbB] = useState('');

  const [mkId, setMkId] = useState('');
  const [mkBout, setMkBout] = useState('');
  const [mkQuestion, setMkQuestion] = useState('');
  const [mkType, setMkType] = useState('');
  const [mkSels, setMkSels] = useState('');

  const [subDh, setSubDh] = useState('');
  const [subTier, setSubTier] = useState('ringside');

  const [liveBout, setLiveBout] = useState('');
  const [liveRound, setLiveRound] = useState('');
  const [liveTacticA, setLiveTacticA] = useState('');
  const [liveTacticB, setLiveTacticB] = useState('');
  const [liveBranchA, setLiveBranchA] = useState('/brawlverse/branch-a.mp4');
  const [liveBranchB, setLiveBranchB] = useState('');
  const [liveState, setLiveState] = useState('VOTING');
  const [liveMinutes, setLiveMinutes] = useState('10');

  const [votesBout, setVotesBout] = useState('');
  const [scriptPrompt, setScriptPrompt] = useState('');

  const [error, setError] = useState('');

  async function api<T = unknown>(
    path: string,
    opts: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    };
    const r = await fetch(path, { ...opts, headers });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as T;
  }

  const loadBouts = useCallback(async () => {
    try {
      const list = await api<Bout[]>('/api/bouts');
      setBouts(list);
      const tallyMap: Record<string, BoutTally> = {};
      for (const b of list) {
        try {
          tallyMap[b.id] = await api<BoutTally>(
            `/api/votes?op=tally&bout_id=${b.id}&round_no=${b.round_no}`
          );
        } catch {
          // a bout without a tally is simply rendered without bars
        }
      }
      setTallies(tallyMap);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadMkts = useCallback(async () => {
    try {
      const d = await api<{ markets: Market[] }>('/api/admin?op=betting');
      setMarkets(d.markets ?? []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadSubs = useCallback(async () => {
    try {
      const d = await api<{ subscriptions: Sub[] }>(
        '/api/admin?op=subscriptions'
      );
      setSubs(d.subscriptions ?? []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadGates = useCallback(async () => {
    try {
      const d = await api<{ gates: Gate[] }>('/api/admin?op=gates');
      setGates(d.gates ?? []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadCaps = useCallback(async (status: string) => {
    try {
      const rows = await api<Caption[]>(
        `/api/admin?op=captions&status=${status}`
      );
      setCaps(rows ?? []);
      setCapsStatus(status);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadVotes = useCallback(async () => {
    try {
      const q = votesBout ? `&bout_id=${encodeURIComponent(votesBout)}` : '';
      const rows = await api<VoteRow[]>(`/api/admin?op=votes${q}`);
      setVotes(rows ?? []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [votesBout]);

  const loadEpisodes = useCallback(async (status: string) => {
    try {
      const d = await api<{ episodes: EpisodeRow[] }>(
        `/api/adaptlane/render?op=list&status=${status}`
      );
      setEpisodes(d.episodes ?? []);
      setEpStatus(status);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const loadContents = useCallback(async (status: string) => {
    try {
      const d = await api<{ items: ContentRow[] }>(
        `/api/content?op=list&status=${status}`
      );
      setContents(d.items ?? []);
      setContentStatus(status);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  async function publishEpisode(weekKey: string) {
    try {
      await api('/api/adaptlane/render?op=publish', {
        method: 'POST',
        body: JSON.stringify({ week_key: weekKey }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadEpisodes(epStatus);
  }

  useEffect(() => {
    void loadBouts();
    void loadMkts();
    void loadGates();
    void loadSubs();
    void loadCaps('pending');
    void loadEpisodes('review');
    void loadContents('published');
  }, [
    loadBouts,
    loadMkts,
    loadGates,
    loadSubs,
    loadCaps,
    loadEpisodes,
    loadContents,
  ]);

  async function toggleBout(id: string, open: boolean) {
    try {
      await api(`/api/admin?op=bouts&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ voting_open: open }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadBouts();
  }

  async function nextRound(id: string, r: number) {
    try {
      await api(`/api/admin?op=bouts&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ round_no: r, voting_open: true }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadBouts();
  }

  async function addBout() {
    try {
      await api('/api/admin?op=bouts', {
        method: 'POST',
        body: JSON.stringify({
          id: nbId,
          title: nbTitle,
          fighter_a: nbA,
          fighter_b: nbB,
          voting_open: false,
        }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadBouts();
  }

  async function addMarket() {
    const selections = mkSels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api('/api/admin?op=betting', {
        method: 'POST',
        body: JSON.stringify({
          id: mkId,
          bout_id: mkBout,
          market_type: mkType || 'winner',
          question: mkQuestion,
          selections,
        }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadMkts();
  }

  async function marketAction(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/admin?op=betting&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadMkts();
  }

  async function setSub() {
    try {
      await api(
        `/api/admin?op=subscriptions&device_hash=${encodeURIComponent(subDh)}`,
        { method: 'PATCH', body: JSON.stringify({ tier: subTier }) }
      );
    } catch (e) {
      setError(errMsg(e));
    }
    void loadSubs();
  }

  async function setGate(id: string, status: string) {
    try {
      await api(`/api/admin?op=gates&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadGates();
  }

  async function captionAction(id: number, action: string) {
    try {
      await api(`/api/admin?op=captions&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
    void loadCaps(capsStatus);
  }

  async function createLiveRound() {
    try {
      const d = await api<{ round_id: string }>('/api/admin?op=live', {
        method: 'POST',
        body: JSON.stringify({
          bout_id: liveBout,
          round_no: Number(liveRound) || 1,
          tactic_a: liveTacticA,
          tactic_b: liveTacticB,
        }),
      });
      setLiveRoundId(d.round_id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function updateLiveRound() {
    try {
      await api('/api/admin?op=live', {
        method: 'PATCH',
        body: JSON.stringify({
          round_id: liveRoundId,
          branch_a_url: liveBranchA,
          branch_b_url: liveBranchB,
          state: liveState,
          vote_minutes: Number(liveMinutes) || 10,
        }),
      });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function settleLiveRound() {
    try {
      const d = await api<{
        winning_tactic: string;
        winning_branch: string;
        video_url: string;
        tally: Record<string, number>;
      }>('/api/live?op=tally', {
        method: 'POST',
        body: JSON.stringify({ round_id: liveRoundId }),
      });
      setError(
        `${d.winning_tactic} (${d.winning_branch.toUpperCase()}) — ${JSON.stringify(d.tally)} — ${d.video_url || 'no video'}`
      );
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function genScript() {
    try {
      const d = await api<{ text: string; model: string }>(
        '/api/admin?op=script',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: scriptPrompt, model: scriptModel }),
        }
      );
      setScriptText(d.text);
      setScriptModel(d.model);
    } catch (e) {
      setScriptText(t('failed', { error: errMsg(e) }));
    }
  }

  return (
    <div className="brawl-admin">
      <h1>BOOKER CONSOLE</h1>
      {error ? <p className="brawl-adm-small">⚠ {error}</p> : null}

      <div className="brawl-adm-card">
        <div className="brawl-adm-row">
          {bouts.map((b) => {
            const tally = tallies[b.id];
            return (
              <div className="brawl-adm-card" key={b.id}>
                <h3>
                  {b.title}{' '}
                  <span className="brawl-adm-small">
                    [{b.id}] R{b.round_no}{' '}
                    {b.voting_open ? '🟢 OPEN' : '🔴 CLOSED'}
                  </span>
                </h3>
                <p>
                  {b.fighter_a} vs {b.fighter_b}
                </p>
                {tally
                  ? Object.entries(tally.tally).map(([k, v]) => {
                      const p = tally.total
                        ? Math.round((v / tally.total) * 100)
                        : 0;
                      return (
                        <div key={k}>
                          {k.toUpperCase()} — {v} ({p}%)
                          <div
                            className="brawl-adm-bar"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                      );
                    })
                  : null}
                <div className="brawl-adm-row">
                  <button
                    type="button"
                    className="brawl-adm-btn"
                    onClick={() => void toggleBout(b.id, !b.voting_open)}
                  >
                    {b.voting_open ? 'Close voting' : 'Open voting'}
                  </button>
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void nextRound(b.id, b.round_no + 1)}
                  >
                    → Round {b.round_no + 1}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="brawl-adm-card">
        <h3>{t('createBout')}</h3>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder={t('boutId')}
            value={nbId}
            onChange={(e) => setNbId(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('boutTitle')}
            value={nbTitle}
            onChange={(e) => setNbTitle(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('fighterA')}
            value={nbA}
            onChange={(e) => setNbA(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('fighterB')}
            value={nbB}
            onChange={(e) => setNbB(e.target.value)}
          />
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void addBout()}
          >
            {t('create')}
          </button>
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.markets')}</h2>
        <div>
          {markets.length === 0 ? (
            <p className="brawl-adm-small">{t('noRows')}</p>
          ) : null}
          {markets.map((m) => {
            const pools = Object.entries(m.pools)
              .map(([k, v]) => `${k}:${v}`)
              .join(' ');
            const sel = settleSel[m.id] ?? m.selections[0] ?? '';
            return (
              <div className="brawl-adm-row brawl-adm-item" key={m.id}>
                <span>
                  [{m.id}] <b>{m.question}</b>{' '}
                  <span className="brawl-adm-small">
                    {m.status} · pool {m.total_pool} · {pools}
                  </span>
                </span>
                <span style={{ flex: 1 }} />
                {m.status === 'open' ? (
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void marketAction(m.id, { action: 'lock' })}
                  >
                    {t('lock')}
                  </button>
                ) : null}
                {m.status !== 'settled' ? (
                  <>
                    <select
                      className="brawl-adm-select"
                      value={sel}
                      onChange={(e) =>
                        setSettleSel((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                    >
                      {m.selections.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="brawl-adm-btn"
                      onClick={() =>
                        void marketAction(m.id, {
                          action: 'settle',
                          winning_selection: sel,
                        })
                      }
                    >
                      {t('settle')}
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder={t('marketId')}
            value={mkId}
            onChange={(e) => setMkId(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder="bout_id (qf1)"
            value={mkBout}
            onChange={(e) => setMkBout(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('question')}
            style={{ flex: 1 }}
            value={mkQuestion}
            onChange={(e) => setMkQuestion(e.target.value)}
          />
        </div>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder="winner|method|round"
            style={{ width: 150 }}
            value={mkType}
            onChange={(e) => setMkType(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('selections')}
            style={{ flex: 1 }}
            value={mkSels}
            onChange={(e) => setMkSels(e.target.value)}
          />
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void addMarket()}
          >
            {t('create')}
          </button>
          <button
            type="button"
            className="brawl-adm-btn brawl-adm-btn--ghost"
            onClick={() => void loadMkts()}
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.subs')}</h2>
        <div>
          {subs.length === 0 ? (
            <span className="brawl-adm-small">{t('noRows')}</span>
          ) : null}
          {subs.map((s, i) => (
            <div className="brawl-adm-row" key={`${s.player}-${i}`}>
              <span>
                <b>{s.player}</b> {s.tier} [{s.status}]{' '}
                <span className="brawl-adm-small">
                  {t('periodEnd')} {s.period_end}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder="device_hash (sha)"
            value={subDh}
            onChange={(e) => setSubDh(e.target.value)}
          />
          <select
            className="brawl-adm-select"
            value={subTier}
            onChange={(e) => setSubTier(e.target.value)}
          >
            <option value="ringside">ringside $4.99</option>
            <option value="booker">booker $14.99</option>
            <option value="promoter">promoter $49</option>
            <option value="annual">annual $199/yr</option>
            <option value="free">free (revoke)</option>
          </select>
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void setSub()}
          >
            {t('save')}
          </button>
          <button
            type="button"
            className="brawl-adm-btn brawl-adm-btn--ghost"
            onClick={() => void loadSubs()}
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.gates')}</h2>
        <div>
          {gates.map((g) => {
            const dot =
              g.status === 'done' ? '🟢' : g.status === 'killed' ? '🔴' : '⚪';
            return (
              <div className="brawl-adm-row brawl-adm-item" key={g.id}>
                <span>
                  {dot} <b>{g.id}</b> {g.label}
                  {g.note ? (
                    <span className="brawl-adm-small"> — {g.note}</span>
                  ) : null}
                </span>
                <span style={{ flex: 1 }} />
                {g.status !== 'done' ? (
                  <button
                    type="button"
                    className="brawl-adm-btn"
                    onClick={() => void setGate(g.id, 'done')}
                  >
                    {t('done')}
                  </button>
                ) : null}
                {g.status !== 'killed' ? (
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void setGate(g.id, 'killed')}
                  >
                    ×
                  </button>
                ) : null}
                {g.status !== 'pending' ? (
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void setGate(g.id, 'pending')}
                  >
                    ↺
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.captions')}</h2>
        <div className="brawl-adm-row">
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void loadCaps('pending')}
          >
            pending
          </button>
          <button
            type="button"
            className="brawl-adm-btn brawl-adm-btn--ghost"
            onClick={() => void loadCaps('approved')}
          >
            approved
          </button>
          <button
            type="button"
            className="brawl-adm-btn brawl-adm-btn--ghost"
            onClick={() => void loadCaps('rejected')}
          >
            rejected
          </button>
        </div>
        <div>
          {capsStatus && caps.length === 0 ? (
            <p className="brawl-adm-small">{t('noRows')}</p>
          ) : null}
          {caps.map((c) => (
            <div className="brawl-adm-row brawl-adm-item" key={c.id}>
              <span>
                [{c.id}] <b>{c.text}</b>{' '}
                <span className="brawl-adm-small">
                  — {c.nickname}
                  {c.pinned ? ' 📌' : ''}
                </span>
              </span>
              <span style={{ flex: 1 }} />
              {capsStatus === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="brawl-adm-btn"
                    onClick={() => void captionAction(c.id, 'approve')}
                  >
                    {t('approve')}
                  </button>
                  <button
                    type="button"
                    className="brawl-adm-btn"
                    onClick={() => void captionAction(c.id, 'pin')}
                  >
                    {t('pin')}
                  </button>
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void captionAction(c.id, 'reject')}
                  >
                    {t('reject')}
                  </button>
                </>
              ) : capsStatus === 'approved' ? (
                <>
                  <button
                    type="button"
                    className="brawl-adm-btn"
                    onClick={() =>
                      void captionAction(c.id, c.pinned ? 'unpin' : 'pin')
                    }
                  >
                    {c.pinned ? t('unpin') : t('pin')}
                  </button>
                  <button
                    type="button"
                    className="brawl-adm-btn brawl-adm-btn--ghost"
                    onClick={() => void captionAction(c.id, 'reject')}
                  >
                    {t('reject')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="brawl-adm-btn"
                  onClick={() => void captionAction(c.id, 'approve')}
                >
                  {t('approve')}
                </button>
              )}
              <button
                type="button"
                className="brawl-adm-btn brawl-adm-btn--ghost"
                onClick={() => void captionAction(c.id, 'delete')}
              >
                {t('delete')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.content')}</h2>
        <p className="brawl-adm-small">{t('contentNote')}</p>
        <div className="brawl-adm-row">
          {['published', 'review', 'draft', 'failed'].map((s) => (
            <button
              key={s}
              type="button"
              className={`brawl-adm-btn${
                contentStatus === s ? '' : ' brawl-adm-btn--ghost'
              }`}
              onClick={() => void loadContents(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div>
          {contents.length === 0 ? (
            <p className="brawl-adm-small">{t('noRows')}</p>
          ) : null}
          {contents.map((c) => (
            <div className="brawl-adm-row brawl-adm-item" key={c.id}>
              <span>
                <b>{c.title || c.id}</b>{' '}
                <span className="brawl-adm-small">
                  {c.kind}
                  {c.tactic ? ` · ${c.tactic}` : ''}
                  {c.provider ? ` · ${c.provider}` : ''}
                  {c.credits_used ? ` · ${c.credits_used}cr` : ''}
                </span>
              </span>
              <span style={{ flex: 1 }} />
              {c.video_url ? (
                <a
                  className="brawl-adm-btn brawl-adm-btn--ghost"
                  href={c.video_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('episodesWatch')}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.episodes')}</h2>
        <div className="brawl-adm-row">
          {['review', 'draft', 'failed', 'published', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              className={`brawl-adm-btn${
                epStatus === s ? '' : ' brawl-adm-btn--ghost'
              }`}
              onClick={() => void loadEpisodes(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div>
          {episodes.length === 0 ? (
            <p className="brawl-adm-small">{t('noRows')}</p>
          ) : null}
          {episodes.map((e) => (
            <div className="brawl-adm-row brawl-adm-item" key={e.week_key}>
              <span>
                <b>{e.week_key}</b>
                {e.title ? ` · ${e.title}` : ''}{' '}
                <span className="brawl-adm-small">
                  {e.status}
                  {e.attempts ? ` · try ${e.attempts}` : ''}
                  {e.error ? ` · ${e.error}` : ''}
                </span>
              </span>
              <span style={{ flex: 1 }} />
              {e.video_url ? (
                <a
                  className="brawl-adm-btn brawl-adm-btn--ghost"
                  href={e.video_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('episodesWatch')}
                </a>
              ) : null}
              {e.status === 'review' && e.video_url ? (
                <button
                  type="button"
                  className="brawl-adm-btn"
                  onClick={() => void publishEpisode(e.week_key)}
                >
                  {t('episodesPublish')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.live')}</h2>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder="bout_id (qf1)"
            value={liveBout}
            onChange={(e) => setLiveBout(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder="round_no"
            style={{ width: 100 }}
            value={liveRound}
            onChange={(e) => setLiveRound(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('tacticA')}
            value={liveTacticA}
            onChange={(e) => setLiveTacticA(e.target.value)}
          />
          <input
            className="brawl-adm-input"
            placeholder={t('tacticB')}
            value={liveTacticB}
            onChange={(e) => setLiveTacticB(e.target.value)}
          />
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void createLiveRound()}
          >
            {t('createRound')}
          </button>
        </div>
        {liveRoundId ? (
          <>
            <p className="brawl-adm-small">round_id: {liveRoundId}</p>
            <div className="brawl-adm-row">
              <input
                className="brawl-adm-input"
                placeholder={t('branchAUrl')}
                value={liveBranchA}
                onChange={(e) => setLiveBranchA(e.target.value)}
              />
              <input
                className="brawl-adm-input"
                placeholder={t('branchBUrl')}
                value={liveBranchB}
                onChange={(e) => setLiveBranchB(e.target.value)}
              />
            </div>
            <div className="brawl-adm-row">
              <select
                className="brawl-adm-select"
                value={liveState}
                onChange={(e) => setLiveState(e.target.value)}
              >
                <option value="scheduled">scheduled</option>
                <option value="VOTING">VOTING</option>
                <option value="LOCKED">LOCKED</option>
                <option value="REVEAL">REVEAL</option>
                <option value="done">done</option>
              </select>
              <input
                className="brawl-adm-input"
                placeholder="vote_minutes"
                style={{ width: 120 }}
                value={liveMinutes}
                onChange={(e) => setLiveMinutes(e.target.value)}
              />
              <button
                type="button"
                className="brawl-adm-btn"
                onClick={() => void updateLiveRound()}
              >
                {t('save')}
              </button>
              <button
                type="button"
                className="brawl-adm-btn brawl-adm-btn--ghost"
                onClick={() => void settleLiveRound()}
              >
                {t('tally')}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="brawl-adm-card">
        <h2>{t('tabs.votes')}</h2>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder="bout_id (empty = all)"
            value={votesBout}
            onChange={(e) => setVotesBout(e.target.value)}
          />
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void loadVotes()}
          >
            {t('refresh')}
          </button>
        </div>
        <table className="brawl-standings">
          <tbody>
            <tr>
              <th>Time</th>
              <th>Bout</th>
              <th>Round</th>
              <th>Choice</th>
              <th>Weight</th>
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

      <div className="brawl-adm-card">
        <h2>OpenRouter</h2>
        <div className="brawl-adm-row">
          <input
            className="brawl-adm-input"
            placeholder="model (optional)"
            style={{ flex: 1 }}
            value={scriptModel}
            onChange={(e) => setScriptModel(e.target.value)}
          />
          <button
            type="button"
            className="brawl-adm-btn"
            onClick={() => void genScript()}
          >
            {t('create')}
          </button>
        </div>
        <textarea
          className="brawl-adm-input"
          placeholder="prompt (max 4000 chars)"
          style={{ width: '100%', minHeight: 90 }}
          value={scriptPrompt}
          onChange={(e) => setScriptPrompt(e.target.value)}
        />
        {scriptText ? (
          <p className="brawl-adm-small" style={{ whiteSpace: 'pre-wrap' }}>
            {scriptText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
