# Mixamo 动作库下载指南（v2）

> 目标：把 `manifest.json` 里 27 个逻辑动作变成 `pipeline/assets/mixamo/mp4/*.mp4`，
> 供 `produce.py` / `round.py` 当 `segment.reference` 用。
> 全程在**你自己的电脑**上做（mixamo.com 要 Adobe 账号登录，自动化做不了）。

**v2 的变化**：目录契约变了、清单合并到 `pipeline/assets/mixamo/manifest.json`、
并且有两个动作是"镜像生成"而不是重新下载。

## 1. 登录（2 分钟）

打开 https://www.mixamo.com ，用 Adobe 账号登录（没有就免费注册一个）。

## 2. 角色：直接用自带的

点顶部 **Characters**，选一个默认角色（推荐 **X Bot** 或 **Y Bot**，体型接近拳手）。
v1 只是要"动作底片"，不追求拳手本人长相——自有拳手模型重定向是 P1 的事。

## 3. 下动作（约 30–45 分钟）

对 `manifest.json` 里每个 clip：

1. 点顶部 **Animations**，用 `keywords` 搜（英文关键词，试 2–3 个）。
2. 点开预览，挑**格斗/拳击风格**的版本（别下成跳舞的）。
3. 点 **DOWNLOAD**，下载设置按下面来：

| 项 | 选什么 |
|---|---|
| Format | **FBX Binary (.fbx)** |
| Skin | **With Skin** |
| Frames per second | **30** |
| In Place | movement 类（move_advance/retreat/circle）**必勾**；其余按 MANIFEST 的 `in_place` 来 |

4. 改名：`<id>.fbx`（如 `strike_jab.fbx`），放到 `pipeline/assets/mixamo/fbx/`。

### 镜像动作不用下载

MANIFEST 里 `mirror_of` 非空的 clip，源文件已在库里，渲染时自动 X 轴翻转生成：

| clip | 源文件 |
|---|---|
| `defense_dodge_l` | `defense_dodge_r.fbx` |

`strike_hook` / `strike_hook_b` 是左右两个不同的原始动作（不是镜像），要分开下。

## 4. 校验（1 分钟）

```bash
python3 pipeline/reference/mixamo/check.py --fbx-only
```

全绿才算下齐；缺哪个会列出来，回第 3 步补。

## 5. 渲染成 mp4

```powershell
# 4 进程并行（本机只有 Intel 集显，串行 40 分钟）
powershell -ExecutionPolicy Bypass -File pipeline/blender/render_all.ps1 -Jobs 4
```

首次使用需要生成场景模板：

```powershell
& "E:\blender-tool\blender-4.5.15-windows-x64\blender.exe" --background --factory-startup `
  --python pipeline/blender/setup_scene.py -- pipeline/blender/brawlverse_template.blend
```

输出 `pipeline/assets/mixamo/mp4/<id>.mp4`。FBX 源文件和 mp4 都不进 git（见 `.gitignore`）。

## 6. 接入管线

`round.py` 会自动按战术序列挑底片，不用手填路径：

```bash
python3 pipeline/round.py --bout qf1 --round 1 \
    --tactic-a heavy --tactic-b dodge --fighter "IRON JAW"
```

## 已知缺口

| 动作 | 现状 |
|---|---|
| `defense_clinch`（缠抱） | Mixamo 站内无此动作，用 `defense_block.fbx` 近似（MANIFEST 已标 `approximate`） |
| `react_knockdown` | 用 `react_body_hit.fbx` 近似；真实动作需补下 "Livershot Knockdown"（唯一结果） |

## 常见坑

- **搜不到想要的**：换关键词，或用相近动作代替（左右勾拳互为镜像，Blender 里 Scale X = -1）。
- **动作带位移乱飘**：下载时没勾 In Place，重下。
- **文件巨大**：With Skin 的 FBX 单个 5–20MB 正常；放本地别提交。
- **渲染很慢**：EEVEE 在 Intel 集显上约 3 秒/帧；用 `render_all.ps1` 并行，别用 Cycles。
