# BRAWLVERSE 动作库（Mixamo → 动作画面）

> 目标：引擎招式与 Mixamo FBX 动作库真正连起来，动作画面从映射读动作，
> 不再手写路径、口头约定。

## 唯一真源

**`pipeline/assets/mixamo/manifest.json`** —— 机器可读的清单，27 个 clip：

| 状态 | 含义 | 数量 |
|---|---|---|
| present | 自有 FBX，文件在 `assets/mixamo/fbx/` | 25 |
| mirror | 无独立文件，Blender 里镜像另一 clip（Scale X = -1） | 1（defense_dodge_l ← defense_dodge_r） |
| fallback | 无独立动作，画面借用另一 clip 的片段 | 1（defense_clinch ← defense_block） |

每个 clip 有：`id`、`fbx`、`category`、`status`、`wanted_id`、`engine`
（它服务的招式/事件 key）、`move_ids`（引擎 `MoveId`）、`tactics`、
`in_place`、`note`（fallback 还有 `approx_of` / `reason`）。

**TS 镜像**：
- `src/lib/arena/actions.ts` —— 招式 / 事件 / 连招 → clip 映射
- `src/lib/brawlverse/actions.ts` —— clip 目录 + `tactic_sequences`（成片消费入口）

**同步测试**：`tests/unit/lib/arena-actions.test.ts`、
`tests/unit/lib/actions.test.ts` —— 两边漂移就报错。

## 招式 → 动作覆盖表

引擎 10 招（`src/lib/arena/engine.ts` 的 `MoveId`）：

| 招式 | clip | 状态 |
|---|---|---|
| jab 刺拳 | strike_jab | ready |
| cross 直拳 | strike_cross | ready |
| hook 勾拳 | strike_hook（左）；右勾拳 strike_hook_b 在 power_combo 里 | ready |
| uppercut 上勾拳 | strike_uppercut | ready |
| body 击腹 | strike_body | ready |
| block 格挡 | defense_block | ready |
| dodge 闪避 | defense_dodge_r（右闪；左闪为其镜像） | ready |
| duck 下潜 | defense_duck | ready |
| feint 佯攻 | strike_jab（fallback：借用刺拳起手前段） | fallback |
| taunt 嘲讽 | react_taunt | ready |

回合事件（受击反应、击倒、胜负、出场、站架、移动）：

| 事件 | clip | 状态 |
|---|---|---|
| idle / idle_alt 站架 | stance_idle_a / stance_idle_b | ready |
| advance / retreat / circle_left / circle_right 移动 | move_advance / move_retreat / move_circle_l / move_circle_r | ready |
| entrance 出场 | move_swagger | ready |
| hit_head / hit_body 受击 | react_head_hit / react_body_hit | ready |
| stagger 踉跄 | react_stagger | ready |
| knockdown 击倒 | react_knockdown（Livershot Knockdown，85 帧） | ready |
| ko 倒地不起 | react_ko | ready |
| getup 读秒起身 | react_getup | ready |
| victory / defeat 胜负 | react_victory / react_defeat | ready |

标准连招（`manifest.json` 的 `combos`，也是 `actions.ts` 的 `COMBOS`）：

- **opening_combo**：`strike_jab → strike_cross → strike_hook → react_head_hit`
- **power_combo**：`strike_cross → strike_hook_b → strike_uppercut → react_stagger`

## 战术序列（投票真正生效的地方）

`manifest.json` 的 `tactic_sequences` 决定每个战术用哪 6 个动作：

| 战术 | 序列 |
|---|---|
| heavy | move_advance → strike_jab → strike_cross → strike_hook → strike_uppercut → react_head_hit |
| rage | move_circle_r → strike_jab → strike_body → strike_hook_b → strike_uppercut → react_stagger |
| dodge | move_retreat → defense_dodge_l → defense_dodge_r → defense_duck → strike_jab → react_body_hit |
| guard | stance_idle_a → defense_block → defense_clinch → move_advance → strike_jab → react_body_hit |
| fair | stance_idle_b → move_retreat → defense_block → defense_duck → strike_cross → react_head_hit |

未知战术回退 `guard`。`round.py` 与 `src/lib/brawlverse/actions.ts` 读同一张表。

## 校验（改动后必跑）

```bash
# 1. 清单 vs 磁盘（FBX + mp4）
python3 pipeline/reference/mixamo/check.py

# 2. TS 镜像 vs 清单
./node_modules/.bin/vitest run tests/unit/lib

# 3. 类型 + 构建（改了 TS 才需要）
pnpm typecheck && pnpm build
```

## 接线点（动作画面怎么消费这个库）

```
Mixamo FBX (pipeline/assets/mixamo/fbx/, 只放本地)
  → Blender 并行渲染 (pipeline/blender/render_all.ps1 → render_one.py)
  → mp4 底片 (pipeline/assets/mixamo/mp4/, 只放本地)
  → round.py / produce.py 的 segment.reference
  → wan-2.2-animate-replace 换角色成片
  → R2 presigned 直传 → content_items → /episodes
```

1. **渲染**：`powershell -File pipeline/blender/render_all.ps1 -Jobs 4`
   （manifest 驱动，每个 clip 出一个 `mp4/<id>.mp4`，镜像与 fallback 自动解析源文件）。
2. **解析**：`python3 pipeline/actions.py --list`、`--move jab cross hook`、
   `--event knockdown`、`--combo opening_combo`。
3. **回合预渲染**：`round.py` 按战术取动作序列，两个分支用不同底片拼不同视频。

## 加新动作的流程

1. mixamo.com 下动作（FBX Binary / With Skin / 30fps；位移类勾 In Place）。
2. 改名后放入 `pipeline/assets/mixamo/fbx/`（FBX **不进仓**，见下）。
3. 在 `manifest.json` 里加 clip，并在 `moves` / `events` / `combos` /
   `tactic_sequences` 里按需挂上它。
4. 同步改 `src/lib/arena/actions.ts` 与 `src/lib/brawlverse/actions.ts`，
   跑上面三项校验。

## Git 规则

- FBX 源文件与渲染 mp4 **都不进仓**（`.gitignore` 排除
  `pipeline/assets/mixamo/fbx/`、`pipeline/assets/mixamo/mp4/`）；
  仓库里只保留 `manifest.json` 这份清单。
- 成片走 R2 / 对象存储，URL 存进 `content_items`。
