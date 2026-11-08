/**
 * 运维告警(P0-4)。
 * 周更 Cron 一旦失败必须有人知道,否则"每周一集"是空头承诺。
 * 配置 OPS_ALERT_WEBHOOK(飞书/Slack/任意可接收 {"text": "..."} 的 webhook)即可。
 * 未配置时只写日志,不抛错——告警通道本身绝不能把主流程打挂。
 */
export async function opsAlert(
  title: string,
  detail: Record<string, unknown> = {}
): Promise<boolean> {
  const url = process.env.OPS_ALERT_WEBHOOK || '';
  const text = `[hook.tv] ${title}\n${JSON.stringify(detail)}`;
  if (!url) {
    console.warn('[opsAlert] webhook not configured:', title, detail);
    return false;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, msg_type: 'text', content: { text } }),
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch (err) {
    console.error('[opsAlert] send failed:', title, err);
    return false;
  }
}
