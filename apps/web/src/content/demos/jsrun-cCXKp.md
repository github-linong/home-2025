---
title: "Vue 时间轮盘结构草稿"
description: "用 Vue 渲染秒、分、时三段数字列表，对应抖音风格时间轮盘屏保思路。"
pubDate: "2019-04-24"
type: web
demoUrl: "/demos/jsrun/cCXKp.html"
legacyUrl: "https://jsrun.net/cCXKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue"]
---

## 简介

页面用 Vue 在 #app 内渲染 seconds/minutes/hours 三段：分别循环输出「0秒…」「0分…」「0时…」，数据为 60、60、24。Markdown 称其为抖音时间轮盘屏保小 DEMO，并链到掘金文章。当前 HTML 无样式，也未引入 Vue 脚本。

## 如何测试验证

1. 打开页面，查看是否渲染出秒/分/时三段标签文字。
2. 若控制台报 Vue 未定义，说明独立打开时依赖缺失。
3. 对照掘金原文理解完整轮盘视觉与动画应有的样式与交互。
4. 对比本文件与文章实现差异：此处多为数据与模板骨架。

## 相关规范与文档

- [掘金原文](https://juejin.im/post/5cbdbea3f265da037875967f)
- [原 JSRUN](https://jsrun.net/cCXKp)

## 注意

HTML 内无 script 引入 Vue，style 为空；独立打开通常无法运行完整轮盘效果。
