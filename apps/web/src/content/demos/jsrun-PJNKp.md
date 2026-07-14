---
title: "CSS 局部光照（径向渐变跟随鼠标）"
description: "设置风格卡片上用 radial-gradient 与 CSS 变量实现聚光灯式局部高光。"
pubDate: "2021-03-24"
type: web
demoUrl: "/demos/jsrun/PJNKp.html"
legacyUrl: "https://jsrun.net/PJNKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS"]
---

## 简介

页面结构为黑色盒子上的「系统」设置项与绝对定位 .effect 层。原意是：mousemove 更新 --pt-x/--pt-y，effect 用 radial-gradient(circle at …) 在指针处形成白色光晕。半透明卡片边框/背景配合光晕，做出局部被照亮的观感（对应 SegmentFault 问题）。

## 如何测试验证

1. 对照标题与 .effect 层理解局部光照意图
2. 在完整实现中移动鼠标，观察光斑跟随
3. 查看 item 的半透明 border/background 如何「吃」到光
4. 用开发者工具改 --pt-x/--pt-y 验证径向渐变圆心
5. 阅读源站问题了解需求背景

## 相关规范与文档

- [SegmentFault 原问题](https://segmentfault.com/q/1010000039359551)
- [CSS radial-gradient](https://developer.mozilla.org/zh-CN/docs/Web/CSS/gradient/radial-gradient)
- [CSS 自定义属性](https://developer.mozilla.org/zh-CN/docs/Web/CSS/Using_CSS_custom_properties)

## 注意

已从 snippets 源文件恢复样式与 mousemove 脚本；在黑底设置卡片上移动鼠标即可看到局部光斑跟随。
