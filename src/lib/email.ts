/**
 * BRAWLVERSE 邮件发送封装（Resend）。
 * 全部走环境变量，不硬编码密钥。
 *
 * 环境变量：
 * - RESEND_API_KEY（必填）：Resend API Key。
 * - EMAIL_FROM（可选）：发件人，如 "BRAWLVERSE <hello@feint.tv>"。
 *
 * 注意：发件域名还没买（feint.tv 未购）。EMAIL_FROM 没配时，
 * fallback 到 Resend 测试地址 onboarding@resend.dev——测试地址
 * 只能发给 Resend 账户本人的邮箱。买下域名并在 Resend 后台验证后，
 * 把 EMAIL_FROM 换成自己的域名即可，代码不用改。
 */
import { Resend } from 'resend';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: unknown;
}

/** Resend 测试发件地址：仅能发给账户本人邮箱 */
const FALLBACK_FROM = 'onboarding@resend.dev';

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set.');
  }
  return new Resend(apiKey);
}

export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const { to, subject, html, text } = params;
  const from = process.env.EMAIL_FROM || FALLBACK_FROM;

  if (!to || !subject || !html) {
    return { success: false, error: 'Missing required fields' };
  }

  try {
    const { data, error } = await getClient().emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[email] Resend send failed');
      return { success: false, error };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('[email] Unexpected error');
    return { success: false, error };
  }
}
