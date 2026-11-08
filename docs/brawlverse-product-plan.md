# BRAWLVERSE 产品闭环改造 PLAN

目标：让用户进入 feint.tv 后「看得见、玩得到、留得下」——每一件事都有真实结果。

---

## P0-1 `/fan-forge` 表单真正落库

**问题**：`FanForgeForm` 只写 `localStorage`，用户投了等于没投。

**改动文件**

| 文件 | 动作 |
| --- | --- |
| `src/lib/brawlverse/db.ts` | SCHEMA 新增 `fan_forge_submissions` 表（id/name/persona/device_hash/ip/ip_ua/status/votes/created_at + 索引） |
| `src/app/api/fan-forge/route.ts` | 新建。`GET ?op=queue` 返回最近 12 条已入库投稿 + 总数；`POST ?op=submit` 校验（name 2–24、persona 3–120）、限流、Turnstile、垃圾词拦截后写库 |
| `src/components/brawlverse/fan-forge-form.tsx` | 删除全部 `localStorage` 逻辑；改为挂载时 GET 队列、提交 POST；接 `<Turnstile>`；展示提交中/成功/失败/被拦截状态 |
| `messages/en.json`、`messages/zh.json` | `Brawlverse.fanForge` 新增 `submitOk` `submitFailed` `submitNetwork` `submitBusy` `queueTotal` `rejected`；改写 `prototypeNote` 为「提交即入库」 |

**保留**：页面 `fan-forge/page.tsx` 结构、示例卡（`examples`）不动。

**验证**

1. `pnpm typecheck`
2. `pnpm dev` 后 `GET /api/fan-forge?op=queue` 返回 `{ submissions: [], total: 0 }`
3. 浏览器提交一条 → 刷新页面仍在队列里；再查库 `SELECT count(*) FROM fan_forge_submissions`
4. 空名/超长 → 前端拦截；带 `http://` 的 persona → `status=rejected` 不入队

---

## P0-2 `/dashboard` 从模板 demo 改成「我的战绩」

**问题**：整页是 MkSaaS 模板 demo（假卡片 + 假图表 + 假表格），登录后看不到自己的任何数据。

**改动文件**

| 文件 | 动作 |
| --- | --- |
| `src/app/[locale]/(protected)/dashboard/page.tsx` | 重写为 server component：取 `getSession()` → identity key `u:<userId>`，查真实数据 |
| 删除 `src/components/dashboard/section-cards.tsx` | 模板 demo 区块，唯一引用方是 dashboard |
| 删除 `src/components/dashboard/chart-area-interactive.tsx` | 模板 demo 图表 |
| 删除 `src/components/dashboard/data-table.tsx` | 模板 demo 表格 |
| 删除 `src/app/[locale]/(protected)/dashboard/data.json` | 模板假数据 |
| `messages/en.json`、`messages/zh.json` | `Dashboard.dashboard.title` 改为 `My Record` / `我的战绩`；新增 `Dashboard.myRecord.*`（投票数/预测命中率/拳场币/段位/下一档解锁/空态） |

**「我的战绩」五项真实指标**

1. **投票数**：`SELECT COUNT(*), SUM(weight) FROM votes WHERE device_hash = $1`
2. **预测命中率**：`votes` JOIN `live_rounds`，仅统计 `state IN ('REVEAL','done')` 且 `winning_branch` 有值的回合；`choice = tactic_a` 对应 `a`、`choice = tactic_b` 对应 `b`
3. **拳场币**：`bet_wallets.balance`
4. **段位**：`score = 投票数 + 命中数 × 5 + 下注数 × 2`，阈值 0 / 25 / 100 / 300 → ROOKIE / CONTENDER / RINGSWORN / CHAMPION
5. **下次解锁**：`getTier(key)` → 展示下一档权益（free→RINGSIDE ×3、ringside→BOOKER ×10、booker/promoter→已满级）

保留 `DashboardHeader` 面包屑与受保护布局；页面内给出 `/live` `/bet` `/fan-forge` 三个行动入口。

**验证**

1. `pnpm typecheck`、`pnpm build`（确认无 demo 组件残留引用）
2. 登录用户访问 `/dashboard`：五项数字与库内一致；未投票用户看到 0 值与空态文案，不报错
3. 全局搜索 `SectionCards|ChartAreaInteractive|dashboard/data.json` 无结果

---

## P0-3 首页首屏「下一场 + 三件立刻能做的事」，`/live` 升一级导航

**问题**：首页首屏只有口号和视频，用户不知道现在能干嘛；`/live` 藏在 Play 下拉里。

**改动文件**

| 文件 | 动作 |
| --- | --- |
| `src/components/brawlverse/home-next-event.tsx` | 新建客户端组件：拉 `/api/live?op=state`；有 `VOTING/REVEAL` 回合显示状态 + 倒计时 + 跳 `/live`；无回合显示固定档期「每周五 21:00 (UTC+8)」 |
| `src/app/[locale]/(marketing)/(home)/page.tsx` | hero 之后插入 `<HomeNextEvent />`；新增「现在就能做」三卡区块（看直播 / 投票改剧情 / 锻造选手），复用 `.brawl-cards` / `.brawl-card` / `.brawl-cta`，不加新 CSS |
| `src/config/navbar-config.tsx` | `/live` 从 `play.items` 提到一级（Storylines 之后），Play 下拉只留 The Book / Fantasy |
| `messages/en.json`、`messages/zh.json` | `Brawlverse.home` 新增 `nextEventTitle` `nextEventLive` `nextEventIdle` `nextEventCta` `quickTitle` `quickLive*` `quickVote*` `quickForge*`；`Brawlverse.nav` 新增顶层 `live.title`，删除 `play.items.live` |

**验证**

1. `pnpm typecheck` + `pnpm build`
2. 首页首屏：能看到下一场/档期条 + 三张行动卡；点击分别到 `/live` `/live` `/fan-forge`
3. 顶部导航：`Friday Fight Night` 为一级项，Play 下拉只剩两项；中英文均无 `MISSING_MESSAGE`

---

## P1-4 `/storylines` 接上真实投票结果

**问题**：剧情页全是静态文案，和站内真实投票结果完全脱节。

**改动文件**

| 文件 | 动作 |
| --- | --- |
| `src/components/brawlverse/storyline-vote-result.tsx` | 新建客户端组件：拉 `/api/votes?op=tally&bout_id=ex1&round_no=1`，渲染 RAGE / FAIR 实时票数与百分比；`total=0` 显示「还没有人投票」 |
| `src/app/[locale]/(marketing)/(pages)/storylines/page.tsx` | 在第一个 feuds 区块上方插入该组件（复用 `.brawl-panel` + `.brawl-rv-row`） |
| `messages/en.json`、`messages/zh.json` | `Brawlverse.storylines` 新增 `liveResultTitle` `liveResultSub` `liveResultEmpty` `liveResultCta` |

**验证**

1. `pnpm typecheck`
2. `/storylines` 显示与首页 RuleVote 相同的票数（两处同源 `ex1/round_no=1`）
3. 先在首页投一票，回剧情页刷新，数字同步增加

---

## 统一验收

```powershell
pnpm lint:check
pnpm typecheck
pnpm test
pnpm build
```

四项全绿后浏览器抽验 `/`、`/storylines`、`/fan-forge`、`/dashboard`，再提交推送。
