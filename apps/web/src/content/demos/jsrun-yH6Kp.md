---
title: "Canvas 重叠圆面积占比（面试题）"
description: "用 destination-out 画多个圆挖空，再按透明像素占比估算重叠区域相对整幅画布的面积。"
pubDate: "2020-10-21"
type: web
demoUrl: "/demos/jsrun/yH6Kp.html"
legacyUrl: "https://jsrun.net/yH6Kp"
category: "算法"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "算法"]
---

## 简介

针对「多圆重叠面积占比」类题：整幅先铺实色，再用 destination-out 画若干圆挖空；定时扫描 imageData alpha===0 像素占比显示在 eraseRate。canvas 用 transform: scale(1,-1) 翻转坐标系；也支持手工拖刮。fill 按钮未绑事件。

## 如何测试验证

1. 打开后看画布上是否已有多个圆形挖空
2. 读 eraseRate，约为透明像素占全画布比例
3. 在挖空区外再按住拖动，看比例是否上升
4. 对照 transform: scale(1,-1) 理解 y 方向视觉翻转
5. 点「覆盖」——当前脚本未绑定，预期通常无反应

## 相关规范与文档

- [MDN: getImageData](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [MDN: globalCompositeOperation](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)

## 注意

占比相对整幅 100×100 画布，非精确解析几何公式；「覆盖」按钮无监听器。
