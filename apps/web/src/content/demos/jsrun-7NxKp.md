---
title: "Canvas 笔刷马赛克"
heroImage: "/heroes/demo/jsrun-7NxKp.webp"
description: "在图片上按住拖动，用 Canvas 从原图随机取样绘制马赛克块。"
pubDate: "2023-10-13"
type: web
demoUrl: "/demos/jsrun/7NxKp.html"
legacyUrl: "https://jsrun.net/7NxKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "图形", "交互"]
---

## 简介

图片上方叠一层 canvas，按下鼠标/触摸后在移动时持续绘制。每个马赛克块边长为 20px，源区域取自原图随机位置，目标位置跟指针。支持 mousedown/mousemove 与 touchstart/touchmove。

## 如何测试验证

1. 等待图片加载完成（canvas 尺寸对齐图片）
2. 在图上按住左键或手指开始涂抹
3. 拖动观察随机纹理马赛克块出现
4. 松开后停止绘制
5. 改代码中 mosaicSize 可调整块大小

## 相关规范与文档

- [Canvas drawImage](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/drawImage)

## 注意

迁移后丢失了源文件中 #mosaic-overlay 的 absolute 叠层样式；坐标用 clientX/Y，未减容器偏移，涂抹位置可能不准。
