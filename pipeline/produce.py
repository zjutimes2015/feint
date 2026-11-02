#!/usr/bin/env python3
"""Step 2 — 手：按 brief 生成 Replicate 执行计划并跑（默认 dry-run，不花钱）。

Usage:
  python3 produce.py --brief briefs/qf1_r1.json            # dry-run：打印计划+估算
  python3 produce.py --brief briefs/qf1_r1.json --execute --yes   # 真跑（先查余额）
  python3 produce.py --brief briefs/qf1_r1.json --execute --yes --qc  # 真跑+一致性门

模型输入 schema 已用 replicate.py model 实锤（2026-10-31）：
  wan-video/wan-2.2-animate-replace: video, character_image, resolution, merge_audio, seed
  cjwbw/sadtalker:                   driven_audio, source_image
  inworld/realtime-tts-2:            text, language, voice_id, audio_format
  google/nano-banana-2.1:            prompt, image_input, aspect_ratio, output_format
  bria/video-increase-resolution:    video_url, preserve_audio, desired_increase

角色一致性（2026-11-02）：
  - 定妆锚点：sadtalker source_image 与 wan-2.2 character_image 永远走
    anchor_portrait()（character.json portraits.front，兜底旧单张），不许硬编码路径。
  - DNA 锁死：定妆 prompt 末尾逐字追加 dna；wan-2.2 传拳手固定 seed。
    注意 nano-banana-2.1 没有 seed 参数（schema 实锤），锁靠 DNA 逐字 + 正面照 reference。
  - --qc：每段视频生成后跑 pipeline/qc.py，fail 自动重跑≤2 次，仍不过则移出装配。
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.expanduser("~/workspace/custom-connectors/custom.replicate/bin/replicate.py")
ASSETS = os.path.join(HERE, "assets")
QC = os.path.join(HERE, "qc.py")

sys.path.insert(0, HERE)
from draft import FIGHTERS  # noqa: E402  # dna/seed 作者源（character.json 优先）

# $/s 估算（第三方公开价，实锤见投入产出比文档；Replicate 以实际跑单为准）
COST = {
    "wan-video/wan-2.2-animate-replace": 0.08,
    "cjwbw/sadtalker": 0.02,
    "inworld/realtime-tts-2": 0.005,
    "google/nano-banana-2.1": 0.05,   # 按张
    "bria/video-increase-resolution": 0.03,
    "sync/lipsync-2-pro": 0.05,
}

# DNA 锁死模板：dna 逐字追加，一字不改
PORTRAIT_PROMPT = (
    "Esports-style fighter portrait, dramatic rim lighting, dark arena background, "
    "centered, chest up, facing camera, front view.\n"
    "CHARACTER DNA (reproduce EXACTLY, do not alter): {dna}")


def fighter_slug(name):
    return name.lower().replace(" ", "_")


def load_character(fighter):
    """Character Bible：pipeline/assets/fighters/<slug>/character.json。"""
    p = os.path.join(ASSETS, "fighters", fighter_slug(fighter), "character.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return None


def fighter_dna(fighter):
    c = load_character(fighter)
    if c and c.get("dna"):
        return c["dna"]
    return FIGHTERS.get(fighter, {}).get("dna", "")


def fighter_seed(fighter):
    c = load_character(fighter)
    if c and c.get("seed"):
        return c["seed"]
    return FIGHTERS.get(fighter, {}).get("seed", 0)


def portrait_path(fighter):
    """旧单张定妆照（兜底）。新流程 3 视图在 assets/fighters/<slug>/。"""
    return os.path.join(ASSETS, "portraits", fighter.replace(" ", "_") + ".png")


def anchor_portrait(fighter):
    """定妆锚点——sadtalker source_image 与 wan-2.2 character_image 永远走这里。
    不许各处硬编码路径。"""
    c = load_character(fighter)
    if c:
        front = (c.get("portraits") or {}).get("front", "pending")
        if front and front != "pending":
            fp = os.path.join(HERE, front)
            if os.path.exists(fp):
                return fp
    return portrait_path(fighter)


def run_helper(*args):
    r = subprocess.run([sys.executable, HELPER, *args], capture_output=True, text=True)
    return r


def run_qc(video_path, fighter):
    """返回 0=通过 1=失败 2=跳过（无 key 等）。"""
    r = subprocess.run([sys.executable, QC, "--video", video_path,
                        "--fighter", fighter],
                       capture_output=True, text=True)
    print(r.stdout.strip(), file=sys.stderr)
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)
    return r.returncode


def check_balance():
    r = run_helper("account")
    if r.returncode != 0:
        sys.exit("replicate account check failed: " + r.stderr[:200])
    try:
        d = json.loads(r.stdout)
        # balance 字段各异，打印出来人看
        print("account: " + json.dumps(d)[:300], file=sys.stderr)
    except Exception:
        pass


def replicate_run(model, inputs, save):
    """Returns output URL (first)."""
    r = run_helper("run", "--model", model, "--input-json", json.dumps(inputs),
                   "--save", save, "--timeout", "1800")
    if r.returncode != 0:
        raise RuntimeError("replicate run failed: " + r.stderr[-500:])
    d = json.loads(open(save, encoding="utf-8").read())
    out = d.get("output")
    if isinstance(out, list):
        out = out[0] if out else None
    if not out:
        raise RuntimeError("no output url: " + json.dumps(d)[:300])
    return out


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    return dest


def upload_local(path):
    """Replicate 要公网 URL：本地文件走 Muse 中转存储（48h 有效，跑单够用）。"""
    r = subprocess.run(["/opt/hatch/bin/remote-storage", "upload-file",
                        "--path", path], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("upload failed: " + r.stderr[:200])
    d = json.loads(r.stdout)
    return d["url"]


def _to_url(v):
    if isinstance(v, str) and os.path.exists(v):
        return upload_local(v)
    return v


def build_plan(brief):
    """Returns (plan, estimate_usd). plan = list of step dicts."""
    plan, est = [], 0.0
    bout = brief["bout_id"]
    rnd = brief["round"]
    workdir = os.path.join(ASSETS, "%s_r%s" % (bout, rnd))

    # 0. 定妆照（缺啥补啥，缓存=真理源；DNA 锁死 prompt）
    for f in brief["fighters"]:
        pp = portrait_path(f)
        if not os.path.exists(pp):
            plan.append({"id": "portrait-" + f, "model": "google/nano-banana-2.1",
                         # nano-banana-2.1 无 seed 参数：锁 = DNA 逐字
                         "inputs": {"prompt": PORTRAIT_PROMPT.format(
                             dna=fighter_dna(f)),
                             "aspect_ratio": "3:4", "output_format": "png"},
                         "save": pp, "kind": "image", "fighter": f})
            est += COST["google/nano-banana-2.1"]

    for seg in brief.get("segments", []):
        sid = seg["id"]
        dur = seg.get("duration_s", 10)
        fighter = seg.get("fighter", brief["fighters"][0])
        if seg["type"] == "fight":
            plan.append({"id": sid, "model": "wan-video/wan-2.2-animate-replace",
                         "inputs": {"video": seg.get("reference", ""),
                                    "character_image": anchor_portrait(fighter),
                                    "resolution": "720p", "merge_audio": True,
                                    "seed": fighter_seed(fighter)},
                         "save": os.path.join(workdir, sid + ".mp4"),
                         "kind": "video", "fighter": fighter})
            est += dur * COST["wan-video/wan-2.2-animate-replace"]
        elif seg["type"] == "trash_talk":
            f = seg["fighter"]
            plan.append({"id": sid + "-tts", "model": "inworld/realtime-tts-2",
                         "inputs": {"text": seg["line"], "language": "en",
                                    "audio_format": "mp3"},
                         "save": os.path.join(workdir, sid + ".mp3"),
                         "kind": "audio", "fighter": f})
            est += dur * COST["inworld/realtime-tts-2"]
            plan.append({"id": sid, "model": "cjwbw/sadtalker",
                         "inputs": {"driven_audio": "{prev:" + sid + "-tts}",
                                    "source_image": anchor_portrait(f)},
                         "save": os.path.join(workdir, sid + ".mp4"),
                         "kind": "video", "needs": sid + "-tts", "fighter": f})
            est += dur * COST["cjwbw/sadtalker"]
    # 收尾超分（可选，默认开；desired_increase 如报错改为 verify）
    plan.append({"id": "upscale-note",
                 "note": "bria 超分在 assemble 后对成片跑：bria/video-increase-resolution "
                         "{video_url, preserve_audio:true, desired_increase:'2x'}"})
    return plan, round(est, 2)


def execute(plan, workdir, use_qc=False):
    urls = {}
    for step in plan:
        if "model" not in step:
            print("NOTE: " + step.get("note", ""), file=sys.stderr)
            continue
        inputs = dict(step["inputs"])
        # {prev:xxx} 引用上一步的输出 URL；本地文件自动转公网 URL
        for k, v in list(inputs.items()):
            if isinstance(v, str) and v.startswith("{prev:"):
                ref = v[6:-1]
                inputs[k] = urls[ref]
            else:
                inputs[k] = _to_url(v)
        dest = step["save"]
        tries = 0
        while True:
            print("RUN %s <- %s (try %d)" % (step["id"], step["model"], tries + 1),
                  file=sys.stderr)
            out_url = replicate_run(step["model"], inputs, dest + ".json")
            download(out_url, dest)
            urls[step["id"]] = out_url
            print("  -> " + dest, file=sys.stderr)
            if not use_qc or step.get("kind") != "video":
                break
            rc = run_qc(dest, step.get("fighter", ""))
            if rc == 0 or rc == 2:
                break  # 通过 / 跳过
            tries += 1
            if tries >= 2:
                # 导演喊卡：废片移出装配
                bad = dest + ".qc_failed"
                os.rename(dest, bad)
                print("QC 2 次不过，废片移出装配: " + bad, file=sys.stderr)
                break
            print("QC FAIL，重跑该段（%d/2）" % tries, file=sys.stderr)
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true", help="确认花钱")
    ap.add_argument("--qc", action="store_true",
                    help="一致性门：每段视频过 qc.py，fail 重跑≤2 次")
    a = ap.parse_args()

    brief = json.load(open(a.brief, encoding="utf-8"))
    plan, est = build_plan(brief)
    plan_path = a.brief.replace(".json", ".plan.json")
    json.dump({"plan": plan, "estimate_usd": est}, open(plan_path, "w"), indent=2)
    print("plan -> " + plan_path)
    print("estimated cost: $%.2f" % est)
    for s in plan:
        print("  - %-22s %s" % (s["id"], s.get("model", s.get("note", ""))[:60]))

    if not a.execute:
        print("\ndry-run 结束（没花钱）。加 --execute --yes 真跑。")
        return
    if not a.yes:
        sys.exit("真跑需要 --yes（防止手滑烧钱）")
    check_balance()
    execute(plan, os.path.join(ASSETS), use_qc=a.qc)


if __name__ == "__main__":
    main()
