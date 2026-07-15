---
title: "EXIF 图片元数据读取"
heroImage: "/heroes/demo/exif.webp"
description: "图形交互示例：EXIF 图片元数据读取。"
pubDate: "2020-03-19"
type: web
demoUrl: "/demos/html/exif.html"
legacyUrl: "/static/html/exif.html"
category: "图形"
badge: "博客配套"
tags: ["legacy", "图形", "博客配套"]
relatedPosts: ["sf-1190000022022379"]
---

## 简介

读取图片 EXIF 元数据（方向、拍摄参数等）。常用于纠正手机拍照预览旋转问题。

## 如何测试验证

1. 上传带 EXIF Orientation 的手机照片。
2. 确认页面能解析出方向 / 相机信息。
3. 对比 Canvas 绘制前后是否正确旋转。
4. 对已剥离 EXIF 的图，确认友好空状态。

## 相关规范与文档

- [MDN: FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [MDN: ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
- [CIPA: Exif standard overview](https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf)
