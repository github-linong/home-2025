---
title: "剪贴板 execCommand 复制"
description: "交互交互示例：剪贴板 execCommand 复制。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/copy-execCommand.html"
legacyUrl: "/static/html/copy-execCommand.html"
category: "交互"
badge: "博客配套"
tags: ["legacy", "交互", "博客配套"]
relatedPosts: ["sf-1190000022736770"]
---

## 简介

使用已废弃但仍广泛兼容的 document.execCommand("copy") 将内容写入剪贴板。可与异步 Clipboard API Demo 对照。

## 如何测试验证

1. 选中或按按钮复制文本，粘贴到别处验证。
2. 在 HTTPS / HTTP 下分别测试兼容性。
3. 复制失败时查看控制台返回值（false）与权限提示。
4. 对照 clipboard-api-async 页的权限模型差异。

## 相关规范与文档

- [MDN: document.execCommand()](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)
- [MDN: Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [W3C: Clipboard APIs](https://www.w3.org/TR/clipboard-apis/)

## 注意事项

- execCommand 已标记废弃，新项目优先 navigator.clipboard。
