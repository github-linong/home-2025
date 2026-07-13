---
title: "Script Error Same Origin Policy"
description: "src=\"../js/scripterror.js\" 无跨域限制单页面 src=\"https://www.lilnong.top/static/js/scripterror.js?1\""
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/sf-a-1190000019815534-Script-error-Same-origin-policy.html"
legacyUrl: "/static/html/sf-a-1190000019815534-Script-error-Same-origin-policy.html"
category: "思否配套"
badge: "博客配套"
tags: ["legacy", "SegmentFault", "博客配套"]
relatedPosts: ["sf-1190000019815534"]
---

## 简介

跨域脚本错误（Script error.）与同源策略演示主页：对比本地脚本与跨域脚本的 error 信息差异。

## 如何测试验证

1. 触发本地脚本错误，确认有完整 message / stack。
2. 触发跨域脚本错误，观察是否只得到 "Script error."。
3. 给 script 加 crossorigin 并配置 CORS，验证是否恢复详情。
4. 系列 -1 ~ -4 为对照变体，可一并打开。

## 相关规范与文档

- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [MDN: GlobalEventHandlers.onerror](https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [HTML: script crossorigin](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#crossorigin)
