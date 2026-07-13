---
title: "User Session List Virtual Insertsort Log 2"
description: "实验交互示例：User Session List Virtual Insertsort Log 2。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/user-session-list-virtual-insertsort-log-2.html"
legacyUrl: "/static/html/user-session-list-virtual-insertsort-log-2.html"
category: "实验"
badge: "博客配套"
tags: ["legacy", "实验", "博客配套"]
relatedPosts: ["sf-1190000037455206"]
---

## 简介

会话列表虚拟化 + 插入排序相关实验：大量条目下插入 / 排序并打日志，观察性能与顺序正确性。

## 如何测试验证

1. 增加列表人数，确认滚动仍流畅。
2. 随机 push / sort，检查顺序与日志。
3. 对比非虚拟列表的 DOM 节点数。

## 相关规范与文档

- [MDN: DocumentFragment](https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment)
- [MDN: Array.prototype.sort()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort)
- [MDN: Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
