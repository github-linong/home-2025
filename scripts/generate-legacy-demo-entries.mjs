#!/usr/bin/env node
/**
 * Generate content/demos/*.md entries for legacy static/html demos.
 * Each entry gets a meaningful title, description, category, blog links, and legacy URL.
 *
 * Usage: node scripts/generate-legacy-demo-entries.mjs [--dry-run] [--limit N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_DEMO_INTROS, buildIntroMarkdown } from './data/curated-demo-intros.mjs';
import { BLOG_DEMO_INTROS } from './data/blog-demo-intros.mjs';

/** Curated + blog-linked intros; curated wins on key conflict (usually identical topic). */
const DEMO_INTROS = { ...BLOG_DEMO_INTROS, ...CURATED_DEMO_INTROS };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(ROOT, 'apps/web/src/data/static-html-demos.json');
const INVENTORY_PATH = '/tmp/static-html-inventory.json';
const BLOG_DIR = path.join(ROOT, 'apps/web/src/content/blog');
const DEMOS_DIR = path.join(ROOT, 'apps/web/src/content/demos');
const HTML_DIR = path.join(ROOT, 'apps/web/public/demos/html');

const SKIP_DEMO_FILES = new Set(['ai-prototype.md']);

/** Category name equals the primary topic tag (one shared vocabulary with search). */
const CATEGORY_RULES = [
  { re: /^(sf-a|sf-q|sf-article|sf-)/i, category: 'SegmentFault', tag: 'SegmentFault' },
  { re: /^test-/i, category: '测试', tag: '测试' },
  { re: /^bug-/i, category: 'Bug', tag: 'Bug' },
  { re: /^vue-/i, category: 'Vue', tag: 'Vue' },
  { re: /^react-/i, category: 'React', tag: 'React' },
  { re: /^qrcode/i, category: '二维码', tag: '二维码' },
  { re: /^pdf/i, category: 'PDF', tag: 'PDF' },
  { re: /websocket/i, category: 'WebSocket', tag: 'WebSocket' },
  { re: /^pwa|^service.?worker/i, category: 'PWA', tag: 'PWA' },
  { re: /^(audio|video|media|flv|hls)/i, category: '音视频', tag: '音视频' },
  { re: /^(flex|css|waterfall|sticky|grid)/i, category: 'CSS', tag: 'CSS' },
  { re: /^(input|textarea|form|select)/i, category: '表单', tag: '表单' },
  { re: /^(touch|click|copy|clipboard|drag|drop|sort)/i, category: '交互', tag: '交互' },
  { re: /^(ai-|img-|face|merge|upload|download|file|blob)/i, category: '文件 IO', tag: '文件 IO' },
  { re: /^(axios|ajax|xhr|cors|jsonp|fetch|http)/i, category: 'HTTP', tag: 'HTTP' },
  { re: /^(wx|wechat|mobile|ios|android|h5)/i, category: '移动端', tag: '移动端' },
  { re: /font|exif|canvas|svg/i, category: '图形', tag: '图形' },
];

