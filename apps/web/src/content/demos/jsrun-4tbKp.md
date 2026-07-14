---
title: "Canvas 刮奖涂层与擦除比例"
description: "用 destination-out 刮开涂层，统计透明像素占比，并支持轨迹回放与重新覆盖。"
pubDate: "2019-09-11"
type: web
demoUrl: "/demos/jsrun/4tbKp.html"
legacyUrl: "https://jsrun.net/4tbKp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "JavaScript", "交互"]
---

## 简介

刮刮乐原型：涂层 fill/贴图后，鼠标按下拖动以 destination-out 擦除（光标图）；定时 getImageData 算 alpha===0 比例；「自动」按预设轨迹回放，「覆盖」用 source-over 重填。依赖 _.throttle，页面未引入 lodash。

## 如何测试验证

1. 在 canvas 上按住鼠标刮开涂层，露出背景图
2. 观察 #eraseRate 刮开比例是否升高
3. 看「节点记录」是否追加鼠标轨迹点
4. 点「覆盖」恢复遮罩后再刮一次
5. 点「自动」看是否按轨迹自动刮开（若 _.throttle 报错则先看控制台）

## 相关规范与文档

- [MDN: globalCompositeOperation](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
- [MDN: getImageData](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [Lodash throttle](https://lodash.com/docs/#throttle)

## 注意

使用 _.throttle 但未引入 lodash，脚本可能中断；背景/笔刷图依赖 lilnong.top，可能失败；主要为鼠标事件。
