"""
BRAWLVERSE Blender 渲染模板场景一键生成。

用法（现在支持 headless，无需开 GUI）：
  blender --background --factory-startup --python setup_scene.py -- \
    <输出 blend 路径>

生成：暗场 + 拳台地面 + 暖主光 + 冷轮廓光 + 3/4 转播机位
      + EEVEE 引擎 + 720p/24fps/H.264

为什么用 EEVEE：本机只有 Intel 集显，Cycles CPU 渲染 3.6s/帧，
27 个动作要 3 小时；EEVEE 快 20 倍以上。底片只是给 AI 换角色用的
运动参考，不需要路径追踪级别的画质。

为什么背景要暗：wan-2.2-animate-replace 需要清晰的"人体 + 动作"轮廓，
背景越干净、越暗，AI 换角色越不容易串味。
"""
import math
import os
import sys

import bpy

# ---- 清场 ----
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# ---- 世界：纯黑（干净背景，利于换角色） ----
world = bpy.data.worlds.new("BV_World")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.005, 0.005, 0.006, 1)
bpy.context.scene.world = world

# ---- 地面：暗色拳台（只留一点反光，让脚不悬空） ----
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.active_object
floor.name = "BV_Floor"
mat = bpy.data.materials.new("BV_FloorMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.015, 0.015, 0.018, 1)
bsdf.inputs["Roughness"].default_value = 0.7
floor.data.materials.append(mat)

# ---- 相机：3/4 转播机位 ----
bpy.ops.object.camera_add(location=(4.2, -4.8, 1.7))
cam = bpy.context.active_object
cam.name = "BV_Cam"
bpy.ops.object.empty_add(location=(0, 0, 1.0))
tgt = bpy.context.active_object
tgt.name = "BV_Target"
con = cam.constraints.new(type='TRACK_TO')
con.target = tgt
con.track_axis = 'TRACK_NEGATIVE_Z'
con.up_axis = 'UP_Y'
cam.data.lens = 50
bpy.context.scene.camera = cam

# ---- 灯光 ----
# 主光：暖色，右前上
bpy.ops.object.light_add(type='AREA', location=(3, -3, 4))
key = bpy.context.active_object
key.name = "BV_Key"
key.data.energy = 900
key.data.color = (1.0, 0.92, 0.82)
key.data.size = 3
# 轮廓光：冷色，左后（拳击转播感的关键，也是换角色时勾轮廓的依据）
bpy.ops.object.light_add(type='SPOT', location=(-3.5, 3.5, 3))
rim = bpy.context.active_object
rim.name = "BV_Rim"
rim.data.energy = 2200
rim.data.color = (0.55, 0.75, 1.0)
rim.data.spot_size = math.radians(60)
con2 = rim.constraints.new(type='TRACK_TO')
con2.target = tgt
con2.track_axis = 'TRACK_NEGATIVE_Z'
con2.up_axis = 'UP_Y'
# 顶光：弱，压住头顶
bpy.ops.object.light_add(type='AREA', location=(0, 0, 5))
top = bpy.context.active_object
top.name = "BV_Top"
top.data.energy = 220
top.data.color = (0.9, 0.95, 1.0)

# ---- 渲染设置：EEVEE / 720p / 24fps / H.264 ----
s = bpy.context.scene
s.render.engine = "BLENDER_EEVEE_NEXT"
try:
    s.eevee.taa_render_samples = 32
except Exception:
    pass
s.render.resolution_x = 1280
s.render.resolution_y = 720
s.render.resolution_percentage = 100
s.render.film_transparent = False
s.render.image_settings.file_format = 'FFMPEG'
s.render.ffmpeg.format = 'MPEG4'
s.render.ffmpeg.codec = 'H264'
s.render.ffmpeg.constant_rate_factor = 'MEDIUM'
s.render.ffmpeg.ffmpeg_preset = 'GOOD'
s.render.ffmpeg.video_bitrate = 6000
s.render.ffmpeg.audio_codec = 'AAC'
s.render.fps = 24
s.view_settings.view_transform = 'Filmic'
s.view_settings.look = 'Medium Contrast'

# ---- 存盘 ----
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[0] if argv else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "brawlverse_template.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("BRAWLVERSE 模板就绪 -> " + out)
