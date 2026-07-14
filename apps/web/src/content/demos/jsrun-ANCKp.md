---
title: "上传前本地文件预览（拖放/粘贴）"
description: "拖放、点击或粘贴文件后，在上传前本地预览并展示音频/视频/图片/文本/JSON/PDF/Excel 信息。"
pubDate: "2025-09-22"
type: web
demoUrl: "/demos/jsrun/ANCKp.html"
legacyUrl: "https://jsrun.net/ANCKp"
category: "表单"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Vue", "工具", "JavaScript"]
---

## 简介

左侧虚线区支持点击选文件与拖放高亮；右侧展示 name/size/type/lastModified。analysisFile 按 MIME/扩展名分流：文本、JSON（尝试 parse）、音视频与图片用 Object URL 并读取时长/宽高；PDF 用 lilnong 上 pdf.js viewer iframe；xlsx/xls 用 XLSX 转各 sheet HTML。亦监听 paste。预览后会调用 uploadFile 向 /upload_any 提交（演示环境可能失败）。

## 如何测试验证

1. 将图片、音频、视频、pdf 或 xlsx 拖入虚线上传区
2. 或点击「点击上传」选择文件，查看右侧基本信息与预览
3. 复制含文件的剪贴板内容后在页面粘贴，确认是否触发预览
4. 切换 Excel 多表标题查看不同 sheet 的 HTML 表格

## 相关规范与文档

- [PDF.js 相关测试页](https://www.lilnong.top/static/html/pdfjs-test.html)
- [SheetJS](https://docs.sheetjs.com/)
- [HTML Drag and Drop](https://developer.mozilla.org/zh-CN/docs/Web/API/HTML_Drag_and_Drop_API)

## 注意

HTML 原 title 为路径式文件名；页面声明依赖 Element 图标类名与 XLSX 全局，完整能力需对应脚本在运行环境中可用。
