/**
 * AdaptLane 出片客户端(feint 侧)。
 *
 * 环境变量(服务端专用):
 *   ADAPTLANE_API_KEY        AdaptLane 签发的 API Key,缺失时只生成 Brief 不提交
 *   ADAPTLANE_BASE_URL       默认 https://adaptlane.com
 *   ADAPTLANE_WEBHOOK_SECRET webhook HMAC 密钥
 *   ADAPTLANE_AUTOPILOT      'on' 才允许 Cron 自动提交
 *   CRON_SECRET              Vercel Cron 鉴权(自动带 Authorization: Bearer)
 */
import crypto from 'node:crypto';
import { getBaseUrl } from '@/lib/urls';
import type { EpisodeBrief } from './brief';

const TIMEOUT_MS = 20000;
const DEFAULT_BASE = 'https://adaptlane.com';

export type RenderJob = { job_id: string; status: string };

export function adaptlaneConfigured(): boolean {
  return Boolean(
    process.env.ADAPTLANE_API_KEY || process.env.ADAPTLANE_INTERNAL_KEY
  );
}

export function autopilotEnabled(): boolean {
  return (process.env.ADAPTLANE_AUTOPILOT || '').toLowerCase() === 'on';
}

function baseUrl(): string {
  return (process.env.ADAPTLANE_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

async function call(
  path: string,
  init: RequestInit
): Promise<Record<string, any>> {
  const key =
    process.env.ADAPTLANE_API_KEY || process.env.ADAPTLANE_INTERNAL_KEY || '';
  if (!key) throw new Error('ADAPTLANE_API_KEY not set');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl() + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`adaptlane ${res.status}: ${text.slice(0, 200)}`);
    }
    return text ? (JSON.parse(text) as Record<string, any>) : {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 提交一集成片渲染;返回 AdaptLane 的 job_id。
 *
 * 只提交 provider=adaptlane 的镜头(包装镜头:冷开场/英雄镜头/赛果卡/尾卡)。
 * provider=action 的对打镜头由动作库底片 + 换角色模型走 pipeline 链路,
 * 不经过 AdaptLane —— 两条链路各管一段,不是二选一。
 */
export async function submitJob(
  brief: EpisodeBrief,
  aspect = '9:16',
  resolution = '1080x1920'
): Promise<RenderJob> {
  const shots = brief.shots.filter((s) => s.provider === 'adaptlane');
  if (shots.length === 0) {
    throw new Error('adaptlane: brief has no adaptlane shots');
  }
  const data = await call('/api/v1/jobs', {
    method: 'POST',
    body: JSON.stringify({
      show: brief.show,
      week_key: brief.week_key,
      aspect_ratio: aspect,
      resolution,
      callback_url: `${getBaseUrl()}/api/adaptlane/webhook`,
      shots,
      prompt: brief.prompt,
    }),
  });
  const jobId = String(data.job_id || data.id || '');
  if (!jobId) throw new Error('adaptlane: empty job_id');
  return { job_id: jobId, status: String(data.status || 'queued') };
}

/** 主动查任务(webhook 缺失时的兜底)。 */
export async function fetchJob(jobId: string): Promise<RenderJob> {
  const data = await call(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  });
  return {
    job_id: jobId,
    status: String(data.status || 'unknown'),
  };
}

/** HMAC-SHA256(hex),用于 webhook 验签。 */
export function signBody(raw: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

/** 校验 webhook 签名;兼容 `sha256=` 前缀,常量时间比较。 */
export function verifySignature(
  raw: string,
  header: string,
  secret: string
): boolean {
  if (!secret) return false;
  const got = (header || '')
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  const want = signBody(raw, secret);
  return crypto.timingSafeEqual(
    Buffer.from(got, 'hex'),
    Buffer.from(want, 'hex')
  );
}
