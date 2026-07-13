/**
 * Detailed intros for curated demos.
 * Used by scripts/generate-legacy-demo-entries.mjs
 *
 * @typedef {{ summary: string, howToTest: string[], docs: { label: string, url: string }[], notes?: string[] }} DemoIntro
 */

/** @type {Record<string, DemoIntro>} */
export const CURATED_DEMO_INTROS = {
  'MediaDevices-getUserMedia': {
    summary:
      '演示如何通过 MediaDevices.getUserMedia 请求摄像头与麦克风权限，并将实时媒体流绑定到 `<video>` 元素。适合理解权限弹窗、约束条件（constraints）与流生命周期。',
    howToTest: [
      '用 HTTPS 或 localhost 打开页面（非安全上下文会被浏览器拒绝）。',
      '点击「开始」或授权按钮，允许摄像头 / 麦克风权限。',
      '确认预览画面出现；拒绝权限时应有可读错误提示。',
      '在 DevTools → Application / 站点设置中撤销权限后刷新，验证再次申请流程。',
      '可尝试切换前置 / 后置摄像头（若设备支持 `facingMode`）。',
    ],
    docs: [
      { label: 'MDN: MediaDevices.getUserMedia()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia' },
      { label: 'MDN: MediaStream', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaStream' },
      { label: 'W3C: Media Capture and Streams', url: 'https://www.w3.org/TR/mediacapture-streams/' },
    ],
    notes: [
      '需用户手势触发更稳妥；部分移动浏览器对自动播放有额外限制。',
      '结束使用时调用 track.stop()，避免占用摄像头指示灯。',
    ],
  },

  'MediaDevices-getDisplayMedia-MediaRecorder': {
    summary:
      '演示屏幕共享（getDisplayMedia）与 MediaRecorder 录制：选择窗口 / 标签页 / 整屏后，将共享流编码为媒体片段。适合理解录屏权限与 MIME 类型兼容性。',
    howToTest: [
      '打开页面后发起屏幕共享，选择一个窗口或标签页。',
      '开始录制若干秒，观察状态变化（recording / inactive）。',
      '停止录制后，确认可得到 Blob / 可播放预览。',
      '在 Chrome / Firefox / Safari 分别试一次，对比支持的 `mimeType`。',
      '取消共享权限时，确认流结束且 UI 正确复位。',
    ],
    docs: [
      { label: 'MDN: getDisplayMedia()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia' },
      { label: 'MDN: MediaRecorder', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder' },
      { label: 'W3C: Screen Capture', url: 'https://www.w3.org/TR/screen-capture/' },
      { label: 'W3C: MediaStream Recording', url: 'https://www.w3.org/TR/mediastream-recording/' },
    ],
  },

  'MediaDevices-getDisplayMedia-MediaRecorder-download': {
    summary:
      '在录屏 Demo 基础上增加「下载到本地」：将 MediaRecorder 产生的 Blob 通过 Object URL 触发下载。适合验证 Blob、`URL.createObjectURL` 与文件命名。',
    howToTest: [
      '完成一次屏幕录制。',
      '点击下载，确认浏览器开始保存文件（常见为 webm / mp4，视浏览器而定）。',
      '用本地播放器打开文件，确认音视频内容完整。',
      '重复下载时检查是否正确 revokeObjectURL，避免内存泄漏。',
    ],
    docs: [
      { label: 'MDN: URL.createObjectURL()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static' },
      { label: 'MDN: Blob', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Blob' },
      { label: 'MDN: MediaRecorder', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder' },
    ],
  },

  'canvas-draw-signature': {
    summary:
      '基于 Canvas 的手写签名板：监听 pointer / touch / mouse 事件绘制路径，支持清空与导出图片。适合移动端签名、电子协议等场景。',
    howToTest: [
      '在画布上用鼠标或手指书写，确认线条跟手、无明显断点。',
      '点击清空，画布应恢复空白。',
      '导出为 PNG / DataURL，在新标签页或 img 中预览。',
      '旋转手机或缩放窗口，检查坐标换算是否错位（devicePixelRatio）。',
    ],
    docs: [
      { label: 'MDN: CanvasRenderingContext2D', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D' },
      { label: 'MDN: Pointer events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events' },
      { label: 'W3C: HTML Canvas 2D Context', url: 'https://www.w3.org/TR/2dcontext/' },
    ],
  },

  'fe-image-getcolor-canvas': {
    summary:
      '把图片绘制到 Canvas 后读取像素，提取主题色 / 主色调。常用于封面配色、UI 自适应背景等。',
    howToTest: [
      '上传或选择一张色彩鲜明的图片。',
      '确认页面展示提取到的主色块或色值。',
      '换一张近白 / 近黑图片，观察算法是否仍给出合理结果。',
      '打开 DevTools，确认跨域图片未污染 Canvas（否则 getImageData 会抛 SecurityError）。',
    ],
    docs: [
      { label: 'MDN: getImageData()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData' },
      { label: 'MDN: CORS enabled images', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image' },
      { label: 'MDN: CanvasSecurityError', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image#security_and_tainted_canvases' },
    ],
  },

  'demo-image-cover-cut-canvas': {
    summary:
      '图片封面裁剪 Demo：在 Canvas 上框选 / 缩放区域并输出裁剪结果。适合头像上传、封面图裁切等交互。',
    howToTest: [
      '选择本地图片，确认预览加载成功。',
      '拖动或缩放裁剪框，实时预览裁剪区域。',
      '确认输出尺寸符合预期（宽高比、最大边长）。',
      '在高 DPR 屏幕检查导出图是否模糊。',
    ],
    docs: [
      { label: 'MDN: drawImage()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage' },
      { label: 'MDN: FileReader', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader' },
      { label: 'MDN: HTMLInputElement.files', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/files' },
    ],
  },

  'html2canvas-invite-vvmusic': {
    summary:
      '使用 html2canvas 将 DOM（邀请卡样式）渲染为图片，便于分享到社交应用。适合海报生成、分享图等场景。',
    howToTest: [
      '打开页面，确认邀请卡 DOM 正常渲染。',
      '触发「生成图片 / 截图」，等待 canvas 输出。',
      '下载或长按保存，检查字体、图片、圆角是否丢失。',
      '对比跨域图片、外链字体是否导致空白或污染。',
    ],
    docs: [
      { label: 'html2canvas 文档', url: 'https://html2canvas.hertzen.com/' },
      { label: 'MDN: HTMLCanvasElement.toDataURL()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL' },
      { label: 'MDN: ForeignObjectRendering notes', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
    ],
    notes: [
      'html2canvas 是启发式库，复杂 CSS（滤镜、部分字体）可能不完全一致。',
    ],
  },

  'ai-faceplusplus-merge': {
    summary:
      '调用 Face++（旷视）人脸融合能力的前端交互页：上传两张人脸图，请求融合结果并展示。适合理解第三方 AI 视觉 API 的鉴权、上传与结果回显。',
    howToTest: [
      '准备两张正脸清晰照片。',
      '按页面流程上传并提交融合请求。',
      '成功时展示融合图；失败时检查控制台网络错误（密钥、额度、CORS）。',
      '注意：线上密钥可能已失效，需自备 API Key 才能完整跑通。',
    ],
    docs: [
      { label: 'Face++ 人脸融合文档', url: 'https://console.faceplusplus.com.cn/documents/20865676' },
      { label: 'MDN: FormData', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FormData' },
      { label: 'MDN: Fetch API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API' },
    ],
  },

  'ai-baidu-merge': {
    summary:
      '百度 AI 人脸融合 / 人脸相关能力的前端 Demo。流程与 Face++ 类似：选图 → 调 API → 展示结果，便于对比不同厂商参数差异。',
    howToTest: [
      '上传符合要求的人脸图片（清晰、无遮挡）。',
      '提交请求，观察返回 JSON / 结果图。',
      '若 Access Token 过期，按百度开放平台文档重新获取。',
      '对比不同融合度参数对结果的影响。',
    ],
    docs: [
      { label: '百度 AI 开放平台', url: 'https://ai.baidu.com/' },
      { label: 'MDN: XMLHttpRequest', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest' },
      { label: 'MDN: File', url: 'https://developer.mozilla.org/en-US/docs/Web/API/File' },
    ],
  },

  'ai-faceplusplus-HumanBodySegment': {
    summary:
      '人体 / 人像分割（抠图）实验：上传人物图，调用分割接口得到前景蒙版或透明背景图。常用于证件照换底、商品抠图等。',
    howToTest: [
      '上传一张人物主体明确的图片。',
      '确认返回分割结果（蒙版或透明 PNG）。',
      '把结果叠到不同背景色上，检查边缘毛刺。',
      '大图时注意压缩与超时。',
    ],
    docs: [
      { label: 'Face++ 人体轮廓 / 分割', url: 'https://www.faceplusplus.com.cn/' },
      { label: 'MDN: Canvas compositing', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
    ],
  },

  'ai-bg-merge-matting': {
    summary:
      '抠图后与背景合成的实验页（云毕业证相关能力探索）：结合分割结果与背景图做合成预览。',
    howToTest: [
      '上传人像与背景图（或使用页面默认资源）。',
      '执行抠图 / 合成，检查对齐与缩放。',
      '导出结果图，确认透明通道处理正确。',
    ],
    docs: [
      { label: 'MDN: Canvas drawImage', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage' },
      { label: 'MDN: HTMLImageElement.decode()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode' },
    ],
  },

  'face-api-browser': {
    summary:
      '基于 face-api.js 的浏览器端人脸检测 / 识别 Demo：模型在前端加载，不依赖服务端推理。适合理解 Web 端 ML、模型体积与性能权衡。',
    howToTest: [
      '首次打开需等待模型加载（注意网络与体积）。',
      '上传图片或开启摄像头，确认能框出人脸。',
      '观察 FPS / 耗时；低端机可换轻量模型。',
      '断网后再次打开，确认缓存策略是否可用。',
    ],
    docs: [
      { label: 'face-api.js (GitHub)', url: 'https://github.com/justadudewhohacks/face-api.js' },
      { label: 'MDN: Web Workers', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API' },
      { label: 'MDN: WebGL / GPU hints', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API' },
    ],
  },

  'img-resize-merge-upload-config': {
    summary:
      '人脸融合上传配置页：前端压缩 / 缩放图片后提交融合服务。展示「上传前处理」对体积、尺寸与成功率的影响。',
    howToTest: [
      '选择大图上传，确认前端会先 resize / compress。',
      '对比处理前后文件大小。',
      '提交融合，检查结果是否与配置项（阈值、尺寸）一致。',
      '故意上传非人脸图，确认错误提示。',
    ],
    docs: [
      { label: 'MDN: HTMLCanvasElement.toBlob()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob' },
      { label: 'MDN: createImageBitmap()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap' },
    ],
  },

  '71fcaee8aa168ee2107b2eb9125ec293': {
    summary:
      '腾讯云相关「云毕业照」类 Demo：上传照片完成 AI 证件照 / 毕业照风格处理。用于体验云端视觉 API 接入流程。',
    howToTest: [
      '按页面提示上传证件照类照片。',
      '提交后查看结果图或错误码。',
      '若密钥失效，需替换腾讯云 Secret / 接口地址。',
    ],
    docs: [
      { label: '腾讯云 AI', url: 'https://cloud.tencent.com/product/ai' },
      { label: 'MDN: Fetch', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API' },
    ],
  },

  'barrage-bullet-screen-biubiubiu': {
    summary:
      '原生实现的弹幕滚动效果：弹幕轨道、速度、碰撞避让等。不依赖 Vue，便于对照框架版弹幕实现。',
    howToTest: [
      '输入文案发送弹幕，观察从右向左滚动。',
      '连续发送多条，检查轨道是否重叠过度。',
      '切换页面可见性（切后台再回来），观察动画是否卡顿或堆积。',
      '调整窗口宽度，确认速度 / 路程换算合理。',
    ],
    docs: [
      { label: 'MDN: requestAnimationFrame', url: 'https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame' },
      { label: 'MDN: CSS transform', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform' },
      { label: 'MDN: Web Animations API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API' },
    ],
  },

  'active-h5-scratchCard': {
    summary:
      'H5 刮刮卡活动页：用 Canvas 覆盖层 + 擦除交互露出奖品。常见于营销活动。',
    howToTest: [
      '按住刮开涂层，露出下方内容。',
      '刮到一定比例后触发「完成」逻辑（若有）。',
      '在移动端用手指测试，确认 touch 事件正常。',
      '检查高清屏下涂层分辨率是否模糊。',
    ],
    docs: [
      { label: 'MDN: Touch events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Touch_events' },
      { label: 'MDN: destination-out compositing', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
    ],
  },

  'canvas-active-h5-scratchCard': {
    summary:
      'Canvas 实现的刮刮卡变体，强调擦除合成模式（destination-out）与触点半径。可与 DOM 版刮刮卡对照。',
    howToTest: [
      '刮开涂层，确认边缘平滑。',
      '快速刮动时不应丢点。',
      '完成后重置，涂层应重新覆盖。',
    ],
    docs: [
      { label: 'MDN: CanvasRenderingContext2D', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D' },
      { label: 'MDN: PointerEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent' },
    ],
  },

  'flex-study-WYSIWYG': {
    summary:
      'Flexbox 所见即所得学习工具：通过控件调整 justify-content、align-items、flex-grow 等，实时观察布局变化。',
    howToTest: [
      '切换主轴方向（row / column），观察子项排列。',
      '调整 justify / align，确认对齐符合预期。',
      '给子项设置不同 flex-grow / basis，验证空间分配。',
      '对照 DevTools Flex 调试面板结果是否一致。',
    ],
    docs: [
      { label: 'MDN: CSS Flexible Box Layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout' },
      { label: 'MDN: flex', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex' },
      { label: 'CSS WG: CSS Flexible Box Layout Module', url: 'https://www.w3.org/TR/css-flexbox-1/' },
    ],
  },

  'chrome-virtual-scroller': {
    summary:
      '虚拟滚动实验：只渲染可视区域附近的列表节点，降低长列表 DOM 开销。适合对照浏览器原生提案与自研方案。',
    howToTest: [
      '滚动长列表，观察 DOM 节点数量是否保持在窗口附近。',
      '快速甩动滚动，检查白屏 / 闪烁。',
      '跳转到列表中部 / 底部，确认定位准确。',
      '打开 Performance 面板对比普通列表的 Scripting / Rendering。',
    ],
    docs: [
      { label: 'MDN: Intersection Observer', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API' },
      { label: 'Chrome: Virtual Scroller (blog)', url: 'https://developer.chrome.com/blog/virtual-scroller-element' },
      { label: 'MDN: DocumentFragment', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment' },
    ],
  },

  '架构图编辑器': {
    summary:
      '可拖拽的架构图 / 框图编辑器：节点拖动、连线与画布交互。适合快速画系统结构草图。',
    howToTest: [
      '拖入或创建节点，移动位置。',
      '尝试连线（若支持），检查锚点吸附。',
      '缩放 / 平移画布，确认坐标变换正确。',
      '刷新或导出（若有），验证数据持久化。',
    ],
    docs: [
      { label: 'MDN: Drag and Drop API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API' },
      { label: 'MDN: SVG', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG' },
      { label: 'MDN: Pointer events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events' },
    ],
  },

  'zlh-Vue.Draggable': {
    summary:
      'Vue.Draggable（基于 SortableJS）列表示例：拖拽排序、跨列表移动。适合后台配置、看板等交互。',
    howToTest: [
      '拖动列表项改变顺序，确认 Vue 数据同步。',
      '若有多列，尝试跨列表拖拽。',
      '移动端长按拖动，检查滚动冲突。',
      '在控制台打印绑定数组，确认索引更新正确。',
    ],
    docs: [
      { label: 'SortableJS', url: 'https://sortablejs.github.io/Sortable/' },
      { label: 'Vue.Draggable', url: 'https://github.com/SortableJS/Vue.Draggable' },
      { label: 'MDN: HTML Drag and Drop', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API' },
    ],
  },

  'h5-vue-devicemotion-accelerationIncludingGravity': {
    summary:
      '使用 DeviceMotionEvent（含重力加速度）实现摇一摇检测。需注意权限策略与桌面端无传感器的降级。',
    howToTest: [
      '在真机浏览器打开（桌面通常无加速度计）。',
      'iOS 13+ 需先通过用户手势请求权限（DeviceMotionEvent.requestPermission）。',
      '用力摇动设备，确认回调触发并更新 UI。',
      '静止放置，确认阈值过滤后不会误触发。',
    ],
    docs: [
      { label: 'MDN: DeviceMotionEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent' },
      { label: 'MDN: Device orientation events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events' },
      { label: 'W3C: DeviceOrientation Event', url: 'https://www.w3.org/TR/orientation-event/' },
    ],
  },

  'h5-vue-devicemotion-accelerationIncludingGravity-ball': {
    summary:
      '用设备倾斜 / 加速度驱动页面内小球滚动，直观展示传感器数据到 UI 的映射。',
    howToTest: [
      '真机打开后倾斜手机，观察小球方向是否跟随。',
      '调节灵敏度阈值，对比手感。',
      '锁屏或切后台再回来，确认监听是否正确移除 / 恢复。',
    ],
    docs: [
      { label: 'MDN: DeviceMotionEvent.accelerationIncludingGravity', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/accelerationIncludingGravity' },
      { label: 'MDN: requestAnimationFrame', url: 'https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame' },
    ],
  },

  'h5-vibrate-navigator': {
    summary:
      '演示 navigator.vibrate 震动反馈：短震、模式震动。仅部分 Android 浏览器支持良好。',
    howToTest: [
      '在 Android Chrome 点击震动按钮，手机应震动。',
      '尝试模式数组如 `[200, 100, 200]`。',
      'iOS Safari 通常不支持，确认有降级提示。',
      '传入 0 或空数组应停止震动。',
    ],
    docs: [
      { label: 'MDN: Navigator.vibrate()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate' },
      { label: 'W3C: Vibration API', url: 'https://www.w3.org/TR/vibration/' },
    ],
  },

  'h5-video-beforeupload-getmetadata': {
    summary:
      '选择本地视频后，在实际上传前读取 duration、分辨率等元数据。用于上传校验与进度展示。',
    howToTest: [
      '选择 mp4 / mov 等视频文件。',
      '确认页面显示时长、宽高等信息。',
      '对损坏文件或非视频文件，确认错误处理。',
      '大文件时注意 loadedmetadata 触发时机。',
    ],
    docs: [
      { label: 'MDN: HTMLMediaElement.duration', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration' },
      { label: 'MDN: loadedmetadata event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loadedmetadata_event' },
      { label: 'MDN: URL.createObjectURL', url: 'https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static' },
    ],
  },

  'sf-a-1190000022552442-shake-devicemotion-vibrate-audio': {
    summary:
      '摇一摇综合 Demo：DeviceMotion 检测 + vibrate 反馈 + 音频提示。对应思否文章配套示例。',
    howToTest: [
      '真机授权传感器后摇动，应触发震动与音效。',
      '静音模式下确认震动仍可用（音频可能受限）。',
      '连续摇动时检查节流，避免音频重叠轰炸。',
    ],
    docs: [
      { label: 'MDN: DeviceMotionEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent' },
      { label: 'MDN: Navigator.vibrate()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate' },
      { label: 'MDN: HTMLAudioElement', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement' },
    ],
  },

  'sf-a-1190000019207842-mobile-bug-layoutViewport-visualViewport-idealViewport': {
    summary:
      '对比移动端 layout viewport、visual viewport 与 ideal viewport：理解缩放、地址栏显隐对视口尺寸的影响。思否「移动端适配」系列配套页。',
    howToTest: [
      '手机打开，对比页面打印的各 viewport 宽度。',
      '双指缩放，观察 visualViewport 变化。',
      '滚动使地址栏显隐，记录 innerHeight / visualViewport.height。',
      '切换横竖屏，确认 meta viewport 配置影响。',
    ],
    docs: [
      { label: 'MDN: Visual Viewport API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API' },
      { label: 'MDN: Using the viewport meta tag', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag' },
      { label: 'W3C: CSS Device Adaptation', url: 'https://www.w3.org/TR/css-device-adapt-1/' },
    ],
  },

  'ServiceWorkers-PWA-SW-sf-article': {
    summary:
      'Service Worker / PWA 相关演示：注册 SW、缓存策略与离线访问。对应思否文章配套实验。',
    howToTest: [
      'HTTPS / localhost 打开，确认 SW 注册成功（Application → Service Workers）。',
      '刷新后查看 Cache Storage 是否写入资源。',
      '离线模式重新加载，页面是否仍可打开。',
      '更新 SW 后验证 skipWaiting / clients.claim 行为。',
    ],
    docs: [
      { label: 'MDN: Service Worker API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API' },
      { label: 'MDN: Using Service Workers', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers' },
      { label: 'W3C: Service Workers', url: 'https://www.w3.org/TR/service-workers/' },
      { label: 'Web App Manifest', url: 'https://www.w3.org/TR/appmanifest/' },
    ],
  },

  'sum-websocket-test': {
    summary:
      'WebSocket 联调测试页：连接、发送、接收与断线重连。用于后端 WS 服务的冒烟验证。',
    howToTest: [
      '填写可访问的 WS / WSS 地址并连接。',
      '发送文本消息，确认回显或服务端响应。',
      '断开网络或关闭服务，观察 onclose / onerror。',
      '对比 ws:// 与 wss:// 在 HTTPS 页面下的混合内容限制。',
    ],
    docs: [
      { label: 'MDN: WebSocket', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSocket' },
      { label: 'MDN: Writing WebSocket client applications', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications' },
      { label: 'RFC 6455: The WebSocket Protocol', url: 'https://datatracker.ietf.org/doc/html/rfc6455' },
    ],
  },

  'clipboard-api-async': {
    summary:
      '异步 Clipboard API（navigator.clipboard）读写实验。相比 execCommand 更安全、可异步，但需权限与安全上下文。',
    howToTest: [
      '在 HTTPS / localhost 点击「复制」，粘贴到记事本验证。',
      '点击「读取剪贴板」（需权限），确认能读到文本。',
      '在非安全上下文或无权限时，确认错误提示清晰。',
      '与旧版 execCommand("copy") Demo 对照兼容性。',
    ],
    docs: [
      { label: 'MDN: Clipboard API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API' },
      { label: 'MDN: navigator.clipboard', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/clipboard' },
      { label: 'W3C: Clipboard API and events', url: 'https://www.w3.org/TR/clipboard-apis/' },
    ],
  },

  'fe-file-upload-ajax-XMLHTTPRequest-progress': {
    summary:
      '用 XMLHttpRequest.upload.onprogress 实现上传进度条。适合大文件上传体验优化。',
    howToTest: [
      '选择较大文件开始上传（需可用后端或可观察请求）。',
      '进度条应从 0% 平滑到 100%。',
      '取消请求时，进度与状态应复位。',
      '在 Network 面板对比 loaded / total。',
    ],
    docs: [
      { label: 'MDN: XMLHttpRequestUpload', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload' },
      { label: 'MDN: progress event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/progress_event' },
      { label: 'MDN: FormData', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FormData' },
    ],
  },

  'pdfjs-test': {
    summary:
      '使用 Mozilla PDF.js 在浏览器中渲染 PDF，无需原生插件。适合文档预览、页码跳转等。',
    howToTest: [
      '打开 Demo，确认 PDF 第一页渲染。',
      '翻页 / 缩放，检查清晰度与内存。',
      '换一份加密或损坏 PDF，观察错误处理。',
      '移动端滚动时注意 canvas 层数与性能。',
    ],
    docs: [
      { label: 'PDF.js', url: 'https://mozilla.github.io/pdf.js/' },
      { label: 'PDF.js GitHub', url: 'https://github.com/mozilla/pdf.js' },
      { label: 'MDN: Canvas API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
    ],
  },

  'xlsx-sheet': {
    summary:
      '前端解析 Excel（xlsx / SheetJS 一类方案）并展示表格。适合运营导入、配置表预览。',
    howToTest: [
      '上传 .xlsx / .xls 文件。',
      '确认表格行列正确显示。',
      '含合并单元格、多 Sheet 时检查兼容性。',
      '超大表格时观察内存与卡顿。',
    ],
    docs: [
      { label: 'SheetJS (Community)', url: 'https://docs.sheetjs.com/' },
      { label: 'MDN: FileReader.readAsArrayBuffer()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsArrayBuffer' },
      { label: 'MDN: ArrayBuffer', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer' },
    ],
  },

  'sf-a-1190000022597533-file-preview-input-drop': {
    summary:
      '上传前预览：支持 input 选择与拖拽投放，预览图片 / 音视频 / 文本。思否文章配套 Demo。',
    howToTest: [
      '点击选择文件，确认预览类型正确。',
      '拖拽文件到投放区，确认 drop 生效。',
      '分别测试图片、音频、视频、文本。',
      '多文件时检查列表与移除逻辑。',
    ],
    docs: [
      { label: 'MDN: Drag and Drop', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API' },
      { label: 'MDN: DataTransfer', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer' },
      { label: 'MDN: FileReader', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader' },
      { label: 'MDN: URL.createObjectURL', url: 'https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static' },
    ],
  },

  'elementui-nav-3': {
    summary:
      'Element UI 导航联动示例：菜单高亮与路由 / 内容区同步。适合后台布局实践。',
    howToTest: [
      '点击侧边 / 顶部菜单，确认内容切换。',
      '刷新页面，确认激活项与路由一致（若有路由）。',
      '缩小窗口，检查折叠菜单行为。',
    ],
    docs: [
      { label: 'Element UI Menu', url: 'https://element.eleme.cn/#/zh-CN/component/menu' },
      { label: 'Vue Router', url: 'https://router.vuejs.org/' },
      { label: 'MDN: History API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/History_API' },
    ],
  },

  'elementui-upload-dialog': {
    summary:
      'Element UI 上传组件与弹窗进度展示：演示对话框内上传反馈。',
    howToTest: [
      '打开上传弹窗，选择文件。',
      '观察进度条 / 成功失败状态。',
      '关闭弹窗再打开，确认状态是否残留。',
    ],
    docs: [
      { label: 'Element UI Upload', url: 'https://element.eleme.cn/#/zh-CN/component/upload' },
      { label: 'MDN: XMLHttpRequest upload', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload' },
    ],
  },

  'qrcode-20200408-jq22-yanshi4094': {
    summary:
      '二维码美化方案 A（jq22 示例）：在标准 QR 上叠加样式 / Logo。可与同系列其他方案横向对比识别率。',
    howToTest: [
      '生成二维码后用手机扫码，确认可识别。',
      '调整颜色 / Logo 大小，观察容错率下降点。',
      '与「普通方案」「qart」「高度美化」页对比。',
    ],
    docs: [
      { label: 'QR Code 标准概览 (ISO/IEC 18004)', url: 'https://www.iso.org/standard/62021.html' },
      { label: 'MDN: Canvas', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
    ],
    notes: [
      '过度美化会降低扫码成功率，生产环境需真机多 App 验证。',
    ],
  },

  'qrcode-20200408-jq22-yanshi21277': {
    summary:
      '较朴素的二维码生成方案，作为对照组：优先保证识别率与实现简单。',
    howToTest: [
      '输入文本 / URL 生成二维码。',
      '多款扫码 App 验证。',
      '对比美化版在弱光、远距离下的识别差异。',
    ],
    docs: [
      { label: 'MDN: Canvas API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
      { label: 'Wikipedia: QR code', url: 'https://en.wikipedia.org/wiki/QR_code' },
    ],
  },

  'qrcode-20200408-qart-jq22-jqueryinfo12691': {
    summary:
      '基于 qart.js 的艺术二维码：把图片与 QR 编码融合。识别度通常低于标准码，适合展示场景。',
    howToTest: [
      '选择底图生成艺术码。',
      '近距离扫码，记录成功率。',
      '缩小码尺寸后再测，确认可用性边界。',
    ],
    docs: [
      { label: 'qart.js (GitHub)', url: 'https://github.com/kciter/qart.js' },
      { label: 'MDN: Canvas', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
    ],
  },

  'qrcode-20200408-jq22-yanshi22345': {
    summary:
      '高度美化二维码方案：配置项多、视觉强，但实现复杂且识别率风险更高。适合评估「好看 vs 好扫」权衡。',
    howToTest: [
      '按页面配置生成后扫码。',
      '对比普通方案的耗时与成功率。',
      '记录不推荐上生产的原因（配置复杂、容错低）。',
    ],
    docs: [
      { label: 'MDN: Canvas', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
      { label: 'QR Code — Error correction', url: 'https://en.wikipedia.org/wiki/QR_code#Error_correction' },
    ],
  },
};

/**
 * Build markdown body for a curated demo intro.
 * @param {string} slug
 * @param {DemoIntro} intro
 */
export function buildIntroMarkdown(slug, intro) {
  const lines = [];
  lines.push('## 简介');
  lines.push('');
  lines.push(intro.summary);
  lines.push('');
  lines.push('## 如何测试验证');
  lines.push('');
  intro.howToTest.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push('');
  lines.push('## 相关规范与文档');
  lines.push('');
  intro.docs.forEach((d) => {
    lines.push(`- [${d.label}](${d.url})`);
  });
  if (intro.notes?.length) {
    lines.push('');
    lines.push('## 注意事项');
    lines.push('');
    intro.notes.forEach((n) => lines.push(`- ${n}`));
  }
  lines.push('');
  return lines.join('\n');
}
