---
title: "面板内元素拖动与滚轮缩放"
heroImage: "/heroes/demo/jsrun-F6JKp.webp"
description: "在固定视口内拖动天气卡片，并用滚轮通过 transform:scale 缩放。"
pubDate: "2023-08-24"
type: web
demoUrl: "/demos/jsrun/F6JKp.html"
legacyUrl: "https://jsrun.net/F6JKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "Vue", "CSS"]
---

## 简介

300×300 的 layoutView 内有绝对定位红色 draggable 块（示例城市天气文案）。mousedown + mousemove 改 left/top；在容器上监听 wheel，增减 screenNum（下限约 0.2）并设置 scale。按钮可强制 screenNum 为 1、2、0.5。边界限制相关代码被注释掉。

## 如何测试验证

1. 拖动红色方块在视口内移动
2. 在视口上滚动滚轮放大/缩小
3. 点 screenNum = 2 / 0.5 / 1 观察缩放
4. 缩到约 0.2 时确认无法再缩小
5. 打开控制台查看拖动时 screenNum 日志

## 相关规范与文档

- [CSS transform scale](https://developer.mozilla.org/zh-CN/docs/Web/CSS/transform-function/scale)
- [Element: wheel event](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/wheel_event)
