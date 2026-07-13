---
title: "摇一摇 + 震动 + 音频"
description: "摇一摇 完整DEMO - 摇一摇手机， ，为分数统计"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/sf-a-1190000022552442-shake-devicemotion-vibrate-audio.html"
legacyUrl: "/static/html/sf-a-1190000022552442-shake-devicemotion-vibrate-audio.html"
category: "SegmentFault"
badge: "博客配套"
tags: ["legacy", "SegmentFault", "博客配套"]
relatedPosts: ["sf-1190000022552442"]
---

## 简介

摇一摇综合 Demo：DeviceMotion 检测 + vibrate 反馈 + 音频提示。对应思否文章配套示例。

## 如何测试验证

1. 真机授权传感器后摇动，应触发震动与音效。
2. 静音模式下确认震动仍可用（音频可能受限）。
3. 连续摇动时检查节流，避免音频重叠轰炸。

## 相关规范与文档

- [MDN: DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent)
- [MDN: Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- [MDN: HTMLAudioElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement)
