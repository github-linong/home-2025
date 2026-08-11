// cocos/assets/Script/Game/CollectionScreen.ts
// 卡片册：以启动 cfg.cards 为完整图鉴，用 collection 接口的 owned 标记已拥有（未拥有灰显）。
import { Node, view } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addImage, sizeNode, stretch } from '../Core/UI';
import { callFunction } from '../Core/Cloud';

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

  const grid = new Node('Grid');
  sizeNode(grid, W - 60, H - 220);
  grid.setPosition(0, -40);
  parent.addChild(grid);

  const status = addLabel(parent, Copy.app.loading, { size: 24, color: Theme.color.textLight });
  status.setPosition(0, 0);

  // 完整图鉴来自启动配置；collection 接口只回 owned（卡牌目录 id 列表）。
  const catalog = (h.cfg && h.cfg.cards) || [];

  const render = (ownedIds: string[]): void => {
    grid.removeAllChildren();
    const ownedSet = new Set(ownedIds);
    const cols = 4;
    const cell = (W - 60) / cols - 12;
    const topY = (H - 220) / 2 - cell / 2;
    catalog.forEach((c: any, i: number) => {
      const r = Math.floor(i / cols);
      const col = i % cols;
      const x = -((cols - 1) * (cell + 12)) / 2 + col * (cell + 12);
      const has = ownedSet.has(c.id);
      const img = addImage(grid, Theme.assetPath.seriesArt(c.seriesId, c.id), cell, cell, has ? (Theme.color.rarity[c.rarity] || Theme.color.primaryLight) : Theme.color.bgDeep);
      img.setPosition(x, topY - r * (cell + 12));
      if (!has) {
        const lock = addLabel(img, '?', { size: 40, color: '#FFFFFF' });
        lock.setPosition(0, 0);
      }
    });
  };

  // 先渲染完整图鉴（全灰显），再按云端 owned 点亮
  render([]);
  callFunction('collection', {})
    .then((res) => {
      status.removeFromParent();
      const owned = (res && res.data && res.data.owned) || [];
      render(owned);
    })
    .catch(() => {
      status.string = Copy.app.weakNet;
    });
}
