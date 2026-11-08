"""
批量渲染：按 manifest.json 把 FBX 渲成 mp4（用模板的灯光机位）。

manifest 驱动，不再靠文件名猜：
  - clip.fbx 决定用哪个源文件
  - clip.mirror_of 非空 → 渲染后 Scale X=-1 生成镜像版本
  - clip.approx_of 非空 → 用另一个 clip 的源文件近似代替（已在 manifest 标注）

用法（不用开 Blender 界面）：
  blender --background pipeline/blender/brawlverse_template.blend \
    --python pipeline/blender/batch_render.py -- \
    pipeline/assets/mixamo/fbx pipeline/assets/mixamo/mp4
"""
import json
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
FBX_DIR, OUT_DIR = argv[0], argv[1]
MANIFEST = os.path.join(os.path.dirname(FBX_DIR), "manifest.json")

# 模板里的东西（灯光/相机/地面），导入后只删角色
TEMPLATE_OBJS = set(bpy.data.objects[:])
KEEP = ("BV_Cam", "BV_Target", "BV_Floor", "BV_Key", "BV_Rim", "BV_Top")


def clear_imported():
    for o in list(bpy.data.objects):
        if o not in TEMPLATE_OBJS and o.name not in KEEP:
            bpy.data.objects.remove(o, do_unlink=True)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)


def render_clip(fbx_path, out_path, mirror=False):
    """导入一个 FBX，按其动作帧范围渲成 mp4。mirror=True 时 X 轴翻转。"""
    clear_imported()
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    actions = list(bpy.data.actions)
    if not actions:
        print("SKIP (no action): " + fbx_path)
        return False

    if mirror:
        # 镜像动作：翻转 X 轴，让左勾拳变右勾拳
        for act in actions:
            for fc in act.fcurves:
                for kp in fc.keyframe_points:
                    if fc.data_path in ("location", "rotation_euler"):
                        kp.co.x = -kp.co.x
        for o in bpy.data.objects:
            if o.type == "ARMATURE":
                o.scale.x = -1

    fr = actions[0].frame_range
    sc = bpy.context.scene
    sc.frame_start = int(fr[0])
    sc.frame_end = int(fr[1])
    sc.render.filepath = out_path
    print("RENDER %s frames %d-%d mirror=%s" %
          (os.path.basename(out_path), sc.frame_start, sc.frame_end, mirror))
    bpy.ops.render.render(animation=True)
    return os.path.exists(out_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(MANIFEST, encoding="utf-8") as f:
        clips = json.load(f)["clips"]
    by_id = {c["id"]: c for c in clips}

    done = 0
    skipped = 0
    for c in clips:
        cid = c["id"]
        out = os.path.join(OUT_DIR, cid + ".mp4")
        if os.path.exists(out):
            print("EXISTS %s" % cid)
            skipped += 1
            continue

        # 源文件优先级：自有 fbx → 镜像源 → 近似源
        src = c.get("fbx")
        parent = c.get("mirror_of") or c.get("approx_of")
        if not src and parent:
            src = by_id.get(parent, {}).get("fbx")
        if not src:
            print("SKIP (no fbx declared): " + cid)
            continue
        fbx_path = os.path.join(FBX_DIR, src)
        if not os.path.exists(fbx_path):
            print("SKIP (missing fbx): %s -> %s" % (cid, fbx_path))
            continue

        mirror = bool(c.get("mirror_of"))
        if render_clip(fbx_path, out, mirror=mirror):
            done += 1
        else:
            print("FAILED: " + cid)

    print("done -> %s (rendered %d, skipped %d)" % (OUT_DIR, done, skipped))


main()
