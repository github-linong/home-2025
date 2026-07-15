---
title: "拖拽分割条调整侧栏宽度"
heroImage: "/heroes/demo/jsrun-9EVKp.webp"
description: "通过中间 resize 条拖动，动态改变 Element UI 菜单侧栏宽度（最小 200px）。"
pubDate: "2021-06-21"
type: web
demoUrl: "/demos/jsrun/9EVKp.html"
legacyUrl: "https://jsrun.net/9EVKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "布局", "Vue"]
---

## 简介

左侧 el-menu 宽度绑定 detailWidth（初始 200），中间 5px 宽 #resize 捕获 mousedown，mousemove 用位移更新宽度；小于 200 强制回到 200，并短时提示「不能再缩放了」。右侧橙色 .box 占剩余空间。松开后清除 mousemove/mouseup。

## 如何测试验证

1. 按住中间细条向右拖，侧栏变宽
2. 向左拖到不能再缩时看提示
3. 松开后确认不再跟随鼠标
4. 切换菜单展开项确认布局仍可用
5. 在 Vue 数据中观察 detailWidth 变化

## 相关规范与文档

- [Element UI Menu](https://element.eleme.cn/#/zh-CN/component/menu)
- [鼠标拖拽改宽思路](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/mousemove_event)

## 注意

页面只引入了 Element UI，未显式引入 Vue；若全局无 Vue，菜单与拖拽脚本无法运行。
