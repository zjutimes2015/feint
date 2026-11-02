#!/usr/bin/env python3
"""一键跑单集：draft（脑）→ produce（手）→ QC 门 → assemble（合成）。

默认全程 dry-run（不花钱）；真跑：
  python3 run_episode.py --bout qf1 --a "IRON JAW" --b "VIPER" \\
      --feud "VIPER 在 EP0 反击 KO 了 JAW，JAW 走复仇线" --execute --yes

前置：
  OPENROUTER_API_KEY  (draft 用；没有就跳过 draft，用现成的 brief)
  Replicate 走 custom.replicate connector（helper 代跑，无需 token）

角色一致性（2026-11-02）：装配前强制过 QC 门（pipeline/qc.py），fail 段
移出装配（重命名为 .qc_failed），废片不进成片。
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
QC = os.path.join(HERE, "qc.py")


def sh(*args):
    r = subprocess.run([sys.executable, *args])
    if r.returncode != 0:
        sys.exit("FAILED: " + " ".join(args))
    return r


def qc_gate(brief_path):
    """装配前强制 QC 门：每段成片过 qc.py，fail 段移出装配。"""
    brief = json.load(open(brief_path, encoding="utf-8"))
    bout, rnd = brief["bout_id"], brief["round"]
    workdir = os.path.join(HERE, "assets", "%s_r%s" % (bout, rnd))
    failed = 0
    for seg in brief.get("segments", []):
        if seg.get("type") not in ("fight", "trash_talk"):
            continue
        p = os.path.join(workdir, seg["id"] + ".mp4")
        if not os.path.exists(p):
            continue
        fighter = seg.get("fighter", brief["fighters"][0])
        r = subprocess.run([sys.executable, QC, "--video", p,
                            "--fighter", fighter],
                           capture_output=True, text=True)
        if r.returncode == 1:
            bad = p + ".qc_failed"
            os.rename(p, bad)
            print("QC 门 FAIL -> 移出装配: %s" % p, file=sys.stderr)
            failed += 1
        elif r.returncode == 2:
            print("QC 门 SKIP（无 key/缺帧）: %s" % p, file=sys.stderr)
        else:
            print("QC 门 PASS: %s" % p, file=sys.stderr)
    if failed:
        print("QC 门：%d 段废片已移出装配" % failed, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bout", required=True)
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--feud", default="")
    ap.add_argument("--round", default="1")
    ap.add_argument("--model", default="deepseek/deepseek-chat")
    ap.add_argument("--brief", default=None, help="跳过 draft，直接用现成 brief")
    ap.add_argument("--format", default="vertical", choices=["vertical", "horizontal"])
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    brief_path = a.brief
    if not brief_path:
        if not a.feud:
            sys.exit("--feud 必填（或用 --brief 跳过 draft）")
        print("=== 1/4 draft（OpenRouter，几分钱）===")
        sh(os.path.join(HERE, "draft.py"), "--bout", a.bout, "--a", a.a, "--b", a.b,
           "--feud", a.feud, "--round", a.round, "--model", a.model)
        brief_path = os.path.join(HERE, "briefs", "%s_r%s.json" % (a.bout, a.round))
    else:
        print("=== 1/4 draft skipped（用现成 brief）===")

    print("=== 2/4 produce（Replicate，带 --qc 一致性门）===")
    pargs = [os.path.join(HERE, "produce.py"), "--brief", brief_path, "--qc"]
    if a.execute:
        pargs += ["--execute"]
        if a.yes:
            pargs += ["--yes"]
    sh(*pargs)

    if a.execute and a.yes:
        print("=== 3/4 QC 门（装配前强制检查）===")
        qc_gate(brief_path)
        print("=== 4/4 assemble（ffmpeg）===")
        sh(os.path.join(HERE, "assemble.py"), "--brief", brief_path, "--format", a.format)
    else:
        print("=== 3/4 QC 门 skipped（dry-run）===")
        print("=== 4/4 assemble skipped（dry-run）===")
        print("真跑：加 --execute --yes")


if __name__ == "__main__":
    main()
