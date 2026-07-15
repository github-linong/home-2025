---
title: "多图预览放大缩小与旋转"
heroImage: "/heroes/demo/jsrun-PuzKp.webp"
description: "弹层展示多张图，用 CSS transform 的 scale/rotate 做放大、缩小、重置、旋转。"
pubDate: "2022-07-12"
type: web
demoUrl: "/demos/jsrun/PuzKp.html"
legacyUrl: "https://jsrun.net/PuzKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "CSS", "交互"]
---

## 简介

点「传图片」把预设头像 URL 列表填入 showImgUrl 并显示操作钮。每张图可放大（multiples+=0.25，上限 2）、缩小（下限 1）、重置、旋转（degs-=90）。样式绑定 rotate()+scale()。虽引入 Cropper/jQuery，业务代码未调用 Cropper 实例。

## 如何测试验证

1. 点击「传图片」打开预览
2. 对某张图点「放大1」多次，观察上限约 2 倍
3. 点「缩小1」「重置1」「旋转」
4. 点「关闭」隐藏弹层
5. 确认空列表时显示「暂无数据」

## 相关规范与文档

- [CSS transform](https://developer.mozilla.org/zh-CN/docs/Web/CSS/transform)
- [Cropper.js（本页未实际使用）](https://github.com/fengyuanchen/cropperjs)

## 注意

标题含 cropper，但放大逻辑纯 CSS；外链图片依赖 cors-www.lilnong.top 是否可访问。
