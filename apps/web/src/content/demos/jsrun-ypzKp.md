---
title: "Office 文件浏览器端预览"
description: "选择本地 Word/PPT/Excel 等文件，用多个库在页面内渲染预览。"
pubDate: "2022-05-10"
type: web
demoUrl: "/demos/jsrun/ypzKp.html"
legacyUrl: "https://jsrun.net/ypzKp"
category: "工具"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "工具"]
---

## 简介

页面提供 file input，按 MIME 或扩展名分流：.docx（及部分 msWord）走 docx.renderAsync；.pptx 走 PPTXjs 的 pptxToHtml；.xlsx/.xls/.et/.csv/.xml 走 SheetJS 读 workbook 再 sheet_to_html。同时加载了 mammoth（代码中有 render_mammoth 但默认分支未走它）以及 Promise/JSZip 等依赖，体量较大。

## 如何测试验证

1. 点击文件选择控件，挑选 docx、pptx 或表格类文件
2. 等待预览区渲染出文档、幻灯片或工作表 HTML
3. 打开控制台查看 ext、workbook、docx finished 等日志
4. 可对比不同格式与库的预览效果与限制

## 相关规范与文档

- [docx-preview](https://www.npmjs.com/package/docx-preview)
- [SheetJS](https://docs.sheetjs.com/)
- [mammoth.js](https://www.npmjs.com/package/mammoth)
- [kkFileView](https://kkfileview.keking.cn/zh-cn/docs/home.html)

## 注意

依赖多个 CDN（unpkg、bootcdn、lilnong 静态资源、cdn.sheetjs.com），离线或跨域可能失败。.doc 等老格式分支被注释掉。
