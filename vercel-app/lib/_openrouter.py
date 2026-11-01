"""OpenRouter synchronous text generation (admin copywriter helper)."""
import json
import os
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openrouter/auto"
TIMEOUT_S = 60


def configured():
    return bool(os.environ.get("OPENROUTER_API_KEY"))


def generate_text(prompt, model=None):
    """Returns (text, model_used). Raises RuntimeError / urllib errors."""
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    model = (model or "").strip() or DEFAULT_MODEL
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        OPENROUTER_URL, data=body,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "HTTP-Referer": "https://zjutimes2015.github.io/hook/",
                 "X-Title": "BRAWLVERSE booker"},
        method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        d = json.loads(r.read().decode())
    return d["choices"][0]["message"]["content"], model
