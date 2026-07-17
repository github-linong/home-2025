# 万相数字人实时对话 Demo（LingMou CreateChatSession + WebSDK）

## 目标

写一个可本地跑通的数字人对话 Demo：
- 后端（apps/api2）调用 LingMou `CreateChatSession` 拿入会参数（rtcParams / 端渲资产）。
- 前端（apps/web）新页面用 `lm-avatar-chat-sdk` 拉起数字人，支持语音 + 文本对话。

## 范围 / 非目标

- 范围：一个 demo 页 + 一个后端接口 + 环境变量读取（apps/api2/.env 已配好）。
- 非目标：不做生产化（鉴权、并发管理、会话回收策略）、不做移动端 SDK、不改现有认证逻辑。

## 步骤

1. `apps/api2` 安装 `@alicloud/lingmou20250527`（官方 SDK，ROA 签名自己实现不划算）。
2. 新增 `src/avatar/routes.js`：`POST /api/demo/avatar/session`
   - 读取 `ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET`、`LINGMOU_*` 环境变量。
   - 调 `createChatSessionWithOptions(projectId, {license, platform, instanceId})`。
   - 把 rtcParams、sessionId、asset（端渲时）原样透传给前端；错误时返回可读信息。
   - 挂载在 `/api/demo` 前缀下（vite proxy 已有该前缀，无需改代理）。
3. `apps/web` 安装 `lm-avatar-chat-sdk`，新增 `src/pages/demos/avatar-chat.astro`：
   - 「开始对话」按钮 → 请求后端接口 → 依据返回有无 asset 决定 cloudAvatar / localAvatar。
   - 展示状态（StandBy/Listening/Thinking/Responding）、对话文本流、文本提问输入框、打断与退出按钮。
   - 页面提示：必须用 `http://localhost:4321` 访问（RTC 安全上下文限制）。
4. 测试：对 session 路由做单测（mock lingmou client，验证参数映射与错误处理）；本地起 api2 + web 手动验证。

## 风险 / 开放问题

- 文档注明 Web 纯端渲染全链路目前仅支持 3D 数字人；用户订单是 2D 端渲后付费。若 `CreateChatSession` 返回不含 Web 可用资产或直接报错，需要改用云渲项目或移动端方案 —— 以实际返回为准。
- License 用户尚未重新生成填入，联调时才可验证。
- RTC 参数 5 分钟内必须入会，前端拿到即用。

## 验收标准

- `POST /api/demo/avatar/session` 在 env 完整时返回 200 与入会参数；env 缺失时报 4xx 且信息清晰。
- demo 页在 localhost 能发起会话（License 填好后），可语音/文本对话、打断、退出。
- 单测通过：`npm test`（apps/api2）。

## 部署（2026-07-17 已完成）

- 新增 `scripts/deploy-api2.sh` + `npm run deploy:api2`：rsync `apps/api2` → `/opt/lilnong-api2`，
  `npm ci --omit=dev`，仅 upsert 数字人相关 env（不覆盖服务器 Better Auth 生产 .env），重启 systemd。
- 后端：`lilnong-api2` 服务 active，`/api/health` 200，生产端创建+关闭会话验证通过。
- 前端：`npm run deploy:web` 构建并同步到 `/var/www/lilnong.top`，页面上线
  https://www.lilnong.top/demos/avatar-chat/ （HTTPS，满足 RTC 安全上下文）。
- nginx 无需改动：`/api/demo` 已代理到 3002，覆盖 `/api/demo/avatar/*`。

### 已知风险（用户已知情并接受）

- `POST /api/demo/avatar/session` 公网**无鉴权**：任何人调用都会创建按分钟计费的付费会话并占用并发。
  用户明确选择「公开裸奔上线」。后续如需收口，可加：单 IP 限流 + 全局并发上限 + 单会话最长时长。
- 前端已在退出/`beforeunload`（sendBeacon）时调用 `/session/close`，但极端情况（进程被杀）仍可能残留会话，
  必要时用 `QueryChatInstanceSessions` + `CloseChatInstanceSessions` 兜底清理。
