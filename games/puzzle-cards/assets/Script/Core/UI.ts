// cocos/assets/Script/Core/UI.ts
// 程序化 UI 构建助手（拼拼卡 · 暖色糖果风）。
// 全部 UI 在代码里搭建，避免手写易碎的 .scene JSON；节点颜色/文案统一走 Theme / Copy。
//
// 关键修正：Cocos 的 Sprite 若无 spriteFrame 则完全不渲染。为避免面板/按钮在真机不可见，
// 这里统一给面板/按钮/兜底图填充一张 1×1 白色 SpriteFrame（solidFrame），用 tint 着色。
import {
  Node, Label, Sprite, UITransform, Color, Button, Widget, SpriteFrame,
  ImageAsset, Texture2D, Rect, resources,
} from 'cc';
import { Theme } from './Theme';

// 微信小游戏全局对象（仅在该平台存在；编辑器/浏览器预览下 undefined，走 document 分支）。
declare const wx: any;

export function hexColor(hex: string): Color {
  return new Color().fromHEX(hex);
}

// 纯色块兜底纹理（单例）。用于面板/按钮/背景着色，避免空 Sprite 不可见。
// 用运行时 Canvas 画 1×1 白像素纹理：Web 用 document.createElement('canvas')，
// 微信小游戏用 wx.createCanvas()，两者皆为 Cocos 适配的 ImageAsset 源。
// 不依赖 ImageAsset.reset（Web 下 Uint8Array 解码失败）也不依赖 resources 打包时序。
let _solidFrame: SpriteFrame | null = null;
let _solidTried = false;

// 同步返回兜底白纹理；首次调用时构建并缓存。返回 null 表示环境不支持（极少见，退化为不渲染）。
export function solidFrame(): SpriteFrame | null {
  if (_solidTried) return _solidFrame;
  _solidTried = true;
  _solidFrame = buildSolidFrame();
  return _solidFrame;
}

function buildSolidFrame(): SpriteFrame | null {
  try {
    let canvas: any = null;
    if (typeof document !== 'undefined' && (document as any).createElement) {
      canvas = (document as any).createElement('canvas');
    } else if (typeof wx !== 'undefined' && (wx as any).createCanvas) {
      canvas = (wx as any).createCanvas();
    }
    if (!canvas) return null;
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    const image = new ImageAsset(canvas);
    const tex = new Texture2D();
    tex.image = image;
    const frame = new SpriteFrame();
    frame.texture = tex;
    frame.rect = new Rect(0, 0, 1, 1);
    return frame;
  } catch (e) {
    console.warn('[UI] buildSolidFrame failed:', (e as any) && (e as any).message);
    return null;
  }
}

// 圆角白纹理（单例）。用于按钮/面板的 9-slice 圆角（暖色糖果风），
// 替代纯色块方角。用运行时 Canvas 画一张 120×120 圆角白图，inset 设成圆角半径，
// Sprite 以 SLICED 模式缩放即可保持四角圆润。同 solidFrame，不依赖 resources 打包时序。
let _roundedFrame: SpriteFrame | null = null;
let _roundedTried = false;

export function roundedFrame(): SpriteFrame | null {
  if (_roundedTried) return _roundedFrame;
  _roundedTried = true;
  _roundedFrame = buildRoundedFrame();
  return _roundedFrame;
}

function buildRoundedFrame(): SpriteFrame | null {
  try {
    let canvas: any = null;
    if (typeof document !== 'undefined' && (document as any).createElement) {
      canvas = (document as any).createElement('canvas');
    } else if (typeof wx !== 'undefined' && (wx as any).createCanvas) {
      canvas = (wx as any).createCanvas();
    }
    if (!canvas) return null;
    const S = 120;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, S, S);
    const r = 40;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(S, 0, S, S, r);
    ctx.arcTo(S, S, 0, S, r);
    ctx.arcTo(0, S, 0, 0, r);
    ctx.arcTo(0, 0, S, 0, r);
    ctx.closePath();
    ctx.fill();
    const image = new ImageAsset(canvas);
    const tex = new Texture2D();
    tex.image = image;
    const frame = new SpriteFrame();
    frame.texture = tex;
    frame.rect = new Rect(0, 0, S, S);
    frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = r;
    return frame;
  } catch (e) {
    console.warn('[UI] buildRoundedFrame failed:', (e as any) && (e as any).message);
    return null;
  }
}

// 给节点加一个 UITransform 并设置尺寸
export function sizeNode(node: Node, w: number, h: number): UITransform {
  const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
  ut.setContentSize(w, h);
  return ut;
}

// 居中 Widget（铺满父节点；使用绝对像素 0，避免被解释成百分比）
export function stretch(node: Node): Widget {
  const w = node.getComponent(Widget) || node.addComponent(Widget);
  w.isAbsoluteBottom = w.isAbsoluteTop = w.isAbsoluteLeft = w.isAbsoluteRight = true;
  w.left = w.right = w.top = w.bottom = 0;
  w.alignMode = Widget.AlignMode.ONCE;
  return w;
}

