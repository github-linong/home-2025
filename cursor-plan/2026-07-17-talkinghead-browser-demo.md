# TalkingHead 浏览器数字人 Demo

## 目标

新增独立的 TalkingHead Demo：3D 形象在浏览器渲染，使用浏览器内置中文语音识别、阿里云百炼 Qwen 生成中文回复、CosyVoice 语音合成，以 HeadAudio 驱动中文口型，并由 MotionEngine 执行语义动作。

## 范围

- 新增独立 Astro Demo 页面，不修改现有灵眸页面。
- 使用 TalkingHead 和本地托管的 GLB 形象。
- 使用 Web Speech API 完成 ASR。
- 通过 `api2` 服务端代理调用 CosyVoice，API Key 不进入浏览器。
- 将 CosyVoice 返回的 WAV 解码为 PCM，并交给 TalkingHead 播放和驱动口型。
- 接入 HeadAudio AudioWorklet，从实际播放音频实时检测 Oculus viseme；初始化失败时降级为现有能量近似口型。
- CosyVoice 未配置或调用失败时降级到浏览器 TTS。
- 通过 `api2` 服务端代理调用百炼 Qwen 的 OpenAI 兼容流式接口，API Key 不进入浏览器。
- 限制提问长度、模型输出长度和单 IP 请求频率，降低公开计费接口的滥用风险。
- 要求 Qwen 返回约 100 字、最多 150 字的版本化 `avatar_response` 消息；台词放入 `speech`，动作放入可扩展的 `timeline` 事件。
- 后端校验消息类型、协议版本、动作白名单、数量和相对时间后，再以统一消息信封返回浏览器。
- 接入锁定提交版本的 MotionEngine，将 Qwen 动作映射为语义动作并在浏览器执行。
- MotionEngine 不可用或动作执行失败时降级为 TalkingHead 内置手势。
- 使用 CosyVoice 实际音频时长将最多 6 个动作分布到播报过程，形成与台词相关的连续手势。
- 播报结束、打断或离开页面时取消动作计时器并停止 MotionEngine 和 TalkingHead 手势。
- 页面跳转、刷新和关闭时停止 ASR、TTS 和 TalkingHead 动画。
- 使用 `cameraView: "full"` 全身视角展示形象。
- 新增 `side_step_left` / `side_step_right` 白名单动作：MotionEngine 播放侧身倾斜姿态，页面在渲染循环中横向平移骨架根节点（约 0.28 米、2.8 秒往返），结束或打断时自动回位。
- 新增 `turn_around` 白名单动作：转身、转圈由页面直接旋转骨架根节点完成 360°（2.4 秒、smoothstep 缓动），相机保持不动；不使用 MotionEngine 内置的躯干扭转（幅度小且观感像镜头移动）。提示词要求转圈类指令必须映射到 turn_around，不得用走动代替。

## 非目标

- 不引入云端数字人或云端 ASR。
- 首版使用非实时 CosyVoice HTTP API，不实现 WebSocket 分句流式合成。
- 不承诺音素级精准中文口型；首版依据真实音频时长生成近似 viseme 序列。
- 不实现移动端浏览器的完全一致体验。
- 不启用 MotionEngine 的 FaceMirror 摄像头表情追踪，避免新增 MediaPipe 依赖和额外摄像头权限。
- 不让 LLM 生成任意骨骼动画 JSON，仅允许选择服务端白名单中的语义动作。

## 步骤

1. 安装并核对 TalkingHead 依赖及许可证。
2. 选择许可证清晰、包含所需 blend shapes 的示例 GLB，并托管在站点静态资源中。
3. 新增页面 UI、TalkingHead 初始化、文字输入和中文流式回复。
4. 接入 `SpeechRecognition`，将最终识别文本送入回复接口。
5. 新增 `api2` CosyVoice 代理，限制文本长度和单 IP 请求频率。
6. 解码 CosyVoice WAV，使用 TalkingHead 流式 PCM 播放并同步近似口型。
7. 保留浏览器 TTS 作为未配置或调用失败时的降级路径。
8. 在 Astro 客户端路由切换和页面退出时释放所有资源。
9. 将 `/api/demo/llm-stream` 改为服务端 Qwen 流式代理，并补充配置、限流和 SSE 解析测试。
10. 将 Qwen 输出约束为 `{ type, version, speech, timeline }` JSON，聚合 SSE 后解析并校验白名单。
11. 在 CosyVoice/浏览器 TTS 播放开始时执行手势，播放结束时清理。
12. 接入 HeadAudio worklet、预训练模型和 TalkingHead morph target 更新回调。
13. 锁定 MotionEngine v0.3.0 源码提交，注册动作目录并串联现有 TalkingHead 更新循环。
14. 扩展 Qwen 动作提示词和服务端白名单，将左右手要求映射到明确的语义动作。
15. 在播报开始时执行 MotionEngine 动作，在结束、打断和销毁时停止，并保留内置手势降级。
16. 运行后端测试、前端构建、静态资源检查和浏览器交互验证。
17. 将回答目标长度提高至约 100 字、上限 150 字，并允许最多 6 个与台词语义匹配的动作。
18. 依据 CosyVoice 解码后的实际音频时长调度动作；浏览器 TTS 降级时按文本长度估算时长。
19. 将回复协议版本化为 `avatar_response/v1`，使用可辨识的时间线事件，为后续表情、镜头和停顿事件保留扩展空间。

