/** Waffo Pancake 支付：RSA-SHA256 签名请求 + webhook 验签。 */
import crypto from "node:crypto";

const API_BASE = "https://api.waffo.ai";

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxnmRY6yMMA3lVqmAU6ZG
b1sjL/+r/z6E+ZjkXaDAKiqOhk9rpazni0bNsGXwmftTPk9jy2wn+j6JHODD/WH/
SCnSfvKkLIjy4Hk7BuCgB174C0ydan7J+KgXLkOwgCAxxB68t2tezldwo74ZpXgn
F49opzMvQ9prEwIAWOE+kV9iK6gx/AckSMtHIHpUesoPDkldpmFHlB2qpf1vsFTZ
5kD6DmGl+2GIVK01aChy2lk8pLv0yUMu18v44sLkO5M44TkGPJD9qG09wrvVG2wp
OTVCn1n5pP8P+HRLcgzbUB3OlZVfdFurn6EZwtyL4ZD9kdkQ4EZE/9inKcp3c1h4
xwIDAQAB
-----END PUBLIC KEY-----`;

const PROD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz+xApdTIb4ua+DgZKQ54
iBsD82ybyhGCLRETONW4Jgbb3A8DUM1LqBk6r/CmTOCHqLalTQHNigvP3R5zkDNX
iRJz6gA4MJ/+8K0+mnEE2RISQzN+Qu65TNd6svb+INm/kMaftY4uIXr6y6kchtTJ
dwnQhcKdAL2v7h7IFnkVelQsKxDdb2PqX8xX/qwd01iXvMcpCCaXovUwZsxH2QN5
ZKBTseJivbhUeyJCco4fdUyxOMHe2ybCVhyvim2uxAl1nkvL5L8RCWMCAV55LLo0
9OhmLahz/DYNu13YLVP6dvIT09ZFBYU6Owj1NxdinTynlJCFS9VYwBgmftosSE1U
dwIDAQAB
-----END PUBLIC KEY-----`;

const PRODUCT_ENV: Record<string, string> = {
  ringside: "WAFFO_PRODUCT_RINGSIDE",
  booker: "WAFFO_PRODUCT_BOOKER",
  promoter: "WAFFO_PRODUCT_PROMOTER",
};

function privateKey(): crypto.KeyObject | null {
  const pem = (process.env.WAFFO_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!pem) return null;
  return crypto.createPrivateKey(pem);
}

export function waffoConfigured(): boolean {
  return Boolean(process.env.WAFFO_MERCHANT_ID && process.env.WAFFO_PRIVATE_KEY);
}

export function productId(tier: string): string {
  return process.env[PRODUCT_ENV[tier] || ""] || "";
}

function signRequest(method: string, path: string, bodyStr: string): [string, string] {
  const key = privateKey();
  if (!key) throw new Error("WAFFO_PRIVATE_KEY not set");
  const ts = String(Math.floor(Date.now() / 1000));
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("base64");
  const canonical = `${method}\n${path}\n${ts}\n${bodyHash}`;
  const sig = crypto.createSign("RSA-SHA256").update(canonical).sign(key, "base64");
  return [ts, sig];
}

async function apiPost(path: string, body: unknown): Promise<any> {
  const merchant = process.env.WAFFO_MERCHANT_ID || "";
  if (!merchant) throw new Error("WAFFO_MERCHANT_ID not set");
  const bodyStr = JSON.stringify(body);
  const [ts, sig] = signRequest("POST", path, bodyStr);
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Merchant-Id": merchant,
      "X-Timestamp": ts,
      "X-Signature": sig,
    },
    body: bodyStr,
  });
  if (!res.ok) throw new Error(`waffo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function createCheckoutSession(
  product: string,
  metadata: Record<string, string>,
  successUrl: string,
): Promise<string> {
  const res = await apiPost("/v1/actions/checkout/create-session", {
    productId: product,
    productType: "subscription",
    currency: "USD",
    metadata,
    successUrl,
  });
  const url: string = res.checkoutUrl || (res.data && res.data.checkoutUrl) || "";
  if (!url) throw new Error("no checkoutUrl in response: " + JSON.stringify(res).slice(0, 200));
  return url;
}

function parseSigHeader(header: string): [string, string] {
  const parts: Record<string, string> = {};
  for (const kv of (header || "").split(",")) {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return [parts.t || "", parts.v1 || ""];
}

function verifyWith(keyPem: string, sigB64: string, input: Buffer): boolean {
  try {
    const key = crypto.createPublicKey(keyPem);
    return crypto.verify("RSA-SHA256", input, key, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

/** 校验 x-waffo-signature，返回事件对象；失败抛错。 */
export function verifyWebhook(payload: string, sigHeader: string, toleranceMs = 300000): any {
  const [t, v1] = parseSigHeader(sigHeader);
  if (!t || !v1) throw new Error("malformed signature header");
  const tsMs = Number(t);
  if (!Number.isFinite(tsMs)) throw new Error("bad timestamp in signature header");
  const age = Date.now() - tsMs;
  if (age > toleranceMs || age < -60000) throw new Error("webhook timestamp outside tolerance (replay?)");

  const primary = process.env.WAFFO_WEBHOOK_PUBLIC_KEY || PROD_PUBLIC_KEY;
  const input = Buffer.from(t + "." + payload, "utf8");
  if (verifyWith(primary, v1, input)) return JSON.parse(payload);
  const other = primary === TEST_PUBLIC_KEY ? PROD_PUBLIC_KEY : TEST_PUBLIC_KEY;
  if (verifyWith(other, v1, input)) return JSON.parse(payload);
  throw new Error("invalid webhook signature");
}
