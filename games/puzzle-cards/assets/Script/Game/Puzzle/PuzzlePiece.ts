// cocos/assets/Script/Game/Puzzle/PuzzlePiece.ts
// 拼图碎片数据模型（PRD M02 P-001/P-002）。
import { PuzzleBoard } from './PuzzleBoard';

export interface PieceDef {
  id: number;
  row: number;
  col: number;
  // 正确位置（底板格左上角坐标，px）
  correctX: number;
  correctY: number;
  // 当前散落位置（px）
  x: number;
  y: number;
  // 旋转角度 0/90/180/270（高难度用，PRD P-004）
  rotation: number;
  placed: boolean;
}

export class PuzzlePiece {
  def: PieceDef;
  constructor(def: PieceDef) {
    this.def = def;
  }

  // 是否处于正确位置（距离 ≤ 吸附距离 且 角度正确）
  get isAtCorrect(): boolean {
    const dx = this.def.x - this.def.correctX;
    const dy = this.def.y - this.def.correctY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= PuzzleBoard.SNAP_DISTANCE && this.def.rotation % 360 === 0;
  }
}
