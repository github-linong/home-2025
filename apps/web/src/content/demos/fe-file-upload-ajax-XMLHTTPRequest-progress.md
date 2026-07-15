---
title: "XHR 上传进度条"
heroImage: "/heroes/demo/fe-file-upload-ajax-XMLHTTPRequest-progress.webp"
description: "XHR 上传进度条。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/fe-file-upload-ajax-XMLHTTPRequest-progress.html"
legacyUrl: "/static/html/fe-file-upload-ajax-XMLHTTPRequest-progress.html"
category: "实验"
badge: "精选"
tags: ["legacy", "实验", "精选"]
---

## 简介

用 XMLHttpRequest.upload.onprogress 实现上传进度条。适合大文件上传体验优化。

## 如何测试验证

1. 选择较大文件开始上传（需可用后端或可观察请求）。
2. 进度条应从 0% 平滑到 100%。
3. 取消请求时，进度与状态应复位。
4. 在 Network 面板对比 loaded / total。

## 相关规范与文档

- [MDN: XMLHttpRequestUpload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload)
- [MDN: progress event](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/progress_event)
- [MDN: FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
