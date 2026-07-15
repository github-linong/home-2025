---
title: "数字翻牌 / 滚动切换特效骨架"
heroImage: "/heroes/demo/jsrun-DKbKp.webp"
description: "多列 0–9 数字条按随机五位数切换 class，实现翻牌滚动所需 DOM，但样式与 jQuery 缺失。"
pubDate: "2019-07-11"
type: web
demoUrl: "/demos/jsrun/DKbKp.html"
legacyUrl: "https://jsrun.net/DKbKp"
category: "实验"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "动画", "jQuery", "JavaScript"]
---

## 简介

结构为多列 .number-item，每列含 0–9；每 2 秒生成随机五位数，给各列设 number-item--数字类，并用 #clog 显示目标数。典型「odomometer/翻牌」靠 CSS 位移实现，但 <style> 同样是「服务异常」占位，且使用 $ 却未引入 jQuery。

## 如何测试验证

1. 打开页面，看五列 0–9 是否垂直堆叠裸露
2. 观察下方 #clog 是否约每 2 秒变一个五位数
3. 看各列 class 是否变为 number-item--0…9
4. 打开控制台确认是否报 $ is not defined
5. 样式修复并引入 jQuery 后，再验收翻滚动画

## 相关规范与文档

- [jQuery 官方文档](https://api.jquery.com/)
- [MDN: className](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/className)

## 注意

上游 JSRUN 的原始 CSS 已丢失；站点侧已补最小翻牌样式与 jQuery CDN，可看到五位数字滚动切换。
