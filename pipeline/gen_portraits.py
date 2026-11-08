#!/usr/bin/env python3
"""一次性：生成 8 拳手 × 3 视图定妆照（约 $1.2），写入 character.json 并锁定。

一致性原理（2026-11-02 schema 实锤）：
  google/nano-banana-2.1 没有 seed 参数 —— 锁靠两招：
  1) DNA prompt 逐字锁死（character.json 的 dna，一字不改）；
  2) 先生成正面照，再以正面照作 image_input 参考生成 3/4 与侧面（同一个人演到底）。

用户自己跑（需要 Replicate 余额，约 $1.2）：
  python3 gen_portraits.py                 # dry-run：打印计划+估算
  python3 gen_portraits.py --execute --yes # 真跑
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.expanduser("~/workspace/custom-connectors/custom.replicate/bin/replicate.py")
FIGHTERS_DIR = os.path.join(HERE, "assets", "fighters")
MODEL = "google/nano-banana-2.1"
COST_PER_IMAGE = 0.05

sys.path.insert(0, HERE)
from draft import FIGHTERS  # noqa: E402  # persona/dna/seed 唯一作者源

VIEWS = [
    ("front", "facing camera, front view"),
    ("three_quarter", "three-quarter view, head turned slightly to the left"),
    ("profile", "side profile view, facing left"),
]

PORTRAIT_PROMPT = (
    "Esports-style fighter portrait, dramatic rim lighting, dark arena background, "
    "centered, chest up. {view}.\n"
    "CHARACTER DNA (reproduce EXACTLY, do not alter): {dna}")


def fighter_slug(name):
    return name.lower().replace(" ", "_")


def char_path(slug):
    return os.path.join(FIGHTERS_DIR, slug, "character.json")


def replicate_run_image(inputs, save):
    r = subprocess.run([sys.executable, HELPER, "run", MODEL,
                        "--input-json", json.dumps(inputs),
                        "--save", save + ".json", "--timeout", "900"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("replicate run failed: " + r.stderr[-500:])
    d = json.loads(open(save + ".json", encoding="utf-8").read())
    out = d.get("output")
    if isinstance(out, list):
        out = out[0] if out else None
    if not out:
        raise RuntimeError("no output url: " + json.dumps(d)[:300])
    urllib.request.urlretrieve(out, save)
    return out


def upload_local(path):
    r = subprocess.run(["/opt/hatch/bin/remote-storage", "upload-file",
                        "--path", path], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("upload failed: " + r.stderr[:200])
    return json.loads(r.stdout)["url"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    jobs = []
    for name, meta in FIGHTERS.items():
        slug = fighter_slug(name)
        c = json.load(open(char_path(slug), encoding="utf-8"))
        for view, desc in VIEWS:
            dest = os.path.join(FIGHTERS_DIR, slug, view + ".png")
            if os.path.exists(dest):
                continue  # 缺啥补啥，不重复花钱
            prompt = PORTRAIT_PROMPT.format(view=desc, dna=meta["dna"])
            jobs.append((name, slug, view, prompt, dest))

    print("待生成 %d 张 × $%.2f = $%.2f" % (len(jobs), COST_PER_IMAGE,
                                            len(jobs) * COST_PER_IMAGE))
    for name, slug, view, _, dest in jobs:
        print("  - %s [%s] -> %s" % (name, view, dest))
    if not jobs:
        print("全部已有，无需生成。")
        return
    if not a.execute:
        print("\ndry-run 结束（没花钱）。加 --execute --yes 真跑。")
        return
    if not a.yes:
        sys.exit("真跑需要 --yes")

    front_urls = {}
    for name, slug, view, prompt, dest in jobs:
        inputs = {"prompt": prompt, "aspect_ratio": "3:4", "output_format": "png"}
        if view != "front":
            # 同一个人演到底：正面照作参考
            front_local = os.path.join(FIGHTERS_DIR, slug, "front.png")
            if slug not in front_urls:
                front_urls[slug] = upload_local(front_local)
            inputs["image_input"] = [front_urls[slug]]
        print("GEN %s [%s] ..." % (name, view), file=sys.stderr)
        replicate_run_image(inputs, dest)
        print("  -> " + dest, file=sys.stderr)

    # 回填 character.json 并锁定
    for name, meta in FIGHTERS.items():
        slug = fighter_slug(name)
        p = char_path(slug)
        c = json.load(open(p, encoding="utf-8"))
        ok = True
        for view, _ in VIEWS:
            rel = "assets/fighters/%s/%s.png" % (slug, view)
            if os.path.exists(os.path.join(HERE, rel)):
                c["portraits"][view] = rel
            else:
                ok = False
        c["locked"] = ok
        json.dump(c, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("%s locked=%s" % (name, ok))


if __name__ == "__main__":
    main()
