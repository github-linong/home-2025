// cocos/assets/Script/Game/GachaScreen.ts
// 抽卡屏幕：纯 IAA —— 看激励视频免费抽（每日上限 2 次，服务端 ads_log 计频控）。
// 云函数 gacha action:'freeAd' 返回 { results:[{rarity,cardId,isNew,isDuplicate,shards}], pity, cost }。
import { Node, view, Label } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addImage, sizeNode, stretch, dimOverlay, hexColor } from '../Core/UI';
import { callFunction } from '../Core/Cloud';
import { ad } from '../Core/Ad';
import { getMe } from '../Core/Session';
import { Storage } from '../Core/Storage';

const FREE_DAILY_CAP = 2;
const PACK_TYPE = 'normal';

export interface GachaHandlers {
  onBack: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 本地记录今日已看广告免费抽次数（服务端 ads_log 为权威；此处仅用于即时展示）。
function getFreeUsed(): number {
  const rec = Storage.get<{ date: string; count: number } | null>('freeGacha', null);
  if (!rec || rec.date !== todayStr()) return 0;
  return rec.count;
}
function incFreeUsed(): void {
  const rec = Storage.get<{ date: string; count: number } | null>('freeGacha', null);
  const count = (rec && rec.date === todayStr() ? rec.count : 0) + 1;
  Storage.set('freeGacha', { date: todayStr(), count });
}
function setFreeCapReached(): void {
  Storage.set('freeGacha', { date: todayStr(), count: FREE_DAILY_CAP });
}
function freeLeftNow(): number {
  return Math.max(0, FREE_DAILY_CAP - getFreeUsed());
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
  const tip = addLabel(parent, freeLeftNow() > 0 ? Copy.gacha.freeLeft(freeLeftNow()) : Copy.gacha.freeDone, { size: 26, color: Theme.color.text });
  tip.setPosition(0, H / 2 - 150);

  // 卡片册进度（来自 me.stats.totalCards）
  refreshCollectionTip(parent, H);

  // 抽卡主按钮
  const drawBtn = addButton(parent, Copy.gacha.watchAd, () => doDraw(parent, W, H, tip), { w: 340, h: 96, color: Theme.color.accent, size: 32 });
  drawBtn.setPosition(0, 0);
}

async function refreshCollectionTip(parent: Node, H: number): Promise<void> {
  try {
    const me = await getMe(true);
    const total = (me && me.stats && me.stats.totalCards) || 0;
    const t = addLabel(parent, `已收集 ${total} 张`, { size: 24, color: Theme.color.textLight });
    t.setPosition(0, H / 2 - 190);
  } catch {
    /* 忽略 */
  }
}

async function doDraw(parent: Node, W: number, H: number, tipLabel: Node): Promise<void> {
  if (freeLeftNow() <= 0) {
    refreshTip(tipLabel);
    showResult(parent, W, H, [], Copy.gacha.freeDone);
    return;
  }
  // 1) 看激励视频（看完才给抽，IAA 诚信）
  const watched = await ad.showRewarded();
  if (!watched) return; // 中途退出不抽
  // 2) 调云端免费抽
  try {
    const res = await callFunction('gacha', { action: 'freeAd', packType: PACK_TYPE });
    if (res && res.code === 0 && res.data) {
      incFreeUsed();
      const results = (res.data.results || []).filter((r: any) => r && r.cardId);
      showResult(parent, W, H, results, Copy.gacha.surprise);
      refreshTip(tipLabel);
    } else if (res && res.code === 429) {
      // 服务端频控已达上限（本地计数与服务端对账）
      setFreeCapReached();
      refreshTip(tipLabel);
      showResult(parent, W, H, [], Copy.gacha.freeDone);
    } else {
      showResult(parent, W, H, [], Copy.app.retryLater);
    }
  } catch {
    showResult(parent, W, H, [], Copy.app.retryLater);
  }
}

function refreshTip(tipLabel: Node): void {
  const lab = tipLabel.getComponent(Label);
  if (lab) lab.string = freeLeftNow() > 0 ? Copy.gacha.freeLeft(freeLeftNow()) : Copy.gacha.freeDone;
}

function showResult(parent: Node, W: number, H: number, results: any[], headline: string): void {
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
      const card = addPanel(panel, cell, cell, Theme.color.rarity[r.rarity] || Theme.color.primaryLight);
      card.setPosition(cx, cy);
      const id = addLabel(card, r.cardId ? `#${r.cardId}` : '?', { size: 20, color: '#FFFFFF' });
      id.setPosition(0, 8);
      const tag = addLabel(card, r.isNew ? Copy.gacha.gotCard : Copy.gacha.gotDup, { size: 18, color: '#FFFFFF' });
      tag.setPosition(0, -cell / 2 + 18);
    });
  }

  const ok = addButton(panel, Copy.common.ok, () => overlay.destroy(), { w: 280, h: 76 });
  ok.setPosition(0, -panelH / 2 + 60);
}
