#!/usr/bin/env python3
"""Step 2.5 — 一致性门（导演喊卡）：抽帧 + OpenRouter 视觉模型对比定妆照。

每段成片装配前自动跑：
  1. 抽首/中/尾 3 帧，每帧再裁一张近景（头部/上半身放大）；
  2. 视觉模型对比定妆照：脸是否同一人、手套/短裤/纹身是否一致；
  3. 只有明确不一致才 FAIL。

三态（2026-11-08 实测）：全景全身镜头里脸只有 20~30px，直接判脸必然误判。
看不清时必须给 unverifiable，不能猜 false —— 所以 verdict 用 match/mismatch/unverifiable，
只有出现 mismatch 才阻断装配。

Usage:
  OPENROUTER_API_KEY=sk-... python3 qc.py --video assets/qf1_r1/s1.mp4 \\
      --fighter "IRON JAW" [--ref assets/portraits/IRON_JAW.png] [--out qc/qf1_r1_s1.json]

Exit code: 0 = PASS 或 UNKNOWN（看不清，按通过放行）, 1 = FAIL, 2 = SKIP（无 key / 缺 ffmpeg）
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
QC_MODEL = os.environ.get("QC_MODEL", "google/gemini-2.5-flash")

SYSTEM = """你是影视连续性总监（continuity supervisor），铁面无私。
REFERENCE 是该角色的官方定妆照。FRAMES 是待检片段的首/中/尾帧，每帧给两张图：全身图 + 同帧近景（头部/上半身放大）。
只回答 JSON，不要解释。判定规则：
- 先用近景图认五官；近景里五官仍模糊、背对镜头、低头或出画时，identity 必须写 "unverifiable"，禁止靠猜测判 mismatch。
- 能明确看出不是同一人（脸型/年龄/发型/人种特征明显不同）才写 "mismatch"。
- 用全身图看手套（颜色/款式）、短裤、纹身；看不清就写 "unverifiable"，明确不同才写 "mismatch"。
按帧返回 JSON 数组（3 条，顺序对应第 1/2/3 帧）：
[
  {
    "identity": "match|mismatch|unverifiable",  // 脸/发型是否与 REFERENCE 同一人
    "gear": "match|mismatch|unverifiable",      // 手套/短裤/纹身是否与 REFERENCE 一致
    "notes": "一句话原因"
  }
]"""

# 近景取景窗：按 arena 模板的固定机位标定（人物居中、头顶留白约 4%）。
CLOSEUP_FILTER = "crop=iw*0.62:ih*0.72:iw*0.19:ih*0.04,scale=1024:-2:flags=lanczos"


def b64img(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def extract_frames(video, tmpdir):
    """首/中/尾 3 帧 -> [paths]。失败抛 RuntimeError。"""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video],
        capture_output=True, text=True)
    try:
        dur = float(probe.stdout.strip())
    except Exception:
        dur = 10.0
    stamps = [0.5, max(0.6, dur / 2), max(0.7, dur - 0.5)]
    outs = []
    for i, ss in enumerate(stamps):
        out = os.path.join(tmpdir, "f%d.png" % i)
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(round(ss, 2)),
             "-i", video, "-vframes", "1", out],
            capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            raise RuntimeError("ffmpeg 抽帧失败: " + r.stderr[:200])
        outs.append(out)
    return outs


def closeups(frames, tmpdir):
    """每帧裁一张近景放大图 -> [paths]，单张失败给 None（不影响判定）。"""
    outs = []
    for i, fp in enumerate(frames):
        out = os.path.join(tmpdir, "cu%d.png" % i)
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", fp, "-vf", CLOSEUP_FILTER,
             "-vframes", "1", out],
            capture_output=True, text=True)
        outs.append(out if r.returncode == 0 and os.path.exists(out) else None)
    return outs


def judge(ref_path, frames, crops):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        return None  # SKIP
    content = [{"type": "text",
                "text": "REFERENCE 是官方定妆照；下面是待检片段的首/中/尾帧，每帧先全身、后近景。按 system 指令只输出 JSON。"}]
    content.append({"type": "image_url", "image_url": {"url": b64img(ref_path)}})
    for i, fp in enumerate(frames):
        content.append({"type": "text", "text": "第 %d 帧 全身" % (i + 1)})
        content.append({"type": "image_url", "image_url": {"url": b64img(fp)}})
        if crops and i < len(crops) and crops[i]:
            content.append({"type": "text", "text": "第 %d 帧 近景" % (i + 1)})
            content.append({"type": "image_url", "image_url": {"url": b64img(crops[i])}})
    body = json.dumps({
        "model": QC_MODEL,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": content}],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
    }).encode()
    req = urllib.request.Request(
        OPENROUTER_URL, data=body,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "HTTP-Referer": "https://zjutimes2015.github.io/hook/",
                 "X-Title": "BRAWLVERSE QC"},
        method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read().decode())
    raw = d["choices"][0]["message"]["content"]
    return json.loads(raw)


def aggregate(verdict):
    """模型按帧返回数组（或单对象）—— 聚合成一条：任一帧判不一致即 mismatch。"""
    items = verdict if isinstance(verdict, list) else [verdict]
    items = [v for v in items if isinstance(v, dict)]
    if not items:
        return {"identity": "unverifiable", "gear": "unverifiable", "notes": "模型返回为空"}

    def worst(field):
        vals = [str(v.get(field, "")).lower() for v in items]
        if "mismatch" in vals:
            return "mismatch"
        if all(v == "match" for v in vals):
            return "match"
        return "unverifiable"

    notes = " / ".join(dict.fromkeys(
        str(v.get("notes", "")).strip() for v in items if v.get("notes")))
    return {"identity": worst("identity"), "gear": worst("gear"),
            "notes": notes, "frames": items}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--fighter", required=True)
    ap.add_argument("--ref", default=None,
                    help="定妆照路径；缺省走 anchor（character.json portraits.front，兜底旧单张）")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    ref = a.ref
    if not ref:
        # 走锚点：与 produce.py 同一逻辑（不许硬编码路径）
        sys.path.insert(0, HERE)
        from produce import anchor_portrait
        ref = anchor_portrait(a.fighter)
    if not os.path.exists(ref):
        print("QC SKIP: 定妆照不存在 %s（先跑 gen_portraits.py 或等 produce 生成）" % ref,
              file=sys.stderr)
        sys.exit(2)
    if not os.path.exists(a.video):
        print("QC SKIP: 片段不存在 " + a.video, file=sys.stderr)
        sys.exit(2)

    tmpdir = tempfile.mkdtemp(prefix="brawl_qc_")
    try:
        frames = extract_frames(a.video, tmpdir)
    except RuntimeError as e:
        print("QC SKIP: " + str(e), file=sys.stderr)
        sys.exit(2)
    crops = closeups(frames, tmpdir)

    verdict = judge(ref, frames, crops)
    if verdict is None:
        print("QC SKIP: OPENROUTER_API_KEY 未设置（装配继续，人工看）", file=sys.stderr)
        sys.exit(2)
    verdict = aggregate(verdict)

    identity = str(verdict.get("identity", "")).lower()
    gear = str(verdict.get("gear", "")).lower()
    if "mismatch" in (identity, gear):
        status = "fail"          # 明确换脸/换装 —— 阻断装配
    elif identity == "match" and gear == "match":
        status = "pass"
    else:
        status = "unknown"       # 看不清 —— 不阻断，留人工
    passed = status != "fail"

    report = {"video": a.video, "fighter": a.fighter, "ref": ref,
              "status": status, "passed": passed, "verdict": verdict}
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(report, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("qc report -> " + a.out)
    print("QC %s: %s | identity=%s gear=%s | %s" % (
        status.upper(), a.video, identity, gear, verdict.get("notes", "")))
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
