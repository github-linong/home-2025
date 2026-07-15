---
title: "CSS 流动边框多种实现"
heroImage: "/heroes/demo/jsrun-be9Kp.webp"
description: "演示锥形渐变旋转、四边渐变位移动画，以及矩形移动、边长控制和 clip 裁剪等多种流动边框。"
pubDate: "2022-01-07"
type: web
demoUrl: "/demos/jsrun/be9Kp.html"
legacyUrl: "https://jsrun.net/be9Kp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "动画", "CSS"]
---

## 简介

针对「怎么用 CSS 做流动边框」的问答实践。页首用 conic-gradient 背景旋转制造边缘流光；另有四边 linear-gradient 位移方案。后半三节分别：双伪元素矩形移动、四边缘长度生长、clip 裁剪显示环绕边框；悬停可改背景色。

## 如何测试验证

1. 打开页面，观察顶部小方块是否有锥形渐变旋转形成的流动边。
2. 查看「按钮」四周的四段渐变边框是否沿周长流动。
3. 对照三个标题区块：矩形移动、四边长度、clip 裁剪，观察动画差异。
4. 将鼠标悬停在 border-flow / border-flow2 上，确认边框区域背景色变为浅珊瑚色。

## 相关规范与文档

- [SegmentFault 提问](https://segmentfault.com/q/1010000041123027)
- [原 JSRUN](https://jsrun.net/be9Kp)

## 注意

锥形方案注释强调容器宜为正方形，否则视觉速度会不均匀。
