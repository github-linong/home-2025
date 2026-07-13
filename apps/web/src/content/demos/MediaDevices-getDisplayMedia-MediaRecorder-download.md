---
title: "屏幕录制并下载"
description: "屏幕录制并下载本地文件。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/MediaDevices-getDisplayMedia-MediaRecorder-download.html"
legacyUrl: "/static/html/MediaDevices-getDisplayMedia-MediaRecorder-download.html"
category: "音视频"
badge: "精选"
tags: ["legacy", "音视频", "精选"]
---

## 简介

在录屏 Demo 基础上增加「下载到本地」：将 MediaRecorder 产生的 Blob 通过 Object URL 触发下载。适合验证 Blob、`URL.createObjectURL` 与文件命名。

## 如何测试验证

1. 完成一次屏幕录制。
2. 点击下载，确认浏览器开始保存文件（常见为 webm / mp4，视浏览器而定）。
3. 用本地播放器打开文件，确认音视频内容完整。
4. 重复下载时检查是否正确 revokeObjectURL，避免内存泄漏。

## 相关规范与文档

- [MDN: URL.createObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- [MDN: Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- [MDN: MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
