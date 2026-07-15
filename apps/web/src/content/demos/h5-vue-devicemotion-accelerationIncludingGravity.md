---
title: "摇一摇检测"
heroImage: "/heroes/demo/h5-vue-devicemotion-accelerationIncludingGravity.webp"
description: "devicemotion 摇一摇。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/h5-vue-devicemotion-accelerationIncludingGravity.html"
legacyUrl: "/static/html/h5-vue-devicemotion-accelerationIncludingGravity.html"
category: "移动端"
badge: "精选"
tags: ["legacy", "移动端", "精选"]
---

## 简介

使用 DeviceMotionEvent（含重力加速度）实现摇一摇检测。需注意权限策略与桌面端无传感器的降级。

## 如何测试验证

1. 在真机浏览器打开（桌面通常无加速度计）。
2. iOS 13+ 需先通过用户手势请求权限（DeviceMotionEvent.requestPermission）。
3. 用力摇动设备，确认回调触发并更新 UI。
4. 静止放置，确认阈值过滤后不会误触发。

## 相关规范与文档

- [MDN: DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent)
- [MDN: Device orientation events](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events)
- [W3C: DeviceOrientation Event](https://www.w3.org/TR/orientation-event/)
