# BRAWLVERSE 单集生产管线

脑（OpenRouter，便宜）→ 手（Replicate，大头）→ 合成（ffmpeg，免费）→ 手动发布（App 内配热门 BGM）。

## 前置

| 变量/条件 | 用途 | 状态 |
|---|---|---|
| `OPENROUTER_API_KEY` | draft 生成剧本 | 待用户给 key |
| Replicate connector | produce 跑模型 | 已接，余额 0 |
| 实拍动作库 | fight 片段的 `reference` | 待建（手机拍） |

## 跑法

```bash
cd pipeline

# 1. 只出剧本（几分钱），先看反转行不行
OPENROUTER_API_KEY=sk-... python3 draft.py --bout qf1 --a "IRON JAW" --b "VIPER" \
    --feud "VIPER 在 EP0 反击 KO 了 JAW，JAW 走复仇线"

# 2. 看执行计划+估算（不花钱）
python3 produce.py --brief briefs/qf1_r1.json

# 3. 一键全跑（真花钱，需二次确认）
python3 run_episode.py --bout qf1 --a "IRON JAW" --b "VIPER" \
    --feud "VIPER 在 EP0 反击 KO 了 JAW，JAW 走复仇线" --execute --yes
```

## 模型清单（输入 schema 2026-10-31 实锤）

| 环节 | 模型 | 输入 | 单价 |
|---|---|---|---|
| 定妆照 | google/nano-banana-2.1 | prompt/aspect_ratio=3:4 | ~$0.05/张 |
| 正赛 | wan-video/wan-2.2-animate-replace | video/character_image/resolution=720p | $0.08/s |
| 配音 | inworld/realtime-tts-2 | text/language=en | ~$0.005/s |
| 采访动起来 | cjwbw/sadtalker | driven_audio/source_image | ~$0.02/s |
| 对嘴型（可选） | sync/lipsync-2-pro | audio/video | ~$0.05/s |
| 收尾超分 | bria/video-increase-resolution | video_url/desired_increase=2x | ~$0.03/s |

定妆照缓存于 `assets/portraits/`（缺啥补啥，不重复花钱）。
本地文件自动经中转存储转公网 URL（48h 有效，跑单够用）。

## 数据回流（飞轮）

`vercel-app` 的 votes/bets/播放数据 → 下次 draft 时把"上期观众最吃哪段"喂给 OpenRouter → 剧本自动调优。效果数据→内容，这就是护城河。

## 安全

- 默认 dry-run；`--execute` 必须配 `--yes`，防手滑。
- 执行前自动查 Replicate 余额。
- BGM 永不在管线里加（平台热门曲库铁律）。

## 实拍动作库（reference/）

| 来源 | 目录 | 说明 |
|---|---|---|
| Mixamo 渲染（首选） | `reference/mixamo/` | mixamo.com 免费下 FBX（jab/cross/hook/uppercut 全套，商用免费），Blender 渲染成 mp4 |
| CC0 素材 | `reference/cc0/` | Pexels/Pixabay/Mixkit，搜 boxing training |
| 自拍 | `reference/shot/` | 手机拍，版权最干净 |

**Mixamo 流程（已定，2026-11-02）**：27 个必下动作清单见 `pipeline/reference/mixamo/MANIFEST.json`（站架/位移/打击/防守/受击/表演 6 类）；
下载步骤见 `pipeline/reference/mixamo/FETCH_GUIDE.md`（mixamo.com，Adobe 账号免费，FBX Binary + With Skin + 30fps，位移类勾 In Place）；
下完跑 `python3 pipeline/reference/mixamo/check.py` 验收。FBX/mp4 二进制不进仓（见 `.gitignore`）。

选定底片后，在 brief 的 segment.reference 里填路径或 URL，`produce.py` 会自动处理。
详见《BRAWLVERSE-实拍动作库方案-v1.0》。

## Friday Fight Night（Phase B）
- `round.py`：分支预渲染——投票窗口内把 2 个战术分支都生成好，播胜者。
  `python3 round.py --bout qf1 --round 1 --tactic-a heavy --tactic-b dodge --fighter "IRON JAW" --reference reference/mixamo/qf1_combo.mp4`
  默认 dry-run；`--execute --yes` 才花钱。输出 `rounds/<bout>-r<round>_{a,b}.mp4`，传公网 URL 后填到 `/api/admin/live`。
- `b0_latency.py`：B0 延迟实测（p50/p95），决定真实时路线是否可行。需 Replicate 余额，余额 0 时直接报 BLOCKED。

## 角色一致性（P0 杀线机制，2026-11-02）

定妆照没被锁死、生成参数没被锁死、错了没人喊卡——补 5 个机制：

1. **Character Bible**：`pipeline/assets/fighters/<slug>/character.json`——`dna` 一句话锁死脸/发型/手套/短裤/纹身，`seed` 固定；`locked:true` 后人工不再改。DNA 来自 `draft.py` FIGHTERS（唯一作者源）。
2. **锚点锁死**：sadtalker `source_image` 与 wan-2.2 `character_image` 永远走 `produce.py::anchor_portrait()`（读 character.json → portraits.front，兜底旧单张 `assets/portraits/<F>.png`），不许各处硬编码路径。
3. **一致性门**：`pipeline/qc.py`——抽首/中/尾 3 帧，OpenRouter 视觉模型（默认 `google/gemini-2.5-flash`，`QC_MODEL` 可换）对比定妆照；fail 自动重跑≤2 次，废片移出装配（`.qc_failed`）。`run_episode.py` 装配前强制过门。
4. **连续性表**：`briefs/<bout>_continuity.json`——伤痕/破衣/血迹只增不减，`draft.py` 每轮读入上一轮、输出本轮新增。
5. **DNA 锁死模板**：所有生成 prompt 末尾逐字追加 dna；wan-2.2 传拳手固定 seed。注意 nano-banana-2.1 **没有** seed 参数（schema 实锤），定妆锁靠 DNA 逐字 + 正面照作 image_input 参考。

定妆照生成（用户跑，一次性约 $1.2，需 Replicate 余额）：

```bash
cd pipeline
python3 gen_portraits.py                 # dry-run：打印计划+估算
python3 gen_portraits.py --execute --yes # 真跑：8 拳手 × 3 视图，写回 character.json 并锁定
```
