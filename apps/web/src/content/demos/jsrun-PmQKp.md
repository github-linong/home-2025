---
title: "driver.js 添加 Feed 引导"
description: "用 driver.js 高亮「添加」按钮并串联弹窗内多字段，测试多步产品引导。"
pubDate: "2022-04-29"
type: web
demoUrl: "/demos/jsrun/PmQKp.html"
legacyUrl: "https://jsrun.net/PmQKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "Vue"]
---

## 简介

与 intro.js 版场景类似的 Feed 订阅表单。Driver 先高亮「添加」；onNext 里 preventMove 后打开弹窗再 moveNext。随后 defineSteps 覆盖名称、父目录、链接与确定按钮。是否自动开取决于 localStorage autoIntro。

## 如何测试验证

1. 清除 localStorage 的 autoIntro 后刷新，确认「添加」被高亮并出现说明气泡。
2. 按引导进入下一步或点击「添加」，确认对话框打开且引导继续。
3. 逐步查看名称、父目录、链接、确定按钮上的引导文案。
4. 注意最后一步指向不存在的 #third-element-introduction，可能异常或无效。

## 相关规范与文档

- [driver.js](https://driverjs.com/)
- [原 JSRUN](https://jsrun.net/PmQKp)

## 注意

unpkg 的 driver.js 旧版 API（new Driver）；末步选择器不存在；仍残留未启用的 vue-introjs 注释代码。
