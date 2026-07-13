---
title: "上传前文件预览"
description: "SegmentFault交互示例：上传前文件预览。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/sf-a-1190000022597533-file-preview-input-drop.html"
legacyUrl: "/static/html/sf-a-1190000022597533-file-preview-input-drop.html"
category: "SegmentFault"
badge: "博客配套"
tags: ["legacy", "SegmentFault", "博客配套"]
relatedPosts: ["sf-1190000018605820", "sf-1190000022597533"]
---

## 简介

上传前预览：支持 input 选择与拖拽投放，预览图片 / 音视频 / 文本。思否文章配套 Demo。

## 如何测试验证

1. 点击选择文件，确认预览类型正确。
2. 拖拽文件到投放区，确认 drop 生效。
3. 分别测试图片、音频、视频、文本。
4. 多文件时检查列表与移除逻辑。

## 相关规范与文档

- [MDN: Drag and Drop](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)
- [MDN: DataTransfer](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer)
- [MDN: FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [MDN: URL.createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
