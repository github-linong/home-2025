// cocos/assets/Script/Game/CollectionScreen.ts
// 卡片册：以启动 cfg.cards 为完整图鉴，用本地存档 owned 标记已拥有（未拥有灰显）。
import { Node, view, Label, ScrollView, Mask, UITransform } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addRarityCard, sizeNode, stretch } from '../Core/UI';
import { getDefaultConfig } from '../Core/Config';
import { getOwnedCardIds, getTotalCards } from '../Core/LocalProfile';

export interface CollectionHandlers {
  cfg: any;
  onBack: () => void;
}

export function buildCollectionScreen(parent: Node, h: CollectionHandlers): void {
  const W = view.getVisibleSize().width;
  const H = view.getVisibleSize().height;
  const bg = addPanel(parent, W, H, Theme.color.bg);
  stretch(bg);

  const title = addLabel(parent, Copy.home.collection, { size: 36, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, H / 2 - 80);
  const back = addButton(parent, Copy.common.close, h.onBack, { w: 120, h: 64, color: Theme.color.textLight, size: 26 });
  back.setPosition(-W / 2 + 90, H / 2 - 80);

  // 进度统计（本地）
  const owned = getTotalCards();
  const catalog = (h.cfg && h.cfg.cards) || getDefaultConfig().cards;
  const total = catalog.length;
  const prog = addLabel(parent, `已收集 ${owned} / ${total}`, { size: 24, color: Theme.color.textLight });
  prog.setPosition(0, H / 2 - 130);

  // 73 卡网格需要滚动（超出单屏）；用 ScrollView + Mask 容器，布局随竖屏 H 自适应。
  const cols = 4;
  const gap = 12;
  const cell = (W - 60) / cols - gap;
  const rows = Math.ceil(catalog.length / cols);
  const contentH = Math.max(rows * (cell + gap) + gap, H - 260);

  const scrollNode = new Node('CardScroll');
  sizeNode(scrollNode, W - 40, H - 260);
  scrollNode.setPosition(0, (H / 2 - 160) - (H - 260) / 2);
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

  const ownedIds = getOwnedCardIds();
  const ownedSet = new Set(ownedIds);
  catalog.forEach((c: any, i: number) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = -((cols - 1) * (cell + gap)) / 2 + col * (cell + gap);
    const y = -(cell / 2 + gap) - r * (cell + gap);
    const has = ownedSet.has(c.id);
    const card = addRarityCard(content, Theme.assetPath.seriesArt(c.seriesId, c.id), cell, cell, { rarity: c.rarity, owned: has });
    card.setPosition(x, y);
  });
}
