---
title: "上传前读视频时长"
description: "上传前读取视频元数据（时长等）。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/h5-video-beforeupload-getmetadata.html"
legacyUrl: "/static/html/h5-video-beforeupload-getmetadata.html"
category: "移动端"
badge: "精选"
tags: ["legacy", "移动端", "精选"]
---

## 简介

选择本地视频后，在实际上传前读取 duration、分辨率等元数据。用于上传校验与进度展示。

## 如何测试验证

1. 选择 mp4 / mov 等视频文件。
2. 确认页面显示时长、宽高等信息。
3. 对损坏文件或非视频文件，确认错误处理。
4. 大文件时注意 loadedmetadata 触发时机。

## 相关规范与文档

- [MDN: HTMLMediaElement.duration](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration)
- [MDN: loadedmetadata event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loadedmetadata_event)
- [MDN: URL.createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
