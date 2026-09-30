# Railway Cloud Agent VM 使用教程

一台挂在 Railway 项目上的持久 Linux 机器，通过 SSH 连上去，里面有个 AI coding agent 帮你干活。
这份教程记录的是**实际跑通一个项目**（本仓库的个人网站）过程中用到的东西，以及踩到的坑。

---

## 目录

- [1. 这是什么](#1-这是什么)
- [2. 连接](#2-连接)
- [3. 机器里有什么](#3-机器里有什么)
- [4. 什么会持久，什么不会](#4-什么会持久什么不会)
- [5. 预览：让别人看到你在做的东西](#5-预览让别人看到你在做的东西)
- [6. 交付：把东西变成线上服务](#6-交付把东西变成线上服务)
- [7. 和 GitHub 打交道](#7-和-github-打交道)
- [8. 操作 Railway 资源](#8-操作-railway-资源)
- [9. 权限与 token 的坑](#9-权限与-token-的坑)
- [10. 试用 VM vs 已认领 VM](#10-试用-vm-vs-已认领-vm)
- [11. 费用](#11-费用)
- [12. 速查表](#12-速查表)

---

## 1. 这是什么

Railway Cloud Agent VM = **一台持久的云端开发机** + **一个住在里面的 AI agent**。

和本地开发的区别：

| | 本地 | Cloud Agent VM |
|---|---|---|
| 环境 | 你自己装 | 开箱就有 Node / Python / Docker / 各种 CLI |
| 关机 | 东西还在 | 文件还在，**进程会死** |
| 预览给别人看 | 要内网穿透 | 自带公网域名 |
| 部署到 Railway | 要配 token | 已经连好了 |
| 干活的人 | 你 | 你指挥 agent，或者自己敲 |

适合：快速起原型、改一个已有服务、临时需要个干净环境、手边没电脑但想推进项目。

---

## 2. 连接

### 没有 Railway 账号

```bash
ssh dev.new
```

直接给你一台试用 VM，有时间窗口限制，见 [第 10 节](#10-试用-vm-vs-已认领-vm)。
终端每次连上都会打印 **Claim 链接**，点了就变成你账号下的永久机器。

### 已有账号

从 Railway 控制台创建 Cloud Agent，或者从已有服务创建（会自动把该服务的 repo 克隆到 `/app`）。

### 连上之后

默认进入 TUI 会话，直接用自然语言跟 agent 说话：

```
> 帮我把首页改成深色主题
> 这个服务为什么部署失败
> 起个 postgres 容器
```

想自己敲命令就正常用 shell。两者可以混着来 —— agent 改的文件你能看到，你改的它也能看到。

---

## 3. 机器里有什么

实测版本（Ubuntu 26.04.1 LTS，2 vCPU / 726 MB RAM / 30 GB 磁盘）：

**运行时**（mise 管理，推荐用 mise 装新语言，别用 apt）

```
node    v24.21.0      npm 11.19.0   pnpm 12.8.1   yarn 1.22.22
python3 3.14.7        uv  0.12.21
mise    2026.9.16
```

加别的语言：

```bash
mise use --global go@latest
mise use --global rust@latest
```

**CLI 工具**

```
git 2.53    gh 2.101    jq 1.8     rg 15.1     fd 10.3
bat 0.25    eza         sqlite3    caddy 2.10  railway 5.63
```

**Docker**

`dockerd` 已经在跑，需要本地依赖直接起容器：

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

⚠️ 注意内存只有 726 MB，容器和你的应用共享。`docker compose` 没装。

**预置环境变量**

| 变量 | 用途 |
|---|---|
| `RAILWAY_PUBLIC_DOMAIN` | 这台 VM 的公网域名 |
| `RAILWAY_PROJECT_ID` / `RAILWAY_ENVIRONMENT_ID` | CLI 自动读，不用 link |
| `RAILWAY_TOKEN` | 项目级 token（**注意限制**，见第 9 节） |
| `RAILWAY_GIT_REPO_OWNER` / `_NAME` | 从服务创建时，对应的源仓库 |

**不要动的目录**：`/etc/railway`（`bootstrap` 子目录除外）、`express-agent`、`vm-init`。

---

## 4. 什么会持久，什么不会

这是最容易误解的一点：

### ✅ 会留下

- `/app` 以及整个文件系统 —— 断开、休眠、几天后回来，文件原样都在
- 装的包、clone 的仓库、npm/pip 缓存
- git 仓库和它的提交历史

### ❌ 不会留下

- **所有进程**。VM 休眠时全部停止，醒来不会自动恢复。
- dev server、`docker run` 起的容器、后台脚本 —— 回来都得重启。

所以养成习惯：**把启动命令记在 README 里**，别指望进程一直活着。

```bash
# 回到机器上第一件事
cd /app && setsid -f npx vite >/var/log/dev.log 2>&1
```

### 让 agent 记住上下文

Agent 有个 `/memories` 持久存储。跟它说「把这个记下来」，下次新会话它会自己读到。
适合记：构建命令、架构决策、踩过的坑、你的偏好。

---

## 5. 预览：让别人看到你在做的东西

**核心规则：公网流量只到 `0.0.0.0:8080`。**

```bash
echo $RAILWAY_PUBLIC_DOMAIN     # 你的公网域名
```

三条规矩，违反了就访问不到：

1. 必须监听 `0.0.0.0`，不能是 `127.0.0.1`
2. 必须是 **8080** 端口
3. 必须服务在**域名根路径**，不能是子路径

### 静态文件

什么都不用起 —— 没有进程占 8080 时，域名直接把 `/app/index.html` 吐出来，保存即生效。

需要完整静态服务器（多文件、子目录）：

```bash
setsid -f caddy run --config /etc/railway/placeholder.Caddyfile >/var/log/caddy.log 2>&1

# 项目在子目录里，让它在域名根路径服务：
SITE_ROOT=/app/mysite setsid -f caddy run --config /etc/railway/placeholder.Caddyfile >/var/log/caddy.log 2>&1
```

### Vite（⚠️ 有坑）

**Vite 默认拒绝不认识的 Host**，所以 localhost 通了不代表公网域名能开。必须先配：

```js
// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: [process.env.RAILWAY_PUBLIC_DOMAIN].filter(Boolean),
    hmr: process.env.RAILWAY_PUBLIC_DOMAIN
      ? { protocol: "wss", host: process.env.RAILWAY_PUBLIC_DOMAIN, clientPort: 443 }
      : undefined,
  },
});
```

`hmr` 那段是让热更新的 WebSocket 走 wss/443，不配的话页面能开但 HMR 连不上。

**永远不要写 `allowedHosts: true`** —— 那等于对任意 Host 开放。

### 后台运行

用 `setsid -f`，**不要**用 `nohup &` 或 `caddy start`（命令执行器可能把它们回收掉）：

```bash
setsid -f <命令> >/var/log/dev.log 2>&1
```

### 验证（重要）

`curl localhost:8080` **不能证明公网可访问**，因为绕过了 Host 检查。要这样验：

```bash
curl -fsS -H "Host: $RAILWAY_PUBLIC_DOMAIN" http://localhost:8080/
```

失败就看日志：`tail /var/log/dev.log`

### 停掉

```bash
pkill caddy          # 或
pkill -f "bin/vite"
```

⚠️ 小坑：`pkill -f vite` 会把**你自己这条包含 "vite" 字样的命令**也匹配上，导致 shell 自杀报 `signal 15`。
用更精确的模式，或者事后用端口确认：

```bash
ss -ltn | grep :8080 || echo "已释放"
```

---

## 6. 交付：把东西变成线上服务

**VM 上跑着的预览不是成品。** 它依赖进程存活，VM 一休眠就没了。

### 方式 A：ship（最快）

Agent 有个 `ship` 工具，把当前目录打包部署成一个独立的 Railway 服务，返回永久域名。
第一次会创建服务，之后重复 ship 会更新同一个。

跟 agent 说「部署上线」就行。

部署走 Railpack 自动检测。以本仓库为例，`package.json` 里给出脚本它就认得：

```json
{
  "scripts": {
    "build": "vite build",
    "start": "serve -s dist -l ${PORT:-8080}"
  }
}
```

Railpack 会跑 `npm install` → `npm run build` → `npm run start`。

⚠️ **构建产物的坑**：VM 上能跑的命令，部署镜像里未必能跑。
典型例子是 Rust —— Railpack 把可执行文件放进 `bin/`，你要是把启动命令写成 `target/release/xxx` 就会失败。
部署完**一定要 curl 一下线上域名**，别只看 VM 预览。

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" https://<你的服务>.up.railway.app/
```

### 方式 B：GitHub 仓库 + 自动部署

```bash
gh repo create myapp --private --source . --push
railway add --repo <owner>/myapp --branch main --service myapp
railway domain --service myapp
```

之后 push 即部署。**但这条路在 VM 里可能走不通**，见第 9 节。

### 如果你是在改一个已有仓库

不要 ship，不要 `railway up`。走正常 PR 流程：

```bash
git checkout -b railway/fix-xxx
git commit -am "..."
git push -u origin HEAD
gh pr create --fill
```

交付物是 **PR 链接**。

⚠️ **别往默认分支推** —— 连了 GitHub 的服务，合进默认分支 = 直接上生产。

---

## 7. 和 GitHub 打交道

### 如果 gh 已认证

从服务创建的 VM 通常带着你的 GitHub token，直接能用：

```bash
gh auth setup-git      # 让普通 git 也能访问私有仓库
gh repo clone owner/repo
```

### 如果 gh 没认证（试用 VM 常见）

```bash
$ gh auth status
You are not logged into any GitHub hosts.
```

这时候需要一个 **Fine-grained PAT**：

1. https://github.com/settings/tokens?type=beta
2. Repository access → Only select repositories → 选你的仓库
3. Permissions → Repository permissions → **Contents: Read and write**

**推送时别把 token 写进 remote URL**（会留在 `.git/config` 里）。用一次性 header：

```bash
git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:<TOKEN>' | base64 -w0)" \
    push -u origin main
```

这样 remote 保持干净：

```bash
$ git remote -v
origin  https://github.com/owner/repo.git (fetch)
origin  https://github.com/owner/repo.git (push)
```

用完去 GitHub 把 token 删掉。

### safe-clone

预装的辅助脚本，clone 并自动建工作分支，token 不落盘：

```bash
REPO_URL=github.com/owner/repo.git BRANCH=railway/my-work GITHUB_TOKEN=xxx safe-clone
```

拒绝覆盖已有 checkout，默认落在 `/root/repo`。

---

## 8. 操作 Railway 资源

### CLI

已经预先 link 好，任意目录都能用，不需要 `railway login` / `railway link`：

```bash
railway status                    # 项目结构
railway status --json | jq .      # 完整信息，服务/部署/环境
railway logs --service myapp
railway domain --service myapp
railway variables --service myapp
railway up --service myapp        # 直接部署当前目录
```

指定其他服务/环境：

```bash
railway logs --service api --environment staging
```

⚠️ **永远不要运行** `railway login` / `railway link` / `railway service link` —— 非交互 shell 里会失败，而且这里根本不需要。

### MCP

Agent 还有 `railway` MCP server，比 CLI 更适合改配置。关键区别是它支持 **staged 模式**：

- `staged: true` → 变更进入项目的 pending changes，等你在控制台点确认
- 默认 → 直接生效

改服务、变量、卷、存储桶、TCP 代理这些都支持暂存。部署、重启、域名操作没有暂存，总是立即生效。

---

## 9. 权限与 token 的坑

**这是本次踩得最深的一个。**

VM 里的 `RAILWAY_TOKEN` 是**项目级 token**，不是账号 token。后果：

| 操作 | 能否在 VM 里做 |
|---|---|
| `railway status` 读项目结构 | ✅ |
| `railway logs` / `railway up` | ✅ |
| `railway whoami` | ❌ Unauthorized |
| `railway usage` 查用量 | ❌ Unauthorized |
| `railway list` 列所有项目 | ❌ Unauthorized |
| `railway service source connect` 连 GitHub 仓库 | ❌ Unauthorized |

也就是说：**把服务连接到 GitHub 仓库这件事，只能在浏览器里做**。

即使 token 够用也绕不过，因为连接仓库还需要你的账号授权了 Railway 的 GitHub App。

手动步骤：

1. 打开服务的 Settings 页
2. Source 区域 → **Connect Repo**
3. 列表里没有你的仓库 → **Configure GitHub App** 去授权
4. 选仓库 + 分支 → 保存

同理，**查账户用量**也得去控制台：https://railway.com/workspace/usage

---

## 10. 试用 VM vs 已认领 VM

`ssh dev.new` 开的是试用机。查当前状态：

```bash
curl -fsS -H "Authorization: Bearer $AI_AGENT_KEY" "$AI_GATEWAY_URL/status"
```

返回 `{"trial": false}` = 已认领，下面的限制全部解除。

试用状态下的限制：

| 限制 | 说明 |
|---|---|
| 构建窗口 | `build_expires_at` 之后拒绝新任务 |
| LLM 额度 | 共享的小额度，用完就停 |
| 公网访问 | 域名只对**你自己的 IP**响应 |
| 生命周期 | 不认领的话之后会被删除 |

认领方法：终端每次连接打印的 Claim 链接，或者让 agent 帮你取（30 分钟过期）。
**VM 内部无法自己认领**，必须在浏览器点。

⚠️ 环境变量 `RAILWAY_TRIAL_EXPIRES_AT` 在认领后**不会被清除**，别信它，以 status 接口的 `trial` 字段为准。

---

## 11. 费用

**VM 本身是大头**，按运行时间算。静态站那点资源基本可以忽略。

省钱的做法：

- 不用的时候让它休眠（断开 SSH 后自动进入，不再计算力费用，磁盘保留）
- 后台挂着的 dev server 不会阻止休眠
- 真正长期在线的东西，部署成独立服务，别靠 VM 撑着

查账单：https://railway.com/workspace/usage （VM 里查不到，见第 9 节）

---

## 12. 速查表

```bash
# ── 环境 ────────────────────────────────────────────
echo $RAILWAY_PUBLIC_DOMAIN                  # 公网域名
curl -fsS -H "Authorization: Bearer $AI_AGENT_KEY" "$AI_GATEWAY_URL/status"

# ── 起服务 ──────────────────────────────────────────
setsid -f npx vite >/var/log/dev.log 2>&1                    # Vite（先配 allowedHosts）
setsid -f caddy run --config /etc/railway/placeholder.Caddyfile >/var/log/caddy.log 2>&1

# ── 验证（必须带 Host）──────────────────────────────
curl -fsS -H "Host: $RAILWAY_PUBLIC_DOMAIN" http://localhost:8080/

# ── 停服务 ──────────────────────────────────────────
pkill caddy
ss -ltn | grep :8080 || echo "8080 已释放"

# ── Railway ────────────────────────────────────────
railway status
railway status --json | jq '.environments.edges[].node.serviceInstances.edges[].node.serviceName'
railway logs --service <name>
railway domain --service <name>

# ── Git 推送（token 不落盘）─────────────────────────
git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:<TOKEN>' | base64 -w0)" push -u origin main

# ── 装语言 ──────────────────────────────────────────
mise use --global go@latest

# ── Docker ─────────────────────────────────────────
docker run -d -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

---

## 踩坑总结

1. **`curl localhost:8080` 通了 ≠ 公网能访问** —— Vite 的 Host 检查会拦，必须带 `-H "Host: $RAILWAY_PUBLIC_DOMAIN"` 验证
2. **进程不持久** —— 休眠后全死，把启动命令写进 README
3. **VM 的 Railway token 是项目级的** —— 连 GitHub 仓库、查用量这些账号级操作只能在控制台做
4. **`pkill -f <关键词>` 会误杀自己** —— 你的命令行里也包含那个关键词
5. **部署产物路径和 VM 不一样** —— 部署完 curl 线上域名确认，别只信本地预览
6. **`RAILWAY_TRIAL_EXPIRES_AT` 认领后不清除** —— 以 status 接口为准

---

*基于 2026-09-30 在一台 Railway Cloud Agent VM 上的实际操作记录整理。*
