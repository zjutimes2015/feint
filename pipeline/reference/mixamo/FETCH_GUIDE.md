# Mixamo 动作库下载指南（v1）

> 目标：把 `MANIFEST.json` 里 27 个动作下齐，变成 `reference/mixamo/*.mp4`，供 `produce.py` / `round.py` 当 `segment.reference` 用。
> 全程在**你自己的电脑**上做（mixamo.com 要 Adobe 账号登录，自动化做不了）。

## 1. 登录（2 分钟）

打开 https://www.mixamo.com ，用 Adobe 账号登录（没有就免费注册一个）。

## 2. 角色：直接用自带的（v1 不用自传）

点顶部 **Characters**，选一个默认角色（推荐 **X Bot** 或 **Y Bot**，体型接近拳手）。
v1 只是要"动作底片"，不追求拳手本人长相——自有拳手模型重定向是 P1 的事。

## 3. 下动作（约 30–45 分钟）

对 `MANIFEST.json` 里每个 clip：

1. 点顶部 **Animations**，用 `keywords` 搜（英文关键词，试 2–3 个）。
2. 点开预览，挑**格斗/拳击风格**的版本（别下成跳舞的）。
3. 点 **DOWNLOAD**，下载设置按下面来：

| 项 | 选什么 |
|---|---|
| Format | **FBX Binary (.fbx)** |
| Skin | **With Skin** |
| Frames per second | **30** |
| In Place | movement 类（move_advance/retreat/circle）**必勾**；其余按 MANIFEST 的 `in_place` 来 |

4. 改名：`<id>.fbx`（如 `strike_jab.fbx`），放到本仓库 `pipeline/reference/mixamo/fbx/`。

## 4. 校验（1 分钟）

```bash
cd <仓库根>
python3 pipeline/reference/mixamo/check.py
```

全绿才算下齐；缺哪个会列出来，回第 3 步补。

## 5. 渲染成 mp4（Blender，有就跑）

```bash
# 5.1 生成模板场景（Blender → Scripting 面板 → 打开 pipeline/blender/setup_scene.py → Run Script → 另存为 brawlverse_template.blend）
# 5.2 批量渲染（不用开界面）
blender --background brawlverse_template.blend \
  --python pipeline/blender/batch_render.py \
  -- pipeline/reference/mixamo/fbx pipeline/reference/mixamo
```

输出 `reference/mixamo/<id>.mp4`。FBX 源文件和 mp4 都不进 git（已在 `.gitignore`），只在你本地。

## 6. 接入管线

在 bout brief 的 `segment.reference` 里填路径，如：

```json
{ "segment": "qf1_r1_combo", "reference": "reference/mixamo/strike_cross.mp4" }
```

`produce.py` / `round.py` 会自动处理。Friday Fight Night 分支预渲染示例见 `pipeline/README.md`。

## 常见坑

- **搜不到想要的**：换关键词，或用相近动作代替（如没有左勾拳就用右勾拳镜像——Blender 里 Scale X = -1）。
- **动作带位移乱飘**：下载时没勾 In Place，重下。
- **文件巨大**：With Skin 的 FBX 单个 5–20MB 正常；27 个约 200–400MB，放本地别提交。
