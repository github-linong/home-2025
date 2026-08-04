---
title: "腾讯地图 · 能力测试"
heroImage: "/heroes/demo/tencent-map-capabilities.webp"
description: "前端实验交互示例：腾讯地图能力测试台，覆盖坐标转换、行政区划、逆地址解析、IP 定位、地点搜索、关键词提示、静态地图、驾车路线等 10 项常用 WebService / JS 能力，逐项可填参测试。"
pubDate: "2026-08-04"
type: web
demoUrl: "/demos/html/tencent-map-capabilities.html"
category: "地图"
badge: "实验"
tags: ["地图", "腾讯地图", "WebService", "能力测试", "实验"]
---

## 简介

一个自包含的「腾讯地图能力测试台」前端 Demo：把腾讯地图常用的 10 项 WebService / JS 能力做成可展开测试的卡片，逐项填入参数即可发起真实请求并查看返回。

能力分两类，页面已用标签标出：

- **直连可用（绿标）**：坐标转换（纯算法）、逆地址解析、地点搜索、静态地图——浏览器内即可跑通。
- **需代理（黄标）**：行政区划列表 / 子级查询 / 搜索、IP 定位、关键词提示、驾车路线——这些是 WebService REST 接口，`apis.map.qq.com` 未开放 CORS，浏览器直连会被拦截。页面会构造并展示**完整请求 URL**，供你在自己的服务端代理转发（Key 也建议放服务端，避免泄露）。

已内置默认 Key（仅前端 JS API 用途），打开即用；可在右上角 ⚙ 替换为你自己的 Key（仅存浏览器 localStorage，不上传）。

## 能力清单

| 能力 | 类型 | 说明 |
| --- | --- | --- |
| 坐标转换 | 直连 | WGS84 / GCJ02 / BD09 互转 |
| 逆地址解析 | 直连 | 经纬度 → 中文地址 |
| 地点搜索 | 直连 | 关键词搜周边 POI |
| 静态地图 | 直连 | 生成地图图片 |
| 行政区划列表 | 代理 | 全国行政区划 |
| 行政区划子级查询 | 代理 | 按父级 ID 查子级 |
| 行政区划搜索 | 代理 | 按名称搜行政区 |
| IP 定位 | 代理 | IP → 城市/经纬度 |
| 关键词输入提示 | 代理 | 输入联想 |
| 驾车路线规划 | 代理 | 起终点驾车路线 |

## 技术要点

- 坐标转换：`eviltransform` 算法（WGS84↔GCJ02↔BD09），中国境外坐标不偏移。
- 逆地址解析 / 地点搜索：加载腾讯地图 GL（`libraries=service`），用 `TMap.service.ReverseGeocoder` 与 `TMap.service.Search.searchNearby`（注意位置参数名是 `center` 不是 `location`）。
- 静态地图：直接拼接 `apis.map.qq.com/staticmap/v2/image` 的 `<img>` 地址。
- WebService REST：统一 `fetch` + 友好 CORS 提示，并回显请求 URL。
- 移动优先：卡片网格自适应塌缩、44px 触摸目标、毛玻璃面板、`prefers-reduced-motion` 降级。

## 如何测试验证

1. 打开 Demo，点任意能力卡片展开测试面板。
2. 直连类（坐标转换 / 逆地址解析 / 地点搜索 / 静态地图）点「测试」即可看到真实返回。
3. 代理类点「测试」会展示完整请求 URL 与 CORS 提示——把它放到你自己的服务端代理即可拿到数据。
4. 右上角 ⚙ 可替换为你自己的 Key（逆地址解析、地点搜索、静态地图需在腾讯地图控制台开通对应权限并将当前域名加白名单）。
