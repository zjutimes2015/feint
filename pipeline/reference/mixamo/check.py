#!/usr/bin/env python3
"""动作库校验：FBX 源文件齐不齐、mp4 底片渲了没。

单一事实源是 pipeline/assets/mixamo/manifest.json（v3 起），
不再从 reference/mixamo/ 另开一份清单，避免两处漂移。

用法：
    python3 pipeline/reference/mixamo/check.py          # 查 FBX + mp4
    python3 pipeline/reference/mixamo/check.py --fbx-only

退出码 0 = 全齐；1 = 有缺失。
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(os.path.dirname(HERE))
MANIFEST = os.path.join(PIPELINE, "assets", "mixamo", "manifest.json")


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def scan_dir(d, ext):
    if not os.path.isdir(d):
        return {}
    out = {}
    for fn in os.listdir(d):
        if not fn.lower().endswith(ext):
            continue
        out[os.path.splitext(fn)[0].lower()] = os.path.join(d, fn)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fbx-only", action="store_true", help="只查 FBX，跳过 mp4")
    a = ap.parse_args()

    man = load_manifest()
    clips = man["clips"]
    paths = man["paths"]
    fbx_dir = os.path.join(PIPELINE, paths["fbx_dir"])
    mp4_dir = os.path.join(PIPELINE, paths["mp4_dir"])

    fbx_files = scan_dir(fbx_dir, ".fbx")
    mp4_files = scan_dir(mp4_dir, ".mp4")

    print("=== BRAWLVERSE 动作库校验 ===")
    print("manifest : %s (%d clips)" % (MANIFEST, len(clips)))
    print("fbx dir  : %s" % fbx_dir)
    print("mp4 dir  : %s" % mp4_dir)

    # FBX 源文件
    by_id = {c["id"]: c for c in clips}

    def source_of(c):
        """自有 fbx → 镜像源 → 近似源；都拿不到返回 None。"""
        if c.get("fbx"):
            return c["fbx"]
        parent = c.get("mirror_of") or c.get("approx_of")
        if parent:
            return (by_id.get(parent) or {}).get("fbx")
        return None

    missing_fbx = []
    by_cat = {}
    for c in clips:
        by_cat.setdefault(c["category"], []).append(c)
        src = source_of(c)
        if not src:
            missing_fbx.append((c["id"], "manifest 未声明 fbx（也无 mirror_of/approx_of）"))
            continue
        stem = os.path.splitext(src)[0].lower()
        if stem not in fbx_files:
            missing_fbx.append((c["id"], "缺 %s" % src))

    print("\n--- FBX 源文件 ---")
    for cat, cs in by_cat.items():
        ok = sum(1 for c in cs if (source_of(c) or "").lower().endswith(".fbx") and
                 os.path.splitext(source_of(c))[0].lower() in fbx_files)
        print("[%s] %-10s %d/%d" % ("OK " if ok == len(cs) else "缺 ", cat, ok, len(cs)))
    for cid, why in missing_fbx:
        print("       - %s：%s" % (cid, why))
    total_mb = sum(os.path.getsize(p) for p in fbx_files.values()) / 1024 / 1024
    print("已下 %d 个 FBX，共 %.1f MB" % (len(fbx_files), total_mb))

    ok = not missing_fbx
    if not a.fbx_only:
        # mp4 底片
        missing_mp4 = [c["id"] for c in clips if c["id"].lower() not in mp4_files]
        print("\n--- mp4 底片 ---")
        print("[%s] 已渲 %d/%d" % ("OK " if not missing_mp4 else "缺 ",
                                   len(clips) - len(missing_mp4), len(clips)))
        for cid in missing_mp4:
            print("       - 缺 %s.mp4" % cid)
        ok = ok and not missing_mp4

    if not ok:
        print("\n下一步：")
        if missing_fbx:
            print("  按 pipeline/reference/mixamo/FETCH_GUIDE.md 补下缺失 FBX")
        if not a.fbx_only and missing_mp4:
            print("  blender --background pipeline/blender/brawlverse_template.blend \\")
            print("    --python pipeline/blender/batch_render.py -- \\")
            print("    pipeline/assets/mixamo/fbx pipeline/assets/mixamo/mp4")
        sys.exit(1)

    print("\n全齐。下一步：python3 pipeline/round.py --help")


if __name__ == "__main__":
    main()
