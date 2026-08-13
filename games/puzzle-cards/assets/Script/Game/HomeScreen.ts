// cocos/assets/Script/Game/HomeScreen.ts
// 首页：标题 + 主操作（开始拼图 / 试试手气 / 我的卡片册）+ 赛季进度（本地）。
import { Node, find, view } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addImage, addPanel, addRarityCard, sizeNode, stretch } from '../Core/UI';
import { getDefaultConfig } from '../Core/Config';
import { getTotalCards, getTotalStars } from '../Core/LocalProfile';

export interface HomeHandlers {
  onStart: () => void;
  onGacha: () => void;
  onCollection: () => void;
}

export function buildHome(parent: Node, h: HomeHandlers): void {
  const w = view.getVisibleSize().width;
  const hgt = view.getVisibleSize().height;

  // 背景：明确纯色暖白底（bg_home 资源当前不存在，避免 addImage fallback 发灰）
  const bg = addPanel(parent, w, hgt, Theme.color.bg);
  stretch(bg);

  // 标题
  const title = addLabel(parent, Copy.home.title, { size: 40, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, hgt / 2 - 160);

  // 精选卡牌展示（真实卡面烘托氛围，让首页像真正的集卡游戏落地页）
  const catalog = (getDefaultConfig().cards) || [];
  const feat = catalog.find((c: any) => c.rarity === 'SSR') || catalog[0] || null;
  if (feat) {
    const card = addRarityCard(parent, Theme.assetPath.seriesArt(feat.seriesId, feat.id), 220, 220, { rarity: feat.rarity, owned: true });
    card.setPosition(0, 0);
  }

  // 进度面板（本地存档：集卡进度 + 星级总数）
  const panel = addPanel(parent, w - 80, 120, Theme.color.bg);
  panel.setPosition(0, view.getVisibleSize().height / 2 - 260);
  const totalCards = getTotalCards();
  const totalStars = getTotalStars(catalog.map((c: any) => c.id));
  const prog = addLabel(panel, Copy.home.season, { size: 26, bold: true, color: Theme.color.text });
  prog.setPosition(0, 28);
  const tip = addLabel(panel, `已收集 ${totalCards} / ${catalog.length} 张 · 星星 ${totalStars}`, { size: 22, color: Theme.color.textLight });
  tip.setPosition(0, -26);

  // 主按钮（贴底紧凑三连，避免悬空；竖屏 H 自适应）
  const SAFE = 36;
  const b1y = -hgt / 2 + SAFE + 220;
  const b2y = -hgt / 2 + SAFE + 110;
  const b3y = -hgt / 2 + SAFE;
  const b1 = addButton(parent, Copy.home.startLevel, h.onStart, { w: 320, h: 88 });
  b1.setPosition(0, b1y);
  const b2 = addButton(parent, Copy.home.drawCard, h.onGacha, { w: 320, h: 80, color: Theme.color.accent });
  b2.setPosition(0, b2y);
  const b3 = addButton(parent, Copy.home.collection, h.onCollection, { w: 320, h: 80, color: Theme.color.accentPink });
  b3.setPosition(0, b3y);
}
