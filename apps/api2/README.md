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

Astro 开发服务器已将 `/api/auth`、`/api/me`、`/api/learn` 代理到 `3002`。

## 英语学习内容

```bash
# 建表并导入内置词卡 / 短文 / 国际音标（可重复执行）
npm run learn:migrate
```

接口：`GET /api/learn/decks`、`/decks/:slug/cards`、`/passages`、`/passages/:slug`、`/words?q=`、`/ipa`。

音标内容整理自《英语国际音标课》讲义（字母读音、元音/双元音/辅音分组与例词）。

### 发音音频

- `GET /api/learn/audio/status` — 探测本机 TTS 工具是否可用
- `GET /api/learn/audio/ipa?s=æ` — 音标发音（eSpeak-ng 音素合成）
- `GET /api/learn/audio/word?q=cat` — 单词发音：优先真人录音（Wiktionary/Lingua Libre/词典 CDN），否则 Piper→eSpeak 兜底

依赖（均为可选外部工具，未安装时相应能力降级）：

```bash
# 音标发音 + 单词兜底（必备其一，推荐）
brew install espeak-ng            # macOS
# apt-get install espeak-ng       # Debian/Ubuntu

# 更自然的单词/短文合成（可选）
pip install piper-tts
# 下载 voice 到 data/piper-voices/en_US-lessac-medium.onnx(.json)
```

真人音频与合成结果会缓存到 `data/learn-audio/`（已 gitignore）。可用环境变量覆盖：`ESPEAK_BIN`、`PIPER_BIN`、`PIPER_MODEL`、`LEARN_AUDIO_UA`。

## 前端面试题库（学前端）

题库来自 [febobo/web-interview](https://github.com/febobo/web-interview)，按技术栈分类（JavaScript / es6 / TypeScript / Vue / Vue3 / React / NodeJS / css / http / algorithm / Webpack / Git / Linux / applet / design）。

存储：**独立 MySQL 库**（连接见 `src/fequiz/db.js`，环境变量 `FEQUIZ_MYSQL_*`，也可用 `FEQUIZ_MYSQL_URL`）。

```bash
# 1) 建表 + 内置精选种子题（离线可用）
npm run fe:migrate

# 2) 导入 web-interview 全量题库 + 全量预处理（生成 6 类题型）
#    克隆到 data/web-interview，幂等，可重复跑；导入完成后自动预处理
npm run fe:import

# 若导入时跳过了预处理（FE_SKIP_PREPROCESS=1），可单独补跑：
npm run fe:preprocess
```

AI 二次加工（把原题加工为 填空/选择/判断/问答/计算/应用 6 类题型）在**导入时全量预处理**完成（`fe:import` / `fe:preprocess`，分批、断点续传、失败降级离线模板）。出卷时直接读取预处理好的题型，不再按需调 LLM。

主观题自动判分复用 `DASHSCOPE_API_KEY`（qwen-flash）；未配置时客观题规则判分，主观题标记「待人工复核」。

接口：

- `GET  /api/fequiz/overview` — 分类 / 题数 / 难度分布
- `GET  /api/fequiz/stats` — 全库统计（含 6 种题型覆盖、AI 生成状态）
- `POST /api/fequiz/quiz` — 出卷：`{ categories: string[], types: string[], count: number }`
- `POST /api/fequiz/quiz/:id/score` — 交卷自动判分
- `GET  /api/fequiz/sessions` — 最近考试记录

前端页面：`apps/web/src/pages/learn-fe.astro`（`/learn-fe`）。

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
| `npm run learn:migrate` | 英语学习表 + 种子数据 |
| `npm run fe:migrate` | 前端面试题库表 + 种子题 |
| `npm run fe:import` | 导入 web-interview 全量题库 + 全量预处理 |
| `npm run fe:preprocess` | 全量预处理（生成 6 类题型，断点续传） |
| `npm test` | 单元测试 |
