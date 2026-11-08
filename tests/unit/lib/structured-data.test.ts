import { getSchemaUrl, serializeStructuredData } from '@/lib/structured-data';
import { describe, expect, it } from 'vitest';

describe('structured data', () => {
  it('cannot break out of the JSON-LD script with content strings', () => {
    const data = {
      name: '</script><script>alert("unsafe")</script>',
      description: '中文 <tags> & quotation "marks"',
    };
    const serialized = serializeStructuredData(data);

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(data);
  });

  it('keeps nested paths and locale prefixes in canonical URLs', () => {
    expect(getSchemaUrl('/blog/guides/example', 'zh')).toBe(
      'http://localhost:3000/zh/blog/guides/example'
    );
    expect(getSchemaUrl('/blog/guides/example', 'en')).toBe(
      'http://localhost:3000/blog/guides/example'
    );
    expect(getSchemaUrl('', 'zh')).toBe('http://localhost:3000/zh');
  });
});
