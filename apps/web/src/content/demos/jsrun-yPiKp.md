---
title: "纯 CSS 按钮 Loading 菊花"
description: "给按钮加 loading 类即可隐藏文字并显示无图片旋转菊花指示器。"
pubDate: "2017-11-08"
type: web
demoUrl: "/demos/jsrun/yPiKp.html"
legacyUrl: "https://jsrun.net/yPiKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "动画"]
---

## 简介

源自张鑫旭微码示例：匹配 a/label 且 class 含 -btn，再加 .loading。::first-line 文字透明隐藏文案；::before 用多重 box-shadow 拼出八点菊花，steps(8) 的 spinZoom 动画缩放旋转。示例为带 -btn loading 的链接。无需图片或 JS。

## 如何测试验证

1. 打开页面观察链接上的旋转菊花与透明文字
2. 阅读 .loading::before 的 box-shadow 八点布局
3. 尝试去掉 loading 类（在控制台或本地改）恢复文字可见
4. 对照 spinZoom 关键帧理解 steps 分步旋转

## 相关规范与文档

- [张鑫旭微码原页](http://www.zhangxinxu.com/php/microCodeDetail.php?id=5)
- [CSS ::before](https://developer.mozilla.org/zh-CN/docs/Web/CSS/::before)
- [animation](https://developer.mozilla.org/zh-CN/docs/Web/CSS/animation)

## 注意

HTML 原 title 为张鑫旭 URL；选择器要求 class 名包含 -btn。
