---
title: "SortableJS 与 Vue 列表同步排序"
description: "Sortable 拖拽 ul 项后，在 onEnd 中 splice 同步 Vue 的 list 数组。"
pubDate: "2021-07-27"
type: web
demoUrl: "/demos/jsrun/468Kp.html"
legacyUrl: "https://jsrun.net/468Kp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "Vue"]
---

## 简介

创建 10 条带 id/val/checked 的数据渲染列表。mounted 时对 #sortWrap 调用 Sortable.create（delay 100、animation 150 等）。拖拽结束后用 newIndex/oldIndex 对 list 做 splice 重排，下方 JSON 实时反映顺序。点击项会将 checked 置 true。

## 如何测试验证

1. 拖动列表项改变顺序
2. 观察下方 JSON 数组顺序是否同步
3. 点击某项，确认 checked 变为 true
4. 尝试快速拖拽，感受 delay:100
5. 在控制台打印 list 核对 id 序列

## 相关规范与文档

- [SortableJS](https://github.com/SortableJS/Sortable)
- [Sortable onEnd](https://github.com/SortableJS/Sortable#event-object-demo)
