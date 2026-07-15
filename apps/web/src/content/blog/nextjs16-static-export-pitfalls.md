---
title: "Next.js 16 Static Export 踩坑记录"
description: "个人站使用 Next.js 16 静态导出的完整踩坑记录，包括 sitemap、Google Fonts、headers 和 dangerouslySetInnerHTML 等问题。"
pubDate: "Mar 19 2026"
heroImage: "/heroes/blog/nextjs16-static-export-pitfalls.webp"
tags: ["Next.js","静态导出","踩坑","静态站点","JavaScript"]
---

## 背景

个人站选了 Next.js 16 + `output: "export"` 做纯静态导出，部署到 Nginx。听起来很简单，实际踩了不少坑。

## 坑 1：sitemap.ts / robots.ts 不兼容 static export

Next.js 提供了 `src/app/sitemap.ts` 和 `src/app/robots.ts` 来生成 SEO 文件。但如果你用了 `output: "export"`，构建时会报错：

```
Error: export const dynamic = "force-static"/export const revalidate
not configured on route "/robots.txt" with "output: export"
```

原因：这两个文件会生成 Route Handler，而 static export 模式不支持动态路由。

解决：直接把 `robots.txt` 和 `sitemap.xml` 放到 `public/` 目录下作为静态文件。简单粗暴，但有效。

## 坑 2：Google Fonts 在国内加载失败

`create-next-app` 默认使用 `next/font/google` 加载 Geist 字体。在国内网络环境下，Google Fonts CDN 经常超时或直接不可用。

表现：页面首屏延迟 3-5 秒，字体 fallback 到系统默认。

解决：直接移除 Google Fonts，用系统字体栈：

```css
--font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
  "WenQuanYi Micro Hei", system-ui, -apple-system, sans-serif;
```

好处：零网络请求、加载即显示、中文渲染更好。

## 坑 3：next.config.ts 里的 headers 不生效

在 `next.config.ts` 里配了安全头（CSP、HSTS 等），结果 static export 模式下完全不生效：

```
⚠ Specified "headers" will not automatically work with "output: export"
```

解决：安全头改到 Nginx 配置里加。static export 输出的是纯 HTML 文件，没有 Node.js 服务器来处理 headers。

## 坑 4：dangerouslySetInnerHTML 不是唯一选择

最初版本用 `<script>` 做客户端数据渲染。这在 React 19 时代是反模式：

- XSS 风险
- innerHTML 里 `className` 不生效（应该用 `class`）
- SEO 不友好（内容需要 JS 执行才可见）

解决：改用 async Server Component，构建时直接 `fs.readFile` 读数据，用 JSX 渲染。代码更少，安全性更高，SEO 天然友好。

## 总结

`output: "export"` 的核心约束就一句话：你得到的是纯 HTML 文件，没有服务器。

所有依赖服务器运行时的功能（Route Handlers、headers、middleware）都不可用。想清楚这一点，很多坑就自然避开了。

---

如果你也在用 Next.js 做静态站，希望这些能帮你省点时间。
