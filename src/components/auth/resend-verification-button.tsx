'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const RESEND_COOLDOWN_SECONDS = 60;

export function ResendVerificationButton({
  email,
  callbackUrl,
  initialMessage,
}: {
  email: string;
  callbackUrl: string;
  initialMessage: string;
}) {
  const t = useTranslations('AuthPage.verification');
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1_000)
      );
      setCooldown(remaining);
      if (!remaining) setCooldownUntil(0);
    }, 1_000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  async function resend() {
    setPending(true);
    setResult(null);
    try {
      const response = await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackUrl,
      });
      setResult(response.error ? 'error' : 'success');
      if (!response.error) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1_000);
      }
    } catch {
      setResult('error');
    } finally {
      setPending(false);
    }
  }

  const message =
    result === 'error'
      ? t('sendFailed')
      : result === 'success'
        ? t('requested')
        : initialMessage;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5 text-sm">
      <p
        role={result === 'error' ? 'alert' : 'status'}
        className={cn(
          'min-w-0 flex-1 text-muted-foreground',
          result === 'error' && 'text-destructive'
        )}
      >
        {message}
      </p>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-sm font-medium"
        data-testid="auth-resend-verification"
        disabled={pending || cooldown > 0 || !email}
        onClick={resend}
      >
        {pending
          ? t('sending')
          : cooldown > 0
            ? t('cooldown', { seconds: cooldown })
            : t('resend')}
      </Button>
    </div>
  );
}
