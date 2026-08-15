// cocos/assets/Script/Game/GachaScreen.ts
// 抽卡屏幕：纯 IAA —— 看激励视频免费抽（每日上限 2 次）。
// 无服务端版本：掉落/保底/频控全部本地完成（LocalGacha + LocalProfile）。
import { Node, view, Label } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addRarityCard, sizeNode, stretch, dimOverlay, hexColor } from '../Core/UI';
import { ad } from '../Core/Ad';
import { performFreeDraw, freeDrawLeft, canFreeDrawToday, GachaResult } from '../Core/LocalGacha';
import { getTotalCards } from '../Core/LocalProfile';
import { getDefaultConfig } from '../Core/Config';
import { showCardDetail } from './CollectionScreen';

export interface GachaHandlers {
  onBack: () => void;
  cfg?: any;
}

export function buildGachaScreen(parent: Node, h: GachaHandlers): void {
  const W = view.getVisibleSize().width;
  const H = view.getVisibleSize().height;

  const bg = addPanel(parent, W, H, Theme.color.bg);
  stretch(bg);

  const title = addLabel(parent, Copy.gacha.title, { size: 38, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, H / 2 - 80);

  const back = addButton(parent, Copy.common.close, h.onBack, { w: 120, h: 60, color: Theme.color.textLight, size: 26 });
  back.setPosition(-W / 2 + 90, H / 2 - 70);

  // 今日免费次数提示
  const tip = addLabel(parent, freeDrawLeft() > 0 ? Copy.gacha.freeLeft(freeDrawLeft()) : Copy.gacha.freeDone, { size: 26, color: Theme.color.text });
  tip.setPosition(0, H / 2 - 150);

  // 卡片册进度
  const total = getTotalCards();
  const tip2 = addLabel(parent, `已收集 ${total} 张`, { size: 24, color: Theme.color.textLight });
  tip2.setPosition(0, H / 2 - 190);

  // 抽卡主按钮（下沉到中下部，避免悬空；竖屏 H 自适应）
  const drawBtn = addButton(parent, Copy.gacha.watchAd, () => doDraw(parent, W, H, tip, tip2, h.cfg), { w: 340, h: 96, color: Theme.color.accent, size: 32 });
  drawBtn.setPosition(0, -H / 2 + 36 + 200);
}

async function doDraw(parent: Node, W: number, H: number, tipLabel: Node, tip2Label: Node, cfg: any): Promise<void> {
  if (!canFreeDrawToday()) {
    refreshTip(tipLabel);
    showResult(parent, W, H, [], Copy.gacha.freeDone, cfg);
    return;
  }
  // 1) 看激励视频（看完才给抽，IAA 诚信）；编辑器/无广告环境直接放行，保证可玩。
  let watched = true;
  try {
    watched = await ad.showRewarded();
  } catch {
    watched = true;
  }
  if (!watched) return; // 中途退出不抽
  // 2) 本地免费抽（无服务端）
  const res = performFreeDraw();
  refreshTip(tipLabel);
  if (tip2Label) {
    const lab = tip2Label.getComponent(Label);
    if (lab) lab.string = `已收集 ${getTotalCards()} 张`;
  }
  showResult(parent, W, H, res.results, res.results.length ? Copy.gacha.surprise : Copy.gacha.freeDone, cfg);
}

function refreshTip(tipLabel: Node): void {
  const lab = tipLabel.getComponent(Label);
  if (lab) lab.string = freeDrawLeft() > 0 ? Copy.gacha.freeLeft(freeDrawLeft()) : Copy.gacha.freeDone;
}

function showResult(parent: Node, W: number, H: number, results: GachaResult[], headline: string, cfg: any): void {
  const overlay = dimOverlay(parent, W, H, 0.5);
  const panelH = Math.min(H - 80, 600);
  const panel = addPanel(overlay, W - 80, panelH, Theme.color.bg);
  panel.setPosition(0, 0);

  const head = addLabel(panel, headline, { size: 34, bold: true, color: Theme.color.primaryDark });
  head.setPosition(0, panelH / 2 - 50);

  if (!results.length) {
    const empty = addLabel(panel, Copy.gacha.freeDone, { size: 26, color: Theme.color.textLight });
    empty.setPosition(0, 0);
  } else {
    const cols = Math.min(4, results.length);
    const cell = Math.min(150, (W - 160) / cols);
    results.forEach((r, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = (col - (cols - 1) / 2) * (cell + 16);
      const topY = panelH / 2 - 110;
      const cy = topY - row * (cell + 16);
      const sid = r.cardId ? r.cardId.split('_')[0] : 'flower';
      const card = addRarityCard(panel, Theme.assetPath.seriesArt(sid, r.cardId), cell, cell, { rarity: r.rarity, owned: true });
      card.setPosition(cx, cy);
      const tag = addLabel(card, r.isNew ? Copy.gacha.gotCard : Copy.gacha.gotDup, { size: 18, color: '#FFFFFF', bold: true });
      tag.setPosition(0, -cell / 2 + 18);
    });

    // A2 图鉴知识：第一张新卡下方给 lore 提示，点击卡片可看完整详情
    const firstNew = results.find((r) => r.isNew && r.cardId);
    if (firstNew && firstNew.cardId) {
      const catalog = (cfg && cfg.cards) || getDefaultConfig().cards || [];
      const def = catalog.find((c: any) => c.id === firstNew.cardId);
      if (def && def.lore && def.lore.fact) {
        const fact = def.lore.fact.length > 16 ? `${def.lore.fact.slice(0, 16)}…` : def.lore.fact;
        const loreBtn = addButton(panel, `💡 ${fact}`, () => {
          showCardDetail(overlay, W, H, def, true);
        }, { w: W - 180, h: 64, color: Theme.color.bgDeep, textColor: Theme.color.text, size: 22 });
        loreBtn.setPosition(0, -panelH / 2 + 150);
      }
    }
  }

  const ok = addButton(panel, Copy.common.ok, () => overlay.destroy(), { w: 280, h: 76 });
  ok.setPosition(0, -panelH / 2 + 60);
}
