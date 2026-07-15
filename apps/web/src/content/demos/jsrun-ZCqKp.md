---
title: "粘贴剪贴板图片即时预览"
heroImage: "/heroes/demo/jsrun-ZCqKp.webp"
description: "监听 paste，用 clipboardData 取文件并用 FileReader 读成 DataURL 显示截图。"
pubDate: "2018-03-02"
type: web
demoUrl: "/demos/jsrun/ZCqKp.html"
legacyUrl: "https://jsrun.net/ZCqKp"
category: "交互"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "JavaScript", "交互"]
---

## 简介

极简「截图粘贴预览」：在页面监听 paste，若 clipboardData.files 有文件则 FileReader.readAsDataURL，把结果赋给 img#showImage。含文本输入框便于聚焦；无实际上传服务，仅本地预览。

## 如何测试验证

1. 用系统截图或复制一张图片到剪贴板
2. 点击页面空白或输入框获得焦点
3. 按 Cmd/Ctrl+V 粘贴
4. 确认下方 img 显示出刚粘贴的图
5. 打开控制台查看 clipboardData 相关日志

## 相关规范与文档

- [MDN: ClipboardEvent.clipboardData](https://developer.mozilla.org/zh-CN/docs/Web/API/ClipboardEvent/clipboardData)
- [MDN: FileReader.readAsDataURL](https://developer.mozilla.org/zh-CN/docs/Web/API/FileReader/readAsDataURL)

## 注意

无图片文件时粘贴会被忽略；需用户手势粘贴，不能纯自动演示。