## 风险与开放问题

- Chrome 的 Web Speech ASR 可能使用浏览器厂商服务，不等于严格离线。
- CosyVoice HTTP API 会增加一次完整合成等待；低延迟体验需要后续改为 WebSocket/SSE 分句流式合成。
- CosyVoice 返回音频但非所有音色都返回时间戳，中文口型仍为近似。
- TTS 代理是公开计费接口，必须限制文本长度和请求频率；生产环境可进一步要求登录。
- 浏览器可用音色和 `SpeechRecognition` 支持情况因系统而异，需要提供文字输入降级。
- Qwen 与 CosyVoice 共用 `DASHSCOPE_API_KEY`；密钥额度或权限异常会同时影响回复与播报。
- 公开 LLM 接口会产生调用费用；生产环境可进一步要求登录或增加每日配额。
- 模型即使被提示输出 JSON 仍可能格式错误；后端必须降级为无动作短文本，不能直接信任模型字段。
- 模型返回的 `type`、`version` 和事件字段同样不可信；服务端必须重建规范消息，不能原样透传。
- TalkingHead 同一时间只适合播放一个手势；动作时间线采用顺序切换，不叠加多个手势，也不生成任意 Mixamo 动画。
- HeadAudio 官方预训练模型以英语语音训练；中文音频可做声学近似，但不保证达到中文音素级精度。
- HeadAudio 比时间戳驱动更耗浏览器 CPU，低性能设备必须保留轻量降级路径。
- HeadAudio 新增 worklet 与二进制模型静态资源，开发和生产构建都需验证 URL 与 CSP。
- MotionEngine 尚未正式发布到 npm 且项目较新；依赖必须锁定 Git 提交，升级前重新验证 TalkingHead 兼容性。
- MotionEngine 动作数据约 80 KB，且部分动作依赖形象骨骼和 morph target；当前模型不支持的字段会被 TalkingHead 忽略，视觉效果需浏览器验收。
- 语义动作正在播放时打断会涉及异步收尾；所有入口都必须调用统一停止函数，避免旧动作覆盖新动作。
- CosyVoice 不返回词级时间戳；动作与台词的同步依据 LLM 给出的相对位置和音频总时长，只能做到自然近似，不能保证逐字对齐。

## 验收标准

- 页面能加载本地 3D 形象并保持基本待机动作。
- 支持中文文字/语音提问、Qwen 中文流式回复和 CosyVoice 中文播报。
- Qwen 的 SSE 响应在服务端转换为纯文本流，浏览器无法接触 API Key。
- 中文音频播放时按真实时长生成近似 viseme 口型。
- 支持挥手、左右抬手、指向、点赞、点头、摇头、鼓掌、思考等 MotionEngine 白名单语义动作，未知动作自动降级为 `none`。
- 用户要求手势舞或连续动作时，单次回答可按台词顺序执行 2–6 个动作。
- 浏览器只消费 `avatar_response/v1`，且仅执行 `timeline` 中已知的 `motion` 事件；未知事件安全忽略。
- 停止播报、开始新问题或离开页面后不残留手势。
- MotionEngine 加载或执行失败时仍能使用 TalkingHead 内置手势播报。
- HeadAudio 可用时从 CosyVoice 音频实时生成口型；不可用时页面明确降级且仍可播报。
- 未配置 CosyVoice 时页面明确提示并降级到浏览器 TTS。
- 支持可用浏览器中的语音识别，并在不支持时明确提示。
- 支持停止播报/识别。
- 离开页面后不再占用麦克风或继续播报。
- Web 构建和现有测试通过。
