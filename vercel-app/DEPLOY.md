# BRAWLVERSE API — Vercel 部署说明

架构：Vercel Python Serverless Functions + Postgres（`DATABASE_URL`）。
前端（GitHub Pages 纯静态）通过 `API_BASE` 连它；booker 后台是 `/admin.html`。

## 0. 准备两样东西

1. **Vercel Token**：vercel.com → 头像 → Settings → Tokens → Create
   （给 Muse 用 `vercel deploy`；也可以你本地 `vercel login` 后我远程指挥）
2. **Postgres 连接串**：三选一
   - Vercel Postgres（Vercel 项目 → Storage → Create → Postgres，最省事）
   - Neon（你 ad-scope 用过同款）
   - Supabase
   拿到 `DATABASE_URL`（`postgresql://...`，要带 `?sslmode=require` 的那串）

## 1. 部署

```bash
cd vercel-app
vercel deploy --prod
# 首次会问：link 到哪个项目 → 建新项目 brawlverse-api
```

> **框架预设必须是 Other（不是 Next.js）**
> 本仓库是 Python Serverless Functions + 静态页，没有 `package.json`，也不依赖 Next.js。
> 用 Dashboard 导入 Git 仓库时的设置：
> - **Root Directory**：`vercel-app`（部署 API 用）；只想部署静态站则留仓库根目录 `.`
> - **Framework Preset**：`Other`
>
> 两个 `vercel.json` 已经写了 `"framework": null`，会把框架预设强制覆盖为 Other，
> 避免再出现下面这个报错。

### 报错 `NEXT_NO_VERSION` / `Could not identify Next.js version`

```
Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
Error: [NEXT_NO_VERSION] No Next.js version detected.
```

原因：Vercel 项目的 Framework Preset 被设成了 Next.js，但部署目录里没有 `package.json`（或没有 `next` 依赖）。
处理：① 确认 Root Directory 指向 `vercel-app`（API）或仓库根目录（静态站）；② Framework Preset 改成 `Other`；③ Redeploy。

## 2. 配环境变量（Vercel 项目 → Settings → Environment Variables）

- `DATABASE_URL` = 你的 postgres 连接串
- `ADMIN_TOKEN` = 强口令（booker 后台登录用）

配完 **Redeploy** 一次生效。

## 3. 接前端

仓库根目录的 `config.js` 是唯一配置点：

```js
window.BV_API_BASE = location.hostname === "zjutimes2015.github.io"
  ? "https://brawlverse-api.vercel.app"   // 换成你的实际域名
  : "";
```

`index.html` / `episodes.html` / `fighters.html` 都会读它。推送后 GitHub Pages 自动更新。
未填或 API 不可达时，所有交互降级为本地计数，不会报错。

## 3.1 接口路径（v2 合并后）

`api/` 下只有 9 个函数入口，子路径全部改为 query 参数 `op`：

| 入口 | op |
|---|---|
| `/api/bouts` | 默认列表、`health` |
| `/api/votes` | `tally`（GET 默认）、`cast`（POST） |
| `/api/captions` | `feed`、`pinned`、`post` |
| `/api/betting` | `markets`、`bet`、`claim`、`leaderboard`、`records` |
| `/api/fantasy` | `teams`、`picks`、`leaderboard` |
| `/api/live` | `state`、`vote`、`tally` |
| `/api/subscription` | `status`、`checkout` |
| `/api/webhooks` | `waffo`（默认） |
| `/api/admin` | `bouts`、`betting`、`captions`、`gates`、`live`、`subscriptions`、`votes`、`script` |

`script` 是 OpenRouter 文本生成，需 `OPENROUTER_API_KEY`。
函数数与时长上限写在 `vercel.json`（`maxDuration: 60`，`includeFiles: lib/**`）。

## 4. Booker 后台

`https://<你的vercel域名>/admin.html`，输 ADMIN_TOKEN。

## 防刷（v2）

- 浏览器真指纹：canvas + WebGL + 屏幕 + 时区 + 语言 + 硬件，并双种子哈希
- 后端另存 `ip_ua` 哈希，后台查原始投票时可识别"多设备同 IP"刷票
- 一设备一回合一票（改投=更新）、同 IP 60 秒 20 票限频
- 开源级指纹，防普通刷票够用；决赛前可再叠 Turnstile（v3）
