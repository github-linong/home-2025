---
title: "摄像头采集 getUserMedia"
heroImage: "/heroes/demo/MediaDevices-getUserMedia.webp"
description: "浏览器摄像头 / 麦克风采集实验，基于 MediaDevices.getUserMedia。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/MediaDevices-getUserMedia.html"
legacyUrl: "/static/html/MediaDevices-getUserMedia.html"
category: "音视频"
badge: "精选"
tags: ["legacy", "音视频", "精选"]
---

## 简介

演示如何通过 MediaDevices.getUserMedia 请求摄像头与麦克风权限，并将实时媒体流绑定到 `<video>` 元素。适合理解权限弹窗、约束条件（constraints）与流生命周期。

## 如何测试验证

1. 用 HTTPS 或 localhost 打开页面（非安全上下文会被浏览器拒绝）。
2. 点击「开始」或授权按钮，允许摄像头 / 麦克风权限。
3. 确认预览画面出现；拒绝权限时应有可读错误提示。
4. 在 DevTools → Application / 站点设置中撤销权限后刷新，验证再次申请流程。
5. 可尝试切换前置 / 后置摄像头（若设备支持 `facingMode`）。

## 相关规范与文档

- [MDN: MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: MediaStream](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)
- [W3C: Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)

## 注意事项

- 需用户手势触发更稳妥；部分移动浏览器对自动播放有额外限制。
- 结束使用时调用 track.stop()，避免占用摄像头指示灯。
