---
title: "intro.js 表单引导测试"
heroImage: "/heroes/demo/jsrun-KAQKp.webp"
description: "在 Element UI 添加 Feed 弹窗流程中嵌入 intro.js，试验无按钮步进式新手引导。"
pubDate: "2022-04-29"
type: web
demoUrl: "/demos/jsrun/KAQKp.html"
legacyUrl: "https://jsrun.net/KAQKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "Vue", "表单"]
---

## 简介

页面为「添加」按钮与弹窗表单（名称、父目录、链接）。首次进入若 localStorage 无 autoIntro，会自动开引导：隐藏步数/按钮/进度，依赖 blur/change/确定触发 nextStep。引导进行中限制非高亮区指针事件，高亮区可操作。

## 如何测试验证

1. 首次打开（或清掉 localStorage 的 autoIntro）观察是否自动进入引导态。
2. 点击「添加」打开对话框，看高亮是否落到名称等表单项。
3. 在名称输入后失焦、选择父目录、填写链接失焦，确认引导进入下一步。
4. 点「确定」完成最后一步；退出后 introState 应变回未引导。

## 相关规范与文档

- [intro.js](https://introjs.com/)
- [原 JSRUN](https://jsrun.net/KAQKp)

## 注意

部分 CDN/raw GitHub 主题可能失效；引导依赖 introState 与自定义样式，属试验代码而非完整产品。
