#!/usr/bin/env python3
"""Friday Fight Night 分支预渲染：投票窗口内把 2 个战术分支都生成好。

战术真正生效的方式:每个战术对应一条动作序列(来自 manifest.json 的
tactic_sequences),分支视频按该序列拼接不同底片生成。两条分支用不同的
动作序列与不同的底片,观众投票选出来的才是真的不一样。

用法：
  python3 round.py --bout qf1 --round 1 --tactic-a heavy --tactic-b dodge \\
      --fighter "IRON JAW"
  # 默认 dry-run，只出计划和估算；加 --execute --yes 才真正花钱跑
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "rounds")
MANIFEST = os.path.join(HERE, "assets", "mixamo", "manifest.json")
MP4_DIR = os.path.join(HERE, "assets", "mixamo", "mp4")

sys.path.insert(0, os.path.dirname(__file__))
import produce  # noqa: E402


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def sequence_for(tactic, manifest):
    """战术 -> 动作序列。这是战术真正影响成片的地方。"""
    seqs = manifest.get("tactic_sequences") or {}
    key = (tactic or "").lower()
    if key in seqs:
        return list(seqs[key])
    print("WARN: 未知战术 %s，回退 guard" % tactic, file=sys.stderr)
    return list(seqs.get("guard") or [])


def clip_reference(clip_id, manifest):
    """动作 id -> 渲染好的底片 mp4 路径。"""
    for c in manifest["clips"]:
        if c["id"] == clip_id:
            p = os.path.join(MP4_DIR, clip_id + ".mp4")
            if os.path.exists(p):
                return p
            print("WARN: 缺底片 %s (%s)，该拍用空 reference" % (clip_id, p),
                  file=sys.stderr)
            return ""
    return ""


def build_branch_brief(bout, rnd, branch, tactic, fighter, manifest,
                       duration, clip_ids):
    """一个分支 = 一组 fight 段,每段用不同的底片动作。"""
    seg_id = "%s-r%s-%s" % (bout, rnd, branch)
    segments = []
    per = max(2, duration // max(1, len(clip_ids)))
    for i, clip_id in enumerate(clip_ids):
        segments.append({
            "id": "%s-%d" % (seg_id, i),
            "type": "fight",
            "duration_s": per,
            "fighter": fighter,
            "reference": clip_reference(clip_id, manifest),
            "action": clip_id,
            "tactic": tactic,
        })
    return {
        "bout_id": bout,
        "round": "%s-%s" % (rnd, branch),
        "fighters": [fighter],
        "segments": segments,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bout", required=True)
    ap.add_argument("--round", required=True)
    ap.add_argument("--tactic-a", required=True)
    ap.add_argument("--tactic-b", required=True)
    ap.add_argument("--fighter", required=True, help="出镜拳手（定妆照名）")
    ap.add_argument("--duration", type=int, default=30)
    ap.add_argument("--shots", type=int, default=4,
                    help="每个分支用几个动作（从战术序列头部取）")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true", help="二次确认，真的花钱")
    a = ap.parse_args()

    manifest = load_manifest()
    seq_a = sequence_for(a.tactic_a, manifest)
    seq_b = sequence_for(a.tactic_b, manifest)
    clips_a = seq_a[:a.shots]
    clips_b = seq_b[:a.shots]

    if clips_a == clips_b:
        print("WARN: 两个战术的动作序列相同，分支内容会一样", file=sys.stderr)

    total_est = 0.0
    outputs = {}
    for branch, tactic, clips in (
        ("a", a.tactic_a, clips_a),
        ("b", a.tactic_b, clips_b),
    ):
        brief = build_branch_brief(a.bout, a.round, branch, tactic, a.fighter,
                                   manifest, a.duration, clips)
        plan, est = produce.build_plan(brief)
        total_est += est
        print("branch %s (tactic=%s, clips=%s): %d steps, est $%.2f" %
              (branch, tactic, ",".join(clips), len(plan), est))
        for step in plan:
            ref = step.get("inputs", {}).get("video", "")
            print("   - %-22s %s <- %s" %
                  (step.get("id"), step.get("model", "note"),
                   os.path.basename(ref) if ref else "-"))
        if a.execute:
            if not a.yes:
                print("ABORT: --execute 需要同时加 --yes（花钱确认）", file=sys.stderr)
                sys.exit(2)
            workdir = os.path.join(HERE, "assets", "%s_r%s-%s" %
                                   (a.bout, a.round, branch))
            os.makedirs(workdir, exist_ok=True)
            produce.execute(plan, workdir)
            seg_files = []
            for seg in brief["segments"]:
                src = os.path.join(workdir, seg["id"] + ".mp4")
                if os.path.exists(src):
                    seg_files.append(src)
            if not seg_files:
                continue
            dst = os.path.join(OUTDIR, "%s-r%s_%s.mp4" % (a.bout, a.round, branch))
            lst = os.path.join(workdir, "concat.txt")
            open(lst, "w").write("".join("file '%s'\n" % s for s in seg_files))
            subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                            "-i", lst, "-c", "copy", dst], check=True)
            outputs[branch] = dst
            print("branch %s -> %s" % (branch, dst))

    print("TOTAL est: $%.2f for 2 branches" % total_est)
    if outputs:
        print("UPLOAD these to public URLs, then POST /api/content with kind=branch:")
        for b, p in outputs.items():
            print("  %s: %s" % (b, p))
    else:
        print("dry-run 结束（没花钱）。加 --execute --yes 真跑。")


if __name__ == "__main__":
    main()
