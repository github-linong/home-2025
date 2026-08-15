// cocos/assets/Script/Game/PuzzleScreen.ts
// 拼图屏（手机竖屏 720×1280 适配版）。
// 布局分区：顶部安全栏（返回 / 第X关 / 倒计时）— 居中正方形大棋盘（碎片散落在盘内，盖在淡显底图上）— 底部固定三按钮栏（提示/加时/原图）。
// 配色走 Theme 暖色糖果风。
import {
  Node, view, EventTouch, UITransform, Sprite, SpriteFrame, Texture2D, Label,
  Vec3, Graphics, Color, resources, Rect, UIOpacity,
} from 'cc';
import { Theme } from '../Core/Theme';
import {
  addLabel, addButton, addPanel, addImage, sizeNode, stretch, hexColor,
  dimOverlay, solidFrame, addToolButton, addRarityCard,
} from '../Core/UI';
import { callFunction } from '../Core/Cloud';
import { setLevelResult, ownCard, hasCard } from '../Core/LocalProfile';
import { getDefaultConfig } from '../Core/Config';
import { ad } from '../Core/Ad';
import { PuzzleBoard } from './Puzzle/PuzzleBoard';
import { predictStar } from './Puzzle/Scoring';
import { Copy } from '../Core/Copy';
import { showCardDetail } from './CollectionScreen';

