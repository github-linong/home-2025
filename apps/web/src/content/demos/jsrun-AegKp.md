---
title: "Vue 多选选中效果三种写法"
description: "用三个并列 Vue 实例对比数组、对象映射、条目属性三种多选状态管理。"
pubDate: "2018-07-24"
type: web
demoUrl: "/demos/jsrun/AegKp.html"
legacyUrl: "https://jsrun.net/AegKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "表单"]
---

## 简介

同一份 javascript/css/html/vue 列表被三个 app 共享。app_1 用 id 数组存选中并用 ~indexOf 判断；app_2 用对象键映射配合 $set/$delete；app_3 直接在 item 上挂 vv_selected。选中项文字变红（.selected）。可对照不同数据结构对勾选状态与渲染的影响。

## 如何测试验证

1. 分别点击三列列表项切换选中（再次点击取消）
2. 观察每列上方展示的选中 id 列表是否同步变化
3. 对比数组 splice、对象 $set/$delete、item 属性三种实现差异
4. 注意三实例共享同一 _list 引用时 app_3 改写 item 可能影响其他列

## 相关规范与文档

- [Vue 2 列表渲染](https://v2.cn.vuejs.org/v2/guide/list.html)
- [Vue.set / Vue.delete](https://v2.cn.vuejs.org/v2/api/#Vue-set)

## 注意

页面依赖全局 Vue，本地 HTML 未内嵌 Vue CDN。
