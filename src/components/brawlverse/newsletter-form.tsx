'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * 页脚 newsletter 订阅：email 输入框，提交到 POST /api/subscribe。
 */
export function NewsletterForm() {
  const t = useTranslations('Brawlverse.newsletter');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>(
    'idle'
  );

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? 'done' : 'error');
      if (res.ok) setEmail('');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return <p className="text-sm text-muted-foreground">{t('success')}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-sm font-medium">{t('title')}</p>
      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('placeholder')}
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={state === 'sending'}>
          {t('subscribe')}
        </Button>
      </div>
      {state === 'error' ? (
        <p className="text-xs text-destructive">{t('fail')}</p>
      ) : null}
    </form>
  );
}
