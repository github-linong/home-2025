---
title: "CSS position: sticky 粘性定位示例"
heroImage: "/heroes/demo/jsrun-f2iKp.webp"
description: "纵向滚动页中演示 sticky：顶部块 top:50px 吸附，分区标题吸顶直到离开所在 section。"
pubDate: "2017-10-09"
type: web
demoUrl: "/demos/jsrun/f2iKp.html"
legacyUrl: "https://jsrun.net/f2iKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "交互", "布局"]
---

## 简介

纯 CSS 演示 position: sticky（含 -webkit-sticky）。首段灰色块 sticky 且 top:50px；下方多个 section 内红色 h2 也 sticky、top:0，随滚动在各自 section 范围内吸顶。脚本仅把各 div 编号为 1、2、3…，便于观察粘性边界。

## 如何测试验证

1. 在 iframe 内向下滚动，观察顶部编号块是否在距顶约 50px 处「粘住」
2. 继续滚，看吸顶块最终是否随内容滚走
3. 滚到绿色边框的 section，观察红色「I am sticky」标题是否贴顶
4. 跨到下一 section，确认上一标题释放、下一标题开始吸顶
5. 对比奇数/偶数块底色，核对编号是否连续

## 相关规范与文档

- [MDN: position](https://developer.mozilla.org/zh-CN/docs/Web/CSS/position)
- [SegmentFault 相关讨论](https://segmentfault.com/q/1010000011442574)

## 注意

需在可滚动视口中看效果；sticky 父级若有 overflow:hidden 等限制会失效（本页用于对照常见坑）。
