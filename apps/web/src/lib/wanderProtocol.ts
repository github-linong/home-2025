// Shared client/server protocol types for the Wander game.

export type Dir =
  | "up" | "down" | "left" | "right"
  | "up-left" | "up-right" | "down-left" | "down-right";

export interface PlayerView {
  userId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  facing: Dir;
  status: "active" | "disconnected";
}

export interface WorldSize {
  w: number;
  h: number;
}

export interface RoomSnapshot {
  type: "room.snapshot";
  protocolVersion: number;
  roomId: string;
  roomCode: string;
  ownerId: string;
  world: WorldSize;
  stateVersion: number;
  players: PlayerView[];
}

export type ServerMessage =
  | { type: "session.ready"; userId: string; user?: { id: string; name?: string }; publicRoomCode?: string }
  | {
      type: "room.create.ok";
      roomId: string;
      roomCode: string;
      ownerId: string;
      world: WorldSize;
      stateVersion: number;
      you: string;
      player: PlayerView;
      reconnectToken: string;
      players: PlayerView[];
    }
  | {
      type: "room.join.ok";
      roomId: string;
      roomCode: string;
      ownerId: string;
      world: WorldSize;
      stateVersion: number;
      you: string;
      player: PlayerView;
      reconnectToken: string;
      players: PlayerView[];
    }
  | { type: "room.leave.ok"; roomId: string }
  | RoomSnapshot
  | { type: "world.resized"; world: WorldSize; stateVersion: number }
  | {
      type: "session.reconnect.ok";
      roomId: string;
      reconnectToken: string;
      world: WorldSize;
      stateVersion: number;
    }
  | { type: "game.pong"; t?: number }
  | { type: "game.error"; error: { code: string; message: string; retryable: boolean } }
  | { type: "session.kicked"; userId: string; reason: string };

export interface ClientEnvelope {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

export function createRequestId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}`;
}