function parseArgs(argv) {
  const args = { limit: Infinity, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function cleanTitle(raw) {
  if (!raw) return '';
  return raw
    .replace(/\s*-\s*www\.lilnong\.top\s*$/i, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDescription(raw) {
  if (!raw) return '';
  return raw
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTemplateNoise(text) {
  return !text || /\{\{[^}]+\}\}/.test(text);
}

/** HTML <title> copied from _template.html or unrelated pages — never use as list titles. */
const BAD_TEMPLATE_TITLES = new Set([
  '上传前预览文件',
  'Document',
  'Examples',
  'BIU',
  'Vue 中 v-if 和 v-show 的使用',
  '仅用于学习',
  '测试文案',
  '自建比赛页面fixed元素丢失测试',
  '罗汉鬼套路：lol一个不被秒就死不了的套路 万鞭归宗！！！_电子竞技_游戏_哔哩哔哩',
  '全部订单',
  '千秋万代一桶江湖',
  '我们同时监听放电状态和电池等级和剩余事件的事件',
]);

function isBadTitle(title, file) {
  if (!title) return true;
  if (title === file || title === file.replace(/\.html$/i, '')) return true;
  if (/^\d{10,}\.html$/i.test(title)) return true;
  if (BAD_TEMPLATE_TITLES.has(title)) return true;
  if (title === 'Document' || title === 'Examples' || title === 'BIU') return true;
  if (title.length > 120) return true;
  return false;
}

const FILENAME_DESCRIPTIONS = {
  'textarea-event-test.html':
    '交互式演示 input、change、keydown、keypress、keyup 在 textarea 上的触发时机与冒泡/阻止默认行为差异。',
  'MediaDevices-getUserMedia.html': '浏览器摄像头 / 麦克风采集实验，基于 MediaDevices.getUserMedia。',
  'MediaDevices-getDisplayMedia-MediaRecorder.html': '屏幕共享录制实验，基于 getDisplayMedia + MediaRecorder。',
  'MediaDevices-getDisplayMedia-MediaRecorder-download.html': '屏幕录制并下载本地文件。',
  'canvas-draw-signature.html': 'Canvas 手写签名，支持清空与导出。',
  'fe-image-getcolor-canvas.html': '用 Canvas 提取图片主题色。',
  'ai-faceplusplus-merge.html': 'Face++ 人脸融合交互 Demo。',
  'ai-baidu-merge.html': '百度 AI 人脸混合实验。',
  'ai-faceplusplus-HumanBodySegment.html': '人像抠图 / 人体分割实验。',
  'ai-bg-merge-matting.html': '背景融合与抠图实验（云毕业证相关）。',
  'face-api-browser.html': '浏览器端 face-api.js 人脸识别。',
  'barrage-bullet-screen-biubiubiu.html': '原生弹幕滚动效果。',
  'active-h5-scratchCard.html': 'H5 刮刮卡活动页。',
  'flex-study-WYSIWYG.html': 'Flexbox 属性可视化学习工具。',
  'chrome-virtual-scroller.html': 'Chrome 虚拟滚动实验。',
  '架构图编辑器.html': '可拖拽的架构图编辑器。',
  '架构图编辑器-20220618.html': '架构图编辑器 · 2022-06-18 快照。',
  '架构图编辑器-20220717.html': '架构图编辑器 · 2022-07-17 快照。',
  '架构图编辑器-20220717.2.html': '架构图编辑器 · 2022-07-17 变体 2。',
  '架构图编辑器-20220717.3.html': '架构图编辑器 · 2022-07-17 变体 3。',
  'ServiceWorkers-PWA-SW-sf-article.html': 'Service Worker / PWA 配套演示。',
  'sum-websocket-test.html': 'WebSocket 联调测试页。',
  'clipboard-api-async.html': '异步 Clipboard API 读写实验。',
  'fe-file-upload-ajax-XMLHTTPRequest-progress.html': 'XHR 上传进度条。',
  'pdfjs-test.html': 'PDF.js 前端预览 PDF。',
  'xlsx-sheet.html': '前端读取 / 展示 Excel（xlsx）。',
  'elementui-nav-3.html': 'Element UI 导航联动。',
  'elementui-upload-dialog.html': 'Element UI 上传弹窗与进度展示。',
  'h5-vue-devicemotion-accelerationIncludingGravity.html': 'devicemotion 摇一摇。',
  'h5-vue-devicemotion-accelerationIncludingGravity-ball.html': '陀螺仪驱动小球滚动。',
  'h5-vibrate-navigator.html': 'navigator.vibrate 震动反馈。',
  'h5-video-beforeupload-getmetadata.html': '上传前读取视频元数据（时长等）。',
  'flex-direction-column-sf.html':
    '仅 display:flex + flex-direction:column。博客系列起点，尚未做两端对齐或撑开。',
  'flex-direction-column-sf.1.html':
    '在 column 基础上加 justify-content: space-between，头底两端对齐；微调位置较难。',
  'flex-direction-column-sf.2.html':
    '中间 section 用 flex:1 撑开，并 display:flex + align-items:center 让内容垂直居中。',
  'flex-direction-column-sf.3.html':
    '内容上下各插 flexempty（flex:1 1 20px），用可伸缩空白控制上下留白比例。',
  'vue-bug-bullet.1.html': '弹幕列表用 :key="idx" 复现错乱；博客配套问题版。',
  'vue-bug-bullet.2.html': '改为 :key="item.id" 的修复版，对照 .1 复现路径验证。',
  'vue-bug-bullet.3.html': 'iframe 并排嵌入 .1 / .2，便于对照复现与修复。',
  'sf-q-1010000022743489-Vue.Draggable.html':
    '跨列表 clone：move 里用 list1/list2.includes 判断是否可放入。',
  'sf-q-1010000022743489-Vue.Draggable-2.html':
    'move 改用 relatedContext.list.includes，避免写死两个列表。',
  'sf-q-1010000022743489-Vue.Draggable-3.html':
    '目标列表绑定 :move="moveHandle"（与 -4 内容相同）。',
  'sf-q-1010000022743489-Vue.Draggable-4.html':
    '与 -3 相同：目标列表绑定 moveHandle。',
  'sf-q-1010000022743489-Vue.Draggable-5.html':
    'move 内允许同列表排序（from==to）；去掉 bind(this) computed。',
  'sf-q-1010000022743489-Vue.Draggable-6.html':
    '禁止拖回源列表（relatedContext.list == this.list）。',
  'sf-q-1010000022743489-Vue.Draggable-7.html':
    '对象项 + cloneHandle；拖入后弹 Dialog 编辑子项。',
  'sf-q-1010000022743489-Vue.Draggable-8.html':
    '在 -7 基础上加 move 日志开关，并限制只能从源列表拖出。',
  'sf-q-1010000022743489-Vue.Draggable-9.html':
    '源列表 checkbox 多选拖拽；目标列表用 move 控制。',
  'sf-q-1010000022743489-Vue.Draggable-9-1.html':
    '源列表 pull:false（不可拖出），对照 pull:clone 行为。',
  'vue-elementui-i18n-5.x.x.html': 'Element UI 5.x 国际化切换实验。',
  'vue-elementui-i18n-6.x.x.html': 'Element UI 6.x 国际化切换实验。',
  'vue-elementui-i18n-8.x.x.html': 'Element UI 8.x 国际化切换实验。',
  'video2canvas.html': '用 canvas 逐帧捕获 video。',
  'video2canvas-20210115.html': 'video→canvas 捕获（2021-01-15 迭代）。',
  'video2canvas-attribute.html': '带额外 attribute / 属性控制的 video→canvas。',
  'sf-q-1010000019613308-video-controls-bilibili.html': '自定义视频控件 · 基础版（B 站问答配套）。',
  'sf-q-1010000019613308-video-controls-bilibili-2.html': '自定义视频控件 · 变体 2。',
  'sf-q-1010000019613308-video-controls-bilibili-3.html': '自定义视频控件 · 变体 3。',
  'sf-q-1010000019613308-video-controls-bilibili-4.html': '自定义视频控件 · 变体 4。',
  'sf-q-1010000019613308-video-controls-bilibili-5.html': '自定义视频控件 · 变体 5。',
  'canvas-draw-signature-ori.html': 'Canvas 签名 · 原生实现。',
  'canvas-draw-signature-douyin.html': 'Canvas 手写签名板（清屏 / 上传）；同页另有未完成的 Phaser Arcade 精灵实验（与抖音无关）。',
  'canvas-draw-signature-phaser.html': 'Canvas 签名 · Phaser 实现。',
  'test-kroomgift-text-lineheight-nocenter.html': '歌房礼物文案行高不居中 · 基础复现。',
  'test-kroomgift-text-lineheight-nocenter-flexible.html': '歌房礼物行高 · flexible 方案。',
  'test-kroomgift-text-lineheight-nocenter-flexible.3.2.0.html': '歌房礼物行高 · flexible 3.2.0。',
  'test-kroomgift-text-lineheight-nocenter-flexible-viewport.html': '歌房礼物行高 · flexible + viewport。',
  'segmentfault-1010000018277389.html': 'Vue 批量绑定排查 · 基础版。',
  'segmentfault-1010000018277389-2.html': 'Vue 批量绑定排查 · 变体 2。',
  'segmentfault-1010000018277389-3.html': 'Vue 批量绑定排查 · 变体 3。',
};

const FILENAME_TITLES = {
  'textarea-event-test.html': 'Textarea 事件触发测试',
  'touchstart-click.html': 'Touch 击穿与 300ms 延迟',
  'copy-execCommand.html': '剪贴板 execCommand 复制',
  'waterfall.html': '瀑布流布局',
  'hidden-dom.html': '隐藏 DOM 元素测试',
  'exif.html': 'EXIF 图片元数据读取',
  'createfont.html': '动态加载 Web 字体',
  'bug-vue-audio-pending-status.html': 'Vue Audio Pending 状态复现',
  'input-number-validity.html': 'Input number 校验 Bug 复现',
  'vue-bullet-biubiubiu.html': 'Vue 弹幕效果',
  'vue-erp-test-vue@2.6.11.html': 'Vue ERP 插槽示例 (2.6.11)',
  'MediaDevices-getUserMedia.html': '摄像头采集 getUserMedia',
  'MediaDevices-getDisplayMedia-MediaRecorder.html': '屏幕录制 MediaRecorder',
  'MediaDevices-getDisplayMedia-MediaRecorder-download.html': '屏幕录制并下载',
  'canvas-draw-signature.html': 'Canvas 手写签名',
  'fe-image-getcolor-canvas.html': '图片主题色提取',
  'demo-image-cover-cut-canvas.html': '图片封面裁剪 Canvas',
  'html2canvas-invite-vvmusic.html': 'html2canvas 邀请卡截图',
  'ai-faceplusplus-merge.html': 'Face++ 人脸融合',
  'ai-baidu-merge.html': '百度 AI 人脸混合',
  'ai-faceplusplus-HumanBodySegment.html': '人像抠图分割',
  'ai-bg-merge-matting.html': '背景融合抠图',
  'face-api-browser.html': '浏览器端人脸识别',
  'img-resize-merge-upload-config.html': '人脸融合上传配置',
  '71fcaee8aa168ee2107b2eb9125ec293.html': '腾讯云毕业照',
  'barrage-bullet-screen-biubiubiu.html': '原生弹幕效果',
  'active-h5-scratchCard.html': 'H5 刮刮卡',
  'canvas-active-h5-scratchCard.html': 'Canvas 刮刮卡',
  'flex-study-WYSIWYG.html': 'Flex 可视化学习',
  'chrome-virtual-scroller.html': '虚拟滚动实验',
  '架构图编辑器.html': '架构图编辑器',
  'zlh-Vue.Draggable.html': 'Vue.Draggable 拖拽排序',
  'ServiceWorkers-PWA-SW-sf-article.html': 'Service Worker / PWA',
  'sum-websocket-test.html': 'WebSocket 测试',
  'clipboard-api-async.html': '异步 Clipboard API',
  'fe-file-upload-ajax-XMLHTTPRequest-progress.html': 'XHR 上传进度条',
  'pdfjs-test.html': 'PDF.js 预览',
  'xlsx-sheet.html': 'Excel 表格读取',
  'sf-a-1190000022597533-file-preview-input-drop.html': '上传前文件预览',
  'sf-a-1190000022597533-file-preview-accept-capture-multiple.html': '上传前预览 · accept/capture/multiple',
  'sf-a-1190000022597533-file-preview-input-drop-babel.html': '上传前预览 · Babel 版',
  'sf-a-1190000022597533-file-preview-input-drop-progress.html': '上传前预览 · 带进度',
  'sf-a-1190000022597533-file-preview-input-drop-progress-test.html': '上传前预览 · 进度测试',
  'elementui-nav-3.html': 'Element UI 导航联动',
  'elementui-upload-dialog.html': 'Element UI 上传弹窗',
  'h5-vue-devicemotion-accelerationIncludingGravity.html': '摇一摇检测',
  'h5-vue-devicemotion-accelerationIncludingGravity-ball.html': '陀螺仪小球',
  'h5-vibrate-navigator.html': '手机震动 vibrate',
  'h5-video-beforeupload-getmetadata.html': '上传前读视频时长',
  'sf-a-1190000022552442-shake-devicemotion-vibrate-audio.html': '摇一摇 + 震动 + 音频',
  'sf-a-1190000019207842-mobile-bug-layoutViewport-visualViewport-idealViewport.html':
    '移动端三种 Viewport 对比',
  'qrcode-20200408-jq22-yanshi4094.html': '二维码美化方案 A',
  'qrcode-20200408-jq22-yanshi21277.html': '二维码普通方案',
  'qrcode-20200408-qart-jq22-jqueryinfo12691.html': 'qart.js 艺术二维码',
  'qrcode-20200408-jq22-yanshi22345.html': '二维码高度美化方案',
  'flex-direction-column-sf.html': 'Flex 垂直布局 · 基础 column',
  'flex-direction-column-sf.1.html': 'Flex 垂直布局 · space-between',
  'flex-direction-column-sf.2.html': 'Flex 垂直布局 · section flex:1 居中',
  'flex-direction-column-sf.3.html': 'Flex 垂直布局 · 空白块 flex 分隔',
  'vue-bug-bullet.1.html': 'Vue 弹幕 Bug · 复现（:key=idx）',
  'vue-bug-bullet.2.html': 'Vue 弹幕 Bug · 修复（:key=id）',
  'vue-bug-bullet.3.html': 'Vue 弹幕 Bug · 对比页',
  'sf-q-1010000022743489-Vue.Draggable.html': 'Vue.Draggable · includes 判重',
  'sf-q-1010000022743489-Vue.Draggable-2.html': 'Vue.Draggable · relatedContext 判重',
  'sf-q-1010000022743489-Vue.Draggable-3.html': 'Vue.Draggable · 目标列表 move',
  'sf-q-1010000022743489-Vue.Draggable-4.html': 'Vue.Draggable · 目标列表 move（同 -3）',
  'sf-q-1010000022743489-Vue.Draggable-5.html': 'Vue.Draggable · 允许同列表排序',
  'sf-q-1010000022743489-Vue.Draggable-6.html': 'Vue.Draggable · 禁拖回源列表',
  'sf-q-1010000022743489-Vue.Draggable-7.html': 'Vue.Draggable · clone + Dialog',
  'sf-q-1010000022743489-Vue.Draggable-8.html': 'Vue.Draggable · move 日志 + 源限制',
  'sf-q-1010000022743489-Vue.Draggable-9.html': 'Vue.Draggable · checkbox 多选拖',
  'sf-q-1010000022743489-Vue.Draggable-9-1.html': 'Vue.Draggable · pull:false',
  'vue-elementui-i18n-5.x.x.html': 'Element UI i18n · 5.x',
  'vue-elementui-i18n-6.x.x.html': 'Element UI i18n · 6.x',
  'vue-elementui-i18n-8.x.x.html': 'Element UI i18n · 8.x',
  'video2canvas.html': 'video → canvas 捕获',
  'video2canvas-20210115.html': 'video → canvas · 20210115',
  'video2canvas-attribute.html': 'video → canvas · attribute',
  'sf-q-1010000019613308-video-controls-bilibili.html': '自定义视频控件 · 基础',
  'sf-q-1010000019613308-video-controls-bilibili-2.html': '自定义视频控件 · 变体 2',
  'sf-q-1010000019613308-video-controls-bilibili-3.html': '自定义视频控件 · 变体 3',
  'sf-q-1010000019613308-video-controls-bilibili-4.html': '自定义视频控件 · 变体 4',
  'sf-q-1010000019613308-video-controls-bilibili-5.html': '自定义视频控件 · 变体 5',
  '架构图编辑器-20220618.html': '架构图编辑器 · 20220618',
  '架构图编辑器-20220717.html': '架构图编辑器 · 20220717',
  '架构图编辑器-20220717.2.html': '架构图编辑器 · 20220717.2',
  '架构图编辑器-20220717.3.html': '架构图编辑器 · 20220717.3',
  'canvas-draw-signature-ori.html': 'Canvas 签名 · 原生',
  'canvas-draw-signature-douyin.html': 'Canvas 手写签名（附 Phaser 实验）',
  'canvas-draw-signature-phaser.html': 'Canvas 签名 · Phaser',
  'test-kroomgift-text-lineheight-nocenter.html': '歌房礼物行高不居中 · 基础',
  'test-kroomgift-text-lineheight-nocenter-flexible.html': '歌房礼物行高 · flexible',
  'test-kroomgift-text-lineheight-nocenter-flexible.3.2.0.html': '歌房礼物行高 · flexible 3.2.0',
  'test-kroomgift-text-lineheight-nocenter-flexible-viewport.html': '歌房礼物行高 · flexible+viewport',
  'segmentfault-1010000018277389.html': 'Vue 批量绑定排查',
  'segmentfault-1010000018277389-2.html': 'Vue 批量绑定排查 · 变体 2',
  'segmentfault-1010000018277389-3.html': 'Vue 批量绑定排查 · 变体 3',
  'FontInflation.html': 'FontInflation 字号膨胀',
  'FontInflation_viewport.html': 'FontInflation · viewport',
  'test-FontInflation.html': 'FontInflation · 测试页',
  'test-FontInflation-viewport.html': 'FontInflation · 测试+viewport',
  'lagou-46.html': '拉勾课程笔记 Demo · 46',
  'lagou-46-2.html': '拉勾课程笔记 Demo · 46-2',
  'lagou-46-3.html': '拉勾课程笔记 Demo · 46-3',
  'test-mobile-Sortable-github-drop.html': 'Sortable 移动端 · 列表',
  'test-mobile-Sortable-github-drop-grid.html': 'Sortable 移动端 · 网格',
  'test-mobile-Sortable-github-drop-grid-2.html': 'Sortable 移动端 · 网格 2',
  'page-correspond-localstorage.html': '跨页通信 · localStorage',
  'page-correspond-localstorage-visibilitychange.html': '跨页通信 · storage+visibility',
  'mobile-keyboard-test.html': '移动端键盘兼容',
  'mobile-keyboard-test-longpage.html': '移动端键盘 · 长页',
  'scaleRotate.html': '双指放大旋转',
  'test-mobile-userscalable-scaleRotate.html': '双指放大旋转 · userscalable',
  'mobile-fixed-header.html': '移动端吸顶 · 非 fixed',
  'mobile-fixed-header-sticky.html': '移动端吸顶 · sticky',
  'chat-sendbox-icon-img-call.html': '消息发送框 · 图标通话',
  'chat-sendbox-icon-img-call-2.html': '消息发送框 · 变体 2',
  'sf-article-input-textarea-contentEditable-im-sendbox.html': 'IM 发送框 contentEditable',
  'sf-article-input-textarea-contentEditable-im-sendbox-webkit-user-modify.html':
    'IM 发送框 · webkit-user-modify',
  'mobile_date_test.html': '移动端 new Date 测试',
  'test-mobile-date-ios-android.html': '移动端 Date · iOS/Android',
  'datetime-local.html': 'datetime-local 时区',
  'test-input-type-datetime-local.html': 'input datetime-local 测试',
  'sf-q-1010000038765159-list-sort-max-rate.html': '无序数据有序柱状图',
  'sf-q-1010000038765159-list-sort-max-rate-async.html': '无序数据有序柱状图 · async',
  'userlist-long-list-kroom-test.html': '长列表 fixed 丢失 · kroom',
  'userlist-long-list-kroom-test2.html': '长列表 fixed 丢失 · kroom 2',
  'userlist-flex-order-test.html': '用户列表 flex order',
  'wx-qq-position-fixed.html': '微信/QQ position:fixed',
  'test-mobile-devicePixelRatio-adaptation.html': '移动端 DPR 适配',
  'test-mobile-fixed-input-BUG.html': '移动端 fixed + input Bug',
  'Fixed-plus-Input-BUG现象.html': 'Fixed + Input Bug 现象',
  'mobile.html': '移动端适配',
  'test-preventoverscrolljs.html': 'preventOverscroll.js 测试',
  'test-mobile-scroll.html': '移动端滚动事件',
  'm_scroll.html': '移动端滚动',
  'preventoverscrolljs.html': 'preventOverscroll 演示',
  'img-resize-merge-upload.html': '人脸融合上传',
  'img-resize-merge-upload copy.html': '人脸融合上传 · 副本',
  'h5-vue-devicemotion-accelerationIncludingGravity-threshold.html': '摇一摇 · 阈值',
  'fixed-bottom-input.html': '底部 fixed 输入框',
  'vue-vif-vshow-bug.html': 'v-if / v-show Bug 复现',
  'sf-a-1190000022616927-vue-emit.html': 'Vue $emit 事件传递',
  'sf-a-1190000022770549-reRender-raf-task.html': 'Vue 重渲染 + rAF 任务',
  'vue-component-focus.html': 'Vue 组件 focus 管理',
  'js-encode-char-jschardet.html': '字符编码检测 jschardet',
  'h5-vue-deviceorientation.html': 'deviceorientation 摇一摇',
  'h5-vue-deviceorientation-threshold.html': 'deviceorientation 摇一摇 · 阈值',
  'playlist-table-auto-col.html': '表格列操作',
  'playlist-table-auto-col copy.html': '表格列操作 · 副本',
  'qrcode-awesome-qr.html': '二维码加图片 · awesome-qr',
  'qrcode-awesome-qr-norequire.html': '二维码加图片 · 无 require',
  'getBattery.html': 'Battery Status API',
  'test-h5-getBattery.html': 'Battery Status API · 测试',
  'fe-injection-html-script-tag.html': 'HTML script 注入',
  'test-fe-injection-html-script-tag.html': 'HTML script 注入 · 测试',
  'animate-transition-rotate.html': 'Animate 旋转过渡',
  'test-animate-transition-rotate.html': 'Animate 旋转过渡 · 测试',
};

function humanizeFilename(file) {
  if (FILENAME_TITLES[file]) return FILENAME_TITLES[file];

  let name = file.replace(/\.html$/i, '');
  name = name.replace(/^sf-a-\d+-/, '');
  name = name.replace(/^sf-q-\d+-/, '');
  name = name.replace(/^sf-article-\d+-/, '');
  name = name.replace(/^sf-article-/, '');
  name = name.replace(/^\d{10,}-?/, '');
  name = name.replace(/^test-/, '');
  name = name.replace(/-/g, ' ');
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return name.slice(0, 80);
}

/** Short Chinese-friendly names for well-known demo filenames */
const DEMO_TITLE_OVERRIDES = {
  'textarea-event-test.html': 'Textarea / Input 事件触发对比',
  'touchstart-click.html': 'Touch 与 Click 击穿复现',
  'copy-execCommand.html': '剪贴板 execCommand 复制',
  'waterfall.html': '瀑布流布局',
  'hidden-dom.html': '隐藏 DOM 元素测试',
  'exif.html': 'EXIF 图片元数据读取',
  'createfont.html': '动态加载 Web 字体',
};

function inferCategory(file) {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(file)) return { category: rule.category, tag: rule.tag };
  }
  return { category: '实验', tag: '实验' };
}

function extractSfIds(file) {
  const ids = new Set();
  for (const m of file.matchAll(/(?:sf-[qa]-|sf-article-)(\d{10,})/gi)) ids.add(m[1]);
  const bare = file.match(/^(\d{10,16})\.html$/i);
  if (bare) ids.add(bare[1]);
  const sfNum = file.match(/^sf-(\d{10,})/i);
  if (sfNum) ids.add(sfNum[1]);
  return [...ids];
}

function buildBlogIndex() {
  const bySlug = new Map();
  const bySfId = new Map();

  for (const name of fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))) {
    const slug = name.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(BLOG_DIR, name), 'utf8');
    const titleM = content.match(/^title:\s*["']?([^"'\n]+)/m);
    const title = titleM?.[1]?.trim() ?? slug;
    bySlug.set(slug, { slug, title, content });

    const idM = slug.match(/^(?:sf-a-|sf-q-|sf-)(\d+)/);
    if (idM) {
      const id = idM[1];
      if (!bySfId.has(id)) bySfId.set(id, []);
      bySfId.get(id).push(slug);
    }
  }
  return { bySlug, bySfId };
}

function buildDemoToPosts(blogIndex) {
  const map = new Map();
  const re = /\/static\/html\/([^\s"'<>)\]]+\.html)/gi;

  for (const { slug, content } of blogIndex.bySlug.values()) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const file = m[1];
      if (!map.has(file)) map.set(file, new Set());
      map.get(file).add(slug);
    }
  }
  return map;
}

function inferRelatedPosts(file, demoToPosts, blogIndex) {
  const posts = new Set(demoToPosts.get(file) ?? []);
  for (const id of extractSfIds(file)) {
    for (const slug of blogIndex.bySfId.get(id) ?? []) posts.add(slug);
  }
  return [...posts].sort();
}

function inferTitle(file, htmlTitle, inventory, relatedPosts, blogIndex) {
  if (FILENAME_TITLES[file]) return FILENAME_TITLES[file];
  if (DEMO_TITLE_OVERRIDES[file]) return DEMO_TITLE_OVERRIDES[file];

  const candidates = [
    cleanTitle(htmlTitle),
    cleanTitle(inventory?.desc),
    cleanTitle(inventory?.h1),
    cleanTitle(inventory?.title),
  ].filter((t) => !isBadTitle(t, file));

  if (candidates.length) return candidates[0];

  const human = humanizeFilename(file);
  if (human && human.length > 3) return human;

  return file.replace(/\.html$/i, '');
}

function isBadDescription(text) {
  if (!text || text.length < 20) return true;
  if (/：\s*(：|$)/.test(text)) return true;
  if (/^(console|stopPropagation|preventDefault|Document|Examples|BIU)\b/i.test(text)) return true;
  return false;
}

function inferDescription(file, title, inventory, relatedPosts, blogIndex, category) {
  if (FILENAME_DESCRIPTIONS[file]) return FILENAME_DESCRIPTIONS[file];

  const snippet = cleanDescription(inventory?.snippet ?? '');
  const desc = cleanDescription(inventory?.desc ?? '');

  if (!isBadDescription(snippet)) return snippet.slice(0, 200);
  if (!isBadDescription(desc)) return desc.slice(0, 200);

  const parts = [`${category}交互示例：${title}。`];
  if (!relatedPosts.length) {
    if (/^sf-/i.test(file)) {
      parts.push('思否文章/问答配套演示页。');
    } else {
      parts.push('历史前端实验与 Bug 复现页。');
    }
  }
  return parts.join('');
}

function inferPubDate(file) {
  const d = file.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (d) return `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  if (/^sf-|^test-|^vue-|^2019|^2020|^2021|^2022|^2023|^2024/.test(file)) {
    const y = file.match(/^(20\d{2})/);
    if (y) return `${y[1]}-06-01`;
  }
  return '2019-06-01';
}

/** Curated valuable demos (beyond blog-linked). Keep in sync with apps/web/src/data/curated-demos.ts */
const CURATED_SLUGS = new Set([
  'MediaDevices-getUserMedia',
  'MediaDevices-getDisplayMedia-MediaRecorder',
  'MediaDevices-getDisplayMedia-MediaRecorder-download',
  'canvas-draw-signature',
  'fe-image-getcolor-canvas',
  'demo-image-cover-cut-canvas',
  'html2canvas-invite-vvmusic',
  'ai-faceplusplus-merge',
  'ai-baidu-merge',
  'ai-faceplusplus-HumanBodySegment',
  'ai-bg-merge-matting',
  'face-api-browser',
  'img-resize-merge-upload-config',
  '71fcaee8aa168ee2107b2eb9125ec293',
  'barrage-bullet-screen-biubiubiu',
  'active-h5-scratchCard',
  'canvas-active-h5-scratchCard',
  'flex-study-WYSIWYG',
  'chrome-virtual-scroller',
  '架构图编辑器',
  'zlh-Vue.Draggable',
  'ServiceWorkers-PWA-SW-sf-article',
  'sum-websocket-test',
  'clipboard-api-async',
  'fe-file-upload-ajax-XMLHTTPRequest-progress',
  'pdfjs-test',
  'xlsx-sheet',
  'sf-a-1190000022597533-file-preview-input-drop',
  'elementui-nav-3',
  'elementui-upload-dialog',
  'h5-vue-devicemotion-accelerationIncludingGravity',
  'h5-vue-devicemotion-accelerationIncludingGravity-ball',
  'h5-vibrate-navigator',
  'h5-video-beforeupload-getmetadata',
  'sf-a-1190000022552442-shake-devicemotion-vibrate-audio',
  'sf-a-1190000019207842-mobile-bug-layoutViewport-visualViewport-idealViewport',
  'qrcode-20200408-jq22-yanshi4094',
  'qrcode-20200408-jq22-yanshi21277',
  'qrcode-20200408-qart-jq22-jqueryinfo12691',
  'qrcode-20200408-jq22-yanshi22345',
]);

function inferBadge(relatedPosts, file) {
  const slug = file.replace(/\.html$/i, '');
  if (relatedPosts.length) return '博客配套';
  if (CURATED_SLUGS.has(slug)) return '精选';
  if (/^sf-/i.test(file)) return '思否';
  if (/^test-|^bug-/i.test(file)) return 'Bug 复现';
  return '实验';
}

function slugFromFile(file) {
  return file.replace(/\.html$/i, '');
}

function yamlQuote(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildMarkdown(entry) {
  const lines = [
    '---',
    `title: ${yamlQuote(entry.title)}`,
    `description: ${yamlQuote(entry.description)}`,
    `pubDate: ${yamlQuote(entry.pubDate)}`,
    'type: web',
    `demoUrl: ${yamlQuote(entry.demoUrl)}`,
    `legacyUrl: ${yamlQuote(entry.legacyUrl)}`,
    `category: ${yamlQuote(entry.category)}`,
    `badge: ${yamlQuote(entry.badge)}`,
    `tags: [${entry.tags.map(yamlQuote).join(', ')}]`,
  ];
  if (entry.relatedPosts.length) {
    lines.push(`relatedPosts: [${entry.relatedPosts.map(yamlQuote).join(', ')}]`);
  }
  lines.push('---', '');

  if (entry.body) {
    lines.push(entry.body.trimEnd(), '');
  }

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = loadJson(MANIFEST_PATH, { demos: [] });
  const inventoryRows = loadJson(INVENTORY_PATH, []);
  const inventory = new Map(inventoryRows.map((r) => [r.file, r]));
  const blogIndex = buildBlogIndex();
  const demoToPosts = buildDemoToPosts(blogIndex);

  if (!manifest.demos.length) {
    console.error('No demos in manifest. Run migrate:static-html first.');
    process.exit(1);
  }

  fs.mkdirSync(DEMOS_DIR, { recursive: true });

  let count = 0;
  let withPosts = 0;

  for (const demo of manifest.demos) {
    if (count >= args.limit) break;

    const { file } = demo;
    const slug = slugFromFile(file);
    const mdPath = path.join(DEMOS_DIR, `${slug}.md`);

    if (SKIP_DEMO_FILES.has(`${slug}.md`)) continue;

    const htmlPath = path.join(HTML_DIR, file);
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
    const htmlTitleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const htmlTitle = htmlTitleM?.[1] ?? '';
    const inv = inventory.get(file);
    const relatedPosts = inferRelatedPosts(file, demoToPosts, blogIndex);
    if (relatedPosts.length) withPosts++;

    const { category, tag } = inferCategory(file);
    const title = inferTitle(file, htmlTitle, inv, relatedPosts, blogIndex);
    const description = inferDescription(file, title, inv, relatedPosts, blogIndex, category);
    const tags = ['legacy', tag];
    if (relatedPosts.length) tags.push('博客配套');
    if (CURATED_SLUGS.has(slug) && !relatedPosts.length) tags.push('精选');

    const postTitles = Object.fromEntries(
      relatedPosts.map((s) => [s, blogIndex.bySlug.get(s)?.title ?? s]),
    );

    const entry = {
      title,
      description,
      pubDate: inferPubDate(file),
      demoUrl: `/demos/html/${file}`,
      legacyUrl: `/static/html/${file}`,
      category,
      badge: inferBadge(relatedPosts, file),
      tags,
      relatedPosts,
      postTitles,
      body: DEMO_INTROS[slug] ? buildIntroMarkdown(slug, DEMO_INTROS[slug]) : '',
    };

    const md = buildMarkdown(entry);

    if (!args.dryRun) {
      fs.writeFileSync(mdPath, md);
    }
    console.log(`[${count + 1}] ${slug} — ${title}${relatedPosts.length ? ` (${relatedPosts.length} posts)` : ''}`);
    count++;
  }

  console.log(`\nDone: ${count} entries, ${withPosts} linked to blog posts`);
  if (!args.dryRun) console.log(`Output: ${DEMOS_DIR}`);
}

main();
