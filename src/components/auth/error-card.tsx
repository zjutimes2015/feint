import { AuthCard } from '@/components/auth/auth-card';
import { Routes } from '@/routes';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Hints for the error codes Better Auth puts on the error URL.
 * Anything unmapped is shown verbatim so it can be grepped in the logs.
 */
const ERROR_HINTS: Record<string, string> = {
  state_mismatch:
    'The OAuth state cookie was rejected. Open the login page on the same domain you registered, then retry.',
  please_restart_the_process:
    'The sign-in attempt expired. Close other login tabs and start again.',
  invalid_client:
    'The provider rejected the client id/secret. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
  redirect_uri_mismatch:
    'The callback URL is not whitelisted at the provider. Add {baseUrl}/api/auth/callback/{provider}.',
  access_denied: 'The provider account cancelled the authorization.',
  account_not_linked:
    'This email already exists with a different sign-in method.',
};

export const ErrorCard = ({
  errorCode,
  errorDescription,
}: {
  errorCode?: string;
  errorDescription?: string;
}) => {
  const t = useTranslations('AuthPage.error');
  const hint = errorCode ? ERROR_HINTS[errorCode] : undefined;

  return (
    <AuthCard
      headerLabel={t('title')}
      bottomButtonHref={`${Routes.Login}`}
      bottomButtonLabel={t('backToLogin')}
      className="border-none"
    >
      <div className="w-full flex flex-col items-center justify-center py-4 gap-3">
        <div className="flex items-center gap-2">
          <TriangleAlertIcon className="text-destructive size-4" />
          <p className="font-medium text-destructive">{t('tryAgain')}</p>
        </div>
        {errorCode && (
          <div className="w-full space-y-1 text-center">
            <p className="font-mono text-xs text-muted-foreground break-all">
              {errorCode}
            </p>
            {(hint ?? errorDescription) && (
              <p className="text-xs text-muted-foreground">
                {hint ?? errorDescription}
              </p>
            )}
          </div>
        )}
      </div>
    </AuthCard>
  );
};
