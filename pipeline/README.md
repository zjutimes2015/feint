# BRAWLVERSE 单集生产管线

脑（OpenRouter，便宜）→ 手（Replicate，大头）→ 合成（ffmpeg，免费）→ 手动发布（App 内配热门 BGM）。

## 两条出片链路的分工（重要）

| 镜头类型 | 走哪条链路 | 为什么 |
|---|---|---|
| 包装镜头（冷开场/英雄登场/赛果卡/出场/尾卡） | **AdaptLane**（文生视频） | 纯环境与人物特写，不需要动作库，文字描述足够 |
| 对打镜头（真正交手） | **动作库底片 + wan-2.2 换角色** | 只有这一段需要真实格斗动作，文字生成会飘 |

站内的 shot 级路由在 `src/lib/brawlverse/render-plan.ts`：每个 shot 声明 `provider`（`adaptlane` / `action`）+ `action_id`。
`provider=adaptlane` 的镜头由 `src/lib/brawlverse/adaptlane.ts` 提交；`provider=action` 的镜头由本目录的 pipeline 生成。

**战术投票真的影响成片**：战术决定动作序列（`manifest.json` 的 `tactic_sequences`），两条分支用不同的动作序列与不同的底片，不是同一段视频换个标签。

## 目录契约（唯一事实源）

```
pipeline/assets/mixamo/
  manifest.json      ← 动作库单一事实源（id / fbx / mirror_of / move_ids / tactics / tactic_sequences）
  fbx/               ← FBX 源文件（不进 git）
  mp4/               ← 渲染出的底片（不进 git）
pipeline/blender/
  brawlverse_template.blend   ← 场景模板（灯光/机位/渲染设置）
  setup_scene.py              ← 模板生成脚本（headless 可跑）
  render_one.py               ← 渲染单个 clip
  render_all.ps1              ← 多进程并行渲染全库
```

校验：

```bash
python3 pipeline/reference/mixamo/check.py          # FBX + mp4 一起查
python3 pipeline/reference/mixamo/check.py --fbx-only
```

## 前置

| 变量/条件 | 用途 | 状态 |
|---|---|---|
| `REPLICATE_API_TOKEN` | 跑 Replicate 模型 | **已配**（2026-11-08 验证账号 zjutimes2015） |
| `OPENROUTER_API_KEY` | draft 生成剧本 + QC 一致性门 | **已配**（2026-11-08，QC 已实跑） |
| `FEINT_PRESIGN_URL` / `FEINT_ADMIN_TOKEN` | 成片直传自己的 R2 | 可选，不配则回落 Replicate files API（48h 过期） |
| Blender 4.5 LTS | 渲染底片 | 已装于 `E:\blender-tool\blender-4.5.15-windows-x64` |
| 实拍动作库 | fight 片段的 `reference` | **已建**：24 个 FBX → 27 个逻辑动作 |

## 跑法

```bash
cd pipeline

# 1) 只出剧本（几分钱）
OPENROUTER_API_KEY=sk-... python3 draft.py --bout qf1 --a "IRON JAW" --b "VIPER" \
    --feud "VIPER 在 EP0 反击 KO 了 JAW，JAW 走复仇线"

# 2) 看执行计划+估算（不花钱）
python3 produce.py --brief briefs/qf1_r1.json

# 3) 一键全跑（真花钱，需二次确认）
python3 run_episode.py --bout qf1 --a "IRON JAW" --b "VIPER" \
    --feud "..." --execute --yes
```

### 渲染动作底片（一次性，永久资产）

```powershell
# Windows：4 进程并行（本机只有 Intel 集显，串行要 40 分钟）
powershell -ExecutionPolicy Bypass -File pipeline/blender/render_all.ps1 -Jobs 4

# 重新生成场景模板（改了灯光/机位才需要）
& "E:\blender-tool\blender-4.5.15-windows-x64\blender.exe" --background --factory-startup \
  --python pipeline/blender/setup_scene.py -- pipeline/blender/brawlverse_template.blend
```

### 换角色最小验证（**先跑这个**，约 $0.3）

```bash
python3 verify_swap.py                     # 打印计划，不花钱
python3 verify_swap.py --execute --yes     # 真跑：渲 1 段换角色 + 自动一致性门 + 抽 3 帧
```

这一步验证的是整条路线的核心假设：Mixamo 底片经 wan-2.2 换成拳手定妆照后，
手部/手套/躯干比例是否守恒。**不通过就换路线，别往下走。**