export interface LabelOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  width?: number;
  height?: number;
}
// 创建文本节点（默认暖棕正文色）
export function addLabel(parent: Node, text: string, opts: LabelOpts = {}): Node {
  const node = new Node('Label');
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = opts.size ?? 28;
  label.color = hexColor(opts.color ?? Theme.color.text);
  if (opts.bold) label.isBold = true;
  label.lineHeight = (opts.size ?? 28) * 1.3;
  sizeNode(node, opts.width ?? Math.max(80, text.length * (opts.size ?? 28) * 0.62), opts.height ?? (opts.size ?? 28) * 1.4);
  parent.addChild(node);
  node.layer = parent.layer;
  return node;
}

export interface BtnOpts {
  w?: number; h?: number; color?: string; textColor?: string; size?: number;
}

export interface ToolBtnOpts {
  w?: number; h?: number;
  bgColor?: string;
  iconColor?: string;
  textColor?: string;
  showAdIcon?: boolean;
}

// 创建按钮（暖橘主色，圆角由 Sprite 默认处理）
export function addButton(parent: Node, text: string, onClick: () => void, opts: BtnOpts = {}): Node {
  const node = new Node('Button');
  const sprite = node.addComponent(Sprite);
  const rf = roundedFrame();
  if (rf) {
    sprite.spriteFrame = rf;
    sprite.type = Sprite.Type.SLICED;
    sprite.color = hexColor(opts.color ?? Theme.color.primary);
  } else {
    // 兜底：圆角纹理不可用（极少见）退化为方角色块
    sprite.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) sprite.spriteFrame = sf;
    sprite.color = hexColor(opts.color ?? Theme.color.primary);
  }
  const btn = node.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  targetOnClick(node, onClick);
  sizeNode(node, opts.w ?? 280, opts.h ?? 80);

  // Label 必须作为子节点：Sprite 与 Label 同属 UIRenderer，不能挂在同一节点。
  const labelNode = new Node('Label');
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.color = hexColor(opts.textColor ?? '#FFFFFF');
  label.fontSize = opts.size ?? 30;
  label.isBold = true;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.CLAMP;
  label.lineHeight = (opts.size ?? 30) * 1.3;
  sizeNode(labelNode, opts.w ?? 280, opts.h ?? 80);
  labelNode.setPosition(0, 0, 0);
  node.addChild(labelNode);

  parent.addChild(node);
  node.layer = parent.layer;
  // 必须在 node.layer 同步到 UI_2D 之后，再同步子节点 Label
  labelNode.layer = node.layer;
  return node;
}

// 点击绑定：直接监听节点事件（避免依赖编辑器序列化的 clickEvents）。
function targetOnClick(target: Node, cb: () => void): void {
  target.on(Button.EventType.CLICK, cb);
}

// 创建底部工具按钮（深色圆角方底，上图标下文字，参考古风拼图风格）。
// iconText 用单个字符/emoji 作为图标（如 '💡' / '⏱' / '👁'），小游戏包体不引入图标资源。
export function addToolButton(parent: Node, iconText: string, label: string, onClick: () => void, opts: ToolBtnOpts = {}): Node {
  const w = opts.w ?? 110;
  const h = opts.h ?? 130;
  const node = new Node('ToolButton');
  const sprite = node.addComponent(Sprite);
  const rf = roundedFrame();
  if (rf) {
    sprite.spriteFrame = rf;
    sprite.type = Sprite.Type.SLICED;
    sprite.color = hexColor(opts.bgColor ?? '#2A2A3A');
  } else {
    sprite.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) sprite.spriteFrame = sf;
    sprite.color = hexColor(opts.bgColor ?? '#2A2A3A');
  }
  const btn = node.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  targetOnClick(node, onClick);
  sizeNode(node, w, h);

  // 图标
  const iconNode = new Node('Icon');
  const iconLab = iconNode.addComponent(Label);
  iconLab.string = iconText;
  iconLab.fontSize = 34;
  iconLab.color = hexColor(opts.iconColor ?? '#FFFFFF');
  iconLab.horizontalAlign = Label.HorizontalAlign.CENTER;
  iconLab.verticalAlign = Label.VerticalAlign.CENTER;
  sizeNode(iconNode, w, 44);
  iconNode.setPosition(0, 22);
  node.addChild(iconNode);

  // 文字
  const labelNode = new Node('Label');
  const labelComp = labelNode.addComponent(Label);
  labelComp.string = label;
  labelComp.fontSize = 22;
  labelComp.color = hexColor(opts.textColor ?? '#FFFFFF');
  labelComp.horizontalAlign = Label.HorizontalAlign.CENTER;
  labelComp.verticalAlign = Label.VerticalAlign.CENTER;
  sizeNode(labelNode, w, 30);
  labelNode.setPosition(0, -20);
  node.addChild(labelNode);

  // 视频小标（提示这是广告按钮）
  if (opts.showAdIcon !== false) {
    const adNode = new Node('AdIcon');
    const adLab = adNode.addComponent(Label);
    adLab.string = '▶';
    adLab.fontSize = 14;
    adLab.color = hexColor('#FFD66B');
    adLab.horizontalAlign = Label.HorizontalAlign.CENTER;
    adLab.verticalAlign = Label.VerticalAlign.CENTER;
    sizeNode(adNode, 24, 24);
    adNode.setPosition(-28, -42);
    node.addChild(adNode);
  }

  parent.addChild(node);
  node.layer = parent.layer;
  // 子节点 layer 同步
  node.children.forEach((c) => { c.layer = node.layer; });
  return node;
}

