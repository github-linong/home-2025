// cocos/assets/Script/Game/PuzzleScreen.ts
// 拼图对战屏幕：渲染底板 + 碎片（可拖拽吸附），完成后提交云端并展示鼓励结果。
import { Node, view, EventTouch, UITransform, Sprite, Label, Vec3 } from 'cc';
import { Copy } from '../Core/Copy';
import { Theme } from '../Core/Theme';
import { addLabel, addButton, addPanel, addImage, sizeNode, stretch, hexColor, dimOverlay } from '../Core/UI';
import { callFunction } from '../Core/Cloud';
import { PuzzleBoard } from './Puzzle/PuzzleBoard';
import { predictStar } from './Puzzle/Scoring';

export interface PuzzleHandlers {
  level: any;
  cfg: any;
  onBack: () => void;
}

export function buildPuzzleScreen(parent: Node, h: PuzzleHandlers): void {
  const W = view.getVisibleSize().width;
  const H = view.getVisibleSize().height;
  const bg = addPanel(parent, W, H, Theme.color.bg);
  stretch(bg);

  const level = h.level || {};
  const count = level.pieceCount || 9;
  const cols = Math.round(Math.sqrt(count));
  const rows = cols;
  const pieceSize = Math.min(W, H) * 0.7 / cols;
  const stdTimeSec = level.stdTimeSec || 60;

  const title = addLabel(parent, level.name || Copy.level.start, { size: 32, bold: true, color: Theme.color.primaryDark });
  title.setPosition(0, H / 2 - 70);

  const back = addButton(parent, Copy.common.close, h.onBack, { w: 120, h: 60, color: Theme.color.textLight, size: 26 });
  back.setPosition(-W / 2 + 90, H / 2 - 70);

  // 参考图预览（看一眼参考图）。关卡无 cardId 字段，按 seriesId + indexInChapter 推导卡牌目录 id。
  const refCardId = `${level.seriesId || 'flower'}_${String(level.indexInChapter || 1).padStart(3, '0')}`;
  const ref = addImage(parent, Theme.assetPath.seriesArt(level.seriesId || 'flower', refCardId), 120, 120, Theme.color.primaryLight);
  ref.setPosition(W / 2 - 90, H / 2 - 70);

  // 底板容器
  const boardNode = new Node('Board');
  sizeNode(boardNode, cols * pieceSize, rows * pieceSize);
  boardNode.setPosition(0, -20);
  parent.addChild(boardNode);
  const boardBg = addImage(boardNode, Theme.assetPath.boardBg, cols * pieceSize, rows * pieceSize, Theme.color.bgDeep);
  boardBg.setPosition(0, 0);

  const board = new PuzzleBoard(rows, cols, pieceSize);
  board.generate(count, 0);
  let placed = 0;
  const startTime = Date.now();
  let hintsUsed = 0;

  const pieceNodes: Node[] = [];
  board.pieces.forEach((p, i) => {
    const node = new Node(`piece_${i}`);
    const sp = node.addComponent(Sprite);
    sp.type = Sprite.Type.SLICED;
    sp.color = hexColor([Theme.color.primary, Theme.color.accent, Theme.color.accentPink, Theme.color.primaryLight][i % 4]);
    const lab = node.addComponent(Label);
    lab.string = `${i + 1}`;
    lab.color = hexColor('#FFFFFF');
    lab.fontSize = Math.floor(pieceSize * 0.3);
    sizeNode(node, pieceSize - 6, pieceSize - 6);
    // 初始散落：底板下方区域
    const sx = (Math.random() - 0.5) * (W - pieceSize);
    const sy = -H / 2 + pieceSize; // 底部区域
    node.setPosition(sx, sy);
    parent.addChild(node);
    pieceNodes.push(node);
    makeDraggable(node, boardNode, p, pieceSize, () => {
      placed++;
      if (placed >= board.pieces.length) finish();
    });
  });

  function makeDraggable(node: Node, container: Node, piece: any, size: number, onPlaced: () => void): void {
    let grabbing = false;
    let offX = 0;
    let offY = 0;
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      grabbing = true;
      const loc = e.getUILocation();
      const cont = container.parent!.getComponent(UITransform)!;
      const local = cont.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      offX = node.position.x - local.x;
      offY = node.position.y - local.y;
    });
    node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      if (!grabbing) return;
      const loc = e.getUILocation();
      const cont = container.parent!.getComponent(UITransform)!;
      const local = cont.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      node.setPosition(local.x + offX, local.y + offY);
    });
    node.on(Node.EventType.TOUCH_END, () => {
      grabbing = false;
      const dx = node.position.x - piece.def.correctX;
      const dy = node.position.y - piece.def.correctY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 30) {
        node.setPosition(piece.def.correctX, piece.def.correctY);
        piece.def.placed = true;
        onPlaced();
      }
    });
  }

  async function finish(): Promise<void> {
    const usedTimeSec = Math.round((Date.now() - startTime) / 1000);
    const star = predictStar(stdTimeSec, usedTimeSec, hintsUsed);
    const clearCopy = star === 3 ? Copy.result.clear3 : star === 2 ? Copy.result.clear2 : Copy.result.clear1;
    try {
      const res = await callFunction('levelComplete', {
        levelId: level.id, usedTimeSec, hintsUsed, pieceHash: board.pieces.map((p) => `${p.def.row},${p.def.col}`).join('|'),
      });
      const newCard = res && res.data && res.data.newCard;
      showResult(clearCopy, star, !!newCard);
    } catch {
      showResult(clearCopy, star, false);
    }
  }

  function showResult(clearCopy: string, star: number, newCard: boolean): void {
    const overlay = dimOverlay(parent, W, H, 0.5);
    const panel = addPanel(overlay, W - 80, 420, Theme.color.bg);
    panel.setPosition(0, 0);
    const t = addLabel(panel, clearCopy, { size: 38, bold: true, color: Theme.color.primaryDark });
    t.setPosition(0, 150);
    const s = addLabel(panel, Copy.result.star(star), { size: 30, color: Theme.color.text });
    s.setPosition(0, 90);
    if (newCard) {
      const n = addLabel(panel, Copy.result.newCard, { size: 28, bold: true, color: Theme.color.accent });
      n.setPosition(0, 36);
    }
    const retry = addButton(panel, Copy.result.retry, () => h.onBack(), { w: 260, h: 76, color: Theme.color.textLight });
    retry.setPosition(0, -50);
    const home = addButton(panel, Copy.result.backHome, () => h.onBack(), { w: 260, h: 76 });
    home.setPosition(0, -140);
  }
}
