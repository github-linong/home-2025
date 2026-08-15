// Core/Fx.ts
// 动效工具（v2 设计系统 §4.1/§4.3）：统一时长与缓动，低端机可降级。
// 规范：弹窗 200ms ease-out / 吸附 120ms back / 翻卡 400ms / 完成聚合 ≤2.5s / 抽卡三段 ≤3s。
import { Node, tween, Vec3, UIOpacity, Color, Label, Sprite, UITransform, view } from 'cc';

export const Fx = {
  // 时长规范（ms，见 docs/redesign-v2.md §4.3）
  dur: {
    pop: 200,      // 弹窗/按钮入场
    flip: 400,     // 卡面翻转
    snap: 120,     // 碎片吸附
    flash: 80,     // 正确放置白闪
    glow: 500,     // 行/区域完成微光
    gather: 600,   // 完成聚合
    star: 150,     // 星星结算
    cardFly: 500,  // 新卡飞出
    page: 150,     // 页面切换
    burst: 700,    // 粒子寿命
  },
  // 质量档（Main 启动时按机型设置；低端机关粒子/装饰）
  quality: { particles: true, decorations: true },
};

const easeOutBack = 'backOut';

// 弹入（scale 0.9→1 + fade）
export function popIn(node: Node, scaleFrom = 0.9, dur = Fx.dur.pop): void {
  node.setScale(scaleFrom, scaleFrom, 1);
  const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
  op.opacity = 0;
  tween(node)
    .parallel(
      tween().to(dur / 1000, { scale: new Vec3(1, 1, 1) }, { easing: easeOutBack }),
      tween(op).to(dur / 1000, { opacity: 255 }),
    )
    .start();
}

// Y 轴翻卡（halfDone 在翻到 90° 时回调，用于换面）
export function flipY(node: Node, halfDone?: () => void, dur = Fx.dur.flip): void {
  const half = dur / 2000;
  tween(node)
    .to(half, { scale: new Vec3(0.01, node.scale.y, 1) }, { easing: 'quadOut' })
    .call(() => { if (halfDone) halfDone(); })
    .to(half, { scale: new Vec3(node.scale.x, node.scale.y, 1) }, { easing: 'quadIn' })
    .start();
}

// 呼吸（无限循环；返回可 stop 的 tween）
export function pulse(node: Node, scaleTo = 1.06, dur = 0.8): import('cc').Tween<Node> {
  const t = tween(node)
    .repeatForever(
      tween()
        .to(dur, { scale: new Vec3(scaleTo, scaleTo, 1) }, { easing: 'sineInOut' })
        .to(dur, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }),
    )
    .start();
  return t;
}

// 轻量粒子爆发（单次 < 20 个；字符粒子 '✦'/'✧'/'·'，无需贴图资源）
export function burst(parent: Node, x: number, y: number, opts: { count?: number; chars?: string[]; color?: string; spread?: number } = {}): void {
  if (!Fx.quality.particles) return;
  const { count = 10, chars = ['✦', '✧'], color = '#FFD66B', spread = 90 } = opts;
  for (let i = 0; i < count; i++) {
    const n = new Node('FxDot');
    const lab = n.addComponent(Label);
    lab.string = chars[i % chars.length];
    lab.fontSize = 16 + Math.random() * 18;
    lab.color = new Color().fromHEX(color);
    n.setPosition(x, y);
    parent.addChild(n);
    n.layer = parent.layer;
    const a = Math.random() * Math.PI * 2;
    const r = spread * (0.4 + Math.random() * 0.8);
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    const op = n.addComponent(UIOpacity);
    op.opacity = 255;
    tween(n)
      .to(Fx.dur.burst / 1000, { position: new Vec3(tx, ty, 0) }, { easing: 'quadOut' })
      .call(() => n.destroy())
      .start();
    tween(op).delay(Fx.dur.burst / 2000).to(Fx.dur.burst / 2000, { opacity: 0 }).start();
  }
}

// 飘字（金币 +N 等）
export function floatText(parent: Node, text: string, x: number, y: number, color = '#FFD66B', size = 30): void {
  const n = new Node('FloatText');
  const lab = n.addComponent(Label);
  lab.string = text;
  lab.fontSize = size;
  lab.isBold = true;
  lab.color = new Color().fromHEX(color);
  n.setPosition(x, y);
  parent.addChild(n);
  n.layer = parent.layer;
  const op = n.addComponent(UIOpacity);
  op.opacity = 255;
  tween(n)
    .to(0.7, { position: new Vec3(x, y + 80, 0) }, { easing: 'quadOut' })
    .call(() => n.destroy())
    .start();
  tween(op).delay(0.25).to(0.45, { opacity: 0 }).start();
}

// 震屏（轻微，抽卡传说/完成时刻用）
export function shake(node: Node, intensity = 6, times = 3): void {
  const orig = node.position.clone();
  let count = 0;
  const iv = setInterval(() => {
    count++;
    if (count > times * 2) {
      clearInterval(iv);
      node.setPosition(orig);
      return;
    }
    const dx = (Math.random() - 0.5) * intensity;
    const dy = (Math.random() - 0.5) * intensity;
    node.setPosition(orig.x + dx, orig.y + dy, orig.z);
  }, 40);
}

// 完成聚合（碎片向心）：传入碎片节点数组与目标点
export function gatherTo(pieceNodes: Node[], target: Vec3, onDone?: () => void, dur = Fx.dur.gather): void {
  pieceNodes.forEach((n, i) => {
    tween(n)
      .delay(i * 0.015)
      .to(dur / 1000, { position: target, scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
      .start();
  });
  // 全部到齐后回调（近似：最晚一块的时长 + 延迟）
  setTimeout(() => onDone && onDone(), dur + pieceNodes.length * 15);
}

export default { Fx, popIn, flipY, pulse, burst, floatText, shake, gatherTo };
