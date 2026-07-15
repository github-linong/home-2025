---
title: "CSS :link / :visited 伪类与透明背景实验"
heroImage: "/heroes/demo/jsrun-8diKp.webp"
description: "对比链接未访问/已访问/悬停/按下样式，并用不同 alpha 的背景测 :visited 限制。"
pubDate: "2017-11-20"
type: web
demoUrl: "/demos/jsrun/8diKp.html"
legacyUrl: "https://jsrun.net/8diKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS"]
---

## 简介

演示 a:link、:visited、:hover、:active 的颜色与字号变化，另加 a1–a4：在 link/visited 上设不同 rgba 背景。用于观察浏览器对 :visited 可改样式的限制（隐私相关），并非爱恨投票交互。

## 如何测试验证

1. 观察默认「Hello」为红色大字（:link）
2. 点击某一链接后，看 :visited 是否变为蓝底红字等样式
3. 悬停、按下时分别观察 :hover / :active
4. 对比 Hello1–Hello4 点击前后背景是否可见差异
5. 结合开发者工具查看各 class 的 :visited 规则哪些实际生效

## 相关规范与文档

- [MDN: :visited](https://developer.mozilla.org/zh-CN/docs/Web/CSS/:visited)
- [知乎相关专栏文](https://zhuanlan.zhihu.com/p/29747893)

## 注意

现代浏览器对 :visited 可应用样式有严格限制，部分背景差异可能看不见；标题 Love or hate 非功能描述。
