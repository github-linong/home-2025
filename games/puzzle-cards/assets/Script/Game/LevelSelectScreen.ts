// cocos/assets/Script/Game/LevelSelectScreen.ts
// 选关：按配置生成 60 关网格（5 章 × 12），点击进入拼图。
// 无服务端版本：关卡解锁/星级来自本地存档 LocalProfile。
import { Node, view, ScrollView, UITransform, Mask } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, sizeNode, stretch, addImage, hexColor } from '../Core/UI';
import { isLevelUnlocked, getLevelRecord } from '../Core/LocalProfile';

export interface LevelSelectHandlers {
  cfg: any;
  onPick: (level: any) => void;
  onBack: () => void;
}

export function buildLevelSelect(parent: Node, h: LevelSelectHandlers): void {
  const W = view.getVisibleSize().width;
  const H = view.getVisibleSize().height;
  const bg = addPanel(parent, W, H, Theme.color.bg);
  stretch(bg);

  const title = addLabel(parent, '选择关卡', { size: 36, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, H / 2 - 80);

  const back = addButton(parent, Copy.common.close, h.onBack, { w: 120, h: 64, color: Theme.color.textLight, size: 26 });
  back.setPosition(-W / 2 + 90, H / 2 - 80);

  // 从配置取关卡；无配置时用本地兜底 60 关。
  const levels = (h.cfg && h.cfg.levels) || [];
  if (levels.length === 0) {
    const empty = addLabel(parent, '暂无关卡，请检查网络', { size: 26, color: Theme.color.textLight });
    empty.setPosition(0, 0);
    return;
  }

  const levelIds = levels.map((lv: any) => lv.id);

  const cols = 4;
  const cell = 120;
  const gap = 16;
  const gridW = cols * cell + (cols - 1) * gap;
  const startX = -gridW / 2 + cell / 2;
  const topY = H / 2 - 200;
  const rowH = cell + gap;
  const rows = Math.ceil(levels.length / cols);
  const contentH = Math.max(rows * rowH + gap, H - 260);

  // 滚动容器：60 关高度超出屏幕，必须可滚动。
  const scrollNode = new Node('LevelScroll');
  sizeNode(scrollNode, W - 40, H - 260);
  scrollNode.setPosition(0, topY - (H - 260) / 2);
  parent.addChild(scrollNode);
  scrollNode.layer = parent.layer;

  const mask = scrollNode.addComponent(Mask);
  mask.type = Mask.Type.GRAPHICS_RECT;

  const scroll = scrollNode.addComponent(ScrollView);

  const content = new Node('Content');
  sizeNode(content, W - 40, contentH);
  content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
  content.setPosition(0, (H - 260) / 2);
  scrollNode.addChild(content);
  content.layer = scrollNode.layer;
  scroll.content = content;
  scroll.horizontal = false;
  scroll.vertical = true;
  scroll.inertia = true;

  levels.forEach((lv: any, i: number) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = startX + c * rowH;
    // content 锚点在上边，y 向下递增为负。
    const y = -cell / 2 - gap - r * rowH;
    // 按钮显示全局序号 1~60；颜色按章节区分，更易辨认。
    const chapterColors: Record<string, string> = {
      ch1: Theme.color.primary,
      ch2: Theme.color.accent,
      ch3: Theme.color.accentPink,
      ch4: Theme.color.success,
      ch5: Theme.color.primaryDark,
    };
    const unlocked = isLevelUnlocked(lv.id, levelIds);
    const rec = getLevelRecord(lv.id);
    const btnColor = unlocked ? (chapterColors[lv.chapterId] || Theme.color.primaryLight) : Theme.color.bgDeep;

    const btn = addButton(content, unlocked ? `${i + 1}` : '锁', () => {
      if (unlocked) h.onPick(lv);
    }, {
      w: cell, h: cell, color: btnColor, size: 30,
    });
    btn.setPosition(x, y);

    // 星级：已完成关卡在按钮下方显示 ★
    if (rec && rec.star > 0) {
      const stars = '★'.repeat(rec.star) + '☆'.repeat(3 - rec.star);
      const sl = addLabel(content, stars, { size: 20, color: '#FFB000' });
      sl.setPosition(x, y - cell / 2 - 12);
    } else if (!unlocked) {
      const lockTip = addLabel(content, '完成上一关解锁', { size: 14, color: Theme.color.textLight });
      lockTip.setPosition(x, y - cell / 2 - 12);
    }
  });
}
