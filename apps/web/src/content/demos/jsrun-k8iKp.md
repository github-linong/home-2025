---
title: "D3.js 树状图（行政区划）"
description: "内联 D3 v3，用 layout.tree 与 svg.diagonal 绘制「中国→省→市」层级树。"
pubDate: "2017-10-31"
type: web
demoUrl: "/demos/jsrun/k8iKp.html"
legacyUrl: "https://jsrun.net/k8iKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "D3", "SVG", "图形"]
---

## 简介

将 d3 打包进页面后，用 d3.layout.tree().size 计算节点，d3.svg.diagonal 画连线，SVG 节点为小矩形+文本。数据为省市区假树（浙江/广西/黑龙江/新疆等）。静态图，无折叠展开交互。

## 如何测试验证

1. 打开页面确认出现横向展开的树（根「中国」）
2. 核对省份节点下是否有对应城市文字
3. 沿灰色 link 路径看父子连线
4. 用开发者工具检查生成的 svg/g/node
5. 此示例无点击折叠，仅静态浏览即可

## 相关规范与文档

- [D3 官方站点](https://d3js.org/)
- [Observable: d3-hierarchy](https://d3js.org/d3-hierarchy)

## 注意

内联的是偏 D3 v3 API（layout.tree / svg.diagonal）；文件体积大；无缩放拖拽等交互。
