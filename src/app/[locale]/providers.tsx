'use client';

import { PostHogProvider } from '@/analytics/posthog-analytics';
import { QueryProvider } from '@/components/providers/query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { websiteConfig } from '@/config/website';
import { authClient } from '@/lib/auth-client';
import { deviceId } from '@/lib/brawlverse/device';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * 登录后把当前浏览器的游客数据归并到账号。
 *
 * 访客身份买的订阅、投票、钱包都记在设备指纹键下；登录后档位键切成
 * 'u:'+userId，若不归并，游客身份买的订阅就显示不出来。
 * 覆盖邮箱登录、OAuth 与注册（会话出现即触发），归并本身幂等，
 * 同一会话只跑一次。
 */
function GuestClaim() {
  const { data: session } = authClient.useSession();
  const claimedFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || claimedFor.current === userId) return;
    claimedFor.current = userId;
    const did = deviceId();
    if (!did || did.length < 8) return;
    fetch('/api/identity?op=claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: did }),
    }).catch(() => {
      // 归并失败不阻塞页面；下次会话变化时再试
      claimedFor.current = null;
    });
  }, [session]);

  return null;
}

/**
 * Providers
 *
 * This component is used to wrap the app in the providers.
 *
 * - PostHogProvider: Provides the PostHog analytics to the app.
 * - QueryProvider: Provides the query client to the app.
 * - ThemeProvider: Provides the theme to the app.
 * - TooltipProvider: Provides the tooltip to the app.
 */
export function Providers({ children }: ProvidersProps) {
  const defaultMode = websiteConfig.ui.mode?.defaultMode ?? 'system';

  return (
    <PostHogProvider>
      <QueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme={defaultMode}
          enableSystem={true}
          disableTransitionOnChange
        >
          <TooltipProvider>
            <GuestClaim />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </QueryProvider>
    </PostHogProvider>
  );
}
