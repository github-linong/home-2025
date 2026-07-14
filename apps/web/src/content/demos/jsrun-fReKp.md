---
title: "Vue keep-alive 动态 include 缓存"
description: "按路由访问把组件名写入 include 列表，从列表删除即可销毁对应缓存。"
pubDate: "2022-03-24"
type: web
demoUrl: "/demos/jsrun/fReKp.html"
legacyUrl: "https://jsrun.net/fReKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue"]
---

## 简介

左侧链到 /a、/b、/c，右侧 keep-alive :include="list" 包裹 router-view。组件名为 ComponentA/B/C，模板显示当前时间戳。路由变化时若组件名不在 list 则 push；点列表旁 x 可 splice 移除，从而失去缓存。验证：先访 A、B 再切换，时间不变即已缓存；删 A 后再进 A 会刷新时间。

## 如何测试验证

1. 点 Go to a，记录右侧时间戳
2. 再进 b、切回 a，确认时间未变（已缓存）
3. 在 list 旁点 x 删除 ComponentA
4. 再次进入 a，确认时间更新（缓存已清）
5. 对 b、c 重复验证 include 白名单效果

## 相关规范与文档

- [keep-alive include](https://v2.cn.vuejs.org/v2/api/#keep-alive)
- [Vue Router](https://v3.router.vuejs.org/zh/)

## 注意

初次进入时 list 仍为空，该次渲染未必入缓存；再次进入同路由才会明显体现 include。
