---
title: "Flex/Calc/绝对定位底部固定对比"
heroImage: "/heroes/demo/jsrun-vIzKp.webp"
description: "对比多种 header-content-footer 布局在固定高度、max-height、min-height 下的底部固定表现。"
pubDate: "2022-06-02"
type: web
demoUrl: "/demos/jsrun/vIzKp.html"
legacyUrl: "https://jsrun.net/vIzKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "布局"]
---

## 简介

四组方案并排展示：demo1 为纵 flex + footer absolute + 底 padding；同结构再演示 content 加 flex:auto；demo2 纯 flex 无 absolute；demo3 用 calc 限制 content 最大高度；demo4 头尾 absolute、content 全高加上下 padding。顶部固定「add」按钮可向所有 .content 追加 remove 按钮以观察溢出滚动。

## 如何测试验证

1. 先观察各组在默认 content 较少时 footer 是否贴底
2. 点击 add 向各 content 追加按钮，观察滚动与 footer 位置
3. 拖拽改变各 .body 尺寸（resize），对比 maxHeight/minHeight 变体
4. 对照页面内中文说明理解 absolute、flex:auto、calc 的取舍

## 相关规范与文档

- [CSS Flexible Box](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flexible_box_layout)
- [calc()](https://developer.mozilla.org/zh-CN/docs/Web/CSS/calc)
- [position](https://developer.mozilla.org/zh-CN/docs/Web/CSS/position)

## 注意

Grid 方案（demo5）在 HTML 中已整段注释，当前不可见。
