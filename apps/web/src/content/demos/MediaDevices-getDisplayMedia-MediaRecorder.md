---
title: "屏幕录制 MediaRecorder"
description: "屏幕共享录制实验，基于 getDisplayMedia + MediaRecorder。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/MediaDevices-getDisplayMedia-MediaRecorder.html"
legacyUrl: "/static/html/MediaDevices-getDisplayMedia-MediaRecorder.html"
category: "音视频"
badge: "精选"
tags: ["legacy", "音视频", "精选"]
---

## 简介

演示屏幕共享（getDisplayMedia）与 MediaRecorder 录制：选择窗口 / 标签页 / 整屏后，将共享流编码为媒体片段。适合理解录屏权限与 MIME 类型兼容性。

## 如何测试验证

1. 打开页面后发起屏幕共享，选择一个窗口或标签页。
2. 开始录制若干秒，观察状态变化（recording / inactive）。
3. 停止录制后，确认可得到 Blob / 可播放预览。
4. 在 Chrome / Firefox / Safari 分别试一次，对比支持的 `mimeType`。
5. 取消共享权限时，确认流结束且 UI 正确复位。

## 相关规范与文档

- [MDN: getDisplayMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [MDN: MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [W3C: Screen Capture](https://www.w3.org/TR/screen-capture/)
- [W3C: MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)
