---
title: "df 输出解析为 Vue 进度条"
description: "把 Linux df -h 风格文本拆成挂载点与占用，并用进度条可视化。"
pubDate: "2019-12-17"
type: web
demoUrl: "/demos/jsrun/L5WKp.html"
legacyUrl: "https://jsrun.net/L5WKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "JavaScript", "工具", "图形"]
---

## 简介

data 中硬编码多行 df 输出；computed 跳过表头，用非空白正则拆字段，取出挂载点、Use%、Used/Size，渲染为左名称、中绿色进度条、右「已用/总量」。进度条宽度直接用 Use% 字符串（如 11%）。简洁示范：把 shell 文本变成前端可视化。

## 如何测试验证

1. 打开页面查看各挂载点对应的绿色进度条
2. 对照右侧「Used/Size」与进度条宽度是否一致
3. 阅读 coumputedData 中 match(/[^\s]+/g) 的字段下标含义
4. 可修改 data 中字符串模拟不同 Use% 再刷新观察

## 相关规范与文档

- [Vue 2 计算属性](https://v2.cn.vuejs.org/v2/guide/computed.html)
- [df (Linux)](https://man7.org/linux/man-pages/man1/df.1.html)

## 注意

依赖全局 Vue；进度条 class 命名含拼写 coumputedData。
