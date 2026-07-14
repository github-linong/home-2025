---
title: "Axios 自动重试与取消"
description: "封装 axiosAutoTry：支持重试次数、超时重试、503 退避，以及 CancelToken 取消。"
pubDate: "2022-01-26"
type: web
demoUrl: "/demos/jsrun/yn9Kp.html"
legacyUrl: "https://jsrun.net/yn9Kp"
category: "实验"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "axios"]
---

## 简介

失败时若 __try_count>0 则递减并重试：ECONNABORTED（超时）立即递归；HTTP 503 随机延时 500–1000ms 后再试。五个按钮：普通请求、503 重试、5s 超时重试、CancelToken.source 取消、executor 取消。结果打到 top.console。

## 如何测试验证

1. 点 demo1 看普通成功/失败日志
2. 点 demo2 观察 503 多次重试
3. 点 demo3 结合 timeout:5000 看超时路径
4. 点 demo4/demo5，约 1.5s 后取消，核对 isCancel
5. 打开控制台过滤「重试请求」警告

## 相关规范与文档

- [Axios](https://axios-http.com/zh/docs/intro)
- [Cancellation](https://axios-http.com/zh/docs/cancellation)

## 注意

请求打到 www.lilnong.top 的 cors/corsutils；离线或跨域失败时重试行为仍可从控制台理解。
