---
title: "固定宽度卡片自动换行过渡"
description: "容器可缩放时，按列数重算 absolute 定位，用 CSS transition 实现换行动画。"
pubDate: "2021-10-30"
type: web
demoUrl: "/demos/jsrun/rfUKp.html"
legacyUrl: "https://jsrun.net/rfUKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "布局", "交互", "动画", "CSS"]
---

## 简介

对应 SegmentFault 问题：固定宽卡片在容器变宽时自动换行并带过渡。列表容器 relative 可 resize，子项 absolute；computed 按当前宽度算出每行列数，得到 left/top；定时读取 offsetWidth（对齐到 50px 网格）。item 有 transition: all 1s，宽度变化时位移动画可见。

## 如何测试验证

1. 观察红框列表中约 70 个半透明色块的网格排列
2. 拖动手柄改变容器宽度，观察列数变化与位移动画
3. 缩小宽度使每行卡片减少，确认过渡是否平滑
4. 阅读 computed 中按宽度求 leftWidth、行/列索引的算法

## 相关规范与文档

- [SegmentFault 原问题](https://segmentfault.com/q/1010000040884063)
- [CSS transition](https://developer.mozilla.org/zh-CN/docs/Web/CSS/transition)

## 注意

HTML 原 title 为 SegmentFault URL；@resize 非标准事件，实际靠 setInterval 轮询宽度。
