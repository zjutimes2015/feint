/** Fan Forge 投稿:入库 + 社区队列读取。 */
import { checkRate, clientIp, qAll, qOne, sha } from '@/lib/brawlverse/db';
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { resolveIdentity } from '@/lib/brawlverse/identity';
import { verifyTurnstile } from '@/lib/brawlverse/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QUEUE_LIMIT = 12;

// 明显广告/外链直接拒绝,不做人工审核队列
const BLOCK_RE = new RegExp(
  '加微信|微信号|兼职|贷款|赌博|博彩|六合彩|时时彩|代购|客服|代理|日结|赚钱|' +
    'http|www\\.|\\.com|\\.cn',
  'i'
);

type ForgeRow = {
  id: number;
  name: string;
  persona: string;
  votes: number;
  created_at: number;
};

/**
 * 可选的"基础拳手"（变体基底）。
 *
 * v1 不做从零生成角色:粉丝在已有 8 位拳手的外观上做一个变体(皮肤/风格/人设),
 * 成本、质量、审核难度都比从零生成低一个量级,而且定妆照已锁死、不会漂移。
 * 留空 base_fighter 表示纯文字投稿(旧路径,仍然有效)。
 */
const BASE_FIGHTERS = [
  'IRON JAW',
  'VIPER',
  'SLEDGE',
  'MONSOON',
  'VOLT',
  'THE PROFESSOR',
  'GOLIATH-7',
  'LA REINA',
] as const;

type BaseFighter = (typeof BASE_FIGHTERS)[number];

function isBaseFighter(v: string): v is BaseFighter {
  return (BASE_FIGHTERS as readonly string[]).includes(v);
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const op = opOf(req, 'queue');
  if (op !== 'queue') return json({ error: 'unknown op' }, 400, req);

  const submissions = await qAll<ForgeRow>(
    `SELECT id, name, persona, votes, created_at
     FROM fan_forge_submissions
     WHERE status = 'queued'
     ORDER BY created_at DESC
     LIMIT $1`,
    [QUEUE_LIMIT]
  );
  const total = await qOne<{ n: string }>(
    "SELECT COUNT(*) AS n FROM fan_forge_submissions WHERE status = 'queued'"
  );
  const variants = await qAll<{
    id: number;
    base_fighter: string;
    variant_name: string;
    persona: string;
    votes: number;
    created_at: number;
  }>(
    `SELECT id, base_fighter, variant_name, persona, votes, created_at
     FROM fan_forge_variants
     WHERE status = 'queued'
     ORDER BY votes DESC, created_at DESC
     LIMIT $1`,
    [QUEUE_LIMIT]
  );

  return json(
    {
      submissions,
      variants,
      baseFighters: BASE_FIGHTERS,
      total: Number(total?.n || 0),
    },
    200,
    req
  );
}

export async function POST(req: Request) {
  const op = opOf(req, 'submit');
  if (op !== 'submit') return json({ error: 'unknown op' }, 400, req);

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const name = String(body.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const persona = String(body.persona ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24) {
    return json({ error: 'name_invalid' }, 400, req);
  }
  if (persona.length < 3 || persona.length > 120) {
    return json({ error: 'persona_invalid' }, 400, req);
  }

  // 可选:基于哪位拳手做变体
  const baseRaw = String(body.base_fighter ?? '')
    .trim()
    .toUpperCase();
  const baseFighter = baseRaw && isBaseFighter(baseRaw) ? baseRaw : '';

  const identity = await resolveIdentity(req, String(body.device_id ?? ''));
  if (!identity) return json({ error: 'device_id_required' }, 400, req);

  const ip = clientIp(req);
  if (!(await checkRate(ip))) {
    return json({ error: 'rate_limited' }, 429, req);
  }
  if (!(await verifyTurnstile(String(body.turnstile_token ?? ''), ip))) {
    return json({ error: 'turnstile_failed' }, 403, req);
  }

  const status = BLOCK_RE.test(`${name} ${persona}`) ? 'rejected' : 'queued';
  const ua = req.headers.get('user-agent') || '';
  const now = Date.now() / 1000;

  const row = await qOne<{ id: number }>(
    `INSERT INTO fan_forge_submissions
       (name, persona, device_hash, ip, ip_ua, status, votes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7)
     RETURNING id`,
    [name, persona, identity.key, ip, sha(ip + '|' + ua), status, now]
  );

  // 选了基础拳手 → 同时落一条变体记录,方便 admin 直接看到"粉丝给谁做了皮肤"
  let variantId = 0;
  if (baseFighter && status === 'queued' && row?.id) {
    const v = await qOne<{ id: number }>(
      `INSERT INTO fan_forge_variants
         (submission_id, base_fighter, variant_name, persona, status, votes, created_at)
       VALUES ($1,$2,$3,$4,'queued',0,$5)
       RETURNING id`,
      [row.id, baseFighter, name, persona, now]
    );
    variantId = v?.id ?? 0;
  }

  // 被拦截的条目同样返回 200,前端只提示未通过初筛
  return json(
    {
      ok: status === 'queued',
      status,
      id: row?.id ?? 0,
      variantId,
      baseFighter,
    },
    200,
    req
  );
}
