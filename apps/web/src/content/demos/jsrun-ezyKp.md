---
title: "端内 Upload 组件（客户端/H5 分流）"
description: "封装 vv-upload：按 UA 与开关在 App 内客户端上传与 H5 file 输入间切换。"
pubDate: "2019-06-19"
type: web
demoUrl: "/demos/jsrun/ezyKp.html"
legacyUrl: "https://jsrun.net/ezyKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "交互", "JavaScript", "工具"]
---

## 简介

自定义 vv-upload：默认 slot 文案「上传图片」，隐藏 file input（accept 默认 image/*）。根据 isClientAutoUpload、isClientUpload 等 props 计算 labelFor：端内客户端上传时返回 false 并走 uploadImage 分支占位逻辑，否则绑定 input id 走 H5 选文件。示例展示默认、带 slot、多个实例。适合对照混合 App 上传能力封装思路。

## 如何测试验证

1. 查看三个 vv-upload 实例的默认文案与自定义 slot
2. 在浏览器中点击上传，确认走 H5 隐藏 file input
3. 阅读 isIOS/isAndroid/isVVMusic 与 labelFor 计算逻辑
4. 对照 props 思考端内自动分流与端外 H5 的开关组合

## 相关规范与文档

- [Vue 2 自定义组件](https://v2.cn.vuejs.org/v2/guide/components-custom-events.html)
- [<input type="file">](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/input/file)

## 注意

客户端上传分支仅为占位（空 XHR）；inputChange 使用 e.files，标准事件应为 e.target.files。