export interface PuzzleHandlers {
  level: any;
  cfg: any;
  onBack: () => void;
  onNext?: (level: any) => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

export function buildPuzzleScreen(parent: Node, h: PuzzleHandlers): void {
  // 竖屏小游戏：布局基于实际可见区域（由 Main.setupResolution 锁成竖屏比例，W 固定、H 随设备自适应）。
  // 用 getVisibleSize 而非硬编码，才能在不同高度比例的手机上贴边、不悬空。
  const W = view.getVisibleSize().width;
  const H = view.getVisibleSize().height;
  const SAFE = 36; // 顶部刘海 / 底部 home indicator 安全边距

  // 暖色背景
  const bg = addPanel(parent, W, H, Theme.color.bg);
  stretch(bg);

  const level = h.level || {};
  const count = level.pieceCount || 9;
  const cols = Math.round(Math.sqrt(count));
  const rows = cols;
  const stdTimeSec = level.stdTimeSec || 60;
  let timeLeft = (level.timeLimitSec || stdTimeSec * 2);

  // —— 棋盘尺寸：占满中部，正方形 ——
  const topBarBottom = H / 2 - SAFE - 100;        // 顶栏下沿
  const bottomBarTop = -H / 2 + SAFE + 150;        // 底栏上沿
  const availH = topBarBottom - bottomBarTop;
  const BOARD = Math.min(W - 2 * SAFE, Math.round(availH * 0.92));
  const pieceSize = BOARD / cols;
  const boardCY = Math.round((topBarBottom + bottomBarTop) / 2);
  const boardLeft = -BOARD / 2;
  const boardBottom = boardCY - BOARD / 2;

  const levels = (h.cfg && h.cfg.levels) || [];
  const levelIndex = levels.findIndex((l: any) => l.id === level.id);
  const levelNumber = levelIndex >= 0 ? levelIndex + 1 : (level.indexInChapter || 1);

  // —— 顶部安全栏 ——
  const topY = H / 2 - SAFE - 50;
  const back = addButton(parent, '✕', h.onBack, {
    w: 64, h: 64, color: Theme.color.bgDeep, textColor: Theme.color.text, size: 30,
  });
  back.setPosition(-W / 2 + SAFE + 32, topY);

  const title = addLabel(parent, `第 ${levelNumber} 关`, {
    size: 40, bold: true, color: Theme.color.text,
  });
  title.setPosition(0, topY);

  // 倒计时胶囊（暖橘底白字）
  const timerNode = addPanel(parent, 140, 56, Theme.color.primary);
  timerNode.setPosition(W / 2 - SAFE - 70, topY);
  const timerLabel = addLabel(timerNode, formatTime(timeLeft), {
    size: 30, bold: true, color: '#FFFFFF',
  });
  timerLabel.setPosition(0, 0);

  // 关卡描述（棋盘上方）
  const descText = level.desc || Copy.level.dragTip;
  const desc = addLabel(parent, descText, {
    size: 26, color: Theme.color.textLight, width: W - 120,
  });
  desc.setPosition(0, topBarBottom - 60);

  // —— 底板（完整目标图淡显 + 网格）——
  const boardNode = new Node('Board');
  sizeNode(boardNode, BOARD, BOARD);
  boardNode.setPosition(0, boardCY);
  parent.addChild(boardNode);
  boardNode.layer = parent.layer;

  const fullImageNode = new Node('FullImage');
  const fullSprite = fullImageNode.addComponent(Sprite);
  fullSprite.type = Sprite.Type.SIMPLE;
  fullSprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sizeNode(fullImageNode, BOARD, BOARD);
  boardNode.addChild(fullImageNode);
  fullImageNode.layer = boardNode.layer;

  const gridNode = new Node('GridLines');
  boardNode.addChild(gridNode);
  gridNode.layer = boardNode.layer;
  const grid = gridNode.addComponent(Graphics);
  grid.lineWidth = 1.5;
  grid.strokeColor = new Color(255, 255, 255, 120);
  for (let c = 0; c <= cols; c++) {
    const x = -BOARD / 2 + c * pieceSize;
    grid.moveTo(x, -BOARD / 2);
    grid.lineTo(x, BOARD / 2);
    grid.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = -BOARD / 2 + r * pieceSize;
    grid.moveTo(-BOARD / 2, y);
    grid.lineTo(BOARD / 2, y);
    grid.stroke();
  }

  const board = new PuzzleBoard(rows, cols, pieceSize);
  board.generate(count, 0);
  board.pieces.forEach((p) => {
    p.def.correctX = boardLeft + p.def.col * pieceSize + pieceSize / 2;
    p.def.correctY = boardBottom + p.def.row * pieceSize + pieceSize / 2;
  });

  let placed = 0;
  let hintsUsed = 0;
  let finished = false;
  let timerHandle: any = null;
  const startTime = Date.now();
  const parentUIT = parent.getComponent(UITransform)!;

  const pieceNodes: Node[] = [];
  const pieceLocks: boolean[] = new Array(board.pieces.length).fill(false);
  const piecePlaced: boolean[] = new Array(board.pieces.length).fill(false);

  const idxRaw = level.indexInChapter || 1;
  const idxStr = idxRaw < 10 ? `00${idxRaw}` : idxRaw < 100 ? `0${idxRaw}` : `${idxRaw}`;
  const refCardId = `${level.seriesId || 'flower'}_${idxStr}`;
  const boardResPath = Theme.assetPath.seriesArt(level.seriesId || 'flower', refCardId);

  resources.load(`${boardResPath}/texture`, Texture2D, (err: any, tex: Texture2D) => {
    if (!err && tex) {
      const sf = new SpriteFrame();
      sf.texture = tex;
      sf.rect = new Rect(0, 0, tex.width, tex.height);
      fullSprite.spriteFrame = sf;
      fullSprite.color = new Color(255, 255, 255, 150);
    }
  });

  // —— 碎片（散落在棋盘内，盖在淡显底图上）——
  const colors = [Theme.color.primary, Theme.color.accent, Theme.color.accentPink, Theme.color.primaryLight];
  board.pieces.forEach((p, i) => {
    const node = new Node(`piece_${i}`);
    const sp = node.addComponent(Sprite);
    sp.type = Sprite.Type.SIMPLE;
    const sf = solidFrame();
    if (sf) sp.spriteFrame = sf;
    sp.color = hexColor(colors[i % 4]);
    sizeNode(node, pieceSize, pieceSize);

    // 极坐标散开：半径在 [pieceSize, 盘内半径] 间随机，确保偏离正确点
    const minR = pieceSize * 1.0;
    const maxR = BOARD / 2 - pieceSize * 0.5;
    const r = minR + Math.random() * Math.max(1, maxR - minR);
    const ang = Math.random() * Math.PI * 2;
    const sx = p.def.correctX + Math.cos(ang) * r;
    const sy = p.def.correctY + Math.sin(ang) * r;
    node.setPosition(sx, sy);

    (node as any)['_pp'] = { correctX: p.def.correctX, correctY: p.def.correctY, index: i };
    parent.addChild(node);
    node.layer = parent.layer;
    pieceNodes.push(node);
    makeDraggable(node, i, p, pieceSize);
  });

  resources.load(`${boardResPath}/texture`, Texture2D, (err: any, tex: Texture2D) => {
    if (err || !tex) return;
    const imgW = tex.width;
    const imgH = tex.height;
    const pw = imgW / cols;
    const ph = imgH / rows;
    board.pieces.forEach((p, i) => {
      const node = pieceNodes[i];
      if (!node) return;
      const sp = node.getComponent(Sprite);
      if (!sp) return;
      const crop = new SpriteFrame();
      crop.texture = tex;
      const cx = p.def.col * pw;
      const cy = (rows - 1 - p.def.row) * ph;
      crop.rect = new Rect(cx, cy, pw, ph);
      sp.spriteFrame = crop;
      sp.type = Sprite.Type.SIMPLE;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
    });
  });

  // 进度文字（棋盘下方）
  const progress = addLabel(parent, `已完成 0 / ${board.pieces.length}`, {
    size: 26, color: Theme.color.textLight,
  });
  progress.setPosition(0, bottomBarTop + 60);

  // —— 底部固定三按钮栏 ——
  const btnY = -H / 2 + SAFE + 75;
  const btnW = (W - 2 * SAFE - 2 * 20) / 3;
  const btnH = 150;
  const btnX0 = -W / 2 + SAFE + btnW / 2;
  addToolButton(parent, '💡', Copy.level.hintBtn, onHint, {
    w: btnW, h: btnH, bgColor: Theme.color.bgDeep, iconColor: Theme.color.primary, textColor: Theme.color.text,
  }).setPosition(btnX0, btnY);
  addToolButton(parent, '⏱', Copy.level.timeBtn, onAddTime, {
    w: btnW, h: btnH, bgColor: Theme.color.bgDeep, iconColor: Theme.color.primary, textColor: Theme.color.text,
  }).setPosition(btnX0 + (btnW + 20), btnY);
  addToolButton(parent, '👁', Copy.level.refBtn, onShowReference, {
    w: btnW, h: btnH, bgColor: Theme.color.bgDeep, iconColor: Theme.color.primary, textColor: Theme.color.text,
  }).setPosition(btnX0 + (btnW + 20) * 2, btnY);

  // 倒计时
  timerHandle = setInterval(() => {
    if (finished) return;
    timeLeft -= 1;
    const lab = timerLabel.getComponent(Label);
    if (lab) lab.string = formatTime(timeLeft);
    if (timeLeft <= 10 && lab) lab.color = hexColor('#FF6B6B');
    if (timeLeft <= 0) {
      clearInterval(timerHandle);
      timeUp();
    }
  }, 1000);

  function makeDraggable(node: Node, index: number, piece: any, size: number): void {
    let grabbing = false;
    let offX = 0;
    let offY = 0;
    const SNAP = Math.max(40, Math.min(80, size * 0.42));

    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      if (pieceLocks[index] || finished) return;
      grabbing = true;
      node.setSiblingIndex(node.parent!.children.length - 1);
      const loc = e.getUILocation();
      const local = parentUIT.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      offX = node.position.x - local.x;
      offY = node.position.y - local.y;
      const sp = node.getComponent(Sprite);
      if (sp) sp.color = new Color(255, 255, 255, 255);
    });
    node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      if (!grabbing || pieceLocks[index] || finished) return;
      const loc = e.getUILocation();
      const local = parentUIT.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      node.setPosition(local.x + offX, local.y + offY);
      piece.def.x = node.position.x;
      piece.def.y = node.position.y;
      const dx = node.position.x - piece.def.correctX;
      const dy = node.position.y - piece.def.correctY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      node.setScale(dist <= SNAP ? 1.06 : 1.0, dist <= SNAP ? 1.06 : 1.0);
    });
    node.on(Node.EventType.TOUCH_END, () => {
      if (pieceLocks[index] || finished) return;
      grabbing = false;
      node.setScale(1, 1);
      const dx = node.position.x - piece.def.correctX;
      const dy = node.position.y - piece.def.correctY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= SNAP) placePiece(index, node, piece);
    });
  }

  function placePiece(index: number, node: Node, piece: any): void {
    node.setPosition(piece.def.correctX, piece.def.correctY);
    piece.def.x = piece.def.correctX;
    piece.def.y = piece.def.correctY;
    piece.def.placed = true;
    pieceLocks[index] = true;
    piecePlaced[index] = true;
    placed++;
    node.setScale(1.12, 1.12);
    setTimeout(() => node.setScale(1, 1), 120);
    const lab = progress.getComponent(Label);
    if (lab) lab.string = `已完成 ${placed} / ${board.pieces.length}`;
    if (placed >= board.pieces.length) finish();
  }

  async function onHint(): Promise<void> {
    if (finished) return;
    const ok = await ad.showRewarded();
    if (!ok) return;
    hintsUsed++;
    const pending = pieceNodes.map((n, i) => ({ n, i })).filter(({ i }) => !piecePlaced[i]);
    if (pending.length === 0) return;
    const pick = pending[0];
    const piece = board.pieces[pick.i];
    const node = pick.n;
    node.setScale(1.2, 1.2);
    setTimeout(() => placePiece(pick.i, node, piece), 200);
  }

  async function onAddTime(): Promise<void> {
    if (finished) return;
    const ok = await ad.showRewarded();
    if (!ok) return;
    timeLeft += 30;
    const lab = timerLabel.getComponent(Label);
    if (lab) {
      lab.string = formatTime(timeLeft);
      lab.color = hexColor(Theme.color.accent);
      setTimeout(() => { if (lab) lab.color = hexColor('#FFFFFF'); }, 600);
    }
    showFloatText('+30s', W / 2 - SAFE - 70, topY - 50, Theme.color.accent);
  }

  async function onShowReference(): Promise<void> {
    if (finished) return;
    const ok = await ad.showRewarded();
    if (!ok) return;
    const overlay = dimOverlay(parent, W, H, 0.88);
    const refImg = addImage(overlay, boardResPath, Math.min(W - 80, BOARD), Math.min(W - 80, BOARD), Theme.color.bgDeep);
    refImg.setPosition(0, 20);
    const hintLab = addLabel(overlay, Copy.level.hint, { size: 28, color: Theme.color.text });
    hintLab.setPosition(0, -BOARD / 2 - 70);
    const close = addButton(overlay, '关闭', () => overlay.destroy(), {
      w: 200, h: 72, color: Theme.color.primary,
    });
    close.setPosition(0, -BOARD / 2 - 140);
    void ok;
  }

  function showFloatText(text: string, x: number, y: number, color: string): void {
    const node = addLabel(parent, text, { size: 30, bold: true, color });
    node.setPosition(x, y);
    const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    op.opacity = 255;
    let t = 0;
    const iv = setInterval(() => {
      t += 0.05;
      node.setPosition(x, y + t * 60);
      op.opacity = Math.max(0, 255 - t * 400);
      if (op.opacity <= 0) {
        clearInterval(iv);
        node.destroy();
      }
    }, 50);
  }

  function timeUp(): void {
    if (finished) return;
    finished = true;
    const overlay = dimOverlay(parent, W, H, 0.6);
    const panelH = 360;
    const panel = addPanel(overlay, W - 80, panelH, Theme.color.bg);
    panel.setPosition(0, 0);
    const t = addLabel(panel, Copy.level.timeUp, { size: 34, bold: true, color: Theme.color.text });
    t.setPosition(0, panelH / 2 - 70);
    const retry = addButton(panel, Copy.result.retry, () => h.onBack(), {
      w: 280, h: 80, color: Theme.color.primary,
    });
    retry.setPosition(0, 20);
    const home = addButton(panel, Copy.result.home, () => h.onBack(), {
      w: 280, h: 80, color: Theme.color.bgDeep, textColor: Theme.color.text,
    });
    home.setPosition(0, -80);
  }

  // 无头测试钩子
  (parent as any).__autoSolve = () => {
    board.pieces.forEach((p, i) => {
      const node = pieceNodes[i];
      if (node) {
        node.setPosition(p.def.correctX, p.def.correctY);
        p.def.placed = true;
        pieceLocks[i] = true;
        piecePlaced[i] = true;
      }
    });
    placed = board.pieces.length;
    finish();
  };

  async function finish(): Promise<void> {
    if (finished) return;
    finished = true;
    if (timerHandle) clearInterval(timerHandle);

    const usedTimeSec = Math.round((Date.now() - startTime) / 1000);
    const star = predictStar(stdTimeSec, usedTimeSec, hintsUsed);
    const clearCopy = star === 3 ? Copy.result.clear3 : star === 2 ? Copy.result.clear2 : Copy.result.clear1;

    if (level.id) setLevelResult(level.id, star, usedTimeSec);

    let newCardId = '';
    let newCardRarity = 'N';
    if (refCardId && !hasCard(refCardId)) {
      const catalog = (h.cfg && h.cfg.cards) || getDefaultConfig().cards || [];
      const cardDef = catalog.find((c: any) => c.id === refCardId);
      newCardRarity = cardDef ? cardDef.rarity : 'N';
      const isNew = ownCard(refCardId, 'level');
      if (isNew) newCardId = refCardId;
    }

    try {
      await callFunction('levelComplete', {
        levelId: level.id, usedTimeSec, hintsUsed,
        pieceHash: board.pieces.map((p) => `${p.def.row},${p.def.col}`).join('|'),
      });
    } catch {
      /* 离线时忽略 */
    }

    showResult(clearCopy, star, newCardId, newCardRarity);
  }

  function showResult(clearCopy: string, star: number, newCardId: string, newCardRarity: string): void {
    const overlay = dimOverlay(parent, W, H, 0.82);

    const rayNode = new Node('Rays');
    const rayG = rayNode.addComponent(Graphics);
    overlay.addChild(rayNode);
    rayNode.layer = overlay.layer;
    drawRays(rayG, W, H);

    const imgSize = Math.min(W - 80, H * 0.5);
    const full = addImage(overlay, boardResPath, imgSize, imgSize, Theme.color.bgDeep);
    full.setPosition(0, 60);

    const titleNode = addLabel(overlay, `第 ${levelNumber} 关 ${clearCopy}`, {
      size: 36, bold: true, color: Theme.color.text,
    });
    titleNode.setPosition(0, imgSize / 2 + 110);

    const starNode = addLabel(overlay, Copy.result.star(star), {
      size: 30, color: Theme.color.accent,
    });
    starNode.setPosition(0, imgSize / 2 + 66);

    let cardOffset = 0;
    let loreNode: Node | null = null;
    if (newCardId) {
      cardOffset = 120;
      const sid = newCardId.split('_')[0];
      const card = addRarityCard(overlay, Theme.assetPath.seriesArt(sid, newCardId), 130, 130, {
        rarity: newCardRarity, owned: true,
      });
      card.setPosition(0, -imgSize / 2 - 80);
      const cardLabel = addLabel(overlay, Copy.result.newCard, {
        size: 26, bold: true, color: Theme.color.primary,
      });
      cardLabel.setPosition(0, -imgSize / 2 - 160);

      // A2 图鉴知识：新卡 lore 一行，点击看完整详情
      const catalog = (h.cfg && h.cfg.cards) || getDefaultConfig().cards || [];
      const def = catalog.find((c: any) => c.id === newCardId);
      if (def && def.lore && def.lore.fact) {
        const fact = def.lore.fact.length > 14 ? `${def.lore.fact.slice(0, 14)}…` : def.lore.fact;
        loreNode = addButton(overlay, `💡 ${fact}`, () => {
          showCardDetail(overlay, W, H, def, true);
        }, { w: W - 120, h: 56, color: Theme.color.bgDeep, textColor: Theme.color.text, size: 20 });
        loreNode.setPosition(0, -imgSize / 2 - 205);
      }
    }

    let nextLevel: any = null;
    if (levels.length > 0 && levelIndex >= 0 && levelIndex < levels.length - 1) {
      nextLevel = levels[levelIndex + 1];
    }

    const btnY2 = -imgSize / 2 - 200 - cardOffset;
    const home = addButton(overlay, Copy.result.home, () => h.onBack(), {
      w: 220, h: 80, color: Theme.color.bgDeep, textColor: Theme.color.text, size: 28,
    });
    home.setPosition(nextLevel ? -130 : 0, btnY2);

    if (nextLevel && h.onNext) {
      const next = addButton(overlay, Copy.result.nextLevel, () => h.onNext!(nextLevel), {
        w: 220, h: 80, color: Theme.color.primary, size: 28,
      });
      next.setPosition(130, btnY2);
    }
  }

  function drawRays(g: Graphics, w: number, h: number): void {
    g.clear();
    const cx = 0;
    const cy = 60;
    const rays = 24;
    const maxR = Math.max(w, h) * 0.9;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const a2 = ((i + 0.5) / rays) * Math.PI * 2;
      g.fillColor = new Color(255, 214, 107, 28);
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      g.lineTo(cx + Math.cos(a2) * maxR, cy + Math.sin(a2) * maxR);
      g.close();
      g.fill();
    }
  }
}
