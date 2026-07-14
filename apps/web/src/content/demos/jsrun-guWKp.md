---
title: "弹幕滚动与 DOM 池复用"
description: "用通道与 DOM 池实现弹幕从右向左滚动，并支持输入框发送自定义弹幕。"
pubDate: "2020-01-06"
type: web
demoUrl: "/demos/jsrun/guWKp.html"
legacyUrl: "https://jsrun.net/guWKp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "交互", "JavaScript", "动画"]
---

## 简介

页面在沙漠背景上用 10 条通道、每通道最多 6 个 span 组成 DOM 池，通过 CSS transition 让弹幕从右划到左。预设弹幕池含《琵琶行》等文案与「2333333」，划出后回收到对应通道池。底部输入框可把文案推入弹幕池，点击「发送」或按 Enter 均可。

## 如何测试验证

1. 打开页面，观察多通道弹幕自动从右向左滚动。
2. 在底部输入框输入文字，点击「发送」，确认新弹幕随后出现。
3. 再输入文字后按 Enter，确认同样进入弹幕池并发射。
4. 注意较长弹幕会占用通道更久，通道满时需等待有可用 DOM 后再发。

## 相关规范与文档

- [原 JSRUN](https://jsrun.net/guWKp)

## 注意

背景图依赖外部静态资源；弹幕速度按固定 7s transition，未按宽度等比调速。
