---
title: "SVG 路径描边与沿线运动动画"
heroImage: "/heroes/demo/jsrun-QUzKp__98981.webp"
description: "汇总 SVG stroke-dasharray 流光描边与 CSS offset-path 沿线粒子动画片段。"
pubDate: "2022-06-14"
type: web
demoUrl: "/demos/jsrun/QUzKp__98981.html"
legacyUrl: "https://jsrun.net/QUzKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "SVG", "动画", "图形", "Vue"]
---

## 简介

文件混入多份示例：顶部简单 path；中部是「信息机房应用成效」类 Vue/SFC 片段（tab 切换多组 polyline，g-rect-fill 用 dashoffset 做流动高亮）；底部是登录页风格的 SVG path + 多个 div 沿 offset-path 循环运动。含 CSDN 原文链接与版权声明。可直接运行并可见的主要是静态 SVG 与末段样式动画；Vue 模板依赖未引入的运行环境。

## 如何测试验证

1. 打开页面观察顶部 path 与独立 polyline 的描边流光动画
2. 查看中部 Vue 模板中的 svgData 与 lineMove 关键帧实现思路
3. 观察底部沿线运动元素（需浏览器支持 offset-path）
4. 阅读文内 CSDN 链接了解大屏线条动画写法

## 相关规范与文档

- [CSDN 原文：SVG 线条动画](https://blog.csdn.net/sunxiaobai1/article/details/122862625)
- [stroke-dasharray](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute/stroke-dasharray)
- [offset-path](https://developer.mozilla.org/zh-CN/docs/Web/CSS/offset-path)

## 注意

meta slug 为 QUzKp；中间 Vue SFC（scoped less、组件 import）在纯 HTML 环境下无法完整运行。
