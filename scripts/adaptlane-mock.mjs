#!/usr/bin/env node
/**
 * AdaptLane 本地模拟服务(仅 Node 标准库,无需安装依赖)。
 *
 * 模拟的契约与 src/lib/brawlverse/adaptlane.ts 严格对齐:
 *   POST /api/v1/jobs      提交渲染;按 week_key 幂等
 *   GET  /api/v1/jobs/:id  查询任务
 *   GET  /healthz          健康检查
 *   POST /__echo           模拟服务自检:接收任意 POST,回 200 并打印验签结果
 *
 * 回调(默认 http://localhost:3000/api/adaptlane/webhook):
 *   Header  x-adaptlane-signature: HMAC-SHA256(原始 body, secret) 的 hex
 *   事件    job.progress → job.completed | job.failed
 *
 * 环境变量:
 *   PORT                      监听端口,默认 4001
 *   ADAPTLANE_API_KEY         期望的 Bearer Key,默认 test-key
 *   ADAPTLANE_WEBHOOK_SECRET  回调签名密钥,默认 test-secret
 *   FEINT_BASE_URL            回调缺省前缀,默认 http://localhost:3000
 *   MOCK_DELAY_MS             queued→rendering→终态 每步间隔,默认 1500
 *   MOCK_FAIL=1               让任务以 job.failed 结束
 *   MOCK_VIDEO_URL            成片地址
 *   MOCK_POSTER_URL           封面地址
 */
import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.PORT || 4001);
const API_KEY = process.env.ADAPTLANE_API_KEY || 'test-key';
const WEBHOOK_SECRET = process.env.ADAPTLANE_WEBHOOK_SECRET || 'test-secret';
const FEINT_BASE_URL = (
  process.env.FEINT_BASE_URL || 'http://localhost:3000'
).replace(/\/+$/, '');
const DEFAULT_CALLBACK = `${FEINT_BASE_URL}/api/adaptlane/webhook`;
const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 1500);
const SHOULD_FAIL = process.env.MOCK_FAIL === '1';
const VIDEO_URL =
  process.env.MOCK_VIDEO_URL ||
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
const POSTER_URL =
  process.env.MOCK_POSTER_URL ||
  'https://placehold.co/1080x1920/png?text=BRAWLVERSE+MOCK';

const MAX_BODY = 2 * 1024 * 1024;
const CALLBACK_RETRIES = 3;

/** job_id → job;week_key → job_id(幂等索引) */
const jobsById = new Map();
const jobsByWeek = new Map();

function log(...parts) {
  console.log(`[mock ${new Date().toISOString()}]`, ...parts);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(raw),
    'access-control-allow-origin': '*',
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sign(raw) {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(raw, 'utf8')
    .digest('hex');
}

function sameSignature(got, want) {
  const a = Buffer.from(String(got || '').trim(), 'utf8');
  const b = Buffer.from(want, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 去掉内部字段,只回契约里的内容。 */
function publicJob(job) {
  return {
    job_id: job.job_id,
    week_key: job.week_key,
    status: job.status,
    shot_count: job.shot_count,
    total_seconds: job.total_seconds,
    credits_used: job.credits_used,
    video_url: job.video_url,
    poster_url: job.poster_url,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

/**
 * 向 feint 投递回调。签名对「原始 body」计算,失败重试 3 次。
 * 注意:重试复用同一个 body 与签名,feint 侧靠 event_id 去重。
 */
async function postCallback(job, extra) {
  const body = JSON.stringify({
    event_id: crypto.randomUUID(),
    job_id: job.job_id,
    week_key: job.week_key,
    status: job.status,
    credits_used: job.credits_used,
    error: job.error,
    ...extra,
  });
  const signature = sign(body);
  const target = job.callback_url || DEFAULT_CALLBACK;

  for (let attempt = 1; attempt <= CALLBACK_RETRIES; attempt++) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-adaptlane-signature': signature,
        },
        body,
      });
      const text = await res.text().catch(() => '');
      log(`callback ${extra.event} → ${res.status} ${text.slice(0, 160)}`);
      if (res.ok) return true;
    } catch (e) {
      log(
        `callback ${extra.event} 第 ${attempt} 次失败: ${e?.message ?? e}`
      );
    }
    if (attempt < CALLBACK_RETRIES) await sleep(800 * attempt);
  }

  log(`callback ${extra.event} 放弃:${CALLBACK_RETRIES} 次均失败`);
  return false;
}

/** queued → rendering → completed/failed,并把每一步推给 feint。 */
async function runJob(job) {
  await sleep(DELAY_MS);
  job.status = 'rendering';
  job.updated_at = Date.now() / 1000;
  await postCallback(job, { event: 'job.progress' });

  await sleep(DELAY_MS);
  if (SHOULD_FAIL) {
    job.status = 'failed';
    job.error = 'mock failure (MOCK_FAIL=1)';
    job.updated_at = Date.now() / 1000;
    await postCallback(job, { event: 'job.failed', error: job.error });
    return;
  }

  job.status = 'completed';
  job.video_url = VIDEO_URL;
  job.poster_url = POSTER_URL;
  job.updated_at = Date.now() / 1000;
  await postCallback(job, {
    event: 'job.completed',
    video_url: job.video_url,
    poster_url: job.poster_url,
  });
}

