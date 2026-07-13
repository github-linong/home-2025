---
title: "Vue 弹幕 Bug · 修复（:key=id）"
description: "改为 :key=\"item.id\" 的修复版，对照 .1 复现路径验证。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/vue-bug-bullet.2.html"
legacyUrl: "/static/html/vue-bug-bullet.2.html"
category: "Vue"
badge: "博客配套"
tags: ["legacy", "Vue", "博客配套"]
relatedPosts: ["sf-1190000037465717"]
---

## 简介

Vue 弹幕 Bug 修复版：在问题版基础上给出修正实现。

## 如何测试验证

1. 用与 .1 相同操作路径验证 Bug 已消失。
2. 回归：普通发送、快速发送、窗口缩放。

## 相关规范与文档

- [Vue: key](https://vuejs.org/api/built-in-special-attributes.html#key)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
