---
title: "CSS 荡开涟漪动画"
heroImage: "/heroes/demo/jsrun-5r8Kp.webp"
description: "多层圆形以错开延迟循环缩放淡出，衬托居中「琅琊榜」文字。"
pubDate: "2021-08-20"
type: web
demoUrl: "/demos/jsrun/5r8Kp.html"
legacyUrl: "https://jsrun.net/5r8Kp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "动画"]
---

## 简介

300×300 容器内四个圆形绝对居中，蓝色线性渐变背景。各自 5.2s linear infinite 动画，延迟分别为 -3.9s、-2.6s、-1.3s、0s，形成连续荡开。keyframes 从 scale(0.4) opacity 0 到放大再淡出。文字在上层 z-index:11。

## 如何测试验证

1. 打开页面观察四层圆依次荡开
2. 注意圆与文字叠层关系
3. 在开发者工具暂停动画查看关键帧
4. 修改 animation-delay 观察相位变化
5. 将时长从 5.2s 改短验证节奏

## 相关规范与文档

- [CSS @keyframes](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@keyframes)
- [animation](https://developer.mozilla.org/zh-CN/docs/Web/CSS/animation)
