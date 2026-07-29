# 数字人「看向 / 指向 / 介绍」经验整理

来源：民生大屏讲解 + `/demos/avatar-pointing` 指向实验室（2026-07）。

## Goal

把「数字人介绍屏幕上某一位置」拆成可复用的语义层与实现坑，避免下次从零踩。

## Scope / Non-goals

- Scope：注视、同侧手、讲解式伸手、加载与调度边界、TalkingHead 约束。
- Non-goals：不写完整 SDK；不替代大屏业务逻辑。

## 核心结论（先记住这几条）

1. **「介绍某位置」≠「指尖贴像素」**  
   讲解语义是：先看过去 → 同侧手前伸示意该区域。像素级命中是另一档目标，不要混用验收标准。

2. **屏幕左右 ≠ 解剖左右**  
   人物正对镜头时：观众左边是解剖 `RightArm`，观众右边是解剖 `LeftArm`。  
   选「同侧手」时按**屏幕侧**选，再映射到骨骼名；用户说「右边用右手」通常指**屏幕右侧那只手**。

3. **`lookAt` 不能每帧重启**  
   TalkingHead 的 `lookAt` 会取消旧的 lookat 动画再排队。RAF / 跟随鼠标里每帧调用会导致头永远转不过去（像一直正对镜头）。  
   做法：目标变化超过阈值或 `force` 时才 `lookAt`。

4. **加载成功与姿态初始化要解耦**  
   `showAvatar` 之后若立刻 `applyPointing` 抛错，会被同一个 `catch` 当成「加载失败」并 `stop()` 拆掉模型。  
   做法：种子姿态单独 `try/catch`；改名函数时全量搜引用，避免 HMR/缓存残留旧调用。

5. **硬伸到角落很容易「竖直乱抬」**  
   射线打到很远/很高的平面 → IK 解出举直手臂。  
   讲解式：`shoulder.lerp(rayHit, PRESENT_REACH≈0.4)`，并钳制相对肩部的 Y；约束尽量对齐 TalkingHead 内置 `handLeft`/`handRight`（`Arm.miny/maxy = 0`）。

## 分层建议（接入大屏时）

| 层 | 职责 | 典型 API |
|----|------|----------|
| 注视 | 告诉观众「看这里」 | `lookAt(clientX, clientY, t)` |
| 站位 | 讲解时挪到面板旁更舒服 | 业务侧 overlay 位移（大屏已有） |
| 手势 | 短时「示意一下」 | `playGesture("index"\|"handup", …, mirror)` |
| 持续指向 | 跟着目标区域保持介绍姿势 | `ikSolve` + soft present 目标 |

优先级经验（大屏）：**语音会话视觉 > 鼠标 lookAt**；无语音时才追踪鼠标。

## TalkingHead 细节速查

- `lookAt(x, y, t)`：视口 client 坐标；`t` 为动画时长相关参数。
- `playGesture(name, duration, mirror, transitionMs)`：单手模板默认左手；`mirror=true` 切到右手（解剖 Right）。
- `ikSolve(ik, target, relative, d)`：`relative=true` 时相对肩部；世界坐标瞄准用 `relative=false` 且 `d` 写入 `poseTarget`。
- 内置 `touchAt` 只适合点在身体网格上；点屏幕空白要用自建射线平面。

## 验收清单（讲解感）

- [ ] 目标在右上：头/眼朝右上，**屏幕右侧**手前伸，不是对侧交叉或竖直举臂。
- [ ] 跟随鼠标时头会转向，不会僵在正对镜头。
- [ ] 模型加载成功后，即使指向初始化失败，人物仍留在舞台上。
- [ ] 调试文案区分「tip error」与「是否贴像素」（讲解模式允许误差大）。

## Risks / Open Questions

- Avaturn 无丰富动作库，自然度上限低；长期可考虑动作片段 / Motion 库。
- `playGesture` 与 `ikSolve` 会互相覆盖，模式要互斥或分时段。
- 大屏若要「精确点名 KPI」，应单独开 poke 档（提高 reach），不要改掉 present 默认。

## Acceptance（本文档）

- 新人读完能解释：同侧手映射、lookAt 节流、soft present、加载/姿态解耦。
- 指向实验室与大屏后续改动可引用本文，避免重复踩坑。
