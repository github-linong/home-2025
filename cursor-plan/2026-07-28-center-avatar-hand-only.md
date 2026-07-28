# Goal

语音讲解时数字人站到被介绍面板旁的舒适位置；空闲时回屏幕中心，并仅在无语音会话时跟随鼠标视线。

# Scope / Non-goals

- Scope
  - 空闲：居中 dock + 鼠标 `lookAt`。
  - 语音会话：`focusPanel` 用淡入淡出 hop 站到面板旁，再 `lookAt` 锚点并播指向手势。
  - 播报结束约 2s 后回中心 dock。
  - 鼠标追踪仍被 `voiceSessionActive` 屏蔽。
- Non-goals
  - 本轮不做手臂 IK / 像素级指向。
  - 不改后端协议。

# Steps

1. 恢复 `fadeMoveOverlay` + `standBesidePanel`（左半屏站右侧，右半屏站左侧）。
2. `focusPanel` 移动 → 落地后 lookAt/手势。
3. `returnToDockSoon` 回中心。
4. 更新验收标准。

# Risks / Open Questions

- 短句多面板切换时 hop 可能偏频；必要时可对同侧连续 focus 改为平滑平移。
- 站位 overlap 参数若挡字，再微调 `AVATAR_PANEL_OVERLAP_RATIO`。

# Acceptance Criteria

- 提问讲解时人物会移到目标面板旁，并看向锚点。
- 讲解结束后回到屏幕中心。
- 空闲时鼠标可跟视线；讲解中鼠标不抢视线。
