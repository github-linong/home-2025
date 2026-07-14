---
title: "Canvas 按网格拼贴爱心图案"
description: "用二维 0/1 矩阵定爱心形状，随机从 CDN 拉图并延时 drawImage 拼成马赛克。"
pubDate: "2018-08-08"
type: web
demoUrl: "/demos/jsrun/8dgKp.html"
legacyUrl: "https://jsrun.net/8dgKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "图形", "JavaScript"]
---

## 简介

并非可玩拼图，而是把 9×9 的 0/1 矩阵当作爱心点阵：为 1 的格子用 Image 加载 CDN 图，random 延时后 ctx.drawImage 画小方块。展示矩阵驱动布局 + 异步贴图；标题「拼图小程序」容易误解成交互拼图。

## 如何测试验证

1. 打开页面，等待画布上逐块出现小图
2. 观察整体是否大致呈爱心轮廓
3. 刷新多次，看贴图出现顺序是否随机变化
4. 若 CDN 失败，画布可能空白或少块
5. 在源码中对照 arr 矩阵与绘制位置关系

## 相关规范与文档

- [MDN: CanvasRenderingContext2D.drawImage](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/drawImage)
- [MDN: HTMLImageElement](https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLImageElement/Image)

## 注意

依赖七牛 CDN 图片；外链失效则看不到拼贴。无拖拽、交换等交互。
