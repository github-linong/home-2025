---
title: "点阵心形标记生成器"
heroImage: "/heroes/demo/jsrun-cUUKp.webp"
description: "在 20×20 网格上点选打标签，上方格子按标记播放进场动画并铺头像图。"
pubDate: "2021-11-15"
type: web
demoUrl: "/demos/jsrun/cUUKp.html"
legacyUrl: "https://jsrun.net/cUUKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "图形", "动画", "JavaScript", "工具"]
---

## 简介

上下两块 20×20 网格。下方点击写入当前标签索引到 tagHash；上方对已标记格加动画类并请求头像图。标签历史写入 localStorage（LN_XING_JSON）。可用按钮切换标签索引，以及「删除/新节点」（当前都把 currentTag 设为 -1）。

## 如何测试验证

1. 打开页面，在下方网格点击若干格，看颜色是否按标签变化。
2. 观察上方对应格子是否陆续出现进场动画与头像底图。
3. 点击下方标签索引按钮切换 currentTag，再点新格子验证分组。
4. 刷新页面，确认 localStorage 能恢复上次标记（若浏览器允许）。

## 相关规范与文档

- [原 JSRUN](https://jsrun.net/cUUKp)

## 注意

头像 URL 为 http 外链可能失效或被混合内容拦截；「删除/新节点」文案与行为不完全对应。
