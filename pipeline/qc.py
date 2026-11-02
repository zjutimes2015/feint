#!/usr/bin/env python3
"""Step 2.5 — 一致性门（导演喊卡）：抽帧 + OpenRouter 视觉模型对比定妆照。

每段成片装配前自动跑：
  1. 抽首/中/尾 3 帧；
  2. 视觉模型对比定妆照："是否同一人？手套/短裤/纹身是否一致？"；
  3. PASS 才进装配。

Usage:
  OPENROUTER_API_KEY=sk-... python3 qc.py --video assets/qf1_r1/s1.mp4 \\
      --fighter "IRON JAW" [--ref assets/portraits/IRON_JAW.png] [--out qc/qf1_r1_s1.json]

Exit code: 0 = PASS, 1 = FAIL, 2 = SKIP（无 key / 缺 ffmpeg，装配时按通过处理并打印警告）
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
REFERENCE 是该角色的官方定妆照，FRAMES 是生成片段的首/中/尾 3 帧。
只回答 JSON，不要解释。标准从严：任何存疑一律判 false。
{
  "same_person": true/false,   // 3 帧里的人是否都是 REFERENCE 同一个人（脸/发型完全一致）
  "gear_consistent": true/false, // 手套（颜色/款式）、短裤、纹身是否与 REFERENCE 一致
  "notes": "一句话原因"
}"""


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


def judge(ref_path, frames):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        return None  # SKIP
    content = [{"type": "text",
                "text": "REFERENCE 是官方定妆照，下面 3 张是待检片段的首/中/尾帧。按 system 指令只输出 JSON。"}]
    content.append({"type": "image_url", "image_url": {"url": b64img(ref_path)}})
    for fp in frames:
        content.append({"type": "image_url", "image_url": {"url": b64img(fp)}})
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

    verdict = judge(ref, frames)
    if verdict is None:
        print("QC SKIP: OPENROUTER_API_KEY 未设置（装配继续，人工看）", file=sys.stderr)
        sys.exit(2)

    passed = bool(verdict.get("same_person")) and bool(verdict.get("gear_consistent"))
    report = {"video": a.video, "fighter": a.fighter, "ref": ref,
              "passed": passed, "verdict": verdict}
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(report, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("qc report -> " + a.out)
    print("QC %s: %s | same_person=%s gear=%s | %s" % (
        "PASS" if passed else "FAIL", a.video,
        verdict.get("same_person"), verdict.get("gear_consistent"),
        verdict.get("notes", "")))
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
