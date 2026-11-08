"""渲染单个动作 clip(供多进程并行调用)。

用法:
  blender --background brawlverse_template.blend --python render_one.py -- \
    <fbx_dir> <out_dir> <clip_id> <fbx_name> [mirror]

设计:
  - 帧数上限 MAX_FRAMES:Mixamo 的 idle 类动作有 250 帧,作为底片只用前 3 秒,
    全渲会浪费 10 倍时间
  - 每个进程只渲一个 clip,靠外部并行提吞吐
"""
import json
import os
import sys

import bpy

MAX_FRAMES = 72  # 3 秒 @24fps
SAMPLES = 8  # 底片只做换角色的运动参考,8 采样的 EEVEE 足够;32 采样单帧慢 4 倍

argv = sys.argv[sys.argv.index("--") + 1:]
FBX_DIR, OUT_DIR, CLIP_ID, FBX_NAME = argv[0], argv[1], argv[2], argv[3]
MIRROR = len(argv) > 4 and argv[4] == "1"

TEMPLATE_OBJS = set(bpy.data.objects[:])
KEEP = ("BV_Cam", "BV_Target", "BV_Floor", "BV_Key", "BV_Rim", "BV_Top")


def clear_imported():
    for o in list(bpy.data.objects):
        if o not in TEMPLATE_OBJS and o.name not in KEEP:
            bpy.data.objects.remove(o, do_unlink=True)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, CLIP_ID + ".mp4")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print("EXISTS %s" % CLIP_ID)
        return

    clear_imported()
    fbx = os.path.join(FBX_DIR, FBX_NAME)
    bpy.ops.import_scene.fbx(filepath=fbx)

    acts = list(bpy.data.actions)
    if not acts:
        print("SKIP (no action) %s" % CLIP_ID)
        return

    if MIRROR:
        for act in acts:
            for fc in act.fcurves:
                for kp in fc.keyframe_points:
                    if fc.data_path in ("location", "rotation_euler"):
                        kp.co.x = -kp.co.x
        for o in bpy.data.objects:
            if o.type == "ARMATURE":
                o.scale.x = -1

    fr = acts[0].frame_range
    start = int(fr[0])
    end = min(int(fr[1]), start + MAX_FRAMES - 1)

    sc = bpy.context.scene
    sc.eevee.taa_render_samples = SAMPLES
    sc.frame_start = start
    sc.frame_end = end
    sc.render.filepath = out
    print("RENDER %s frames %d-%d mirror=%s" % (CLIP_ID, start, end, MIRROR))
    bpy.ops.render.render(animation=True)
    print("DONE %s" % CLIP_ID)


main()
