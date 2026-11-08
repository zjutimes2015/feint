import { describe, expect, it } from 'vitest';
import { presignPut, safeExtension } from '@/storage/presign';

const cfg = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  bucketName: 'feint-media',
  publicUrl: 'https://cdn.feint.tv',
};

describe('presignPut', () => {
  it('返回带签名的 PUT URL 与公网地址', () => {
    const r = presignPut(cfg, 'episodes/a.mp4', 'video/mp4');
    expect(r.key).toBe('episodes/a.mp4');
    expect(r.publicUrl).toBe('https://cdn.feint.tv/episodes/a.mp4');
    expect(r.url).toContain('X-Amz-Signature=');
    expect(r.url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(r.url).toContain('/feint-media/episodes/a.mp4');
  });

  it('签名 query 含必需字段', () => {
    const r = presignPut(cfg, 'episodes/b.mp4', 'video/mp4');
    for (const k of [
      'X-Amz-Algorithm',
      'X-Amz-Credential',
      'X-Amz-Date',
      'X-Amz-Expires',
      'X-Amz-SignedHeaders',
      'X-Amz-Signature',
    ]) {
      expect(r.url, `缺 ${k}`).toContain(k);
    }
  });

  it('不同 key 产生不同签名', () => {
    const a = presignPut(cfg, 'episodes/a.mp4', 'video/mp4');
    const b = presignPut(cfg, 'episodes/b.mp4', 'video/mp4');
    expect(a.url).not.toBe(b.url);
  });

  it('缺凭证/endpoint 时抛错,不静默生成坏链接', () => {
    expect(() =>
      presignPut({ ...cfg, accessKeyId: '' }, 'x.mp4', 'video/mp4')
    ).toThrow();
    expect(() =>
      presignPut({ ...cfg, endpoint: '' }, 'x.mp4', 'video/mp4')
    ).toThrow();
  });
});

describe('safeExtension', () => {
  it('只放行短小写字母数字扩展名', () => {
    expect(safeExtension('a.mp4')).toBe('mp4');
    expect(safeExtension('a.MP4')).toBe('mp4');
    expect(safeExtension('a.webm')).toBe('webm');
    expect(safeExtension('noext')).toBe('mp4');
    expect(safeExtension('a.php')).toBe('mp4');
    expect(safeExtension('a.verylongext')).toBe('mp4');
  });
});
