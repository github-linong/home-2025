---
title: "2048 AI（Alpha-Beta 搜素）"
description: "移植 ovolve 2048-AI：评估函数 + 迭代加深 Alpha-Beta，用于择优走子。"
pubDate: "2023-10-30"
type: web
demoUrl: "/demos/jsrun/XjxKp.html"
legacyUrl: "https://jsrun.net/XjxKp"
category: "算法"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "游戏", "算法"]
---

## 简介

内含 Tile/Grid 与 AI：eval 综合平滑度、单调性、空格与最大值；search 做 Alpha-Beta；iterativeDeep 在 minSearchTime(100ms) 内加深。run 循环尝试驱动外部页面按钮，并从 getMapThat 读盘面，调用 gameThat.moveUp/Right/Down/Left。本页无棋盘 UI，单独打开缺少游戏宿主。

## 如何测试验证

1. 阅读 AI.eval 与 search 理解评价与剪枝
2. 确认 minSearchTime 与 getBest 迭代加深
3. 在完整宿主页中观察自动走子（若可用）
4. 对照上游 2048-AI 仓库理解算法
5. 在控制台查看 run 打印的 DOM 探测结果

## 相关规范与文档

- [2048-AI 原项目](http://ovolve.github.io/2048-AI/)
- [GitHub ovolve/2048-AI](https://github.com/ovolve/2048-AI)

## 注意

依赖 jQuery、$、getMapThat、gameThat 等外部全局；迁移页几乎只有算法与挂载钩子，单独预览无法玩完整 2048。
