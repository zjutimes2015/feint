import { websiteConfig } from '@/config/website';
import { defaultMessages } from '@/i18n/messages';
import { getBaseUrl } from '@/lib/urls';
import type {
  NotificationProvider,
  SendPaymentNotificationParams,
} from '../types';
import { sendWebhookMessage } from '../utils';

export class DiscordProvider implements NotificationProvider {
  private webhookUrl: string;
  private botName: string;
  private avatarUrl?: string;

  constructor() {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL is required.');
    this.webhookUrl = webhookUrl;
    this.botName = defaultMessages.Metadata.name ?? 'Bot';
    const logoPath = websiteConfig.metadata?.images?.logoLight;
    this.avatarUrl = logoPath ? `${getBaseUrl()}${logoPath}` : undefined;
  }

  getProviderName(): string {
    return 'discord';
  }

  async sendPaymentNotification(
    params: SendPaymentNotificationParams
  ): Promise<void> {
    const { sessionId, customerId, userName, amount } = params;
    try {
      const body: Record<string, unknown> = {
        username: this.botName,
        embeds: [
          {
            title: '🎉 New Purchase',
            color: 0x4caf50,
            fields: [
              { name: 'Username', value: userName, inline: true },
              { name: 'Amount', value: `$${amount.toFixed(2)}`, inline: true },
              {
                name: 'Customer ID',
                value: `\`${customerId}\``,
                inline: false,
              },
              { name: 'Session ID', value: `\`${sessionId}\``, inline: false },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };
      if (this.avatarUrl) body.avatar_url = this.avatarUrl;
      await sendWebhookMessage(this.webhookUrl, body);
      console.log(
        `Successfully sent Discord notification for user ${userName}`
      );
    } catch (error) {
      console.error('Failed to send Discord notification:', error);
    }
  }
}
