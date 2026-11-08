/**
 * 预签名直传:签发 R2/S3 的 PUT URL。
 *
 * 成片 15MB+ 传不进 Vercel Function(请求体上限 ~4.5MB),
 * 所以 API 只负责签发,文件由客户端/管线直传对象存储。
 */
import { json, opOf, preflight, readJson } from '@/lib/brawlverse/http';
import { isAdmin } from '@/lib/brawlverse/identity';
import { storageConfig } from '@/storage/config/storage-config';
import {
  IMAGE_CONTENT_TYPES,
  MAX_VIDEO_BYTES,
  presignPut,
  safeExtension,
  VIDEO_CONTENT_TYPES,
} from '@/storage/presign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Kind = 'video' | 'image';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  const op = opOf(req, 'presign');
  if (op !== 'presign') return json({ error: 'unknown op' }, 400, req);

  if (!(await isAdmin(req))) {
    return json({ error: 'forbidden' }, 403, req);
  }

  let body: Record<string, any>;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: 'bad json' }, 400, req);
  }

  const kind: Kind = body.kind === 'image' ? 'image' : 'video';
  const filename = String(body.filename || '').trim();
  if (!filename) return json({ error: 'filename required' }, 400, req);

  const contentType = String(body.content_type || '')
    .trim()
    .toLowerCase();
  const allowed = kind === 'video' ? VIDEO_CONTENT_TYPES : IMAGE_CONTENT_TYPES;
  if (!allowed.has(contentType)) {
    return json({ error: 'unsupported content type' }, 400, req);
  }

  const size = Number(body.size || 0);
  if (kind === 'video' && size > MAX_VIDEO_BYTES) {
    return json({ error: 'file too large' }, 413, req);
  }

  // key 由服务端拼，客户端只能给目录和文件名，防止写到任意路径
  const folder = String(body.folder || 'episodes')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .join('/');
  const key = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${safeExtension(filename)}`;

  try {
    const signed = presignPut(
      {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey,
        endpoint: storageConfig.endpoint || '',
        region: storageConfig.region,
        bucketName: storageConfig.bucketName,
        publicUrl: storageConfig.publicUrl,
      },
      key,
      contentType
    );
    return json(
      {
        ok: true,
        url: signed.url,
        key: signed.key,
        publicUrl: signed.publicUrl,
        expiresIn: signed.expiresIn,
        contentType,
      },
      200,
      req
    );
  } catch (e: any) {
    return json(
      { error: 'storage_not_configured', detail: String(e?.message ?? e) },
      503,
      req
    );
  }
}
