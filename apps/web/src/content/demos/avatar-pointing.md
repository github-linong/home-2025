---
title: "3D 人物指向研究 · Pointing Lab"
description: "独立实验室：对比 lookAt、指向手势与 TalkingHead ikSolve，研究数字人如何指向屏幕上的目标点。"
pubDate: "2026-07-28"
type: external
demoUrl: "/demos/avatar-pointing"
category: "AI"
badge: "新作"
tags: ["AI", "数字人", "3D", "WebGL", "IK", "指向"]
---

专门研究「3D 数字人指向某一个点」的独立 Demo，与民生大屏讲解页解耦。

- 复用 Avaturn 写实模型与 TalkingHead 渲染管线
- 全身居中取景并拉远相机，上下左右留白便于点测
- 在舞台上点击或跟随鼠标设置目标点（可视化准星）
- 三种策略可切换对比：
  - **Look**：仅 `lookAt` 头眼看向目标
  - **Gesture**：看向目标 + `index` / `handup` 手势
  - **IK**：用 TalkingHead 内置 `ikSolve`（CCD）驱动肩→肘→腕指向 3D 目标
- 调试面板显示屏幕坐标、左右手选择与末端投影误差，便于迭代参数

[新窗口打开 Demo](/demos/avatar-pointing)
