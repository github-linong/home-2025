# Goal

新建独立 demo，专门研究「3D 数字人指向 / 介绍屏幕上某一点」：可切换多种策略、可视化目标点与误差，便于后续接到大屏。

# Scope / Non-goals

- Scope
  - 新页面 `/demos/avatar-pointing` + demos 内容条目。
  - 复用 Avaturn + TalkingHead + `lib/avatar/visuals`。
  - 三种模式：`look`（只看）、`gesture`（看 + 指向手势）、`ik`（讲解式手臂 IK）。
  - 点击/跟随鼠标设目标；调试面板显示坐标、左右手、投影误差。
  - **讲解语义**：看上去是在介绍该位置的内容——先注视，再同侧手前伸示意；不追求指尖贴像素。
- Non-goals
  - 不接 LLM / TTS / 语音唤醒。
  - 不改民生大屏页。
  - 不追求首版像素级命中。

# Steps

1. 写计划与 TalkingHead 类型（`ikSolve`）。
2. 新建 `avatar-pointing.astro` 实验室页面。
3. 实现目标点、三模式、调试读数。
4. 注册 `content/demos/avatar-pointing.md`。
5. 修正「介绍感」细节：
   - 同侧手（屏幕左→解剖 RightArm，屏幕右→解剖 LeftArm）。
   - `lookAt` 节流，避免 RAF 每帧重启导致头不转。
   - IK 目标改为 shoulder→射线的 soft present（`PRESENT_REACH`），并限制竖直抬手。
   - 约束对齐 TalkingHead 内置 `handLeft`/`handRight`。

# Risks / Open Questions

- IK 目标深度平面选错会导致手臂穿模或抬不到角落。
- `playGesture` 与 `ikSolve` 可能互相覆盖，需模式互斥。
- Avaturn 无动作库，自然度上限仍低。
- 「介绍」与「精确指向」是不同目标；后续大屏接入时要二选一或分层。

# Acceptance Criteria

- 能加载数字人并在舞台上点选目标；全身居中且四周有可点留白。
- 三种模式均可观察差异；IK 时手臂朝目标方向变化，且头/眼会看向目标。
- 点右上角时：同侧（屏幕右侧）手前伸介绍，而不是竖直乱抬或对侧交叉。
- demo 列表可找到并打开该页。
