#!/usr/bin/env python3
"""Step 1 — 脑：OpenRouter 生成单集 brief（分镜表 + 垃圾话台词 + 解说词）。

Usage:
  OPENROUTER_API_KEY=sk-... python3 draft.py --bout qf1 --a "IRON JAW" --b "VIPER" \\
      --feud "VIPER 在 EP0 反击 KO 了 JAW，JAW 走复仇线" --round 1

Output: briefs/<bout>_r<round>.json  (+ briefs/<bout>_continuity.json 连续性表)

角色一致性（2026-11-02）：
  FIGHTERS 每人带 dna（外形锁死句）+ seed（wan-2.2 固定种子）；
  台词生成时 DNA 一并喂给模型，采访细节自动对上脸；
  每轮读入上一轮连续性（伤痕/破衣只增不减），输出本轮新增写入连续性表。
"""
import argparse
import json
import os
import sys
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# persona: 人设（剧情用）；dna: 外形锁死句（视觉用，prompt 末尾逐字追加）；
# seed: wan-2.2-animate-replace 固定种子（nano-banana-2.1 无 seed 参数，靠 DNA+正面照锁）
FIGHTERS = {
    "IRON JAW": {
        "persona": "重炮手，沉默寡言的力量型。EP0 被 VIPER 反击 KO，走复仇线。",
        "dna": "square jaw with a crescent scar on left cheek, shaved head, gunmetal-gray Everlast-style gloves, black trunks with white waistband trim, faded dragon tattoo wrapping right bicep",
        "seed": 71042,
    },
    "VIPER": {
        "persona": "毒牙，狡猾的反击型拳手。EP0 赢家，嘴毒，喜欢心理战。",
        "dna": "lean angular face with a thin scar splitting right eyebrow, slicked-back black ponytail, emerald-green gloves with white fang logo, dark-green trunks with snakescale pattern, coiled snake tattoo up left forearm",
        "seed": 23117,
    },
    "SLEDGE": {
        "persona": "拆迁，纯力量碾压型，拆迁队长人设。",
        "dna": "massive blocky head with flat-top buzz cut, heavy brow, construction-orange gloves, hi-vis yellow trunks with black hazard chevrons, sledgehammer tattoo across chest",
        "seed": 88420,
    },
    "MONSOON": {
        "persona": "风暴，速度连击型，来去如风。",
        "dna": "sharp cheekbones, windswept storm-blue undercut, sky-blue gloves, white trunks with blue typhoon spiral, thin lightning-scar tattoo down left temple",
        "seed": 45209,
    },
    "VOLT": {
        "persona": "混沌，'计划？老子就是闪电'，不可预测。",
        "dna": "wild asymmetric bleached-blond mohawk, jagged yellow lightning-bolt face paint across eyes, neon-yellow gloves, black trunks with electric-crackle print, no tattoos",
        "seed": 61093,
    },
    "THE PROFESSOR": {
        "persona": "秩序，每场比赛都有 14 步剧本，学院派。",
        "dna": "neat side-parted brown hair, round spectacles, trimmed goatee, burgundy gloves, brown trunks with subtle tweed pattern, small chess-knight tattoo behind left ear",
        "seed": 31847,
    },
    "GOLIATH-7": {
        "persona": "温柔巨人，8 人里最不想打架的那个，被迫应战。",
        "dna": "towering gentle face with soft round features, short curly dark hair, oversized forest-green gloves, plain slate-gray trunks, small heart tattoo on right wrist",
        "seed": 77531,
    },
    "LA REINA": {
        "persona": "女王，8 人里最想赢的那个，气场压制。",
        "dna": "regal sharp jawline, long braided raven-black hair with gold cuffs, crimson gloves with gold trim, black-and-gold trunks with crown emblem, rose tattoo on left shoulder",
        "seed": 50268,
    },
}

