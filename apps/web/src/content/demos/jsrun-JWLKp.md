---
title: "Vue.Draggable 勾选批量拖拽"
description: "左侧源列表勾选多项后拖入目标列表，一次把所有勾选项批量放入。"
pubDate: "2020-08-06"
type: web
demoUrl: "/demos/jsrun/JWLKp.html"
legacyUrl: "https://jsrun.net/JWLKp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "Vue"]
---

## 简介

三列：源 list（pull:clone、不可 put）、目标 list1/list2（同 group people）。源项可勾选；从源拖出时，change 回调把所有 checked 项一并 push 到 related 列表并取消勾选。moveHandle 记录拖拽上下文。标题虽写 jquery，实现核心是 Vue + Vue.Draggable。

## 如何测试验证

1. 在源列表勾选多个人名项
2. 拖到 list1 或 list2 放下
3. 确认所有勾选项都进入目标，且源勾选被清空
4. 再试只拖一项对比行为
5. 查看顶部 list/list1/list2 数据绑定

## 相关规范与文档

- [Vue.Draggable](https://github.com/SortableJS/Vue.Draggable)
- [Sortable group](https://github.com/SortableJS/Sortable#group-option)

## 注意

已补 Vue / Sortable / Vue.Draggable CDN。页面仍可能引用 Element UI 样式类名；核心批量拖拽逻辑不依赖它。
