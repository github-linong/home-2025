# Goal

在 `livelihood-dashboard` 增加语音唤醒入口：采集现场麦克风音频，用浏览器 SpeechRecognition 转写中文问题，再走现有 guide + TTS 讲解链路。

# Scope / Non-goals

- Scope
  - 新增「语音提问 / 聆听中」按钮，基于 Web Speech API（`zh-CN`）。
  - 开启后持续聆听；拿到最终识别文本后自动 `ask()`。
  - 数字人播报期间暂停识别，避免回采 TTS；播报结束后若仍处于唤醒态则恢复聆听。
  - 不支持 ASR 的浏览器给出明确禁用/提示，文字提问仍可用。
- Non-goals
  - 不做云端 ASR / 自定义唤醒词模型。
  - 不改 guide / TTS 后端协议。

# Steps

1. UI：askRow 增加麦克风按钮与聆听态样式。
2. 接入 `SpeechRecognition` / `webkitSpeechRecognition`。
3. 与 `voiceSessionActive` 联动：讲解中 abort 识别；`endVoiceSession` 后按需重启。
4. 更新 demo 文案与计划验收。

# Risks / Open Questions

- Chrome/Edge 可用；Safari 支持差。识别依赖厂商服务，不等于离线。
- 现场嘈杂可能误触发；可用最短字数门槛（如 ≥2 字）过滤。
- 连续模式下 `no-speech` / `aborted` 需忽略，避免误报。

# Acceptance Criteria

- 启动数字人后可点「语音提问」开始聆听。
- 说话提问后出现识别文本并自动讲解回答。
- 播报时不再监听；播报结束（唤醒仍开）自动继续听。
- 无 ASR 时按钮禁用且状态有提示。
