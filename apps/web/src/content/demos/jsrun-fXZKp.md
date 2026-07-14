---
title: "纯 CSS 瀑布流 / 多列布局骨架"
description: "本意对比 column、flex、grid 与 masonry 类结构做纯 CSS 瀑布流，但迁移后样式丢失。"
pubDate: "2018-03-22"
type: web
demoUrl: "/demos/jsrun/fXZKp.html"
legacyUrl: "https://jsrun.net/fXZKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "布局"]
---

## 简介

页面保留多种布局示意：.column 多列、.flexbox、.grid 页头页脚、以及不同高度的 .masonry/.item 块。标题与结构指向纯 CSS 瀑布流（多列/列流），脚本为空。当前 <style> 内容变成「服务异常，请稍候再试」，有效 CSS 已丢失，预览几乎无排版。

## 如何测试验证

1. 打开页面，确认标题仍为「纯CSS实现瀑布流布局」
2. 查看源码中 .box.column / .flexbox / .grid / .masonry 等 HTML 骨架
3. 注意 <style> 是否仅为错误文案而非规则
4. 对比各块数字与「长文本」占位是否按列错落（当前通常不会）
5. 若修复样式后，再对照 column / flex / grid / masonry 四块差异

## 相关规范与文档

- [W3CPlus：纯 CSS 实现瀑布流](https://www.w3cplus.com/css/pure-css-create-masonry-layout.html)
- [MDN: CSS multi-column](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_multicol_layout)

## 注意

关键：style 被「服务异常」占位覆盖，现场无可用布局样式，不可当完整瀑布流效果验收。
