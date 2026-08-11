// cocos/assets/Script/Core/UI.ts
// 程序化 UI 构建助手（拼拼卡 · 暖色糖果风）。
// 全部 UI 在代码里搭建，避免手写易碎的 .scene JSON；节点颜色/文案统一走 Theme / Copy。
//
// 关键修正：Cocos 的 Sprite 若无 spriteFrame 则完全不渲染。为避免面板/按钮在真机不可见，
// 这里统一给面板/按钮/兜底图填充一张 1×1 白色 SpriteFrame（solidFrame），用 tint 着色。
import {
  Node, Label, Sprite, UITransform, Color, Button, Widget, resources, SpriteFrame,
  ImageAsset, Texture2D, Rect, PixelFormat,
} from 'cc';
import { Theme } from './Theme';

export function hexColor(hex: string): Color {
  return new Color().fromHEX(hex);
}

// 1×1 白色纹理（单例）。用于面板/按钮/兜底色块，避免空 Sprite 不可见。
// 若当前基础库不支持该方式（极少见），降级为 null（退化为原行为：不渲染，但不崩溃）。
let _solidFrame: SpriteFrame | null = null;
function solidFrame(): SpriteFrame | null {
  if (_solidFrame !== null) return _solidFrame;
  try {
    const image = new ImageAsset();
    image.reset({
      width: 1,
      height: 1,
      format: PixelFormat.RGBA8888,
      _data: new Uint8Array([255, 255, 255, 255]),
    } as any);
    const texture = new Texture2D();
    texture.image = image;
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(0, 0, 1, 1);
    _solidFrame = frame;
  } catch {
    _solidFrame = null;
  }
  return _solidFrame;
}

// 给节点加一个 UITransform 并设置尺寸
export function sizeNode(node: Node, w: number, h: number): UITransform {
  const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
  ut.setContentSize(w, h);
  return ut;
}

// 居中 Widget（铺满父节点）
export function stretch(node: Node): Widget {
  const w = node.getComponent(Widget) || node.addComponent(Widget);
  w.isAbsBottom = w.isAbsTop = w.isAbsLeft = w.isAbsRight = false;
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
  return node;
}

export interface BtnOpts {
  w?: number; h?: number; color?: string; textColor?: string; size?: number;
}
// 创建按钮（暖橘主色，圆角由 Sprite 默认处理）
export function addButton(parent: Node, text: string, onClick: () => void, opts: BtnOpts = {}): Node {
  const node = new Node('Button');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SLICED;
  const sf = solidFrame();
  if (sf) sprite.spriteFrame = sf;
  sprite.color = hexColor(opts.color ?? Theme.color.primary);
  const label = node.addComponent(Label);
  label.string = text;
  label.color = hexColor(opts.textColor ?? '#FFFFFF');
  label.fontSize = opts.size ?? 30;
  label.isBold = true;
  const btn = node.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  targetOnClick(node, onClick);
  sizeNode(node, opts.w ?? 280, opts.h ?? 80);
  parent.addChild(node);
  return node;
}

// 点击绑定：直接监听节点事件（避免依赖编辑器序列化的 clickEvents）。
function targetOnClick(target: Node, cb: () => void): void {
  target.on(Button.EventType.CLICK, cb);
}

// 创建图片节点（从 resources 加载；缺资源时退化为纯色块，保证可运行）
export function addImage(parent: Node, resPath: string, w: number, h: number, fallbackColor?: string): Node {
  const node = new Node('Image');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SLICED;
  if (fallbackColor) {
    const sf = solidFrame();
    if (sf) sprite.spriteFrame = sf;
    sprite.color = hexColor(fallbackColor);
  }
  sizeNode(node, w, h);
  parent.addChild(node);
  resources.load(resPath, SpriteFrame, (err: any, sf: SpriteFrame) => {
    if (!err && sf) {
      sprite.spriteFrame = sf;
      sprite.color = hexColor('#FFFFFF');
    }
  });
  return node;
}

// 简单面板（圆角暖白底，用作卡片/弹窗容器）；填充 solidFrame 保证可见。
export function addPanel(parent: Node, w: number, h: number, color?: string): Node {
  const node = new Node('Panel');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SLICED;
  const sf = solidFrame();
  if (sf) sprite.spriteFrame = sf;
  sprite.color = hexColor(color ?? Theme.color.bg);
  sizeNode(node, w, h);
  parent.addChild(node);
  return node;
}

// 半透明遮罩层（用于结果弹窗背景）。alpha: 0~1
export function dimOverlay(parent: Node, w: number, h: number, alpha = 0.5): Node {
  const node = new Node('Dim');
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SLICED;
  const sf = solidFrame();
  if (sf) sprite.spriteFrame = sf;
  sprite.color = new Color(0, 0, 0, Math.round(alpha * 255));
  sizeNode(node, w, h);
  stretch(node);
  parent.addChild(node);
  return node;
}
