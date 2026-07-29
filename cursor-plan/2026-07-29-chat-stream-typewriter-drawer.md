# Chat 流式对话页 + 打字机 Drawer

## Goal

把 `fetch-readablestream-typewriter-react` demo 改成接近 ChatGPT 的对话页：请求真实大模型流式接口，边收边打字；打字机 / React 渲染相关配置点「配置」打开右侧 drawer 调整。

## Scope

- 新增 `POST /api/demo/chat-stream`：DashScope OpenAI-compatible SSE → 前端 `text/plain` 增量流。
- 不改现有 `POST /api/demo/llm-stream`（TalkingHead 数字人 JSON 协议）。
- 重写 demo HTML：对话布局 + 消息列表 + 底部输入 + 配置 drawer。
- 更新 demo markdown 与 api2 测试。

## Non-goals

- 不做登录 / 会话持久化 / 多会话侧栏历史真实存储。
- 不接入附件、语音、插件。
- 不把密钥暴露到前端。

## Steps

1. 后端：解析上游 SSE delta，边解析边 `res.write` 文本 chunk；支持 `messages` / `prompt`、限流、Abort。
2. 前端：ChatGPT 风格主界面；发送走 chat-stream；保留 mock 作为 drawer 内 fallback。
3. Drawer：渲染策略（naive / rAF）、可选 mock 节流、指标展示、关键代码片段。
4. 测试：chat-stream 配置缺失、校验、SSE 转发、限流。
5. 本地验证：对话流式出字 + drawer 切换策略。

## Risks / Open questions

- 上游可能把多个 token 合在一个 SSE 事件里；rAF 对比需短延迟或 mock 才能拉开 commits。
- api2 必须配置 `DASHSCOPE_API_KEY`，否则真实对话不可用（可回退 mock）。

## Acceptance criteria

- 对话页可发送消息，助手气泡流式增长。
- 点「配置」出现 drawer，可改 naive / rAF 等。
- Network 可见 `/api/demo/chat-stream` 分块到达。
- TalkingHead 的 `/api/demo/llm-stream` 行为不变。
