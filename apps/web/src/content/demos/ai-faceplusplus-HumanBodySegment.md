---
title: "人像抠图分割"
heroImage: "/heroes/demo/ai-faceplusplus-HumanBodySegment.webp"
description: "人像抠图 / 人体分割实验。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/ai-faceplusplus-HumanBodySegment.html"
legacyUrl: "/static/html/ai-faceplusplus-HumanBodySegment.html"
category: "文件 IO"
badge: "精选"
tags: ["legacy", "文件 IO", "精选"]
---

## 简介

人体 / 人像分割（抠图）实验：上传人物图，调用分割接口得到前景蒙版或透明背景图。常用于证件照换底、商品抠图等。

## 如何测试验证

1. 上传一张人物主体明确的图片。
2. 确认返回分割结果（蒙版或透明 PNG）。
3. 把结果叠到不同背景色上，检查边缘毛刺。
4. 大图时注意压缩与超时。

## 相关规范与文档

- [Face++ 人体轮廓 / 分割](https://www.faceplusplus.com.cn/)
- [MDN: Canvas compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
