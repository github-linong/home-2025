// cocos/assets/Script/Game/HomeScreen.ts
// 首页：标题 + 主操作（开始拼图 / 试试手气 / 我的卡片册）+ 赛季进度。
import { Node, find, view } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addImage, addPanel, sizeNode, stretch } from '../Core/UI';
import { getMe } from '../Core/Session';

export interface HomeHandlers {
  onStart: () => void;
  onGacha: () => void;
  onCollection: () => void;
}

export function buildHome(parent: Node, h: HomeHandlers): void {
  const w = view.getVisibleSize().width;
  // 背景
  const bg = addImage(parent, Theme.assetPath.ui('bg_home'), w, view.getVisibleSize().height, Theme.color.bgDeep);
  stretch(bg);

  // 标题
  const title = addLabel(parent, Copy.home.title, { size: 40, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, view.getVisibleSize().height / 2 - 160);

  // 进度面板
  const panel = addPanel(parent, w - 80, 120, Theme.color.bg);
  panel.setPosition(0, view.getVisibleSize().height / 2 - 260);
  const prog = addLabel(panel, Copy.home.season, { size: 26, color: Theme.color.text });
  prog.setPosition(0, 24);
  refreshSeason(panel);

  // 主按钮
  const startY = 40;
  const b1 = addButton(parent, Copy.home.startLevel, h.onStart, { w: 320, h: 88 });
  b1.setPosition(0, startY);
  const b2 = addButton(parent, Copy.home.drawCard, h.onGacha, { w: 320, h: 80, color: Theme.color.accent });
  b2.setPosition(0, startY - 110);
  const b3 = addButton(parent, Copy.home.collection, h.onCollection, { w: 320, h: 80, color: Theme.color.accentPink });
  b3.setPosition(0, startY - 210);
}

async function refreshSeason(panel: Node): Promise<void> {
  try {
    const me = await getMe();
    const totalCards = (me && me.stats && me.stats.totalCards) || 0;
    const tip = addLabel(panel, `${Copy.home.collection}：已收集 ${totalCards} 张`, { size: 22, color: Theme.color.textLight });
    tip.setPosition(0, -28);
  } catch {
    /* 忽略 */
  }
}
