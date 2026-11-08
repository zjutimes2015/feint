/** BRAWLVERSE API 公共 HTTP 辅助:CORS、JSON 响应、请求体解析。 */
// 允许的来源:默认同源(同源请求不需要 CORS),跨域部署时在 CORS_ORIGINS 配置
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  if (ALLOWED_ORIGINS.length === 0) return { Vary: 'Origin' };
  const origin = req.headers.get('origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
  };
}

export function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

export function preflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function readJson<T = Record<string, any>>(
  req: Request
): Promise<T> {
  const raw = await req.text();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function opOf(req: Request, fallback = ''): string {
  const op = new URL(req.url).searchParams.get('op');
  return (op || fallback).toLowerCase();
}
