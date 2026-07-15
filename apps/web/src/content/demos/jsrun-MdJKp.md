---
title: "piexifjs 写入 EXIF Orientation"
heroImage: "/heroes/demo/jsrun-MdJKp.webp"
description: "把 Canvas 导出为 JPEG，用 piexifjs 分别写入 Orientation 1–8 并展示。"
pubDate: "2023-09-13"
type: web
demoUrl: "/demos/jsrun/MdJKp.html"
legacyUrl: "https://jsrun.net/MdJKp"
category: "实验"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "JavaScript", "Canvas"]
---

## 简介

先在 canvas 画矩形与文字，再 toBlob 得到 JPEG。handleFileSelect 构造 0th/Exif/GPS 字段，设置 ImageIFD.Orientation，dump 后 insert 进 DataURL，再以带边框区块显示 Orientation 数字与结果图。连续生成 1 到 8 共八张对照。

## 如何测试验证

1. 打开页面自动生成 8 个结果块
2. 核对每块标注的 Orientation 值为 1–8
3. 用看图/元数据工具检查方向标记（浏览器未必旋转显示）
4. 阅读代码中 Make、DateTimeOriginal、GPS 等示例字段
5. 换 Orientation 值重新导出做对比

## 相关规范与文档

- [piexifjs](https://github.com/hMatoba/piexifjs)
- [EXIF Orientation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement#does_not_honor_exif_orientation_data)
