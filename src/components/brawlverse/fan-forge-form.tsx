'use client';

import Turnstile from '@/components/brawlverse/turnstile';
import { deviceId } from '@/lib/brawlverse/device';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type ForgeEntry = {
  id: number;
  name: string;
  persona: string;
  votes: number;
  created_at: number;
};

type ForgeVariant = {
  id: number;
  base_fighter: string;
  variant_name: string;
  persona: string;
  votes: number;
  created_at: number;
};

type QueueResponse = {
  submissions?: ForgeEntry[];
  variants?: ForgeVariant[];
  baseFighters?: string[];
  total?: number;
};

export default function FanForgeForm() {
  const t = useTranslations('Brawlverse.fanForge');
  const [queue, setQueue] = useState<ForgeEntry[]>([]);
  const [variants, setVariants] = useState<ForgeVariant[]>([]);
  const [baseFighters, setBaseFighters] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [baseFighter, setBaseFighter] = useState('');
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const loadQueue = useCallback(async () => {
    try {
      const r = await fetch('/api/fan-forge?op=queue', { cache: 'no-store' });
      const j = (await r.json()) as QueueResponse;
      setQueue(Array.isArray(j.submissions) ? j.submissions : []);
      setVariants(Array.isArray(j.variants) ? j.variants : []);
      setBaseFighters(Array.isArray(j.baseFighters) ? j.baseFighters : []);
      setTotal(Number(j.total) || 0);
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  function fail(text: string) {
    setMsgOk(false);
    setMsg(text);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const n = name.trim().toUpperCase();
    const p = persona.trim();
    if (n.length < 2 || p.length < 3) {
      fail(t('submitInvalid'));
      return;
    }

    setSubmitting(true);
    setMsg('');
    try {
      const r = await fetch('/api/fan-forge?op=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: n,
          persona: p,
          base_fighter: baseFighter,
          device_id: deviceId(),
          turnstile_token: token,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!r.ok) {
        if (j.error === 'name_invalid' || j.error === 'persona_invalid') {
          fail(t('submitInvalid'));
        } else if (j.error === 'rate_limited') {
          fail(t('submitBusy'));
        } else if (j.error === 'turnstile_failed') {
          fail(t('submitTurnstile'));
        } else {
          fail(t('submitFailed'));
        }
        return;
      }
      if (j.status === 'rejected') {
        fail(t('rejected'));
        return;
      }
      setMsgOk(true);
      setMsg(t('submitOk'));
      setName('');
      setPersona('');
      setBaseFighter('');
      await loadQueue();
    } catch {
      fail(t('submitNetwork'));
    } finally {
      setSubmitting(false);
      setToken('');
      setResetKey((n2) => n2 + 1);
    }
  }

  return (
    <>
      <section className="brawl-section brawl-forge">
        <h2 className="brawl-h2">{t('formTitle')}</h2>
        <form id="forgeForm" onSubmit={onSubmit}>
          <input
            id="fname"
            maxLength={24}
            placeholder={t('namePlaceholder')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            id="fpersona"
            maxLength={120}
            placeholder={t('personaPlaceholder')}
            required
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          />
          {baseFighters.length > 0 ? (
            <select
              id="fbase"
              value={baseFighter}
              onChange={(e) => setBaseFighter(e.target.value)}
              aria-label={t('baseLabel')}
            >
              <option value="">{t('baseNone')}</option>
              {baseFighters.map((f) => (
                <option key={f} value={f}>
                  {t('baseOption', { fighter: f })}
                </option>
              ))}
            </select>
          ) : null}
          <button type="submit" disabled={submitting}>
            {submitting ? t('submitBusy') : t('submit')}
          </button>
        </form>
        <Turnstile onToken={setToken} resetKey={resetKey} />
        {msg ? (
          <p className={`brawl-note${msgOk ? ' brawl-ok' : ''}`}>{msg}</p>
        ) : null}
        <p className="brawl-note">{t('prototypeNote')}</p>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('variantsTitle')}</h2>
        <p className="brawl-note">{t('variantsNote')}</p>
        <div className="brawl-cards" id="variantGrid">
          {loading ? <p className="brawl-note">{t('queueLoading')}</p> : null}
          {!loading && variants.length === 0 ? (
            <p className="brawl-note">{t('variantsEmpty')}</p>
          ) : null}
          {variants.map((v) => (
            <div className="brawl-card brawl-card--gold" key={v.id}>
              <div className="brawl-q">?</div>
              <h3>{v.variant_name}</h3>
              <p className="brawl-style">{v.base_fighter}</p>
              <p className="brawl-bio">{v.persona}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="brawl-section">
        <h2 className="brawl-h2">{t('queueTitle')}</h2>
        <div className="brawl-cards" id="queueGrid">
          {loading ? <p className="brawl-note">{t('queueLoading')}</p> : null}
          {!loading && queue.length === 0 ? (
            <p className="brawl-note">{t('queueEmpty')}</p>
          ) : null}
          {queue.map((f) => (
            <div className="brawl-card brawl-card--gold" key={f.id}>
              <div className="brawl-q">?</div>
              <h3>{f.name}</h3>
              <p className="brawl-style">
                {t('fanSubmission')} “{f.persona}”
              </p>
              <p className="brawl-bio">{t('queuedBio')}</p>
            </div>
          ))}
        </div>
        {total > 0 ? (
          <p className="brawl-note">{t('queueTotal', { count: total })}</p>
        ) : null}
      </section>
    </>
  );
}
