import type { ServerMessage } from "./pokerProtocol";
import { createRequestId } from "./pokerProtocol";

type MessageHandler = (msg: ServerMessage) => void;

const DEV_UID_KEY = "poker_dev_uid";

export function getOrCreateDevUserId(): string {
  try {
    let id = localStorage.getItem(DEV_UID_KEY);
    if (!id) {
      id = `dev_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(DEV_UID_KEY, id);
      document.cookie = `poker_dev_uid=${encodeURIComponent(id)}; path=/; max-age=31536000`;
    }
    return id;
  } catch {
    return `dev_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class PokerSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private closeHandlers = new Set<(code: number, reason: string) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectToken: string | null = null;
  private roomId: string | null = null;
  private seatId: number | null = null;
  private matchId: string | null = null;
  private handId: string | null = null;
  private intentionalClose = false;
  private autoReconnectAttempts = 0;
  private syncInFlight = false;
  public localMatchVersion = 0;
  public localRoomVersion = 0;
  public lastUserId: string | null = null;
  public connected = false;

  constructor(
    private urlBase = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/poker`,
  ) {}

  private buildUrl() {
    const u = new URL(this.urlBase, location.href);
    // Optional client tag for logs; production auth still requires session cookie.
    try {
      const id = localStorage.getItem(DEV_UID_KEY);
      if (id) u.searchParams.set("devUserId", id);
    } catch {
      /* ignore */
    }
    return u.toString();
  }

  connect(): Promise<void> {
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.buildUrl());
      let settled = false;
      const readyTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket session ready timeout"));
          try {
            this.ws?.close();
          } catch {
            /* ignore */
          }
        }
      }, 10_000);

      const finishOpen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        this.connected = true;
        this.startPing();
        this.autoReconnectAttempts = 0;
        if (this.reconnectToken && this.roomId != null && this.seatId != null) {
          this.reconnect();
        }
        resolve();
      };

      this.ws.onopen = () => {
        // Resolve only after session.ready (see onmessage).
      };
      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(readyTimer);
          reject(new Error("WebSocket connection failed"));
        }
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMessage;
          if (msg.type === "session.ready") {
            if ("userId" in msg && typeof (msg as { userId?: string }).userId === "string") {
              this.lastUserId = (msg as { userId: string }).userId;
            }
            finishOpen();
          }
          if (!this.shouldDeliver(msg)) return;
          this.handleMessage(msg);
          for (const h of this.handlers) h(msg);
        } catch {
          /* ignore */
        }
      };
      this.ws.onclose = (ev) => {
        this.stopPing();
        this.connected = false;
        clearTimeout(readyTimer);
        for (const h of this.closeHandlers) h(ev.code, ev.reason || "");
        if (!settled) {
          settled = true;
          if (ev.code === 4401) reject(new Error("AUTH_REQUIRED"));
          else reject(new Error("WebSocket closed before open"));
          return;
        }
        if (ev.code === 4401) {
          const authErr = {
            type: "game.error",
            error: { code: "AUTH_REQUIRED", message: "请先登录", retryable: false },
          } as ServerMessage;
          for (const h of this.handlers) h(authErr);
          return;
        }
        if (!this.intentionalClose && this.reconnectToken) {
          this.scheduleAutoReconnect();
        }
      };
    });
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: (code: number, reason: string) => void) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  /** Drop stale snapshots before UI handlers see them. */
  private shouldDeliver(msg: ServerMessage): boolean {
    if (
      (msg.type === "game.snapshot.public" ||
        msg.type === "game.snapshot.private" ||
        msg.type === "game.event") &&
      "stateVersion" in msg
    ) {
      const handId = "handId" in msg ? (msg as { handId?: string }).handId : undefined;
      const eventType =
        msg.type === "game.event" && "eventType" in msg
          ? (msg as { eventType?: string }).eventType
          : undefined;

      // New hand (or explicit handStarted): reset watermark so the next deal is never dropped.
      if (handId && this.handId && handId !== this.handId) {
        this.localMatchVersion = 0;
        this.handId = handId;
      } else if (handId && !this.handId) {
        this.handId = handId;
      }
      if (eventType === "handStarted") {
        this.localMatchVersion = 0;
        if (handId) this.handId = handId;
        return true;
      }

      const v = msg.stateVersion as number;
      if (typeof v !== "number") return true;
      if (v < this.localMatchVersion) return false;
      if (v === this.localMatchVersion && msg.type !== "game.snapshot.private") {
        if (msg.type === "game.snapshot.public" || msg.type === "game.event") return false;
      }
      if (v > this.localMatchVersion + 1) {
        this.requestSync();
      }
    }
    if (msg.type === "room.snapshot" && "stateVersion" in msg) {
      const v = msg.stateVersion as number;
      if (v < this.localRoomVersion) return false;
    }
    return true;
  }

  private requestSync() {
    if (this.syncInFlight || !this.roomId || !this.matchId) return;
    this.syncInFlight = true;
    this.send("sync.request", {
      roomId: this.roomId,
      matchId: this.matchId,
      lastKnownVersion: this.localMatchVersion,
    });
    setTimeout(() => {
      this.syncInFlight = false;
    }, 1000);
  }

  /** UI can ask for a public+private resync when legalActions are missing. */
  requestSyncPublic() {
    this.requestSync();
  }

  private scheduleAutoReconnect() {
    if (this.autoReconnectAttempts >= 5) return;
    const delay = Math.min(1000 * 2 ** this.autoReconnectAttempts, 15_000);
    this.autoReconnectAttempts += 1;
    setTimeout(() => {
      this.connect().catch(() => {
        /* next attempt via onclose */
      });
    }, delay);
  }

  private handleMessage(msg: ServerMessage) {
    if (
      (msg.type === "game.snapshot.public" || msg.type === "game.event") &&
      "stateVersion" in msg
    ) {
      const v = msg.stateVersion as number;
      if ("matchId" in msg && msg.matchId) this.matchId = msg.matchId as string;
      if ("handId" in msg && msg.handId) {
        const nextHand = msg.handId as string;
        if (this.handId && nextHand !== this.handId) this.localMatchVersion = 0;
        this.handId = nextHand;
      }
      if (v > this.localMatchVersion) this.localMatchVersion = v;
    }
    if (msg.type === "game.snapshot.private" && "stateVersion" in msg) {
      const v = msg.stateVersion as number;
      if ("handId" in msg && msg.handId) {
        const nextHand = msg.handId as string;
        if (this.handId && nextHand !== this.handId) this.localMatchVersion = 0;
        this.handId = nextHand;
      }
      if (v > this.localMatchVersion) this.localMatchVersion = v;
      if ("matchId" in msg && msg.matchId) this.matchId = msg.matchId as string;
    }
    if (msg.type === "room.snapshot" && "stateVersion" in msg) {
      const v = msg.stateVersion as number;
      if (v > this.localRoomVersion) this.localRoomVersion = v;
      if ("matchId" in msg && (msg as { matchId?: string }).matchId) {
        this.matchId = (msg as { matchId: string }).matchId;
      }
    }
    if (msg.type === "room.join.ok" || msg.type === "room.create.ok") {
      const m = msg as { roomId?: string; reconnectToken?: string; seatIndex?: number };
      if (m.roomId) this.roomId = m.roomId;
      if ("reconnectToken" in m && m.reconnectToken) this.reconnectToken = m.reconnectToken;
      if ("seatIndex" in m && m.seatIndex != null) this.seatId = m.seatIndex;
    }
    if (msg.type === "session.reconnect.ok") {
      const m = msg as { reconnectToken?: string; matchId?: string; matchVersion?: number };
      if (m.reconnectToken) this.reconnectToken = m.reconnectToken;
      if (m.matchId) this.matchId = m.matchId;
      if (typeof m.matchVersion === "number" && m.matchVersion > this.localMatchVersion) {
        this.localMatchVersion = m.matchVersion;
      }
    }
    if (msg.type === "game.start.ok") {
      const m = msg as { matchId?: string };
      if (m.matchId) this.matchId = m.matchId;
    }
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, requestId: createRequestId(), payload }));
  }

  createRoom() {
    this.send("room.create");
  }

  joinRoom(roomCode: string, seatIndex?: number) {
    this.send("room.join", { roomCode, seatIndex });
  }

  leaveRoom() {
    if (this.roomId) this.send("room.leave", { roomId: this.roomId });
    this.roomId = null;
    this.matchId = null;
    this.handId = null;
    this.localMatchVersion = 0;
    this.localRoomVersion = 0;
  }

  addBot() {
    if (this.roomId) this.send("room.addBot", { roomId: this.roomId });
  }

  removeBot() {
    if (this.roomId) this.send("room.removeBot", { roomId: this.roomId });
  }

  transferOwner(toUserId: string) {
    if (this.roomId) this.send("room.transferOwner", { roomId: this.roomId, toUserId });
  }

  setReady(ready: boolean) {
    if (this.roomId) this.send(ready ? "game.ready" : "game.unready", { roomId: this.roomId, ready });
  }

  startGame() {
    if (this.roomId) this.send("game.start", { roomId: this.roomId });
  }

  endMatch() {
    if (this.roomId) this.send("game.endMatch", { roomId: this.roomId });
  }

  action(action: string, extra: Record<string, unknown> = {}) {
    const nextHandId = (extra.handId as string | undefined) || this.handId;
    if (!this.roomId || !this.matchId || !nextHandId) return;
    if (nextHandId) this.handId = nextHandId;
    this.send("game.action", {
      roomId: this.roomId,
      matchId: this.matchId,
      handId: nextHandId,
      ...extra,
      action,
    });
  }

  getHandId() {
    return this.handId;
  }

  reconnect() {
    if (this.roomId && this.seatId != null && this.reconnectToken) {
      this.send("session.reconnect", {
        roomId: this.roomId,
        matchId: this.matchId,
        seatId: this.seatId,
        reconnectToken: this.reconnectToken,
      });
    }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send("game.ping"), 15_000);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  close() {
    this.intentionalClose = true;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.roomId = null;
    this.matchId = null;
    this.handId = null;
    this.localMatchVersion = 0;
    this.localRoomVersion = 0;
  }
}