## 模型清单（输入 schema 2026-10-31 实锤）

| 环节 | 模型 | 输入 | 单价 |
|---|---|---|---|
| 定妆照 | google/nano-banana-2.1 | prompt/aspect_ratio=3:4 | ~$0.05/张 |
| 正赛换角 | wan-video/wan-2.2-animate-replace | video/character_image/resolution=720 | $0.08/s |
| 配音 | inworld/realtime-tts-2 | text/language=en | ~$0.005/s |
| 采访动起来 | cjwbw/sadtalker | driven_audio/source_image | ~$0.02/s |
| 对嘴型（可选） | sync/lipsync-2-pro | audio/video | ~$0.05/s |
| 收尾超分 | bria/video-increase-resolution | video_url/desired_increase=2x | ~$0.03/s |

定妆照缓存于 `assets/fighters/<slug>/`（3 视图 + character.json 锁死）。

### 成本量级（周更可持续性）

| 场景 | 估算 |
|---|---|
| 一集 3 分钟完整管线 | ≈ $24（换角色 14.4 + 超分 5.4 + 采访动 3.6 + 配音 0.9） |
| 周更一年（52 集） | ≈ $1,250 |
| 单回合 2 分支预渲染 | ≈ $4.5 |

降本手段：720p 不超分（省 45%）、单分支不做预渲染、缩短镜头时长。
**质量门比产量重要**——宁可每周一集精品。

## Friday Fight Night（分支预渲染）

```bash
python3 round.py --bout qf1 --round 1 --tactic-a heavy --tactic-b dodge \
    --fighter "IRON JAW"
# 默认 dry-run；--execute --yes 才花钱
```

输出 `rounds/<bout>-r<round>_{a,b}.mp4`，上传后：

```bash
POST /api/content  {"id":"branch:qf1:r1:heavy","kind":"branch","tactic":"heavy",
                    "video_url":"<公网绝对地址>","status":"published"}
```

`/episodes` 与 `/live` 共用 `content_items` 这张内容库。

## 角色一致性（P0 杀线机制）

1. **Character Bible**：`pipeline/assets/fighters/<slug>/character.json`——`dna` 一句话锁死脸/发型/手套/短裤/纹身，`seed` 固定；`locked:true` 后人工不再改。
2. **锚点锁死**：sadtalker `source_image` 与 wan-2.2 `character_image` 永远走 `produce.py::anchor_portrait()`。
3. **一致性门**：`pipeline/qc.py`——抽首/中/尾 3 帧，每帧再裁一张近景（`CLOSEUP_FILTER`，按 arena 固定机位标定）送 OpenRouter 视觉模型对比定妆照。判定三态：`match` / `mismatch` / `unverifiable`，**只有 mismatch 才 FAIL**（看不清不算失败），fail 自动重跑≤2 次，废片移出装配（`.qc_failed`）。全景镜头里脸只有 20~30px，不裁近景必然误判——2026-11-08 实测：同一支写实成片，裁近景前判 FAIL，裁近景后判 UNKNOWN 放行；插画版对照仍判 FAIL（短裤/纹身不符）。
4. **连续性表**：`briefs/<bout>_continuity.json`——伤痕/破衣/血迹只增不减。
5. **DNA 锁死模板**：所有生成 prompt 末尾逐字追加 dna；wan-2.2 传拳手固定 seed。
6. **写实基准（2026-11-08 实测）**：定妆照必须是摄影写实风，不能是插画。wan-2.2 会把
   `character_image` 的质感照搬到成片——插画锚点换出来的成片是另一个人（脸全变），
   写实锚点换出来才和角色卡同一个人。`PORTRAIT_PROMPT` 已锁成 85mm 棚拍写实。
   代价：`profile.png` / `three_quarter.png` 仍是旧插画版，仅 `front.png`（视频锚点）已换写实。

## 数据回流（飞轮）

`/live` 投票 → 下一集战术（`brief.ts` 的 `resolveTactic` 读上一场胜出战术）→ 该战术的动作序列 → 成片。
观众的选择真的改变下一集画面，这是效果数据 → 内容的飞轮。

## 安全

- 默认 dry-run；`--execute` 必须配 `--yes`，防手滑。
- BGM 永不在管线内加（平台热门曲库铁律）。
- 成片必须落自己的 R2：Replicate 中转 URL 48h 过期。
