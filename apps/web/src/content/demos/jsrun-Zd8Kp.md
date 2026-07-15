---
title: "粘贴与拖放内容识别"
heroImage: "/heroes/demo/jsrun-Zd8Kp.webp"
description: "演示在 textarea 上监听 paste/drop，解析 clipboardData 与 dataTransfer 中的 files 与 items 并预览。"
pubDate: "2021-08-11"
type: web
demoUrl: "/demos/jsrun/Zd8Kp.html"
legacyUrl: "https://jsrun.net/Zd8Kp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "JavaScript", "交互", "工具"]
---

## 简介

页面上方提供可复制的富文本与图片区域，下方是放置用的 textarea。粘贴或拖入内容后，会分别遍历 files 与 items：文件项生成 Blob URL 并展示名称、大小、类型（图片则缩略图），字符串项异步 getAsString 后写入全量预览区。适合排查不同来源（截图、文件、富文本）在剪贴板/拖放 API 中的差异。

## 如何测试验证

1. 从上方富文本或图片区域复制内容，或从系统选中文件
2. 在红色边框的「放置区域」textarea 中粘贴或拖入
3. 查看红色预览区中「文件预览」与「全量内容预览」的差异
4. 打开控制台观察 types、files.length、items.length 等日志

## 相关规范与文档

- [ClipboardEvent.clipboardData](https://developer.mozilla.org/zh-CN/docs/Web/API/ClipboardEvent/clipboardData)
- [DataTransfer](https://developer.mozilla.org/zh-CN/docs/Web/API/DataTransfer)
- [URL.createObjectURL](https://developer.mozilla.org/zh-CN/docs/Web/API/URL/createObjectURL_static)

## 注意

HTML 原标题为「识别优化」；拖拽相关事件做了 preventDefault，实际解析逻辑在 drop 与 paste 上。
