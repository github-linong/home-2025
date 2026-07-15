---
title: "Rot.js 迷宫实验室（存档版）"
heroImage: "/heroes/demo/sf-rotjs-maze-save.webp"
description: "在迷宫实验室基础上增加地图/状态存档与恢复，便于反复对照实验。"
pubDate: "2025-12-22"
type: web
demoUrl: "/demos/html/sf-1010000046824743-rot-save.html"
legacyUrl: "https://segmentfault.com/q/1010000046824743"
category: "图形"
badge: "精选"
tags: ["精选", "legacy", "游戏", "算法", "Canvas"]
---

## 简介

Rot.js 迷宫实验室的存档变体：在多算法生成、FOV、寻路等能力上补充持久化/恢复流程，适合需要「固定地图再测算法」的场景。建议与主实验室页对照使用。

## 如何测试验证

1. 生成一张迷宫后保存状态，刷新或重置后尝试恢复。
2. 对同一地图切换寻路/FOV 开关，确认行为可复现。
3. 与主实验室页对比，确认存档相关控件可用。

## 相关规范与文档

- [SegmentFault 原问题](https://segmentfault.com/q/1010000046824743)
- [rot.js](https://ondras.github.io/rot.js/manual/)
