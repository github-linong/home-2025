---
title: "腾讯地图 · 定位我的位置"
heroImage: "/heroes/demo/tencent-map-locate.webp"
description: "前端实验交互示例：调用腾讯地图 JS API GL 与浏览器地理定位，识别用户当前位置并标注到地图。无 Key 不加载、错误可恢复、支持点图选点。"
pubDate: "2026-08-03"
type: web
demoUrl: "/demos/html/tencent-map-locate.html"
category: "地图"
badge: "实验"
tags: ["地图", "腾讯地图", "geolocation", "实验"]
---

## 简介

一个自包含的前端 Demo：调用浏览器原生 `navigator.geolocation` 拿到用户经纬度，再用**腾讯地图 JS API GL** 把位置标注到地图上，并通过反向地理编码显示所在地址。

已内置一个默认的腾讯地图 JS API Key（仅前端 JS API 用途，靠域名白名单保护），打开即可直接定位；如需替换可在右上角 ⚙ 填入自己的 Key（仅存浏览器 localStorage，不上传），并在腾讯地图控制台把当前域名加入白名单。

## 交互说明

- **定位我的位置**：请求浏览器定位权限，成功后在地图中心放置脉冲标记并平移过去。
- **点图选点**：若拒绝定位或无权限，可直接点击地图任意位置手动标注。
- **复制坐标 / 回到此处**：在地址卡片上复制 `lat, lng` 或重新居中。
- 定位失败、脚本加载失败、无 Key 等均会保留界面并给出下一步引导。

## 技术要点

- 腾讯地图 GL：`TMap.Map` / `TMap.MultiMarker` / `TMap.service.ReverseGeocoder`。
- 浏览器定位：`navigator.geolocation.getCurrentPosition`，带超时与高精度参数。
- 移动优先：全屏布局、44px 触摸目标、毛玻璃面板、`prefers-reduced-motion` 降级。

## 如何测试验证

1. 打开 Demo，默认已内置 Key，直接点「定位我的位置」即可（域名需已在腾讯地图控制台加白名单）；要用自己的 Key 可在右上角 ⚙ 替换。
2. 点「定位我的位置」，允许浏览器定位权限，确认地图平移到你的位置并显示地址。
3. 拒绝权限后，确认可点击地图选点；复制坐标按钮可用。
4. 移动端或窄窗口下确认全屏可用、按钮可点。
