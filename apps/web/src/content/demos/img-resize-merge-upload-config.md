---
title: "人脸融合上传配置"
description: "merge_degree: face_type:"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/img-resize-merge-upload-config.html"
legacyUrl: "/static/html/img-resize-merge-upload-config.html"
category: "文件/AI"
badge: "博客配套"
tags: ["legacy", "文件 IO", "博客配套"]
relatedPosts: ["sf-1190000018605820"]
---

## 简介

人脸融合上传配置页：前端压缩 / 缩放图片后提交融合服务。展示「上传前处理」对体积、尺寸与成功率的影响。

## 如何测试验证

1. 选择大图上传，确认前端会先 resize / compress。
2. 对比处理前后文件大小。
3. 提交融合，检查结果是否与配置项（阈值、尺寸）一致。
4. 故意上传非人脸图，确认错误提示。

## 相关规范与文档

- [MDN: HTMLCanvasElement.toBlob()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
- [MDN: createImageBitmap()](https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap)
