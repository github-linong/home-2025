---
title: "Input number 校验 Bug 复现"
heroImage: "/heroes/demo/input-number-validity.webp"
description: "表单交互示例：Input number 校验 Bug 复现。"
pubDate: "2020-10-29"
type: web
demoUrl: "/demos/html/input-number-validity.html"
legacyUrl: "/static/html/input-number-validity.html"
category: "表单"
badge: "博客配套"
tags: ["legacy", "表单", "博客配套"]
relatedPosts: ["sf-1190000037628688"]
---

## 简介

复现 / 验证 `<input type="number">` 的约束校验（min / max / step）与 ValidityState 行为；type 改为 text 时的差异。

## 如何测试验证

1. 输入越界数字，触发浏览器默认校验气泡。
2. 调用 checkValidity / reportValidity，观察 ValidityState。
3. 改为 type=text 后对比 pattern / 自定义校验。
4. 清空输入，检查 valueMissing / badInput。

## 相关规范与文档

- [MDN: ValidityState](https://developer.mozilla.org/en-US/docs/Web/API/ValidityState)
- [MDN: <input type="number">](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/number)
- [MDN: Constraint validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation)
- [HTML Standard: form submission](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraint-validation)