// 创建图片节点（从 resources 加载 Texture2D 并包装成 SpriteFrame；缺资源时退化为纯色块）
export function addImage(parent: Node, resPath: string, w: number, h: number, fallbackColor?: string): Node {
  const node = new Node('Image');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SIMPLE;
  if (fallbackColor) {
    const sf = solidFrame();
    if (sf) sprite.spriteFrame = sf;
    sprite.color = hexColor(fallbackColor);
  }
  sizeNode(node, w, h);
  parent.addChild(node);
  node.layer = parent.layer;
  resources.load(`${resPath}/texture`, Texture2D, (err: any, tex: Texture2D) => {
    if (!err && tex) {
      const sf = new SpriteFrame();
      sf.texture = tex;
      sf.rect = new Rect(0, 0, tex.width, tex.height);
      sprite.spriteFrame = sf;
      sprite.color = hexColor('#FFFFFF');
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }
  });
  return node;
}

export interface RarityCardOpts {
  rarity?: string;        // 'N' | 'R' | 'SR' | 'SSR' | 'HIDDEN'
  owned?: boolean;        // false → 未拥有，灰显 + 问号（不加载真实卡面，避免剧透）
  border?: number;        // 描边厚度（px），默认按尺寸自适应
}

// 带稀有度描边的卡牌（集卡册 / 抽卡结果通用）。返回卡牌根节点，调用方负责定位与加标签。
// 描边背板用圆角纹理 + 稀有度色（SLICED 九宫格保持四角圆润）；内层卡面缩小露出描边。
export function addRarityCard(parent: Node, resPath: string, w: number, h: number, opts: RarityCardOpts = {}): Node {
  const rarity = opts.rarity || 'N';
  const border = opts.border ?? Math.max(3, Math.round(Math.min(w, h) * 0.07));
  const isOwned = opts.owned !== false;
  const rarityColor = Theme.color.rarity[rarity] || Theme.color.primaryLight;

  // 描边背板（圆角，稀有度色；未拥有用深底）
  const card = new Node('RarityCard');
  const bg = card.addComponent(Sprite);
  const rf = roundedFrame();
  if (rf) {
    bg.spriteFrame = rf;
    bg.type = Sprite.Type.SLICED;
    bg.color = hexColor(isOwned ? rarityColor : Theme.color.bgDeep);
  } else {
    bg.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) bg.spriteFrame = sf;
    bg.color = hexColor(isOwned ? rarityColor : Theme.color.bgDeep);
  }
  sizeNode(card, w, h);
  parent.addChild(card);
  card.layer = parent.layer;

  // 内层卡面（缩进露出描边）。已拥有加载真实卡面；未拥有仅灰底 + 问号，不加载真实图避免剧透与无效请求。
  const inner = Math.max(8, Math.min(w, h) - border * 2);
  if (isOwned) {
    const img = addImage(card, resPath, inner, inner, Theme.color.primaryLight);
    img.setPosition(0, 0);
  } else {
    const img = new Node('Image');
    const sp = img.addComponent(Sprite);
    sp.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) sp.spriteFrame = sf;
    sp.color = hexColor(Theme.color.bgDeep);
    sizeNode(img, inner, inner);
    card.addChild(img);
    img.layer = card.layer;
  }

  if (!isOwned) {
    const lock = addLabel(card, '?', { size: Math.round(Math.min(w, h) * 0.42), color: '#FFFFFF', bold: true });
    lock.setPosition(0, 0);
  }
  return card;
}

// 简单面板（圆角暖白底，用作卡片/弹窗容器）；填充 solidFrame 保证可见。
export function addPanel(parent: Node, w: number, h: number, color?: string): Node {
  const node = new Node('Panel');
  const sprite = node.addComponent(Sprite);
  const rf = roundedFrame();
  if (rf) {
    sprite.spriteFrame = rf;
    sprite.type = Sprite.Type.SLICED;
    sprite.color = hexColor(color ?? Theme.color.bg);
  } else {
    sprite.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) sprite.spriteFrame = sf;
    sprite.color = hexColor(color ?? Theme.color.bg);
  }
  sizeNode(node, w, h);
  parent.addChild(node);
  node.layer = parent.layer;
  return node;
}

// 半透明遮罩层（用于结果弹窗背景）。alpha: 0~1
export function dimOverlay(parent: Node, w: number, h: number, alpha = 0.5): Node {
  const node = new Node('Dim');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SIMPLE;
  const sf = solidFrame();
  if (sf) sprite.spriteFrame = sf;
  sprite.color = new Color(0, 0, 0, Math.round(alpha * 255));
  sizeNode(node, w, h);
  stretch(node);
  parent.addChild(node);
  node.layer = parent.layer;
  return node;
}
