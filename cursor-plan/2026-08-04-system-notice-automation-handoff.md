# 系统公告自动填充交接说明

## Goal

给后续「自动任务」一份可执行规格：如何根据 git 提交 / 用户可见改动，按天补全系统公告（`用户公告` blog），并可选生成头图。

## Scope

- **做**：新增/更新 `apps/web/src/content/blog/notice-YYYY-MM-DD.md`；可选生成 `/heroes/blog/notice-*.webp`
- **不做**：个人公告（登录态）；改公告 UI/已读逻辑；把部署/内部重构写进公告

## Non-goals

- 不强制用户读完所有历史公告（横幅只推最新一条）
- 不把公告混进博客列表 / RSS（已有 `excludeNoticePosts`）

---

## 数据模型（公告 = Blog）

公告就是普通 Astro Content blog，关键约束：

| 字段 | 要求 |
|------|------|
| 文件路径 | `apps/web/src/content/blog/notice-YYYY-MM-DD.md` |
| `tags` | **必须含** `用户公告`（常量 `PUBLIC_NOTICE_TAG`） |
| `title` | 建议 `M/D 主题简述`，如 `7/29 指向实验室、文生图与请求对比` |
| `description` | 一行摘要；横幅主文案用这个 |
| `pubDate` | 当天，如 `Jul 29 2026` 或 `2026-07-29` |
| `badge` | 常用 `升级`；含「重要/警告」→ warning，含「紧急」→ critical |
| `heroImage` | 可选 `/heroes/blog/notice-YYYY-MM-DD.webp` |
| 正文 | 用户可感知变化 + 入口链接；避免纯部署/密钥/SSRF 细节堆砌 |

**Slug / 已读 ID**：`createSlug(title, entry.slug)`。`GENERATE_SLUG_FROM_TITLE=false` 时 **id = 文件名 slug**（如 `notice-2026-07-29`）。改文件名会重置已读状态。

## UI 行为（自动化不要改，但要懂）

| 位置 | 行为 |
|------|------|
| 右侧主内容横幅 | **只展示时间最新且未读的一条**；关闭 = 标记该条已读，**不再连环弹出旧公告** |
| 左侧边栏「系统公告」 | 打开全部列表；角标 = 未读条数 |
| 已读存储 | `localStorage` 键 `site:system-notice:read:v1`（JSON string[] of notice ids） |
| 博客列表 / 首页最新 / RSS | **排除** `用户公告` 标签文章 |

相关代码：

- `apps/web/src/lib/systemNotices.mjs` — 过滤、映射
- `apps/web/src/lib/systemNoticeUi.mjs` — 已读、横幅逻辑
- `apps/web/src/components/SystemNotice.astro` — 横幅
- `apps/web/src/components/SystemNoticeInbox.astro` — 侧边栏入口 + 弹窗
- `apps/web/src/layouts/BaseLayout.astro` — 注入 `#system-notice-data`

## 内容规则（写什么）

1. **按自然日聚合**：同一天多笔提交 → **一篇** `notice-YYYY-MM-DD.md`，不是一提交一篇。
2. **只写用户可感知**：新页面/Demo、可读功能、登录、搜索、公告本身；部署脚本、rsync、纯测试可省略或一句带过。
3. **对照 git**：`git log --since=<上次公告日> --pretty=format:'%ad %s' --date=short`
4. **空窗期**：无用户可见提交 → **不要造公告**。
5. **补漏**：晚间提交若漏写，应 **改写当日文件**，不要另开错误日期。
6. **入口链接**：正文末尾给真实可点路径（`/demos/...`、`/blog/...`、`/texas-holdem/` 等）。

### Frontmatter 模板

```md
---
title: "M/D 主题简述"
description: "一行摘要，会出现在横幅。"
pubDate: "Mon DD YYYY"
tags: ["用户公告"]
badge: "升级"
---

今天/本周主要变化：

- **功能 A**：一句话
- **功能 B**：一句话

入口：

- [名称](/path/)
```

可选头图：生成后加 `heroImage: "/heroes/blog/notice-YYYY-MM-DD.webp"`。

## 头图（可选）

```bash
# 仅公告 slug
printf 'notice-2026-08-04\n' > /tmp/hero-slugs.txt
node scripts/generate-hero-images.mjs --write --only=blog --slugs-file=/tmp/hero-slugs.txt
```

Demo 头图另议（截屏/AI）：`scripts/capture-demo-heroes.mjs`、`scripts/ai-demo-heroes.mjs`；与公告任务可分开。

## 现有公告（截至交接时）

| 文件 | 主题 |
|------|------|
| `notice-2026-07-10.md` | 站点焕新、思否归档、搜索 |
| `notice-2026-07-13.md` | 历史 Demo 迁入 |
| `notice-2026-07-14.md` | JSRUN 精选 |
| `notice-2026-07-15.md` | 登录、封面、互动内容 |
| `notice-2026-07-16.md` | 学英语、扑克、系统公告 |
| `notice-2026-07-17.md` | 数字人对话、图鉴卡片 |
| `notice-2026-07-28.md` | 民生大屏数字人导览 |
| `notice-2026-07-29.md` | 指向实验室、文生图、请求对比 |

## 建议自动化步骤

1. 列出已有 `notice-*.md` 的最晚 `pubDate` / 文件名日期。
2. `git log` 取该日之后的提交，按天分组。
3. 过滤用户可见主题（可对照 `apps/web/src/pages`、`content/demos`、`content/blog` 新增文件）。
4. 若该日已有 `notice-YYYY-MM-DD.md` → **更新**；否则 **新建**。
5. （可选）跑 hero 生成脚本。
6. 自检：`tags` 含 `用户公告`；`description` 非空；入口链接路径存在。

## Risks / Open questions

- 横幅「关闭最新」≠「全部已读」；侧边栏角标可能仍 >0。
- 改 slug / 改文件名会让用户再次看到「新」公告。
- 个人公告（`scope: user`）尚未实现；自动化先只写 `用户公告`。
- Demo 头图缺失（引用了 webp 但文件不存在）与公告任务无关，但列表破图要单独修。

## Acceptance criteria（给自动任务）

- [ ] 有用户可见提交的日期，都有对应 `notice-YYYY-MM-DD.md`（或明确判定跳过）
- [ ] 每篇含 `tags: ["用户公告"]`，且不进博客主列表/RSS
- [ ] `description` 适合横幅；正文有入口链接
- [ ] 一天一篇，不重复堆叠同日多文件
- [ ] （若生成头图）`heroImage` 路径与 `public/heroes/blog/` 文件一致且文件存在
