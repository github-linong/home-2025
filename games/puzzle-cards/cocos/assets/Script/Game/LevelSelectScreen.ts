// cocos/assets/Script/Game/LevelSelectScreen.ts
// 选关：按配置生成 60 关网格（5 章 × 12），点击进入拼图。
import { Node, view } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, sizeNode, stretch, hexColor } from '../Core/UI';

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

  // 从配置取关卡（gen-config 产出 levels；无则用占位）
  const levels = (h.cfg && h.cfg.levels) || [];
  const cols = 4;
  const cell = 120;
  const gap = 16;
  const gridW = cols * cell + (cols - 1) * gap;
  const startX = -gridW / 2 + cell / 2;
  const startY = H / 2 - 200;
  levels.forEach((lv: any, i: number) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = startX + c * (cell + gap);
    const y = startY - r * (cell + gap);
    const rarity = lv.rarity || 'N';
    const btn = addButton(parent, `${lv.index || i + 1}`, () => h.onPick(lv), {
      w: cell, h: cell, color: Theme.color.rarity[rarity] || Theme.color.primaryLight, size: 30,
    });
    btn.setPosition(x, y);
  });
}
