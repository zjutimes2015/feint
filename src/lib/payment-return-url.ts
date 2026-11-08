import { getBaseUrl } from '@/lib/urls';

export const PAYMENT_RETURN_URL_ERROR =
  'Payment return URL must use the application origin';

/**
 * Resolve a caller-provided payment return URL against the configured app
 * origin. Request Host and Origin headers are intentionally not trusted.
 */
export function normalizePaymentReturnUrl(
  value: string | undefined,
  applicationUrl = getBaseUrl()
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const candidateValue = value.trim();
  if (
    candidateValue.length === 0 ||
    candidateValue.startsWith('//') ||
    candidateValue.startsWith('\\\\')
  ) {
    throw new Error(PAYMENT_RETURN_URL_ERROR);
  }

  try {
    const applicationOrigin = new URL(applicationUrl).origin;
    const candidate = new URL(candidateValue, `${applicationOrigin}/`);
    if (candidate.origin !== applicationOrigin) {
      throw new Error(PAYMENT_RETURN_URL_ERROR);
    }
    return candidate.toString();
  } catch {
    throw new Error(PAYMENT_RETURN_URL_ERROR);
  }
}

/**
 * Convert a trusted same-origin callback into an internal path for client-side
 * navigation. Invalid callbacks return null so callers can choose a safe
 * fallback without exposing validation details.
 */
export function getSafePaymentCallback(
  value: string,
  applicationUrl = getBaseUrl()
): string | null {
  try {
    const normalized = normalizePaymentReturnUrl(value, applicationUrl);
    if (!normalized) {
      return null;
    }
    const url = new URL(normalized);
    // A same-origin URL such as `/.//host` can still normalize to a `//host`
    // pathname, which client navigation treats as a protocol-relative URL.
    if (url.pathname.startsWith('//')) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
