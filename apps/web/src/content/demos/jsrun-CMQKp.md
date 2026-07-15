---
title: "鼠标悬停聚焦高亮元素"
heroImage: "/heroes/demo/jsrun-CMQKp.webp"
description: "监听 mouseover，给当前元素加超大 box-shadow，形成聚光灯式遮罩高亮。"
pubDate: "2022-05-06"
type: web
demoUrl: "/demos/jsrun/CMQKp.html"
legacyUrl: "https://jsrun.net/CMQKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "JavaScript", "交互", "CSS"]
---

## 简介

页面散落多组列表（含 absolute/fixed/relative）。运行逻辑在 body 上监听 mouseover：去掉上一目标的 lilnong-focus，给当前目标加上该类；该类用极大扩散的半透明黑影实现聚焦。顶部虽有 click/mouseover/none 单选且引入 Popper，但现有脚本未读取单选，也未创建 tooltip。

## 如何测试验证

1. 打开页面，把鼠标移到任意列表文字上。
2. 确认当前元素被高亮，四周出现大范围暗色遮罩。
3. 移到其他元素，确认高亮跟随切换。
4. 可尝试点顶部 radio，观察实际仍只有悬停聚焦在工作。

## 相关规范与文档

- [原 JSRUN](https://jsrun.net/CMQKp)

## 注意

eventName 单选与 Popper/#tooltip 未接入；MD 写「mouseover 自带写样式」与现行脚本一致。
