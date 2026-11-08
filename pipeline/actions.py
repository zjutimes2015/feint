#!/usr/bin/env python3
"""动作库解析器：引擎招式 / 回合事件 / 连招 → FBX 与渲染 mp4 路径。

唯一真源是 pipeline/assets/mixamo/manifest.json（v3）；本模块只读它，不另存
映射。round.py 的战术序列也走同一张表。

用法：
    python3 pipeline/actions.py --list
    python3 pipeline/actions.py --move jab cross hook
    python3 pipeline/actions.py --event knockdown
    python3 pipeline/actions.py --combo opening_combo
    python3 pipeline/actions.py --check        # 声明与磁盘是否一致（同 check.py）
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "assets", "mixamo", "manifest.json")


def load_manifest():
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        return json.load(f)


MANIFEST = load_manifest()
PATHS = MANIFEST.get("paths") or {}
FBX_DIR = os.path.join(HERE, PATHS.get("fbx_dir", "assets/mixamo/fbx"))
MP4_DIR = os.path.join(HERE, PATHS.get("mp4_dir", "assets/mixamo/mp4"))
CLIPS = {c["id"]: c for c in MANIFEST["clips"]}


def clip(clip_id):
    try:
        return CLIPS[clip_id]
    except KeyError:
        raise ValueError(f"未知 clip：{clip_id}") from None


def source_fbx(clip_id):
    """自有 fbx → 镜像源 → 近似源；都拿不到就报错。"""
    c = clip(clip_id)
    name = c.get("fbx")
    if not name:
        parent = c.get("mirror_of") or c.get("approx_of")
        if not parent:
            raise ValueError(f"clip 无可用源文件：{clip_id}")
        name = clip(parent).get("fbx")
        if not name:
            raise ValueError(f"clip 的源 {parent} 也没有 fbx：{clip_id}")
    return os.path.join(FBX_DIR, name)


def rendered_mp4(clip_id, render_dir=None):
    """Blender 批量渲染后的 mp4 路径（产物名 = clip id）。"""
    return os.path.join(render_dir or MP4_DIR, clip_id + ".mp4")


def resolve_move(move_id):
    moves = MANIFEST["moves"]
    if move_id not in moves:
        raise ValueError(f"未知招式：{move_id}（引擎 MoveId 见 src/lib/arena/engine.ts）")
    ref = moves[move_id]
    return dict(ref, clip_info=CLIPS[ref["clip"]])


def resolve_event(event):
    events = MANIFEST["events"]
    if event not in events:
        raise ValueError(f"未知事件：{event}")
    ref = events[event]
    return dict(ref, clip_info=CLIPS[ref["clip"]])


def resolve_combo(name):
    combos = MANIFEST["combos"]
    if name not in combos:
        raise ValueError(f"未知连招：{name}（可选：{', '.join(combos)}）")
    return [CLIPS[c] for c in combos[name]["clips"]]


def resolve_sequence(tokens):
    """招式/事件/clip id 混排的序列 → clip 清单。"""
    out = []
    for tok in tokens:
        if tok in MANIFEST["moves"]:
            cid = resolve_move(tok)["clip"]
        elif tok in MANIFEST["events"]:
            cid = resolve_event(tok)["clip"]
        elif tok in CLIPS:
            cid = tok
        else:
            raise ValueError(f"未知招式/事件/clip：{tok}")
        out.append(CLIPS[cid])
    return out


def check():
    """声明与磁盘是否一致；返回问题清单（空 = 一致）。"""
    problems = []
    for c in MANIFEST["clips"]:
        try:
            p = source_fbx(c["id"])
        except ValueError as e:
            problems.append(str(e))
            continue
        if not os.path.exists(p):
            problems.append(f"{c['id']}: 缺源文件 {os.path.relpath(p, HERE)}")
    on_disk = {f for f in os.listdir(FBX_DIR)
               if f.lower().endswith(".fbx")} if os.path.isdir(FBX_DIR) else set()
    listed = {c["fbx"] for c in MANIFEST["clips"] if c.get("fbx")}
    for f in sorted(on_disk - listed):
        problems.append(f"磁盘有未登记的 FBX：{f}")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="打印全部 clip 与状态")
    ap.add_argument("--move", nargs="+", help="招式，如 jab cross hook")
    ap.add_argument("--event", nargs="+", help="事件，如 knockdown")
    ap.add_argument("--combo", help="连招名，如 opening_combo")
    ap.add_argument("--check", action="store_true", help="校验声明与磁盘")
    a = ap.parse_args()

    if a.check:
        problems = check()
        if problems:
            for p in problems:
                print("! " + p)
            sys.exit(1)
        print("OK：声明与磁盘一致（%d 个 clip）" % len(MANIFEST["clips"]))
        return

    if a.list:
        for c in MANIFEST["clips"]:
            detail = c.get("fbx") or c.get("mirror_of") or c.get("approx_of") or "-"
            print("%-20s [%-8s] %s" % (c["id"], c.get("status", "?"), detail))
        return

    seq = []
    try:
        if a.move:
            seq += [resolve_move(m)["clip"] for m in a.move]
        if a.event:
            seq += [resolve_event(e)["clip"] for e in a.event]
        if a.combo:
            seq += [c["id"] for c in resolve_combo(a.combo)]
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    if not seq:
        ap.print_help()
        sys.exit(2)
    for clip_id in seq:
        c = CLIPS[clip_id]
        try:
            fbx = source_fbx(clip_id)
        except ValueError:
            fbx = "-"
        print("%-20s [%-8s] fbx=%s mp4=%s" %
              (clip_id, c.get("status", "?"), os.path.basename(fbx),
               rendered_mp4(clip_id)))


if __name__ == "__main__":
    main()
