---
title: "Vue2/Vue3 共存与组件 API 化探索"
description: "同页加载 Vue2 与 Vue3，挂载 Vue2 组件并草拟框架无关的 create/update/destroy API。"
pubDate: "2022-03-03"
type: web
demoUrl: "/demos/jsrun/UbeKp.html"
legacyUrl: "https://jsrun.net/UbeKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue"]
---

## 简介

先引入 Vue 2.6 存为 Vue2，再引入 Vue 3.2 全局构建。定义带 value/a/slots 的 vue2Data 组件，在 Vue2 中用 v-model、动态具名 slot 挂载。后续 getProps 读取 props 默认值，APIComponent 草拟 create/setOptions/setSlot/destory 与事件 on/once/emit/off（create 内仍为占位）。用于探索「用统一 API 在非 Vue3 环境消费 Vue2 组件」的方向。

## 如何测试验证

1. 打开控制台确认 Vue2、Vue3 版本并存
2. 在 #vue2_1 区域点击按钮触发 input / input1 事件并看日志
3. 阅读 getProps 如何从 props 定义推导初始值
4. 查看 APIComponent 的状态机与待实现方法清单

## 相关规范与文档

- [Vue 2 文档](https://v2.cn.vuejs.org/)
- [Vue 3 全局构建](https://cn.vuejs.org/guide/quick-start.html)
- [相关 JSRUN：vue2InVue2](https://jsrun.net/RM9Kp/edit)

## 注意

标题含「vue3 使用 vue2」，本文件主体仍是 Vue2 挂载与 API 设计草稿；Vue3 变量已赋值但未完成桥接渲染。
