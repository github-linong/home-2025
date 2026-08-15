// cocos/assets/Script/Game/CollectionScreen.ts
// 卡片册：以启动 cfg.cards 为完整图鉴，用本地存档 owned 标记已拥有（未拥有灰显）。
// 点击任意卡弹出详情：大卡面 + 名字 + 稀有度 + 图鉴小知识（lore，仅已拥有展示）。
import { Node, view, Label, ScrollView, Mask, UITransform, Button } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addRarityCard, addImage, sizeNode, stretch, dimOverlay } from '../Core/UI';
import { getDefaultConfig } from '../Core/Config';
import { getOwnedCardIds, getTotalCards } from '../Core/LocalProfile';

export interface CollectionHandlers {
  cfg: any;
  onBack: () => void;
}

function cardFromCatalog(cfg: any, id: string): any {
  const catalog = (cfg && cfg.cards) || getDefaultConfig().cards || [];
  return catalog.find((c: any) => c.id === id) || null;
}

// 卡牌详情弹窗（A2 图鉴知识卡）：大卡面 + lore。未拥有的卡不展示真实卡面与故事（防剧透）。
// 导出供 GachaScreen / PuzzleScreen 复用（抽到新卡时查看）。
export function showCardDetail(parent: Node, W: number, H: number, card: any, owned: boolean): void {
  const overlay = dimOverlay(parent, W, H, 0.6);
  const panelH = Math.min(H - 100, 720);
  const panel = addPanel(overlay, W - 80, panelH, Theme.color.bg);
  panel.setPosition(0, 0);

  const imgSize = Math.min(260, (W - 160) / 2);
  const artY = panelH / 2 - imgSize / 2 - 40;
  if (owned) {
    const img = addImage(panel, Theme.assetPath.seriesArt(card.seriesId, card.id), imgSize, imgSize, Theme.color.primaryLight);
    img.setPosition(0, artY);
  } else {
    const holder = addPanel(panel, imgSize, imgSize, Theme.color.bgDeep);
    holder.setPosition(0, artY);
    const lock = addLabel(holder, '?', { size: Math.round(imgSize * 0.4), color: '#FFFFFF', bold: true });
    lock.setPosition(0, 0);
  }

  const nameLabel = addLabel(panel, owned ? `${card.name} · ${card.description || ''}` : `神秘卡片 · ${card.rarity}`, { size: 32, bold: true, color: Theme.color.primaryDark });
  nameLabel.setPosition(0, artY - imgSize / 2 - 50);

  let y = artY - imgSize / 2 - 100;
  if (owned && card.lore && card.lore.fact) {
    const fact = addLabel(panel, `💡 ${card.lore.fact}`, {
      size: 24, color: Theme.color.text, width: W - 160,
    });
    fact.setPosition(0, y - 20);
    y -= 90;
    if (card.lore.tip) {
      const tip = addLabel(panel, `${Copy.lore.tip}：${card.lore.tip}`, {
        size: 22, color: Theme.color.textLight, width: W - 160,
      });
      tip.setPosition(0, y - 16);
      y -= 80;
    }
  } else if (!owned) {
    const locked = addLabel(panel, Copy.lore.locked, { size: 24, color: Theme.color.textLight });
    locked.setPosition(0, y - 20);
    y -= 80;
  }

  const ok = addButton(panel, Copy.common.ok, () => overlay.destroy(), { w: 260, h: 76 });
  ok.setPosition(0, Math.max(-panelH / 2 + 60, y - 40));
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

    // 点击卡片 → 详情弹窗（Button 与 ScrollView 可共存：拖动时不会触发点击）
    const btn = card.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    card.on(Button.EventType.CLICK, () => {
      const def = cardFromCatalog(h.cfg, c.id) || c;
      showCardDetail(parent, W, H, def, has);
    });
  });
}
