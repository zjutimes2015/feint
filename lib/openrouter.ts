/** OpenRouter 同步文本生成（后台文案助手）。 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/auto";
const TIMEOUT_MS = 60000;

export function openrouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** 返回 [文本, 实际使用的模型]；失败抛错。 */
export async function generateText(prompt: string, model?: string): Promise<[string, string]> {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const used = (model || "").trim() || DEFAULT_MODEL;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://zjutimes2015.github.io/hook/",
        "X-Title": "BRAWLVERSE booker",
      },
      body: JSON.stringify({ model: used, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return [data.choices[0].message.content, used];
  } finally {
    clearTimeout(timer);
  }
}
