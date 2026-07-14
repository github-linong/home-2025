---
title: "Vue 大转盘旋转与分区指示"
description: "用 Vue 驱动圆形转盘持续旋转，并根据角度计算当前朝上分区编号。"
pubDate: "2018-09-30"
type: web
demoUrl: "/demos/jsrun/SXhKp.html"
legacyUrl: "https://jsrun.net/SXhKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "游戏", "CSS", "动画"]
---

## 简介

八扇区分的简易转盘：v-for 生成分区标记，圆弧用 transform rotate；mounted 里 setInterval 累加 rotateArc，computed 用 rotate 样式与公式算当前扇区。演示绑定 + 变换动画，未见指针点击抽停逻辑。

## 如何测试验证

1. 打开页面看红色圆是否在持续旋转
2. 观察圆上 1–8 分区标记是否绕圆心转动
3. 看下方数字随旋转变化（角度与当前扇区）
4. 用开发者工具改 data.num 或 rotateArc 观察反应
5. 确认控制台是否有 Vue is not defined（依赖缺失时）

## 相关规范与文档

- [Vue 2 官方文档](https://v2.cn.vuejs.org/v2/guide/)
- [MDN: transform](https://developer.mozilla.org/zh-CN/docs/Web/CSS/transform)

## 注意

已补 Vue 2 CDN；主要演示持续旋转与扇区计算，未见点击抽停逻辑。
