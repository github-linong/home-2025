---
title: "基于 HTML5 的跨容器拖放"
heroImage: "/heroes/demo/jsrun-DRYKp.webp"
description: "用原生 HTML5 Drag and Drop，把红色区域的可拖拽标签拖进绿色空容器。"
pubDate: "2017-08-23"
type: web
demoUrl: "/demos/jsrun/DRYKp.html"
legacyUrl: "https://jsrun.net/DRYKp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "JavaScript"]
---

## 简介

演示原生 HTML5 拖放：元素设 draggable="true"，在 dragstart 记录源节点，目标容器在 dragover 里 preventDefault，ondrop 时 appendChild 完成转移。标题虽写「排序」，实际是跨两个容器搬移，并非列表内重排。交互事件会打到控制台，便于对照生命周期。

## 如何测试验证

1. 在红色区域按住某个灰色标签开始拖动
2. 拖到下方绿色空白区域，松开鼠标
3. 确认该标签从红区消失并出现在绿区
4. 打开开发者工具控制台，观察 ondragstart / ondragover / ondrop 日志
5. 再拖其他标签进绿区，验证可连续追加

## 相关规范与文档

- [MDN: HTML 拖放 API](https://developer.mozilla.org/zh-CN/docs/Web/API/HTML_Drag_and_Drop_API)
- [MDN: DataTransfer](https://developer.mozilla.org/zh-CN/docs/Web/API/DataTransfer)

## 注意

实际能力是跨容器拖放，不是同列表排序；需鼠标拖拽，触摸端可能不可用。
