---
title: "Rot.js 迷宫实验室"
heroImage: "/heroes/demo/sf-rotjs-maze-lab.webp"
description: "Rot.js + Pathfinding.js：多算法迷宫、FOV 战争迷雾、寻路与热力图的可交互测试台。"
pubDate: "2025-12-22"
type: web
demoUrl: "/demos/html/sf-1010000046824743-rot.html"
legacyUrl: "https://segmentfault.com/q/1010000046824743"
category: "图形"
badge: "精选"
tags: ["精选", "legacy", "游戏", "算法", "Canvas"]
---

## 简介

基于 Rot.js 与 Pathfinding.js 的迷宫「测试实验室」：可切换多种迷宫生成算法，叠加视野（FOV）/ 战争迷雾、动态光照与障碍，并对比多套寻路结果。另可用热力图与自动移动检查行为。同系列还有存档版、3D 版与纯 FOV 专项页。

## 如何测试验证

1. 切换迷宫算法（Divided / Eller / Digger / Cellular 等），观察地图形态差异。
2. 勾选 FOV / 战争迷雾，移动角色看可见区域是否更新。
3. 开启寻路算法对比，检查路径绘制是否合理。
4. 试用「自动移动」与热力图，确认动画与路径统计仍工作。

## 相关规范与文档

- [SegmentFault 原问题](https://segmentfault.com/q/1010000046824743)
- [rot.js](https://ondras.github.io/rot.js/manual/)
- [PathFinding.js](https://github.com/qiao/PathFinding.js)
