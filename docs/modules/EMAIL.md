# Email System

This module provides email functionality for the application. It supports sending emails using templates or raw content through different email providers.

## Overview

The email system is designed to be:

- **Modular**: Easy to extend with new providers
- **Flexible**: Support for templates and raw emails
- **Type-safe**: Full TypeScript support
- **Internationalizable**: Multi-language email support

## Directory Structure

```
src/mail/
├── components/     # Reusable email components
│   ├── email-button.tsx
│   └── email-layout.tsx
├── provider/       # Email provider implementations
│   └── resend.ts   # Resend.com provider implementation
├── templates/      # React-based email templates
│   ├── contact-message.tsx
│   ├── forgot-password.tsx
│   ├── subscribe-newsletter.tsx
│   └── verify-email.tsx
├── index.ts        # sendEmail() and provider registry
├── template.ts     # getTemplate(): renders a template to HTML, text, and subject
└── types.ts        # Template map, TypeScript types, and interfaces
```

## Usage

```typescript
import { sendEmail } from '@/mail';

// Send using a template
const result = await sendEmail({
  to: 'user@example.com',
  template: 'verifyEmail',
  context: {
    name: 'John Doe',
    url: 'https://example.com/verify?token=abc123',
  },
  locale: 'en', // Optional, defaults to the routing default locale
});

// Send a raw email
await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome to our platform',
  html: '<h1>Hello!</h1><p>Welcome to our platform.</p>',
  text: 'Hello! Welcome to our platform.', // Optional
});

if (!result.success) {
  console.error(result.error);
}
```

`sendEmail` never throws. It returns a `SendEmailResult`
(`{ success, messageId?, error? }`):

- When `websiteConfig.mail.enable` is `false`, it returns
  `{ success: false, error: 'Mail feature is disabled' }` without sending.
- In E2E test mode, it returns `{ success: true, messageId: 'e2e-noop' }`
  without contacting the provider.
- Provider failures and unexpected errors are logged and returned as
  `{ success: false, error }`.

Emails are always sent from `websiteConfig.mail.fromEmail`.

## Email Templates

Email templates are React components stored in the `templates` directory. Each template has specific props and is rendered to HTML and plain text by `getTemplate()` in `template.ts`. The subject comes from the `Mail.<template>.subject` message in the requested locale.

### Available Templates

| Template | Context | Used by |
| --- | --- | --- |
| `verifyEmail` | `name`, `url` | Better Auth email verification (`src/lib/auth.ts`) |
| `forgotPassword` | `name`, `url` | Better Auth password reset (`src/lib/auth.ts`) |
| `subscribeNewsletter` | none | Newsletter welcome email (`subscribeNewsletterAction`) |
| `contactMessage` | `name`, `email`, `message` | Contact form, sent to `websiteConfig.mail.supportEmail` (`sendMessageAction`) |

### Creating a New Template

1. Create a React component in the `templates` directory as a default export
2. Make sure it accepts `BaseEmailProps` (`locale`, `messages`) plus any specific props
3. Register it in the `EmailTemplates` map in `types.ts`
4. Add its translations, including a `subject`, under `Mail.<templateName>` in `messages/en.json` and `messages/zh.json`

Example:

```tsx
// templates/my-custom-email.tsx
import { defaultMessages } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import EmailButton from '@/mail/components/email-button';
import EmailLayout from '@/mail/components/email-layout';
import type { BaseEmailProps } from '@/mail/types';
import { Text } from '@react-email/components';
import { createTranslator } from 'use-intl/core';

interface MyCustomEmailProps extends BaseEmailProps {
  username: string;
  actionUrl: string;
}

export default function MyCustomEmail({
  username,
  actionUrl,
  locale,
  messages,
}: MyCustomEmailProps) {
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Mail.myCustomEmail',
  });

  return (
    <EmailLayout locale={locale} messages={messages}>
      <Text>{t('title', { name: username })}</Text>
      <EmailButton href={actionUrl}>{t('action')}</EmailButton>
    </EmailLayout>
  );
}

// Used by the preview server (`pnpm email`)
MyCustomEmail.PreviewProps = {
  locale: routing.defaultLocale,
  messages: defaultMessages,
  username: 'username',
  actionUrl: 'https://example.com',
};
```

Then register the template in `types.ts`:

```typescript
import MyCustomEmail from './templates/my-custom-email';

export const EmailTemplates = {
  // ... existing templates
  myCustomEmail: MyCustomEmail,
} as const;
```

Run `pnpm email` to preview all templates on port `3333`.

## Email Components

The email system includes reusable components in the `components` directory:

- `EmailLayout`: Base wrapper component that provides consistent layout, styling, and the localized footer. It requires `locale` and `messages`.
- `EmailButton`: Styled button component for call-to-action links

## Configuration

The email system configuration is defined in `src/config/website.tsx`:

```typescript
// In src/config/website.tsx
export const websiteConfig = {
  // ...other config
  mail: {
    enable: true, // Disable to skip all email sending
    provider: 'resend', // Email provider to use
    fromEmail: 'Your App <support@example.com>', // Sender for all emails
    supportEmail: 'Your App <support@example.com>', // Recipient for contact form messages
  },
  // ...other config
}
```

## Providers

### Resend

[Resend](https://resend.com/) is the default email provider. It requires an API key set as `RESEND_API_KEY` in your environment variables and a configured `websiteConfig.mail.fromEmail`.

### Creating a New Provider

To add a new email provider:

1. Create a new file in the `provider` directory
2. Implement the `MailProvider` interface
3. Add the provider name to the `MailConfig['provider']` union in `src/types/index.d.ts`
4. Register a factory for it in `providerRegistry` in `index.ts`
5. Set `websiteConfig.mail.provider` to the new name

Example:

```typescript
// provider/my-provider.ts
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';

export class MyProvider implements MailProvider {
  constructor() {
    // Initialize your provider
  }

  public async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    // Render with getTemplate() from '@/mail/template', then send
  }

  public async sendRawEmail(params: SendRawEmailParams): Promise<SendEmailResult> {
    // Implementation for raw emails
  }

  public getProviderName(): string {
    return 'my-provider';
  }
}
```

Then register it in `index.ts`:

```typescript
import { MyProvider } from './provider/my-provider';

const providerRegistry: Partial<Record<MailProviderName, MailProviderFactory>> =
  {
    resend: () => new ResendProvider(),
    'my-provider': () => new MyProvider(),
  };
```

The provider instance is created lazily by `getMailProvider()` on first use.
