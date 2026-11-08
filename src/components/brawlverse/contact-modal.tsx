'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 联系表单弹窗：页脚 Email 图标点击打开，提交到 POST /api/contact。
 */
export function ContactModal({ open, onOpenChange }: ContactModalProps) {
  const t = useTranslations('Brawlverse.contact.modal');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) {
        setError(t('fail'));
        return;
      }
      setDone(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setError(t('fail'));
    } finally {
      setSending(false);
    }
  }

  function handleOpenChange(next: boolean): void {
    onOpenChange(next);
    if (!next) {
      setDone(false);
      setError('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {done ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('success')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">{t('name')}</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">{t('email')}</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">{t('message')}</Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={4}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={sending} className="w-full">
              {sending ? t('submitting') : t('submit')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
