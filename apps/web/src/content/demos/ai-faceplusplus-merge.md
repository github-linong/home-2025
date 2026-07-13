---
title: "Face++ 人脸融合"
description: "Face++ 人脸融合交互 Demo。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/ai-faceplusplus-merge.html"
legacyUrl: "/static/html/ai-faceplusplus-merge.html"
category: "文件 IO"
badge: "精选"
tags: ["legacy", "文件 IO", "精选"]
---

## 简介

调用 Face++（旷视）人脸融合能力的前端交互页：上传两张人脸图，请求融合结果并展示。适合理解第三方 AI 视觉 API 的鉴权、上传与结果回显。

## 如何测试验证

1. 准备两张正脸清晰照片。
2. 按页面流程上传并提交融合请求。
3. 成功时展示融合图；失败时检查控制台网络错误（密钥、额度、CORS）。
4. 注意：线上密钥可能已失效，需自备 API Key 才能完整跑通。

## 相关规范与文档

- [Face++ 人脸融合文档](https://console.faceplusplus.com.cn/documents/20865676)
- [MDN: FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
