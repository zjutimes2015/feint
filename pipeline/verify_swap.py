#!/usr/bin/env python3
"""换角色最小验证（kill-or-keep）。

整个"实拍底片 + AI 换角色"路线建立在一个未验证的假设上:
  Mixamo 底片的骨架/比例,经 wan-2.2-animate-replace 换成拳手定妆照后,
  手部、手套、躯干比例是否守恒?会不会出现多手/穿模/手套消失?

如果这一步不通过,整条路线当场毙掉,得改走双角色模型或全 AI 生成。
所以它必须第一个跑,成本约 $0.3(3 秒 720p 换角色)。

用法:
  REPLICATE_API_TOKEN=... python3 verify_swap.py                    # 打印计划(不花钱)
  REPLICATE_API_TOKEN=... python3 verify_swap.py --execute --yes    # 真跑
  python3 verify_swap.py --judge out/verify_swap.mp4                # 只跑一致性门
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import produce  # noqa: E402

MP4_DIR = os.path.join(HERE, "assets", "mixamo", "mp4")
OUT_DIR = os.path.join(HERE, "out")
FIGHTER = "IRON JAW"
CLIP = "strike_jab"
SECONDS = 3

MODEL = "wan-video/wan-2.2-animate-replace"


def build_plan(portrait_override=""):
    """一个 clip 换角色,3 秒,720p,固定 seed。"""
    ref = os.path.join(MP4_DIR, CLIP + ".mp4")
    if not os.path.exists(ref):
        sys.exit("缺底片 %s —— 先跑 pipeline/blender/render_all.ps1" % ref)
    portrait = portrait_override or produce.anchor_portrait(FIGHTER)
    if not os.path.exists(portrait):
        sys.exit("缺定妆照 %s" % portrait)
    est = SECONDS * produce.COST[MODEL]
    return [{
        "id": "verify_swap",
        "model": MODEL,
        "inputs": {
            "video": ref,
            "character_image": portrait,
            "resolution": "720",
            "merge_audio": True,
            "seed": produce.fighter_seed(FIGHTER),
        },
        "save": os.path.join(OUT_DIR, "verify_swap.mp4"),
        "kind": "video",
        "fighter": FIGHTER,
    }], est


def judge(video):
    """抽帧 + 视觉模型判一致性,返回 (passed, detail)。"""
    rc = subprocess.run(
        [sys.executable, os.path.join(HERE, "qc.py"),
         "--video", video, "--fighter", FIGHTER],
        capture_output=True, text=True)
    sys.stderr.write(rc.stdout + rc.stderr)
    return rc.returncode == 0, rc.stdout.strip()


def extract_frames(video):
    """抽 3 帧存盘,供人工看。"""
    out = []
    for i, ss in enumerate([0.5, 1.5, 2.5]):
        p = os.path.join(OUT_DIR, "verify_frame_%d.png" % i)
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(ss),
             "-i", video, "-vframes", "1", p],
            capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(p):
            out.append(p)
    return out


def gen_portrait():
    """用生产同一条 prompt 生成写实定妆照，落到 out/ 先不动已锁定的角色卡。"""
    dest = os.path.join(OUT_DIR, "portrait_photoreal.png")
    plan = [{
        "id": "portrait_photoreal",
        "model": "google/nano-banana-2.1",
        "inputs": {"prompt": produce.PORTRAIT_PROMPT.format(
            dna=produce.fighter_dna(FIGHTER)),
            "aspect_ratio": "3:4", "output_format": "png"},
        "save": dest, "kind": "image", "fighter": FIGHTER,
    }]
    produce.execute(plan, OUT_DIR, use_qc=False)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--judge", default="", help="只对已有成片跑一致性门")
    ap.add_argument("--gen-portrait", action="store_true",
                    help="先按写实 prompt 生成新定妆照（$0.05），用 --portrait 指定")
    ap.add_argument("--portrait", default="", help="覆盖 character_image")
    a = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    video = os.path.join(OUT_DIR, "verify_swap.mp4")

    if a.judge:
        passed, detail = judge(a.judge)
        frames = extract_frames(a.judge)
        print(json.dumps({
            "passed": passed,
            "detail": detail,
            "frames": frames,
        }, ensure_ascii=False, indent=2))
        sys.exit(0 if passed else 1)

    if a.gen_portrait:
        if not a.execute:
            print("dry-run：会调用 google/nano-banana-2.1 生成写实定妆照（约 $0.05）")
            return
        if not a.yes:
            sys.exit("真跑需要 --yes")
        a.portrait = gen_portrait()
        print("新定妆照: %s" % a.portrait)

    plan, est = build_plan(a.portrait)
    print("=== 换角色最小验证 ===")
    print("model    : %s" % MODEL)
    print("reference: %s" % plan[0]["inputs"]["video"])
    print("portrait : %s" % plan[0]["inputs"]["character_image"])
    print("seed     : %s" % plan[0]["inputs"]["seed"])
    print("est cost : $%.2f" % est)
    print("output   : %s" % plan[0]["save"])

    if not a.execute:
        print("\ndry-run（没花钱）。加 --execute --yes 真跑。")
        return
    if not a.yes:
        sys.exit("真跑需要 --yes")

    t0 = time.time()
    produce.execute(plan, OUT_DIR, use_qc=False)
    print("生成耗时 %.0fs" % (time.time() - t0))

    passed, detail = judge(video)
    frames = extract_frames(video)
    print(json.dumps({
        "passed": passed,
        "detail": detail,
        "frames": frames,
        "video": video,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
