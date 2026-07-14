---
title: "ECharts GL 三维饼/环图"
description: "用 echarts-gl 的 surface 参数方程绘制林地/草地/耕地三维饼图，支持点击与悬停。"
pubDate: "2021-11-21"
type: web
demoUrl: "/demos/jsrun/VsUKp.html"
legacyUrl: "https://jsrun.net/VsUKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "ECharts", "图形", "Vue"]
---

## 简介

Vue 组件在 400×200 容器内初始化图表。数据为林地、草地、耕地面积及配色；getPie3D 生成 parametric surface 扇区，内径比约 0.8。图例显示名称与占比。点击可选中扇区位移，悬停略放大；视角旋转/缩放/平移灵敏度均为 0。

## 如何测试验证

1. 打开页面，确认出现三维饼/环图与顶部图例百分比。
2. 将鼠标移到某一扇区，观察是否轻微放大高亮。
3. 点击扇区，确认选中时外移；再点子可取消或切换。
4. 移出图表区域，确认悬停高亮会取消。

## 相关规范与文档

- [ECharts](https://echarts.apache.org/)
- [原 JSRUN](https://jsrun.net/VsUKp)

## 注意

tooltip formatter 被改成几乎空内容；依赖 bootcdn 的 Vue、echarts、echarts-gl。
