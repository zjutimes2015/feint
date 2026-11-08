import { describe, expect, it } from 'vitest';
import { signBody, verifySignature } from '@/lib/brawlverse/adaptlane';
import { airAtOfWeek, weekKeyOf } from '@/lib/brawlverse/brief';

describe('weekKeyOf', () => {
  it('以周四归属年份计算 ISO 周', () => {
    expect(weekKeyOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(weekKeyOf(new Date('2026-01-05T00:00:00Z'))).toBe('2026-W02');
    expect(weekKeyOf(new Date('2026-12-31T00:00:00Z'))).toBe('2026-W53');
  });

  it('跨年周归到上一年', () => {
    expect(weekKeyOf(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });
});

describe('airAtOfWeek', () => {
  it('周五 21:00 (UTC+8) = 周五 13:00Z', () => {
    expect(airAtOfWeek('2026-W02')).toBe('2026-01-09T13:00:00.000Z');
    expect(airAtOfWeek('2026-W45')).toBe('2026-11-06T13:00:00.000Z');
  });

  it('非法周键返回空串', () => {
    expect(airAtOfWeek('2026-45')).toBe('');
  });
});

describe('verifySignature', () => {
  const raw = JSON.stringify({ event: 'job.completed', job_id: 'j1' });
  const secret = 'test-secret';

  it('接受正确签名(含 sha256= 前缀)', () => {
    const sig = signBody(raw, secret);
    expect(verifySignature(raw, sig, secret)).toBe(true);
    expect(verifySignature(raw, `sha256=${sig}`, secret)).toBe(true);
  });

  it('拒绝篡改内容 / 错误密钥 / 非法格式', () => {
    const sig = signBody(raw, secret);
    expect(verifySignature(raw + ' ', sig, secret)).toBe(false);
    expect(verifySignature(raw, sig, 'other')).toBe(false);
    expect(verifySignature(raw, '', secret)).toBe(false);
    expect(verifySignature(raw, 'not-hex', secret)).toBe(false);
  });
});
