---
title: "Flex 图标与多行文本对比"
heroImage: "/heroes/demo/jsrun-HxWKp.webp"
description: "对比普通流式、默认 Flex、以及逐字 wrap 的 Flex，观察图标旁多行中文排版差异。"
pubDate: "2019-12-12"
type: web
demoUrl: "/demos/jsrun/HxWKp.html"
legacyUrl: "https://jsrun.net/HxWKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "Vue"]
---

## 简介

标题为「flex 实现图标加多行文本功能」。页面分三块：默认流式布局、默认 Flex、带 flex-wrap 且把字符串拆成单字 span 的 Flex。每块左侧有两个 logo 图，右侧为长文本。MD 说明灵感来自 Weex 限制文字长度的场景。

## 如何测试验证

1. 打开页面，查看「默认的流式布局」中图片与文字如何换行。
2. 对比「默认的Flex布局」：图标与整段文字作为 flex 子项时的挤占方式。
3. 查看「处理的Flex布局」：文字被拆成单字后配合 flex-wrap 的换行效果。
4. 注意当前文案出现乱码「恩」等字符，属迁移编码问题，不影响布局对比意图。

## 相关规范与文档

- [原 JSRUN](https://jsrun.net/HxWKp)

## 注意

未引入 Vue CDN，独立打开可能报错；中文串已损坏；logo 来自 cdn.jsrun.top，可能失效。
