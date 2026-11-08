'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { deviceId } from '@/lib/brawlverse/device';
import Turnstile from '@/components/brawlverse/turnstile';

type RuleChoice = 'rage' | 'fair';
type RuleTally = { rage: number; fair: number };

// 服务端的常驻 exhibition 赛程,两套规则投票全站共享
const EX_BOUT = 'ex1';
const EX_ROUND = 1;
const K = 'bv_rulevote';

export default function RuleVote() {
  const t = useTranslations('Brawlverse.home');
  const [tally, setTally] = useState<RuleTally>({ rage: 0, fair: 0 });
  const [mine, setMine] = useState<RuleChoice | ''>('');
  const [msg, setMsg] = useState('');
  const [voting, setVoting] = useState(false);
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const refreshTally = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/votes?op=tally&bout_id=${EX_BOUT}&round_no=${EX_ROUND}`
      );
      const j = (await r.json()) as { tally?: Partial<RuleTally> };
      setTally({
        rage: Number(j.tally?.rage) || 0,
        fair: Number(j.tally?.fair) || 0,
      });
    } catch {
      // 网络异常时保留上一次票数
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(K);
    if (saved === 'rage' || saved === 'fair') setMine(saved);
    void refreshTally();
    const timer = window.setInterval(() => void refreshTally(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshTally]);

  async function vote(k: RuleChoice) {
    setVoting(true);
    try {
      const r = await fetch('/api/votes?op=cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bout_id: EX_BOUT,
          round_no: EX_ROUND,
          choice: k,
          device_id: deviceId(),
          turnstile_token: token,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMsg(
          j.error === 'voting is closed for this bout'
            ? t('voteClosed')
            : t('voteFailed')
        );
        return;
      }
      localStorage.setItem(K, k);
      setMine(k);
      setMsg(t('voteOk'));
      await refreshTally();
    } catch {
      setMsg(t('voteNetwork'));
    } finally {
      setVoting(false);
      setToken('');
      setResetKey((n) => n + 1);
    }
  }

  const total = tally.rage + tally.fair;

  return (
    <div className="brawl-rulevote">
      <h3>{t('ruleTitle')}</h3>
      <div className="brawl-rv-buttons">
        <button
          id="voteRage"
          type="button"
          className={`is-rage${mine === 'rage' ? ' is-picked' : ''}`}
          onClick={() => void vote('rage')}
          disabled={voting}
        >
          {t('rageLabel')}
          <br />
          <small>{t('rageHint')}</small>
        </button>
        <button
          id="voteFair"
          type="button"
          className={`is-fair${mine === 'fair' ? ' is-picked' : ''}`}
          onClick={() => void vote('fair')}
          disabled={voting}
        >
          {t('fairLabel')}
          <br />
          <small>{t('fairHint')}</small>
        </button>
      </div>
      <div className="brawl-rv-bars">
        <div className="brawl-rv-row">
          <span>{t('rageLabel')}</span>
          <div className="brawl-bar">
            <div
              id="barRage"
              className="is-rage"
              style={{ width: `${total ? (tally.rage / total) * 100 : 0}%` }}
            />
          </div>
          <b id="nRage">{tally.rage}</b>
        </div>
        <div className="brawl-rv-row">
          <span>{t('fairLabel')}</span>
          <div className="brawl-bar">
            <div
              id="barFair"
              className="is-fair"
              style={{ width: `${total ? (tally.fair / total) * 100 : 0}%` }}
            />
          </div>
          <b id="nFair">{tally.fair}</b>
        </div>
      </div>
      <p className="brawl-note">
        {total}
        {t('votesSuffix')}
        {mine
          ? ` · ${t('youVoted')} ${mine === 'rage' ? t('rageLabel') : t('fairLabel')}`
          : ` · ${t('tapToVote')}`}
        {msg ? ` · ${msg}` : ''}
      </p>
      <Turnstile onToken={setToken} resetKey={resetKey} />
    </div>
  );
}
