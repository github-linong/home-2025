---
title: "导航下划线跟随选中项"
description: "纯 CSS 利用伪元素与兄弟选择器，让导航下划线在选中项间滑动跟随。"
pubDate: "2021-10-11"
type: web
demoUrl: "/demos/jsrun/3nTKp.html"
legacyUrl: "https://jsrun.net/3nTKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "交互", "动画", "Vue"]
---

## 简介

横向 flex 导航列表由 Vue 生成约 20 项（Mock.js 中文名）。点击切换 selected。下划线由 li::before 的 border-bottom 控制：选中项宽度铺满并延迟展开，其后兄弟项 left 归零，从而形成跟随滑动的视觉。风格参考 CodePen 相关实现。

## 如何测试验证

1. 打开页面，确认默认第一项带底部下划线。
2. 依次点击不同导航文字，观察下划线是否滑动到新选中项。
3. 按住某项观察 :active 黑底白字反馈。
4. 对比长短文案项，确认下划线宽度随项宽变化。

## 相关规范与文档

- [CodePen 参考](https://codepen.io/Chokcoco/pen/PRJvLN)
- [原 JSRUN](https://jsrun.net/3nTKp)

## 注意

依赖 bootcdn 的 Vue 与 Mock.js；无网络时列表可能无法生成。
