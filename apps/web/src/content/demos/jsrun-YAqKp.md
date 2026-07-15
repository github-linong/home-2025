---
title: "CSS shape-outside 模拟 iPhone X 刘海绕排"
heroImage: "/heroes/demo/jsrun-YAqKp.webp"
description: "用 shape-outside: polygon 让列表随滚动绕开刘海形轮廓，并附 clip-path 变形动画。"
pubDate: "2018-03-06"
type: web
demoUrl: "/demos/jsrun/YAqKp.html"
legacyUrl: "https://jsrun.net/YAqKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "交互"]
---

## 简介

张鑫旭思路的实践：浮动透明条用 shape-outside: polygon 模拟刘海凹槽，滚动时用 JS 把 scrollTop 写进多边形坐标，让列表行随刘海位移。页首圆形图用 shape-outside: content-box 做环绕；底部 .ani 用 clip-path polygon 关键帧动画。

## 如何测试验证

1. 看顶部圆形图片旁文字是否沿圆形外侧绕排
2. 在中间黑框列表内上下滚动
3. 观察文字是否随滚动在左侧「躲开」刘海轮廓
4. 对照半透明刘海图与实际生效的浮动 .shape
5. 再看下方六边形渐变块的 clip-path 来回变形

## 相关规范与文档

- [张鑫旭：Shapes 与 iPhone X 刘海](http://www.zhangxinxu.com/wordpress/2017/09/css-shapes-outside-iphone-x-head/)
- [MDN: shape-outside](https://developer.mozilla.org/zh-CN/docs/Web/CSS/shape-outside)
- [MDN: clip-path](https://developer.mozilla.org/zh-CN/docs/Web/CSS/clip-path)

## 注意

刘海图 liu.png 若路径缺失则只见绕排不见贴图；部分外链 logo 可能失败。需在列表容器内滚动，非整页滚动。
