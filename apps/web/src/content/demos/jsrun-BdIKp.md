---
title: "ECharts 径向决策树（预算超降）"
description: "用 Vue 2 编辑各地区科目的预算与支出，ECharts tree（radial）按超降比例着色并持久化。"
pubDate: "2020-12-27"
type: web
demoUrl: "/demos/jsrun/BdIKp.html"
legacyUrl: "https://jsrun.net/BdIKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "ECharts", "Vue", "图形", "JavaScript"]
---

## 简介

演示将「事业部门 → 地区 → 科目」三级数据映射为 ECharts 径向树图。表格中修改预算/实际支出后，计算超降比例（budget/expenses - 1），超额（负值）标红，否则青色。数据写入 localStorage（键 www.lilnong.top-company），树底可用背景图并根据整体超降切换红色滤镜。

## 如何测试验证

1. 打开页面，查看径向树与地区/科目汇总表
2. 在科目行修改 budget、expenses 数字输入
3. 等待约 1 秒深监听汇总后，再点 setOptions 刷新树
4. 确认超降为负时树节点与底部底座呈现红色
5. 刷新页面，确认 localStorage 恢复了上次数据

## 相关规范与文档

- [ECharts Tree 系列](https://echarts.apache.org/zh/option.html#series-tree)
- [Vue 2 侦听器](https://v2.cn.vuejs.org/v2/api/#watch)

## 注意

占比字段 expenses_mix 未在 watch 中赋值；初始化会生成 6 地区 × 14 科目的随机数据（若无缓存）。
