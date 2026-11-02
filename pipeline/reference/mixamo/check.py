#!/usr/bin/env python3
"""
Mixamo 动作库校验：MANIFEST.json 里要的动作，fbx/ 里下齐了没。

用法：
    python3 pipeline/reference/mixamo/check.py

退出码 0 = 齐了；1 = 有缺失。
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "MANIFEST.json")
FBX_DIR = os.path.join(HERE, "fbx")


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)["clips"]


def scan_fbx():
    found = {}
    total_bytes = 0
    if not os.path.isdir(FBX_DIR):
        return found, total_bytes
    for fn in os.listdir(FBX_DIR):
        if not fn.lower().endswith(".fbx"):
            continue
        stem = os.path.splitext(fn)[0].lower()
        path = os.path.join(FBX_DIR, fn)
        total_bytes += os.path.getsize(path)
        # 文件名以 clip id 开头即算命中（如 strike_jab_v2.fbx）
        for clip in CLIPS:
            cid = clip["id"].lower()
            if stem == cid or stem.startswith(cid + "_") or stem.startswith(cid + "-"):
                found[cid] = fn
                break
    return found, total_bytes


CLIPS = load_manifest()
found, total_bytes = scan_fbx()

missing = [c for c in CLIPS if c["id"].lower() not in found]
by_cat = {}
for c in CLIPS:
    by_cat.setdefault(c["category"], []).append(c)

print("=== Mixamo 动作库校验 ===")
print(f"fbx 目录：{FBX_DIR}（{'存在' if os.path.isdir(FBX_DIR) else '不存在，先建目录再下载'}）")
for cat, clips in by_cat.items():
    ok = sum(1 for c in clips if c["id"].lower() in found)
    mark = "OK " if ok == len(clips) else "缺 "
    print(f"[{mark}] {cat}: {ok}/{len(clips)}")
    for c in clips:
        if c["id"].lower() not in found:
            print(f"       - 缺 {c['id']}  （搜：{', '.join(c['keywords'])}）")

print(f"\n已下 {len(found)}/{len(CLIPS)}，共 {total_bytes / 1024 / 1024:.1f} MB")
if missing:
    print("\n下一步：按 pipeline/reference/mixamo/FETCH_GUIDE.md 第 3 步补下缺失动作。")
    sys.exit(1)
print("\n全齐。下步渲染：")
print("  blender --background brawlverse_template.blend --python pipeline/blender/batch_render.py -- pipeline/reference/mixamo/fbx pipeline/reference/mixamo")
