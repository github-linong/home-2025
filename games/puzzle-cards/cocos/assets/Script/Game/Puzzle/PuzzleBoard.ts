// cocos/assets/Script/Game/Puzzle/PuzzleBoard.ts
// 拼图底板与碎片逻辑（PRD M02）：生成、吸附(P-002 20px)、完成判定(P-014)、参考图(P-006)。
import { PuzzlePiece, PieceDef } from './PuzzlePiece';

export class PuzzleBoard {
  // 拼拼卡决策：吸附距离 30px（碎片中心与正确位置的距离）
  static readonly SNAP_DISTANCE = 30;

  pieces: PuzzlePiece[] = [];

  constructor(public rows: number, public cols: number, public pieceSize: number) {}

  // 由一张图生成 pieces：正确位置按网格；初始散落在底板下方 scatterY 区域
  generate(count: number, scatterY: number): void {
    this.pieces = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      const def: PieceDef = {
        id: i,
        row,
        col,
        correctX: col * this.pieceSize,
        correctY: row * this.pieceSize,
        x: Math.random() * 320,
        y: scatterY + Math.random() * 220,
        rotation: 0,
        placed: false,
      };
      this.pieces.push(new PuzzlePiece(def));
    }
  }

  // 尝试放置碎片：接近正确位置则吸附并返回 true（PRD P-002）
  tryPlace(piece: PuzzlePiece): boolean {
    if (piece.isAtCorrect) {
      piece.def.placed = true;
      piece.def.x = piece.def.correctX;
      piece.def.y = piece.def.correctY;
      return true;
    }
    return false;
  }

  get allPlaced(): boolean {
    return this.pieces.length > 0 && this.pieces.every((p) => p.def.placed);
  }

  // 完成度 0..1
  get progress(): number {
    if (this.pieces.length === 0) return 0;
    return this.pieces.filter((p) => p.def.placed).length / this.pieces.length;
  }
}
