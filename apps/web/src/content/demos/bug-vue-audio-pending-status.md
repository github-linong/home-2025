---
title: "Vue Audio Pending 状态复现"
description: "Bug交互示例：Vue Audio Pending 状态复现。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/bug-vue-audio-pending-status.html"
legacyUrl: "/static/html/bug-vue-audio-pending-status.html"
category: "Bug"
badge: "博客配套"
tags: ["legacy", "Bug", "博客配套"]
relatedPosts: ["sf-1190000022957951"]
---

## 简介

复现 Vue 更新 DOM 时可能导致 `<audio>` 进入异常 pending / 无法播放的状态。用于排查音频元素被意外重渲染的问题。

## 如何测试验证

1. 按页面步骤触发 Vue 更新（切换数据 / v-if）。
2. 观察 audio readyState、networkState 与能否播放。
3. 对比 key 固定 / 不销毁节点时的行为差异。
4. 在 Chrome Media 面板查看请求是否被中断。

## 相关规范与文档

- [MDN: HTMLMediaElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
- [MDN: HTMLMediaElement.readyState](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState)
- [Vue: key 与复用](https://vuejs.org/guide/essentials/list.html#maintaining-state-with-key)
