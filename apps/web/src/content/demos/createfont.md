---
title: "动态加载 Web 字体"
heroImage: "/heroes/demo/createfont.webp"
description: "图形交互示例：动态加载 Web 字体。"
pubDate: "2020-03-18"
type: web
demoUrl: "/demos/html/createfont.html"
legacyUrl: "/static/html/createfont.html"
category: "图形"
badge: "博客配套"
tags: ["legacy", "图形", "博客配套"]
relatedPosts: ["sf-1190000022021264"]
---

## 简介

动态加载自定义字体并应用到页面文字，观察 FontFace / @font-face 加载完成前后的渲染变化。

## 如何测试验证

1. 打开页面，确认默认字体先显示，再切换到自定义字体（或 FOIT/FOUT）。
2. 在 Network 面板确认字体文件请求。
3. 使用 document.fonts.ready 验证加载完成时机。
4. 断网或 404 字体 URL，确认降级字体。

## 相关规范与文档

- [MDN: FontFace](https://developer.mozilla.org/en-US/docs/Web/API/FontFace)
- [MDN: CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API)
- [MDN: @font-face](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face)
- [CSS Fonts Module Level 4](https://www.w3.org/TR/css-fonts-4/)