function createJob(payload) {
  const jobId = `mock_${crypto.randomBytes(6).toString('hex')}`;
  const shots = Array.isArray(payload.shots) ? payload.shots : [];
  const totalSeconds = shots.reduce((sum, s) => sum + Number(s.seconds || 0), 0);
  const job = {
    job_id: jobId,
    week_key: String(payload.week_key || ''),
    status: 'queued',
    callback_url: String(payload.callback_url || DEFAULT_CALLBACK),
    aspect_ratio: String(payload.aspect_ratio || '9:16'),
    resolution: String(payload.resolution || '1080x1920'),
    shot_count: shots.length,
    total_seconds: totalSeconds,
    // 与真实产品的 credit 口径无关,只用于验证落库字段
    credits_used: Math.max(1, Math.ceil(totalSeconds / 2)),
    video_url: '',
    poster_url: '',
    error: '',
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  };
  jobsById.set(jobId, job);
  if (job.week_key) jobsByWeek.set(job.week_key, jobId);
  return job;
}

async function handleSubmit(req, res) {
  const auth = String(req.headers.authorization || '');
  if (auth !== `Bearer ${API_KEY}`) {
    log(`401 unauthorized (Authorization 不匹配预期 Bearer Key)`);
    return json(res, 401, { error: 'unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return json(res, 400, { error: 'bad json' });
  }

  const shots = Array.isArray(payload.shots) ? payload.shots : [];
  if (!payload.week_key) return json(res, 400, { error: 'week_key required' });
  if (shots.length === 0) return json(res, 400, { error: 'shots required' });

  // 幂等:同一 week_key 未失败则复用旧任务,避免重复消耗
  const prevId = jobsByWeek.get(String(payload.week_key));
  const prev = prevId ? jobsById.get(prevId) : null;
  if (prev && prev.status !== 'failed') {
    log(
      `submit 幂等命中 week_key=${prev.week_key} status=${prev.status} job_id=${prev.job_id}`
    );
    return json(res, 200, {
      job_id: prev.job_id,
      status: prev.status,
      idempotent: true,
    });
  }

  const job = createJob(payload);
  log(
    `submit week_key=${job.week_key} shots=${job.shot_count} ` +
      `seconds=${job.total_seconds.toFixed(1)} → job_id=${job.job_id}`
  );
  json(res, 202, { job_id: job.job_id, status: 'queued' });
  // 先回包再跑任务,避免 feint 20s 超时
  void runJob(job);
}

function handleGet(pathname, res) {
  const jobId = pathname.slice('/api/v1/jobs/'.length);
  const job = jobsById.get(jobId);
  if (!job) return json(res, 404, { error: 'job_not_found', job_id: jobId });
  return json(res, 200, publicJob(job));
}

/** 模拟服务自检:不依赖 feint,验证签名生成是否正确。 */
async function handleEcho(req, res) {
  const raw = await readBody(req);
  const got = req.headers['x-adaptlane-signature'] || '';
  const valid = sameSignature(got, sign(raw));
  log(`self-check 签名${valid ? '正确' : '不匹配'} body=${raw.slice(0, 120)}`);
  return json(res, 200, { ok: true, signature_valid: valid });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/healthz') {
      return json(res, 200, { ok: true, jobs: jobsById.size });
    }
    if (req.method === 'POST' && pathname === '/__echo') {
      return await handleEcho(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/v1/jobs') {
      return await handleSubmit(req, res);
    }
    if (req.method === 'GET' && pathname.startsWith('/api/v1/jobs/')) {
      return handleGet(pathname, res);
    }
    if (req.method === 'GET' && pathname === '/') {
      return json(res, 200, {
        service: 'adaptlane-mock',
        routes: [
          'POST /api/v1/jobs',
          'GET /api/v1/jobs/:job_id',
          'GET /healthz',
          'POST /__echo',
        ],
        default_callback: DEFAULT_CALLBACK,
      });
    }
    return json(res, 404, { error: 'not_found', path: pathname });
  } catch (e) {
    log('请求处理异常:', e?.message ?? e);
    return json(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, () => {
  log(`AdaptLane 模拟服务已启动 http://localhost:${PORT}`);
  log(`  · API Key 期望值 : ${API_KEY}`);
  log(`  · 回调签名密钥   : ${WEBHOOK_SECRET}`);
  log(`  · 默认回调地址   : ${DEFAULT_CALLBACK}`);
  log(`  · 任务节奏       : ${DELAY_MS}ms/步,失败模式=${SHOULD_FAIL}`);
  log('');
  log('feint 侧 .env.local 需要:');
  log(`  ADAPTLANE_API_KEY=${API_KEY}`);
  log(`  ADAPTLANE_BASE_URL=http://localhost:${PORT}`);
  log(`  ADAPTLANE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`);
  log('');
  log('手工触发一集(需 feint 已在 3000 端口运行):');
  log(
    '  curl -X POST -H "X-Admin-Token: $ADMIN_OPS_TOKEN" ' +
      `"http://localhost:3000/api/adaptlane/render?op=submit"`
  );
});

process.on('SIGINT', () => {
  log('收到 SIGINT,关闭模拟服务');
  server.close(() => process.exit(0));
});
