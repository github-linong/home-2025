---
title: "不确定高度列表展开收起动画"
description: "先测量 ul 实际高度再在固定矮高度与全高之间 transition，实现动态高度折叠。"
pubDate: "2021-04-22"
type: web
demoUrl: "/demos/jsrun/PT3Kp.html"
legacyUrl: "https://jsrun.net/PT3Kp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "动画", "交互"]
---

## 简介

随机生成约 10–20 条 li，mounted 的 $nextTick 里记录 ul 真实 offsetHeight 并设为 style.height。点击「收缩/放出」在该全高与 3em 之间切换；ul 有 transition: all 0.5s 与 overflow:hidden。页面引入了 Element UI 样式/脚本但交互未使用其组件。解决「高度未知时不好做 CSS 动画」的常见手法。

## 如何测试验证

1. 进入页面等待列表按随机条数渲染并测定高度
2. 点击「收缩/放出」观察列表高度过渡
3. 再次点击恢复全高，确认动画连贯
4. 打开控制台查看 testnum、showli 相关日志

## 相关规范与文档

- [Element.offsetHeight](https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLElement/offsetHeight)
- [Vue 2 $nextTick](https://v2.cn.vuejs.org/v2/api/#vm-nextTick)

## 注意

依赖全局 Vue；Element UI 对本 demo 非必需。
