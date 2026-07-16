export const PROTOCOL_VERSION = 1;

export type PokerAction = "fold" | "check" | "call" | "raise" | "allin";

export interface Card {
  rank: string;
  suit: string;
}

export interface SeatPublic {
  seatIndex: number;
  userId: string | null;
  displayName: string | null;
  stack: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  holeCards?: Card[];
}

export interface RoomSeat {
  seatIndex: number;
  userId: string | null;
  displayName: string | null;
  status: string;
  ready: boolean;
  stack: number;
  isBot?: boolean;
  leaveAfterHand?: boolean;
}

export interface RoomSnapshot {
  type: "room.snapshot";
  roomId: string;
  roomCode: string;
  stateVersion: number;
  roomState: string;
  ownerId: string;
  actingOwnerId?: string | null;
  matchId: string | null;
  seats: RoomSeat[];
}

export interface PublicSnapshot {
  type: "game.snapshot.public";
  matchId: string;
  handId: string;
  stateVersion: number;
  street: string;
  pot: number;
  community: Card[];
  seatsPublic: SeatPublic[];
  turnId: number;
  actorSeatId: number;
  dealerIndex: number;
  finished: boolean;
}

export interface PrivateSnapshot {
  type: "game.snapshot.private";
  matchId: string;
  handId: string;
  stateVersion: number;
  holeCards: Card[];
  legalActions: string[];
  raiseBounds?: {
    minimum: number;
    maximum: number;
    callAmount: number;
    fullCallAmount: number;
  };
  turnId: number;
}

export interface GameError {
  type: "game.error";
  requestId?: string;
  error: { code: string; message: string; retryable: boolean };
}

export type ServerMessage =
  | RoomSnapshot
  | PublicSnapshot
  | PrivateSnapshot
  | GameError
  | { type: string; [key: string]: unknown };

/** Polar layouts for 2–9 seated players (percent of table box). Index 0 ≈ bottom (hero arc). */
export const SEAT_LAYOUTS: Record<number, Array<{ left: string; top: string }>> = {
  2: [
    { left: "50%", top: "82%" },
    { left: "50%", top: "14%" },
  ],
  3: [
    { left: "50%", top: "82%" },
    { left: "18%", top: "28%" },
    { left: "82%", top: "28%" },
  ],
  4: [
    { left: "50%", top: "84%" },
    { left: "14%", top: "50%" },
    { left: "50%", top: "12%" },
    { left: "86%", top: "50%" },
  ],
  5: [
    { left: "50%", top: "84%" },
    { left: "14%", top: "58%" },
    { left: "22%", top: "18%" },
    { left: "78%", top: "18%" },
    { left: "86%", top: "58%" },
  ],
  6: [
    { left: "50%", top: "84%" },
    { left: "17%", top: "68%" },
    { left: "16%", top: "26%" },
    { left: "50%", top: "10%" },
    { left: "84%", top: "26%" },
    { left: "83%", top: "68%" },
  ],
  7: [
    { left: "50%", top: "86%" },
    { left: "18%", top: "72%" },
    { left: "12%", top: "38%" },
    { left: "28%", top: "12%" },
    { left: "72%", top: "12%" },
    { left: "88%", top: "38%" },
    { left: "82%", top: "72%" },
  ],
  8: [
    { left: "50%", top: "86%" },
    { left: "22%", top: "76%" },
    { left: "10%", top: "48%" },
    { left: "18%", top: "18%" },
    { left: "50%", top: "8%" },
    { left: "82%", top: "18%" },
    { left: "90%", top: "48%" },
    { left: "78%", top: "76%" },
  ],
  9: [
    { left: "50%", top: "88%" },
    { left: "26%", top: "78%" },
    { left: "10%", top: "55%" },
    { left: "14%", top: "24%" },
    { left: "38%", top: "8%" },
    { left: "62%", top: "8%" },
    { left: "86%", top: "24%" },
    { left: "90%", top: "55%" },
    { left: "74%", top: "78%" },
  ],
};

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function createClientActionId(): string {
  return crypto.randomUUID();
}
