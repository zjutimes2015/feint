# Newsletter Module

This module provides functionality for managing newsletter subscriptions using various email service providers. Currently, it supports [Resend](https://resend.com), [Beehiiv](https://beehiiv.com), and [MailCheap](https://mailcheap.ai) for handling newsletter subscriptions.

## Overview

The newsletter system is designed to be:

- **Modular**: Easy to extend with new providers
- **Flexible**: Simple API for subscription management
- **Type-safe**: Full TypeScript support
- **Provider-agnostic**: Common interface for different newsletter services

## Directory Structure

```
src/newsletter/
├── provider/       # Newsletter provider implementations
│   ├── resend.ts   # Resend.com provider implementation
│   ├── beehiiv.ts  # Beehiiv provider implementation
│   └── mailcheap.ts # MailCheap REST API provider implementation
├── index.ts        # Main API and provider registry
├── schema.ts       # newsletterEmailSchema: trims and lowercases the email
└── types.ts        # TypeScript types and interfaces
```

## Features

- Subscribe users to newsletters
- Unsubscribe users from newsletters
- Check subscription status
- Provider-agnostic interface for easy integration with different newsletter services
- Automatic configuration using environment variables

## Configuration

The newsletter module is configured in two ways:

1. In `src/config/website.tsx`:

```typescript
// In src/config/website.tsx
export const websiteConfig = {
  // ...other config
  newsletter: {
    enable: true, // Whether to show newsletter UI and auto-subscribe on sign up
    provider: 'resend', // Supported: 'resend', 'beehiiv', 'mailcheap'
    autoSubscribeAfterSignUp: true, // Whether to automatically subscribe users after sign up
  },
  // ...other config
}
```

When both `enable` and `autoSubscribeAfterSignUp` are `true`, the Better Auth
`user.create.after` hook in `src/lib/auth.ts` subscribes the new user about two
seconds after sign up, so the verification email is sent first and Resend's
rate limit is not hit. The hook is skipped in E2E test mode.

2. Using environment variables:

```
# Required for Resend provider
RESEND_API_KEY=YOUR-RESEND-API-KEY

# Required for Beehiiv provider
BEEHIIV_API_KEY=YOUR-BEEHIIV-API-KEY
BEEHIIV_PUBLICATION_ID=YOUR-BEEHIIV-PUBLICATION-ID

# Required for MailCheap provider
MAILCHEAP_API_KEY=YOUR-FULL-ACCESS-API-KEY
MAILCHEAP_NEWSLETTER_ID=YOUR-NEWSLETTER-ID-OR-SLUG
```

## MailCheap Request Behavior

Requests use `https://mailcheap.ai/api/v1` with Bearer authentication, a
20-second timeout per attempt and a 2 MB response limit. The `redirect` option
is omitted, so native `fetch` follows redirects using its default `follow`
behavior. Redirects can change the request method according to HTTP semantics;
`307` and `308` preserve the method and body. Reads retry once after a network
or response failure or HTTP 5xx. Writes never retry because a lost response
can hide a successful write.

Redirect regression tests in `tests/unit/newsletter/mailcheap-redirects.test.ts`
use a local HTTP server and native `fetch`. They cover 301/302/303/307/308 for
reads and method/body preservation through 307/308 for writes. They do not
contact the live provider or establish mail delivery.

## Basic Usage

```typescript
import { subscribe, unsubscribe, isSubscribed } from '@/newsletter';

// Subscribe a user to the newsletter
const success = await subscribe('user@example.com');

// Unsubscribe a user from the newsletter
const success = await unsubscribe('user@example.com');

// Check if a user is subscribed
const subscribed = await isSubscribed('user@example.com');
```

## Server Actions

The UI uses the server actions in `src/actions/`:

| Action | Client | Behavior |
| --- | --- | --- |
| `subscribeNewsletterAction` | `actionClient` (public) | Subscribes the email, responds, then sends the localized `subscribeNewsletter` welcome email |
| `unsubscribeNewsletterAction` | `userActionClient` | Unsubscribes the email from the settings page |
| `checkNewsletterStatusAction` | `userActionClient` | Returns the subscription status for the settings page |

All three validate input with `newsletterEmailSchema` (`src/newsletter/schema.ts`),
which trims and lowercases the email before validating it. The core
`subscribe`, `unsubscribe`, and `isSubscribed` functions apply the same
normalization for other callers, such as the sign-up hook, so every provider
call uses one canonical address.

The welcome email is scheduled with Next.js `after()`, so the subscriber does
not wait for it. It is sent 3 seconds after the response to stay under
Resend's 2 requests per second limit, is skipped when
`websiteConfig.mail.enable` is `false`, and a send failure is logged without
affecting the subscription result.

The public newsletter card and the settings newsletter form render nothing when
`websiteConfig.newsletter.enable` is `false`.

## Using with Email Templates

You can combine the newsletter functionality with the email system to send confirmation emails, as `subscribeNewsletterAction` does:

```typescript
import { subscribe } from '@/newsletter';
import { sendEmail } from '@/mail';

export async function subscribeWithConfirmation(email: string) {
  // Subscribe the user
  const success = await subscribe(email);

  if (success) {
    // The subscribeNewsletter template needs no extra context
    await sendEmail({
      to: email,
      template: 'subscribeNewsletter',
      context: {},
    });
  }

  return success;
}
```

## Customization

### Creating a Custom Provider

You can create and use your own newsletter provider implementation:

```typescript
import {
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
  CheckSubscribeStatusParams
} from '@/newsletter/types';

export class CustomNewsletterProvider implements NewsletterProvider {
  constructor() {
    // Initialize your provider
  }

  public getProviderName(): string {
    return 'CustomProvider';
  }

  async subscribe({ email }: SubscribeNewsletterParams): Promise<boolean> {
    // Implementation for subscribing a user
    return true;
  }

  async unsubscribe({ email }: UnsubscribeNewsletterParams): Promise<boolean> {
    // Implementation for unsubscribing a user
    return true;
  }

  async checkSubscribeStatus({ email }: CheckSubscribeStatusParams): Promise<boolean> {
    // Implementation for checking subscription status
    return true;
  }
}
```

Then add `'custom'` to the `NewsletterConfig['provider']` union in
`src/types/index.d.ts`, register a factory in `providerRegistry` in `index.ts`,
and set `websiteConfig.newsletter.provider` to `'custom'`:

```typescript
import { CustomNewsletterProvider } from './provider/custom-provider';

const providerRegistry: Partial<
  Record<NewsletterProviderName, NewsletterProviderFactory>
> = {
  resend: () => new ResendNewsletterProvider(),
  beehiiv: () => new BeehiivNewsletterProvider(),
  mailcheap: () => new MailCheapNewsletterProvider(),
  custom: () => new CustomNewsletterProvider(),
};
```

The provider instance is created lazily by `getNewsletterProvider()` on first
use. An unknown provider name throws `Unsupported newsletter provider`.

## API Reference

### Main Functions

- `subscribe(email)`: Subscribe a user to the newsletter
- `unsubscribe(email)`: Unsubscribe a user from the newsletter
- `isSubscribed(email)`: Check if a user is subscribed to the newsletter

Each function trims and lowercases `email` before calling the provider.

### Provider Management

- `getNewsletterProvider()`: Get the configured newsletter provider instance, creating it on first use

### Provider Interface

The `NewsletterProvider` interface defines the following methods:

- `subscribe(params)`: Subscribe a user to the newsletter
- `unsubscribe(params)`: Unsubscribe a user from the newsletter
- `checkSubscribeStatus(params)`: Check if a user is subscribed to the newsletter
- `getProviderName()`: Get the provider name

Providers return `false` (after logging) on API errors instead of throwing.

### Resend Behavior

The Resend provider uses global contacts (`contacts.create`, `contacts.update`,
`contacts.get`) and needs no audience or segment ID:

- **Subscribe**: creates the contact with `unsubscribed: false`. If create
  returns any error (for example, the contact already exists), it updates the
  contact to `unsubscribed: false`. There is no `contacts.get` pre-check, so a
  new subscriber costs one request, which keeps sign-up bursts under Resend's
  2 requests per second limit.
- **Unsubscribe**: updates the contact to `unsubscribed: true`.
- **Status**: returns `!contact.unsubscribed`; any error returns `false`.

### Types

- `SubscribeNewsletterParams`: Parameters for subscribing a user
- `UnsubscribeNewsletterParams`: Parameters for unsubscribing a user
- `CheckSubscribeStatusParams`: Parameters for checking subscription status

## Best Practices

1. **Validate Email Addresses**: Always validate email addresses before subscribing users
2. **Handle Errors Gracefully**: Provide user-friendly error messages when subscription fails
3. **Confirmation Emails**: Send confirmation emails when users subscribe
4. **Unsubscribe Link**: Always include an unsubscribe link in your newsletter emails
5. **Rate Limiting**: Implement rate limiting on your subscription endpoints to prevent abuse
6. **Privacy Policy**: Make sure your website has a privacy policy explaining how you use subscriber data
