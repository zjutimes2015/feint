/** API 公共 HTTP 辅助：CORS、JSON 响应、请求体解析、管理员鉴权。 */
import crypto from "node:crypto";

// 允许的来源：GitHub Pages 旧站 + 同源（同源请求本身不需要 CORS）
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "https://zjutimes2015.github.io")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
  };
}

export function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

export function preflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function readJson<T = Record<string, any>>(req: Request): Promise<T> {
  const raw = await req.text();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/** Fail-closed：没有 ADMIN_TOKEN 等于完全不开放管理接口。 */
export function requireAdmin(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN || "";
  if (!token) return false;
  const given = req.headers.get("x-admin-token") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function opOf(req: Request, fallback = ""): string {
  const op = new URL(req.url).searchParams.get("op");
  return (op || fallback).toLowerCase();
}
