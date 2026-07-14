---
title: "Canvas 可见水印与通道解码示意"
description: "上传图片后绘制半透明文字水印，并用按通道奇偶重映射的方式示意解码。"
pubDate: "2024-07-02"
type: web
demoUrl: "/demos/jsrun/avDKp.html"
legacyUrl: "https://jsrun.net/avDKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "图形", "工具"]
---

## 简介

选择本地图片后展示原图，再生成带「lilnong.top」文字的水印图（含更低透明度偏移文字）。decodeWatermark 按指定颜色通道奇偶把像素拉成 0/255，用于观察信息痕迹。OpenCV.js 频域暗水印整段已注释，当前为 Canvas 可见水印+简易解码示意。

## 如何测试验证

1. 点击文件选择，上传一张本地图片。
2. 确认出现原图与写有 lilnong.top 的水印图。
3. 查看第三张解码结果图，观察对比度被放大后的痕迹。
4. 对照 MD 中的 OpenCV 文章链接理解完整暗水印方案（本页未启用）。

## 相关规范与文档

- [参考文章 ainyi](https://ainyi.com/154)
- [腾讯云相关文](https://cloud.tencent.com/developer/article/2058152)
- [原 JSRUN](https://jsrun.net/avDKp)

## 注意

OpenCV 实现整段注释未跑；现行是可见水印加 alpha/通道奇偶示意，非完整频域暗水印。
