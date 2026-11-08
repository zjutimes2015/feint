'use client';

/**
 * Cloudflare Turnstile 显式渲染:未配置 NEXT_PUBLIC_TURNSTILE_SITE_KEY 时不渲染、不阻塞。
 * token 单次有效,提交后把 resetKey 自增即可重新取票。
 */
import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback: (token: string) => void;
    }
  ) => string;
  reset: (widgetId: string) => void;
};

export default function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !boxRef.current || widgetRef.current) return;
    let cancelled = false;

    const boot = () => {
      if (cancelled || widgetRef.current || !boxRef.current) return;
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!ts) return;
      widgetRef.current = ts.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: onToken,
      });
    };

    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) {
      boot();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>(
      'script[data-bv-turnstile]'
    );
    if (!script) {
      script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.bvTurnstile = '1';
      document.body.appendChild(script);
    }
    script.addEventListener('load', boot);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', boot);
    };
  }, [onToken]);

  useEffect(() => {
    if (!resetKey || !widgetRef.current) return;
    const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    ts?.reset(widgetRef.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={boxRef} className="brawl-turnstile-slot" />;
}
