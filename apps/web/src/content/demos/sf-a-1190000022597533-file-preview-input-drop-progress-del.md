---
title: "预览文件并显示上传进度"
heroImage: "/heroes/demo/sf-a-1190000022597533-file-preview-input-drop-progress-del.webp"
description: "预览文件并显示上传进度 v0.1 支持预览：音频、视频、图片、文本、json v0.2（2020-12-30） 支持预览：PDF。"
pubDate: "2020-05-22"
type: web
demoUrl: "/demos/html/sf-a-1190000022597533-file-preview-input-drop-progress-del.html"
legacyUrl: "/static/html/sf-a-1190000022597533-file-preview-input-drop-progress-del.html"
category: "SegmentFault"
badge: "博客配套"
tags: ["legacy", "SegmentFault", "博客配套"]
relatedPosts: ["sf-1190000022597533"]
---

## 简介

预览 + 上传进度，并支持删除队列中的文件。

## 如何测试验证

1. 添加多个文件，删除其中一个，确认列表与进度一致。
2. 上传中途删除，观察请求是否中断。

## 相关规范与文档

- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN: FileList](https://developer.mozilla.org/en-US/docs/Web/API/FileList)
