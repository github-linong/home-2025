---
title: "Textarea 事件触发测试"
heroImage: "/heroes/demo/textarea-event-test.webp"
description: "交互式演示 input、change、keydown、keypress、keyup 在 textarea 上的触发时机与冒泡/阻止默认行为差异。"
pubDate: "2020-05-16"
type: web
demoUrl: "/demos/html/textarea-event-test.html"
legacyUrl: "/static/html/textarea-event-test.html"
category: "表单"
badge: "博客配套"
tags: ["legacy", "表单", "博客配套"]
relatedPosts: ["sf-1190000022539504"]
---

## 简介

面试向事件对比页：在 textarea 上观察 input、change、keydown、keypress、keyup 的触发时机，以及 stopPropagation / preventDefault 的影响。

## 如何测试验证

1. 在输入框打字、删字、输入中文（IME），观察各类事件日志顺序。
2. 失焦前后对比 change 是否触发。
3. 勾选 stopPropagation / preventDefault，确认冒泡与默认行为变化。
4. 对照文章结论：哪些键会触发 keypress、input 与 change 的差异。

## 相关规范与文档

- [MDN: input event](https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event)
- [MDN: change event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event)
- [MDN: KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
- [MDN: Event.stopPropagation()](https://developer.mozilla.org/en-US/docs/Web/API/Event/stopPropagation)
- [MDN: Event.preventDefault()](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault)
