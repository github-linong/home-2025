---
title: "扫雷地图与邻雷计数"
heroImage: "/heroes/demo/jsrun-sfQKp.webp"
description: "Vue 生成 10×10 棋盘，随机布雷并用负数展示邻雷数，点击可翻开与蔓延。"
pubDate: "2022-04-07"
type: web
demoUrl: "/demos/jsrun/sfQKp.html"
legacyUrl: "https://jsrun.net/sfQKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "游戏", "算法", "Vue"]
---

## 简介

状态约定：0 未翻空格，负数表示邻雷数，1 已翻开，2 为雷。初始化随机放雷并计算邻雷。点击非雷格将格子标为已翻开；若原值为 0 则向四向递归蔓延。雷格以粉背景显示，数值也直接画在格子上，偏算法可视而非完整隐蔽玩法。

## 如何测试验证

1. 打开页面，查看 10×10 格网及可能显示的雷（2）与负数邻雷提示。
2. 点击值为 0 的格子，观察是否变为 1 并向四周自动翻开。
3. 点击带负数的安全格，确认只翻开该格而不扩散。
4. 点击雷格（值为 2）时手动点击不会触发翻开逻辑（自动蔓延会跳过雷）。

## 相关规范与文档

- [原 JSRUN](https://jsrun.net/sfQKp)

## 注意

雷与数字初始即可见，无胜负结算与插旗；依赖 Vue CDN。
