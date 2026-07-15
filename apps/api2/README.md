# api2 — Better Auth for lilnong.top

独立 ESM 服务（不与遗留 `apps/api` 混用）。

## 依赖

- **Postgres**：生产机已有 PostgreSQL 15；数据库/角色 `lilnong_auth`
- Node 22+

## 本地开发

```bash
# 1) 隧道到服务器 Postgres（本机无 Docker 时）
ssh -L 5433:127.0.0.1:5432 root@YOUR_SERVER -N

# 2) 配置
cp .env.example .env
# Email sign-up needs AUTH_EMAIL_PASSWORD=true and AUTH_INVITE_CODES=...
# (sign-in / GitHub do not require an invite code)
# DATABASE_URL=postgresql://lilnong_auth:…@127.0.0.1:5433/lilnong_auth
# BETTER_AUTH_SECRET=…（≥32 字符）

# 3) 安装 & 建表（首次）
npm install
npx @better-auth/cli@latest migrate --config ./src/auth.js --yes

# 4) 启动
npm run dev
# → http://127.0.0.1:3002/api/health
# → http://127.0.0.1:3002/api/me
# → http://127.0.0.1:3002/api/auth/*
```

Astro 开发服务器已将 `/api/auth`、`/api/me` 代理到 `3002`。

## GitHub OAuth

在 GitHub OAuth App 回调 URL 填：

- 本地：`http://127.0.0.1:3002/api/auth/callback/github`
- 生产：`https://www.lilnong.top/api/auth/callback/github`

并设置 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。

## 生产

1. 部署本目录到服务器，`.env` 使用本机 `127.0.0.1:5432`（无需隧道）
2. `BETTER_AUTH_URL=https://www.lilnong.top`
3. systemd/pm2 跑在 `:3002`
4. nginx 增加 `deploy/api2-nginx-snippet.conf` 中的 `location`（在遗留 `/api/` 之前）

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 热重载 |
| `npm start` | 生产启动 |
| `npm run auth:migrate` | 连通性检查（建表仍用 CLI migrate） |
