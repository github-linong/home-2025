---
name: request-methods-compare-demo
overview: 新增一个独立 demo 页面，10 张卡片按「业务场景」分组并排，覆盖 XHR/Fetch/SSE/WebSocket/JSONP/Beacon 六种技术 × 单次/流式/长轮询/全双工/只发不收五种场景；后端 api2 新增 mock 接口，默认本地假数据，可选接入真实 chat-stream。
todos:
  - id: backend-routes
    content: 新建 apps/api2/src/demo/compare-routes.js，实现 once / stream / sse / long-poll / jsonp / beacon 六个 HTTP 接口 + WebSocket upgrade handler
    status: completed
  - id: mount-routes
    content: 修改 apps/api2/src/server.js，挂载 compare-routes；WebSocket upgrade 事件绑定到 server
    status: completed
  - id: nginx-ws
    content: 修改 deploy/api2-nginx-snippet.conf，在 /api/demo 块补 WebSocket Upgrade 头与 map 指令
    status: completed
  - id: frontend-html
    content: 新建 apps/web/public/demos/html/request-methods-compare.html，10 张卡片按场景分组，顶部放技术×场景说明矩阵，纯原生 JS/CSS，无依赖
    status: completed
  - id: demo-md
    content: 新建 apps/web/src/content/demos/request-methods-compare.md
    status: completed
  - id: tests
    content: 新建 apps/api2/tests/compare-routes.test.js，覆盖全部接口（含 WebSocket 握手、长轮询、Beacon）
    status: completed
isProject: false
---

# 请求方式对比 Demo

## 目标

独立 HTML + api2 后端接口，10 张卡片按业务场景分组对比，每张卡片独立运行，并列观察耗时/分块数/字节数指标。

## 两个维度

- **技术维度**：XHR、Fetch、SSE（EventSource）、WebSocket、JSONP、Beacon
- **场景维度**：单次请求、流式接收、长轮询、全双工、只发不收

页面顶部放 6×5 的技术×场景说明矩阵（纯描述，非可点击），矩阵下方按场景分组排列卡片。

## 10 张卡片列表

**单次请求（3 张）**

1. XHR 单次 — `GET /once`，`XMLHttpRequest` onload
2. Fetch 单次 — `GET /once`，`fetch().then(res.json())`
3. JSONP 单次 — `GET /jsonp?callback=cb`，动态 `<script>` 注入

**流式接收（3 张）** 4. XHR 流式 — `GET /stream`，`xhr.onprogress` + `responseText` 增量截取 5. Fetch 流式 — `GET /stream`，`response.body.getReader()` 6. SSE — `GET /sse`，`new EventSource()`，`onmessage`

**长轮询（2 张）** 7. XHR 长轮询 — `GET /long-poll`，服务器延迟 1.5s 返回，客户端回调里立即再请求 8. Fetch 长轮询 — 同上，用 `async/await` 循环

**全双工（1 张）** 9. WebSocket — `ws /ws`，客户端 send 触发，服务器逐词 push 回来

**只发不收（1 张）** 10. Beacon — `POST /beacon`，`navigator.sendBeacon()`，服务器记录后返回 204，卡片展示「已发送（无响应体）」

## 文件变更范围

- 新建 `apps/web/public/demos/html/request-methods-compare.html`
- 新建 `apps/api2/src/demo/compare-routes.js`
- 修改 `apps/api2/src/server.js`（挂载新路由 + WebSocket upgrade）
- 新建 `apps/web/src/content/demos/request-methods-compare.md`
- 修改 `deploy/api2-nginx-snippet.conf`（WebSocket Upgrade 头）
- 新建 `apps/api2/tests/compare-routes.test.js`

## 后端接口设计

挂载在 `/api/demo/compare/...`，`?delay=ms`（上限 200ms，默认 30ms）控制 mock 节奏。

- `GET /once` → `{ text, ts }` JSON
- `GET /stream` → `text/plain` 逐词 `res.write`，30 词
- `GET /sse` → `text/event-stream`，30 条 `data: {word, index}`，最后 `data: [DONE]`
- `GET /long-poll` → 延迟 `1500ms` 后返回 `{ text, ts, seq }`；seq 由客户端传入 `?seq=N`
- `GET /jsonp?callback=cb` → `cb({text, ts})`，`application/javascript`
- `POST /beacon` → 接收 body，返回 `204 No Content`
- WebSocket upgrade on `/api/demo/compare/ws` — 纯 Node.js 手写握手，无额外 npm 依赖；服务器逐词 push 30 词后关闭

**可选 LLM 切换**（已接线）：`X-Source: llm` 或 `?source=llm`（EventSource / JSONP / iframe / WS）且配置了 `DASHSCOPE_API_KEY` 时，once / stream / sse / jsonp / iframe-stream / ws 代理 DashScope；缺 key → 503。长轮询 / beacon / pixel 始终 mock。CORS 允许 `X-Source`。

## 前端设计

- 纯原生 JS + CSS，无第三方依赖
- 顶部：全局工具栏（全部运行 / 重置 / 数据源切换 / 延迟选择）
- 顶部次区：6×5 技术×场景矩阵（静态说明表格）
- 主体：按场景 4 个分组，卡片 `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
- 每张卡片：状态机（idle → loading → streaming/done | error）、响应预览区（滚动）、底部指标（耗时 ms、分块/事件数、字节数）

## nginx 变更

`deploy/api2-nginx-snippet.conf` 顶部加：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

`/api/demo` 块内补：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

## 测试覆盖

`apps/api2/tests/compare-routes.test.js`：

- `GET /once` 返回合法 JSON
- `GET /stream` 分块非空、Content-Type 为 text/plain
- `GET /sse` 事件格式合法，末尾为 `[DONE]`
- `GET /long-poll` 响应时间 ≥ 1s，含 seq 字段
- `GET /jsonp?callback=cb` 响应以 `cb(` 开头
- `POST /beacon` 返回 204
- WebSocket 握手 + 收词
- LLM：无 key → 503；有假 DashScope → `/once`/`/stream`/`/sse` 返回 `source=llm` 内容；`/capabilities.llm.configured`
- WebSocket 握手成功，收到全部词后连接关闭

## Markdown

frontmatter 参照 `fetch-readablestream-typewriter-react.md`，tags 含 `["XHR", "Fetch", "SSE", "WebSocket", "JSONP", "Beacon", "长轮询", "流式"]`。
