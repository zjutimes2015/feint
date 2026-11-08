/**
 * S3 / Cloudflare R2 的预签名直传。
 *
 * 为什么必须有:Vercel Function 的请求体上限约 4.5MB,成片 15MB+ 根本传不进来。
 * 正确做法是服务端只签发一个短时效的 PUT URL,客户端(或管线脚本)直传对象存储,
 * API 不经手文件字节。
 *
 * 这里手写 AWS SigV4 签名,不引入 @aws-sdk 依赖(仓库里没有,为了一个签名
 * 拉进来几十 MB 依赖不划算)。
 */
import crypto from 'node:crypto';

export type PresignConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  /** 对象存储 endpoint(不含 bucket),如 https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  region: string;
  bucketName: string;
  /** 公网访问前缀,如 https://cdn.feint.tv */
  publicUrl?: string;
};

const SERVICE = 's3';

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC3986 编码(空格要编码成 %20,不能是 +)。 */
function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const ch of Buffer.from(value, 'utf8')) {
    const c = String.fromCharCode(ch);
    if (/[A-Za-z0-9_\-~.]/.test(c)) {
      out += c;
    } else if (c === '/') {
      out += encodeSlash ? '%2F' : '/';
    } else {
      out += `%${ch.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/** 派生签名密钥。 */
function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export type PresignedPut = {
  /** 上传用的完整 URL(带签名 query) */
  url: string;
  /** 对象存储里的 key */
  key: string;
  /** 上传后可通过公网访问的地址 */
  publicUrl: string;
  /** 签名过期时间(秒) */
  expiresIn: number;
};

/**
 * 签发一个预签名 PUT URL。
 *
 * @param cfg 存储配置
 * @param key 对象 key,如 episodes/2026-W45/video.mp4
 * @param contentType 文件 MIME,会写入签名,客户端上传时必须带同样的 Content-Type
 * @param expiresIn 有效期秒数,默认 30 分钟
 */
export function presignPut(
  cfg: PresignConfig,
  key: string,
  contentType: string,
  expiresIn = 1800
): PresignedPut {
  if (!cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('storage credentials are not configured');
  }
  if (!cfg.endpoint || !cfg.bucketName) {
    throw new Error('storage endpoint or bucket is not configured');
  }

  const endpoint = cfg.endpoint.replace(/\/+$/, '');
  const region = cfg.region || 'auto';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const host = new URL(endpoint).host;
  // R2 走 path-style:https://<host>/<bucket>/<key>
  const canonicalUri = `/${uriEncode(cfg.bucketName)}/${uriEncode(key, false)}`;
  const canonicalQuery =
    `X-Amz-Algorithm=AWS4-HMAC-SHA256` +
    `&X-Amz-Credential=${uriEncode(`${cfg.accessKeyId}/${credentialScope}`)}` +
    `&X-Amz-Date=${amzDate}` +
    `&X-Amz-Expires=${expiresIn}` +
    `&X-Amz-SignedHeaders=host`;
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hmac(
    signingKey(cfg.secretAccessKey, dateStamp, region, SERVICE),
    stringToSign
  ).toString('hex');

  const query = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  const url = `${endpoint}${canonicalUri}?${query}`;

  const publicBase = (cfg.publicUrl || endpoint).replace(/\/+$/, '');
  return {
    url,
    key,
    publicUrl: `${publicBase}/${key}`,
    expiresIn,
  };
}

/** 允许直传的视频类型。 */
export const VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

/** 允许直传的图片类型(海报/封面)。 */
export const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** 成片大小上限:200MB。超了先压缩再传,别把桶打爆。 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** 允许出现在对象 key 里的媒体扩展名白名单。 */
const SAFE_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'vtt',
  'srt',
  'json',
]);

/** 从上传文件名里安全地取出扩展名;不在白名单里一律回退 mp4。 */
export function safeExtension(filename: string): string {
  const base = filename.split('/').pop() || '';
  // 必须真的带点,且点前有非空名字,否则 "noext" 会被当成扩展名
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return 'mp4';
  const ext = base.slice(dot + 1).toLowerCase();
  return SAFE_EXTENSIONS.has(ext) ? ext : 'mp4';
}