SYSTEM = """你是 BRAWLVERSE 的 booker（剧情策划），WWE 式剧本娱乐，不是真实体育。
8 位 AI 拳手的人设与外形 DNA 如下（DNA 是该拳手锁死的外形，采访/垃圾话里提到外貌细节时必须与 DNA 一致，例如 IRON JAW 摸的是左脸的疤）：
%s

铁律：
1. 每集必须有反转（观众预期→出乎意料的翻转），3 分钟只变一个变量。
2. 必须有 before/after 视觉对比，3 秒内看得出来。
3. 单集 3 分钟 beat sheet：0:00 钩子 → 0:30 对峙 → 1:00 R1 埋反转 → 1:30 R2 战术投票点 → 2:00 R3 逆转 buff → 2:30 结局+下集预告。
4. 垃圾话台词必须符合拳手人设，英文，短促有力，适合 TTS 朗读（<20 词/条）。
5. 连续性：本轮只能在已有伤痕基础上新增（淤青/伤口/破衣/血迹），绝不能消除或"愈合"上一轮的伤。输出 "continuity" 对象：key 为拳手 slug（小写下划线，如 iron_jaw），value 为本轮新增伤痕描述数组；无新增则为空数组。
6. 镜头数铁律：segments 必须 20–40 个，够 3 分钟正片。fight 镜头 2–4 秒，trash_talk 3–8 秒，必须有开场钩子镜头与结尾定格镜头。
7. 只输出 JSON，不要解释。

输出 JSON 结构：
{
  "segments": [
    {"id": "s1", "type": "fight", "duration_s": 30, "fighter": "拳手名", "action": "动作描述（给换角色模型的实拍参考描述）", "reference": "实拍动作库文件名或描述"},
    {"id": "s2", "type": "trash_talk", "fighter": "拳手名", "line": "英文台词", "duration_s": 8}
  ],
  "commentary": [{"t": "0:05", "line": "英文解说词"}],
  "tactic_vote": {"question": "英文投票问题", "options": ["heavy", "dodge", "guard"]},
  "twist": "本集反转点一句话",
  "continuity": {"iron_jaw": ["新增伤痕描述"], "viper": []}
}"""


def fighter_slug(name):
    return name.lower().replace(" ", "_")


def call_openrouter(system, user, model):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set")
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": 0.9,
    }).encode()
    req = urllib.request.Request(
        OPENROUTER_URL, data=body,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "HTTP-Referer": "https://zjutimes2015.github.io/hook/",
                 "X-Title": "BRAWLVERSE booker"},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode())
    content = d["choices"][0]["message"]["content"]
    usage = d.get("usage", {})
    print("tokens: in=%s out=%s" % (usage.get("prompt_tokens"), usage.get("completion_tokens")),
          file=sys.stderr)
    return json.loads(content)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bout", required=True)
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--feud", required=True, help="恩怨一句话")
    ap.add_argument("--round", default="1")
    ap.add_argument("--model", default="deepseek/deepseek-chat",
                    help="cheap default; use anthropic/claude-* for quality")
    ap.add_argument("--outdir", default="briefs")
    a = ap.parse_args()

    if a.a not in FIGHTERS or a.b not in FIGHTERS:
        sys.exit("未知拳手，可选: " + ", ".join(FIGHTERS))

    os.makedirs(a.outdir, exist_ok=True)

    # 连续性表：读入上一轮（伤痕/破衣只增不减）
    cont_path = os.path.join(a.outdir, "%s_continuity.json" % a.bout)
    prev_cont = {}
    if os.path.exists(cont_path):
        prev_cont = json.load(open(cont_path, encoding="utf-8"))

    personas = "\n".join("- %s：%s\n  外形DNA：%s" % (k, v["persona"], v["dna"])
                         for k, v in FIGHTERS.items())
    user = ("bout_id=%s round=%s\n%s vs %s\n恩怨：%s\n"
            "上一轮连续性状态（本轮只能新增伤痕/破衣，绝不能消除）：%s\n"
            "请输出本集 brief JSON。"
            % (a.bout, a.round, a.a, a.b, a.feud,
               json.dumps(prev_cont, ensure_ascii=False)))
    brief = call_openrouter(SYSTEM % personas, user, a.model)
    brief["bout_id"] = a.bout
    brief["round"] = a.round
    brief["fighters"] = [a.a, a.b]

    # 镜头数验收：P0-1 要的是 20–40 镜的完整正片，不是 5 镜片段。
    segs = brief.get("segments") or []
    n = len(segs)
    total_s = sum(float(s.get("duration_s") or 0) for s in segs)
    print("shots=%d total=%.1fs" % (n, total_s), file=sys.stderr)
    if n < 20 or n > 40:
        print("WARN: 镜头数 %d 不在 20–40 区间，正片时长可能不达标。" % n,
              file=sys.stderr)
    if total_s < 150:
        print("WARN: 总时长 %.1fs < 150s，按 3 分钟正片标准偏短。" % total_s,
              file=sys.stderr)

    # 连续性表：合并本轮新增并写回
    merged = dict(prev_cont)
    for slug, adds in (brief.get("continuity") or {}).items():
        if not isinstance(adds, list):
            adds = [adds]
        merged[slug] = sorted(set(merged.get(slug, [])) | set(adds))
    json.dump(merged, open(cont_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("continuity -> " + cont_path)

    path = os.path.join(a.outdir, "%s_r%s.json" % (a.bout, a.round))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(brief, f, ensure_ascii=False, indent=2)
    print("brief -> " + path)
    print("twist: " + brief.get("twist", ""))


if __name__ == "__main__":
    main()
