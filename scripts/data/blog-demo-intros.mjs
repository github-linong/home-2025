/**
 * Intros for blog-linked demos (博客配套).
 * Merged with curated intros in generate-legacy-demo-entries.mjs
 */

/** @typedef {import('./curated-demo-intros.mjs').DemoIntro} DemoIntro */

/** @type {Record<string, DemoIntro>} */
export const BLOG_DEMO_INTROS = {
  waterfall: {
    summary:
      '瀑布流（Masonry）布局 Demo：多列等高错落排布图片或卡片。配套文章对比了多种 JS 方案与 CSS 尝试，本页为可运行演示。',
    howToTest: [
      '打开页面，确认卡片按列错落排列、无明显大面积空白。',
      '缩放窗口宽度，观察列数与重排是否正确。',
      '滚动加载更多（若支持），检查插入后布局是否错乱。',
      '打开 DevTools 对比 reflow 频率，理解 JS 测高方案的成本。',
    ],
    docs: [
      { label: 'MDN: CSS Multi-column Layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_multicol_layout' },
      { label: 'MDN: CSS Grid Layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout' },
      { label: 'MDN: getBoundingClientRect()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect' },
    ],
  },

  'textarea-event-test': {
    summary:
      '面试向事件对比页：在 textarea 上观察 input、change、keydown、keypress、keyup 的触发时机，以及 stopPropagation / preventDefault 的影响。',
    howToTest: [
      '在输入框打字、删字、输入中文（IME），观察各类事件日志顺序。',
      '失焦前后对比 change 是否触发。',
      '勾选 stopPropagation / preventDefault，确认冒泡与默认行为变化。',
      '对照文章结论：哪些键会触发 keypress、input 与 change 的差异。',
    ],
    docs: [
      { label: 'MDN: input event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event' },
      { label: 'MDN: change event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event' },
      { label: 'MDN: KeyboardEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent' },
      { label: 'MDN: Event.stopPropagation()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Event/stopPropagation' },
      { label: 'MDN: Event.preventDefault()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault' },
    ],
  },

  'touchstart-click': {
    summary:
      '移动端「击穿」与 300ms 点击延迟相关演示：touchstart / touchend 与 click 的顺序、以及穿透到下层元素的问题。',
    howToTest: [
      '在真机或 DevTools 移动模式下点击覆盖层。',
      '观察 touch 与 click 触发顺序及是否触发下层链接。',
      '对比加 touch-action / fastclick 类方案后的行为。',
      '快速连续点击，检查是否出现双击放大或误触。',
    ],
    docs: [
      { label: 'MDN: Touch events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Touch_events' },
      { label: 'MDN: click event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event' },
      { label: 'MDN: touch-action', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action' },
    ],
  },

  'copy-execCommand': {
    summary:
      '使用已废弃但仍广泛兼容的 document.execCommand("copy") 将内容写入剪贴板。可与异步 Clipboard API Demo 对照。',
    howToTest: [
      '选中或按按钮复制文本，粘贴到别处验证。',
      '在 HTTPS / HTTP 下分别测试兼容性。',
      '复制失败时查看控制台返回值（false）与权限提示。',
      '对照 clipboard-api-async 页的权限模型差异。',
    ],
    docs: [
      { label: 'MDN: document.execCommand()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand' },
      { label: 'MDN: Clipboard API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API' },
      { label: 'W3C: Clipboard APIs', url: 'https://www.w3.org/TR/clipboard-apis/' },
    ],
    notes: ['execCommand 已标记废弃，新项目优先 navigator.clipboard。'],
  },

  createfont: {
    summary:
      '动态加载自定义字体并应用到页面文字，观察 FontFace / @font-face 加载完成前后的渲染变化。',
    howToTest: [
      '打开页面，确认默认字体先显示，再切换到自定义字体（或 FOIT/FOUT）。',
      '在 Network 面板确认字体文件请求。',
      '使用 document.fonts.ready 验证加载完成时机。',
      '断网或 404 字体 URL，确认降级字体。',
    ],
    docs: [
      { label: 'MDN: FontFace', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FontFace' },
      { label: 'MDN: CSS Font Loading API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API' },
      { label: 'MDN: @font-face', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face' },
      { label: 'CSS Fonts Module Level 4', url: 'https://www.w3.org/TR/css-fonts-4/' },
    ],
  },

  exif: {
    summary:
      '读取图片 EXIF 元数据（方向、拍摄参数等）。常用于纠正手机拍照预览旋转问题。',
    howToTest: [
      '上传带 EXIF Orientation 的手机照片。',
      '确认页面能解析出方向 / 相机信息。',
      '对比 Canvas 绘制前后是否正确旋转。',
      '对已剥离 EXIF 的图，确认友好空状态。',
    ],
    docs: [
      { label: 'MDN: FileReader', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader' },
      { label: 'MDN: ArrayBuffer', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer' },
      { label: 'CIPA: Exif standard overview', url: 'https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf' },
    ],
  },

  'hidden-dom': {
    summary:
      '隐藏 DOM 元素的多种方式对比（display / visibility / opacity / 移出视口等）及其对布局、事件、可访问性的影响。',
    howToTest: [
      '切换不同隐藏方式，观察是否仍占位。',
      '尝试点击被隐藏元素，确认是否还能收到事件。',
      '用屏幕阅读器或 Accessibility 面板检查可见性。',
      '测量 display:none 与 visibility:hidden 的重排差异。',
    ],
    docs: [
      { label: 'MDN: display', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/display' },
      { label: 'MDN: visibility', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/visibility' },
      { label: 'MDN: aria-hidden', url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden' },
    ],
  },

  'input-number-validity': {
    summary:
      '复现 / 验证 `<input type="number">` 的约束校验（min / max / step）与 ValidityState 行为；type 改为 text 时的差异。',
    howToTest: [
      '输入越界数字，触发浏览器默认校验气泡。',
      '调用 checkValidity / reportValidity，观察 ValidityState。',
      '改为 type=text 后对比 pattern / 自定义校验。',
      '清空输入，检查 valueMissing / badInput。',
    ],
    docs: [
      { label: 'MDN: ValidityState', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ValidityState' },
      { label: 'MDN: <input type="number">', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/number' },
      { label: 'MDN: Constraint validation', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation' },
      { label: 'HTML Standard: form submission', url: 'https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraint-validation' },
    ],
  },

  '_template': {
    summary:
      '静态页模板基准：用于文章中演示「加载远程 HTML / 注入模板」等场景的空白样板页。',
    howToTest: [
      '直接打开，确认基础 HTML 结构可访问。',
      '在引用文章的脚本中作为 URL 列表项加载，确认 200。',
      '检查 charset / viewport 是否齐全。',
    ],
    docs: [
      { label: 'MDN: HTML basics', url: 'https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/HTML_basics' },
      { label: 'MDN: fetch()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch' },
    ],
  },

  'bug-vue-audio-pending-status': {
    summary:
      '复现 Vue 更新 DOM 时可能导致 `<audio>` 进入异常 pending / 无法播放的状态。用于排查音频元素被意外重渲染的问题。',
    howToTest: [
      '按页面步骤触发 Vue 更新（切换数据 / v-if）。',
      '观察 audio readyState、networkState 与能否播放。',
      '对比 key 固定 / 不销毁节点时的行为差异。',
      '在 Chrome Media 面板查看请求是否被中断。',
    ],
    docs: [
      { label: 'MDN: HTMLMediaElement', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement' },
      { label: 'MDN: HTMLMediaElement.readyState', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState' },
      { label: 'Vue: key 与复用', url: 'https://vuejs.org/guide/essentials/list.html#maintaining-state-with-key' },
    ],
  },

  'flex-direction-column-sf': {
    summary:
      '仅 display:flex + flex-direction:column。博客系列起点，尚未做两端对齐或撑开。',
    howToTest: [
      '调浏览器高度，看头/内容/底是否仍贴在一起（本页会）。',
      '打开 .1 对比两端对齐效果。',
      '对照博客 sf-1190000037452855。',
    ],
    docs: [
      { label: 'MDN: flex-direction', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction' },
      { label: 'MDN: justify-content', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content' },
      { label: 'CSS Flexible Box Layout', url: 'https://www.w3.org/TR/css-flexbox-1/' },
    ],
  },
  'flex-direction-column-sf.1': {
    summary:
      '在 column 基础上加 justify-content: space-between，头底两端对齐；微调位置较难。',
    howToTest: [
      '与基础版并排，看背景色/间距分布。',
      '改 min-height，确认仍两端贴齐。',
      '想微调内容偏上时，体会本方案不好控。',
    ],
    docs: [
      { label: 'MDN: justify-content', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content' },
      { label: 'MDN: CSS Flexible Box Layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout' },
    ],
  },
  'flex-direction-column-sf.2': {
    summary:
      '中间 section 用 flex:1 撑开，并 display:flex + align-items:center 让内容垂直居中。',
    howToTest: [
      '对比 .1：绿块是否铺满中间。',
      '增减中间文案行数，看是否仍居中且不压头底。',
      '高度不足时是否出现整体滚动。',
    ],
    docs: [
      { label: 'MDN: flex', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex' },
      { label: 'MDN: align-items', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/align-items' },
    ],
  },
  'flex-direction-column-sf.3': {
    summary:
      '内容上下各插 flexempty（flex:1 1 20px），用可伸缩空白控制上下留白比例。',
    howToTest: [
      '看青色空白是否上下对称分配。',
      '改下方空白 flex-grow，确认内容上移。',
      '与博客结论对照：比单纯 space-between 更好调。',
    ],
    docs: [
      { label: 'MDN: flex-grow', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex-grow' },
      { label: 'MDN: flex-basis', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex-basis' },
    ],
  },

  'vue-bullet-biubiubiu': {
    summary:
      'Vue 实现弹幕效果：数据驱动弹幕列表与动画。可与原生弹幕页、bug 对比系列一起看。',
    howToTest: [
      '发送弹幕，确认轨道滚动。',
      '高频发送时观察性能与重叠。',
      '切换路由或销毁组件，确认定时器 / rAF 已清理。',
    ],
    docs: [
      { label: 'Vue: Transition', url: 'https://vuejs.org/guide/built-ins/transition.html' },
      { label: 'MDN: requestAnimationFrame', url: 'https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame' },
      { label: 'MDN: CSS transform', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform' },
    ],
  },
  'vue-bug-bullet.1': {
    summary: 'Vue 弹幕 Bug 复现页（问题版）：用于对照修复前后差异。',
    howToTest: [
      '按文章步骤复现异常（错位、残留、不消失等）。',
      '记录复现条件（浏览器、操作序列）。',
      '与 .2 修复版、.3 对比版对照。',
    ],
    docs: [
      { label: 'Vue: Reactivity', url: 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html' },
      { label: 'MDN: CSS animations', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations' },
    ],
  },
  'vue-bug-bullet.2': {
    summary: 'Vue 弹幕 Bug 修复版：在问题版基础上给出修正实现。',
    howToTest: [
      '用与 .1 相同操作路径验证 Bug 已消失。',
      '回归：普通发送、快速发送、窗口缩放。',
    ],
    docs: [
      { label: 'Vue: key', url: 'https://vuejs.org/api/built-in-special-attributes.html#key' },
      { label: 'MDN: requestAnimationFrame', url: 'https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame' },
    ],
  },
  'vue-bug-bullet.3': {
    summary: 'Vue 弹幕问题 / 修复对比页，便于并排查看差异。',
    howToTest: [
      '同时打开 .1 与 .2，执行相同操作。',
      '记录 DOM 结构或关键代码差异点。',
    ],
    docs: [
      { label: 'Vue Guide', url: 'https://vuejs.org/guide/introduction.html' },
      { label: 'MDN: MutationObserver', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver' },
    ],
  },

  'vue-erp-test-vue@2.6.11': {
    summary:
      'Vue 2.6.11 ERP 风格插槽示例：演示新插槽语法（v-slot）在部门 / 人员等模块中的用法。',
    howToTest: [
      '切换模块 Tab，确认插槽内容正确渲染。',
      '对比旧版 vue-erp-test（若存在）的 slot 写法。',
      '打开 Vue Devtools 查看组件树与 props。',
    ],
    docs: [
      { label: 'Vue 2: Slots', url: 'https://v2.vuejs.org/v2/guide/components-slots.html' },
      { label: 'Vue 2.6 release (slots)', url: 'https://github.com/vuejs/vue/releases/tag/v2.6.0' },
    ],
  },
  'vue-erp-test': {
    summary: '较早的 Vue ERP 插槽 / 组件通信示例，可与 2.6.11 版对照语法迁移。',
    howToTest: [
      '浏览各部门管理界面交互。',
      '与 vue-erp-test-vue@2.6.11 对比 slot 语法。',
    ],
    docs: [
      { label: 'Vue 2: Components Basics', url: 'https://v2.vuejs.org/v2/guide/components.html' },
      { label: 'Vue 2: Slots', url: 'https://v2.vuejs.org/v2/guide/components-slots.html' },
    ],
  },

  'vue-elementUI-table-resize-thead': {
    summary:
      'Element UI Table 动态调整表头宽度并保持联动的实验页。用于后台表格可拖拽列宽场景。',
    howToTest: [
      '拖拽表头边界，确认列宽变化。',
      '横向滚动时检查表头与表体是否对齐。',
      '窗口缩放后列宽是否错乱。',
    ],
    docs: [
      { label: 'Element UI Table', url: 'https://element.eleme.cn/#/zh-CN/component/table' },
      { label: 'MDN: MouseEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent' },
      { label: 'MDN: Resize Observer', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver' },
    ],
  },

  'sf-a-1190000022616927-vue-emit': {
    summary:
      'Vue 组件通信相关 Demo（emit / 父子传值），文件名含 vue-emit；页面也涉及 v-if / v-show 使用差异。',
    howToTest: [
      '触发子组件事件，确认父组件收到 payload。',
      '切换 v-if / v-show，对比 DOM 是否销毁与事件是否残留。',
      '对照配套文章中的组件通信章节。',
    ],
    docs: [
      { label: 'Vue: Component Events', url: 'https://vuejs.org/guide/components/events.html' },
      { label: 'Vue 2: Custom Events', url: 'https://v2.vuejs.org/v2/guide/components-custom-events.html' },
      { label: 'MDN: CustomEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent' },
    ],
  },

  'sf-1190000037538101-html-input-attribute-type-pattern-min-max-minlength-maxlength': {
    summary:
      '系统演示 HTML input 约束属性：type、pattern、min / max、minlength / maxlength 等与浏览器原生校验。',
    howToTest: [
      '分别切换不同 type，输入合法 / 非法值。',
      '提交表单，观察原生提示文案。',
      '用 setCustomValidity 自定义错误信息（若页面支持）。',
      '对照 ValidityState 各字段。',
    ],
    docs: [
      { label: 'MDN: <input>', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input' },
      { label: 'MDN: pattern', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern' },
      { label: 'MDN: Constraint validation', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation' },
      { label: 'HTML Standard', url: 'https://html.spec.whatwg.org/multipage/input.html' },
    ],
  },

  'sf-1190000020625420-file-FileReader-blob': {
    summary:
      'File / FileReader / Blob 互转与读取演示：选文件后读文本、DataURL 或 ArrayBuffer。',
    howToTest: [
      '选择文本 / 图片文件，对比不同 readAs* 结果。',
      '用 Blob 构造新文件并触发下载。',
      '大文件时观察内存与 UI 卡顿。',
    ],
    docs: [
      { label: 'MDN: File', url: 'https://developer.mozilla.org/en-US/docs/Web/API/File' },
      { label: 'MDN: FileReader', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader' },
      { label: 'MDN: Blob', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Blob' },
      { label: 'File API (W3C)', url: 'https://www.w3.org/TR/FileAPI/' },
    ],
  },

  'sf-a-1190000019735939-XHR-ajax-xhr-XMLHttpRequest': {
    summary:
      'XMLHttpRequest / Ajax 发送方式对比：GET 参数放 open 或 send、编码与 Content-Type 差异。',
    howToTest: [
      '点击不同发送按钮，在 Network 面板对比 URL、Body、Headers。',
      '切换 Content-Type，观察服务端是否能解析（需可用接口或 mock）。',
      '对照文章中的结论表。',
    ],
    docs: [
      { label: 'MDN: XMLHttpRequest', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest' },
      { label: 'MDN: Using XMLHttpRequest', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_XMLHttpRequest' },
      { label: 'MDN: URLSearchParams', url: 'https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams' },
    ],
  },

  'sf-a-1190000019790706-chrome-sources': {
    summary:
      'Chrome Sources / 断点调试相关演示：在页面中触发可调试脚本，配合 debugger、XHR、jQuery Ajax。',
    howToTest: [
      '打开 DevTools → Sources，按文章步骤下断点。',
      '点击页面按钮命中断点。',
      '对比同步代码、XHR 回调、$.ajax 回调的调用栈。',
    ],
    docs: [
      { label: 'Chrome DevTools: Debug JavaScript', url: 'https://developer.chrome.com/docs/devtools/javascript/' },
      { label: 'MDN: debugger statement', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger' },
    ],
  },

  'sf-a-1190000019815534-Script-error-Same-origin-policy': {
    summary:
      '跨域脚本错误（Script error.）与同源策略演示主页：对比本地脚本与跨域脚本的 error 信息差异。',
    howToTest: [
      '触发本地脚本错误，确认有完整 message / stack。',
      '触发跨域脚本错误，观察是否只得到 "Script error."。',
      '给 script 加 crossorigin 并配置 CORS，验证是否恢复详情。',
      '系列 -1 ~ -4 为对照变体，可一并打开。',
    ],
    docs: [
      { label: 'MDN: Same-origin policy', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy' },
      { label: 'MDN: GlobalEventHandlers.onerror', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event' },
      { label: 'MDN: CORS', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS' },
      { label: 'HTML: script crossorigin', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#crossorigin' },
    ],
  },
  'sf-a-1190000019815534-Script-error-Same-origin-policy-1': {
    summary: 'Script error / 同源策略系列变体 1：特定 script 加载与错误捕获组合。',
    howToTest: [
      '打开控制台，触发错误，记录 event.message。',
      '与主系列页及其他变体对比。',
    ],
    docs: [
      { label: 'MDN: Same-origin policy', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy' },
      { label: 'MDN: Window: error event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event' },
    ],
  },
  'sf-a-1190000019815534-Script-error-Same-origin-policy-2': {
    summary: 'Script error / 同源策略系列变体 2。',
    howToTest: ['触发错误并记录；与变体 1/3/4 对照 CORS 头差异。'],
    docs: [
      { label: 'MDN: CORS', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS' },
      { label: 'MDN: Access-Control-Allow-Origin', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin' },
    ],
  },
  'sf-a-1190000019815534-Script-error-Same-origin-policy-3': {
    summary: 'Script error / 同源策略系列变体 3。',
    howToTest: ['确认跨域脚本是否带 crossorigin 属性及错误详情。'],
    docs: [
      { label: 'MDN: script crossorigin', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#crossorigin' },
    ],
  },
  'sf-a-1190000019815534-Script-error-Same-origin-policy-4': {
    summary: 'Script error / 同源策略系列变体 4（系列收尾对照）。',
    howToTest: ['汇总 1–4 与主页，整理可复现矩阵（本地/跨域 × CORS 开/关）。'],
    docs: [
      { label: 'MDN: Same-origin policy', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy' },
    ],
  },

  'sf-a-1190000022597533-file-preview-accept-capture-multiple': {
    summary:
      '文件预览系列：演示 accept、capture、multiple 等 input 属性对选文件体验的影响（相机、多选、类型过滤）。',
    howToTest: [
      '在手机上测试 capture=environment / user。',
      '设置 accept 仅图片，尝试选其他类型是否被拦。',
      'multiple 多选后确认预览列表。',
    ],
    docs: [
      { label: 'MDN: <input type="file">', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file' },
      { label: 'MDN: accept', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept' },
      { label: 'HTML: capture attribute', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/capture' },
    ],
  },
  'sf-a-1190000022597533-file-preview-input-drop-babel': {
    summary: '文件预览 + 拖拽系列的 Babel 转译变体，用于旧浏览器语法兼容对照。',
    howToTest: [
      '功能路径与主预览页一致：选择 / 拖拽 / 预览。',
      '在较旧 Chromium 中确认语法不报错。',
    ],
    docs: [
      { label: 'MDN: Drag and Drop', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API' },
      { label: 'Babel', url: 'https://babeljs.io/' },
    ],
  },
  'sf-a-1190000022597533-file-preview-input-drop-progress': {
    summary: '上传前预览并展示上传进度的综合页。',
    howToTest: [
      '选择文件后开始「上传」（或模拟），观察进度条。',
      '预览与进度是否互相干扰。',
      '失败重试时状态是否复位。',
    ],
    docs: [
      { label: 'MDN: ProgressEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ProgressEvent' },
      { label: 'MDN: XMLHttpRequestUpload', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload' },
    ],
  },
  'sf-a-1190000022597533-file-preview-input-drop-progress-del': {
    summary: '预览 + 上传进度，并支持删除队列中的文件。',
    howToTest: [
      '添加多个文件，删除其中一个，确认列表与进度一致。',
      '上传中途删除，观察请求是否中断。',
    ],
    docs: [
      { label: 'MDN: AbortController', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortController' },
      { label: 'MDN: FileList', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileList' },
    ],
  },
  'sf-a-1190000022597533-file-preview-input-drop-progress-test': {
    summary: '文件预览 + 进度的测试 / 调试变体。',
    howToTest: [
      '按测试用例路径走通选择、预览、进度、失败。',
      '与 progress 主页面对比差异点。',
    ],
    docs: [
      { label: 'MDN: FileReader', url: 'https://developer.mozilla.org/en-US/docs/Web/API/FileReader' },
      { label: 'MDN: XMLHttpRequest', url: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest' },
    ],
  },

  'svg-data-background-img-download': {
    summary:
      '将 SVG / Data URL / CSS background 等资源导出或下载的演示，帮助理解资源 URL 形态。',
    howToTest: [
      '触发下载，确认得到预期文件类型。',
      '检查 Data URL 长度限制与浏览器差异。',
      'background-image 中的资源能否被正确取出。',
    ],
    docs: [
      { label: 'MDN: Data URLs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs' },
      { label: 'MDN: SVG', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG' },
      { label: 'MDN: Download attribute', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#download' },
    ],
  },

  'user-session-list-virtual-insertsort-log-2': {
    summary:
      '会话列表虚拟化 + 插入排序相关实验：大量条目下插入 / 排序并打日志，观察性能与顺序正确性。',
    howToTest: [
      '增加列表人数，确认滚动仍流畅。',
      '随机 push / sort，检查顺序与日志。',
      '对比非虚拟列表的 DOM 节点数。',
    ],
    docs: [
      { label: 'MDN: DocumentFragment', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment' },
      { label: 'MDN: Array.prototype.sort()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort' },
      { label: 'MDN: Intersection Observer', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API' },
    ],
  },

  'sf-article-1190000019520438-DOM-HTML-test-demo': {
    summary:
      'DOM / HTML API 试验页：getAttributeNode、dispatchEvent 等接口的小实验集合。',
    howToTest: [
      '按页面按钮触发各 API，在控制台观察返回值。',
      '手动修改属性后再读取，确认 Attr 节点行为。',
      'dispatchEvent 自定义事件，确认监听器收到。',
    ],
    docs: [
      { label: 'MDN: Element.getAttributeNode()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/getAttributeNode' },
      { label: 'MDN: EventTarget.dispatchEvent()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent' },
      { label: 'DOM Living Standard', url: 'https://dom.spec.whatwg.org/' },
    ],
  },

  'sf-article-1190000021759936-vue': {
    summary:
      'Vue 文章配套页：对比 data 绑定、template 与 render 等渲染方式。',
    howToTest: [
      '修改输入，观察各区域绑定更新。',
      '对照文章中 template / render 示例。',
      '打开 Vue Devtools 查看实例数据。',
    ],
    docs: [
      { label: 'Vue 2: Template Syntax', url: 'https://v2.vuejs.org/v2/guide/syntax.html' },
      { label: 'Vue 2: Render Functions', url: 'https://v2.vuejs.org/v2/guide/render-function.html' },
    ],
  },

  'weex-flex-emoji-unicode-sf-a-1190000021281633': {
    summary:
      'Weex / Flex 场景下 Emoji 与 Unicode 字符宽度、对齐相关问题的复现页。',
    howToTest: [
      '观察含 Emoji 文本在 Flex 布局中的对齐。',
      '对比不同 Unicode 字符的占位宽度。',
      '在真机 Weex / Web 容器分别验证（若环境可用）。',
    ],
    docs: [
      { label: 'MDN: Unicode', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Unicode' },
      { label: 'MDN: flexbox', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout' },
      { label: 'Unicode Emoji', url: 'https://unicode.org/emoji/' },
    ],
  },
};
