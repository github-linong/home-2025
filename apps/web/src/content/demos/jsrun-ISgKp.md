---
title: "Vue 递归树形组件"
heroImage: "/heroes/demo/jsrun-ISgKp.webp"
description: "用自引用 item 组件实现可折叠、可增子节点的树形视图。"
pubDate: "2018-09-12"
type: web
demoUrl: "/demos/jsrun/ISgKp.html"
legacyUrl: "https://jsrun.net/ISgKp"
category: "Vue"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "交互"]
---

## 简介

经典 Vue 树形 demo：item 模板内再渲染 item。文件夹由 children 数组判定；单击切换 open；双击叶子可变为文件夹并新增子项；文件夹下有「+」可添加。左侧竖线样式强化层级。适合学习组件递归与树数据就地修改。

## 如何测试验证

1. 点击带 [+/-] 的节点展开或折叠子树
2. 双击叶子节点，将其变为文件夹并自动添加子项
3. 在已展开文件夹底部点「+」添加 new stuff
4. 对照 isFolder、toggle、changeType、addChild 理解递归结构

## 相关规范与文档

- [Vue 2 组件基础（递归）](https://v2.cn.vuejs.org/v2/guide/components.html)
- [Vue.set](https://v2.cn.vuejs.org/v2/api/#Vue-set)

## 注意

依赖全局 Vue；本地 HTML 未内嵌 CDN。sketch 中另有 SegmentFault 关联描述。
