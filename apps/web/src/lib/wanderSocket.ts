import type { ServerMessage, Dir, ClientEnvelope } from "./wanderProtocol";
import { createRequestId } from "./wanderProtocol";
import { getUserId, getDisplayName, getOrCreateDevUserId } from "./identity";

export { getOrCreateDevUserId };

type MessageHandler = (msg: ServerMessage) => void;

export class WanderSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private closeHandlers = new Set<(code: number, reason: string) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectToken: string | null = null;
  private roomId: string | null = null;
  private intentionalClose = false;
  private autoReconnectAttempts = 0;
  public connected = false;
  public lastUserId: string | null = null;
  public publicRoomCode: string | null = null;
  public localStateVersion = 0;

  constructor(
    private urlBase = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/wander`,
  ) {}

  private buildUrl() {
    const u = new URL(this.urlBase, location.href);
    try {
      // Honor an explicit ?devUserId= (so two browser tabs / the documented
      // multi-player test get distinct identities); otherwise fall back to the
      // shared stable per-browser id (chat/wander/poker all use the same one).
      const fromUrl = new URLSearchParams(location.search).get("devUserId");
      const id = fromUrl || getUserId();
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
        resolve();
      };

      this.ws.onopen = () => {
        // Resolve only after session.ready (set in onmessage).
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
            if (typeof msg.userId === "string") this.lastUserId = msg.userId;
            if (typeof msg.publicRoomCode === "string") this.publicRoomCode = msg.publicRoomCode;
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
        if (!this.intentionalClose && this.reconnectToken && this.roomId) {
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

  /** Drop stale snapshots older than our local watermark. */
  private shouldDeliver(msg: ServerMessage): boolean {
    if (msg.type === "room.snapshot" && typeof msg.stateVersion === "number") {
      if (msg.stateVersion < this.localStateVersion) return false;
    }
    return true;
  }

  private handleMessage(msg: ServerMessage) {
    if (msg.type === "room.snapshot" && typeof msg.stateVersion === "number") {
      if (msg.stateVersion > this.localStateVersion) this.localStateVersion = msg.stateVersion;
    }
    if (msg.type === "room.create.ok" || msg.type === "room.join.ok" || msg.type === "session.reconnect.ok") {
      this.roomId = msg.roomId;
      this.reconnectToken = msg.reconnectToken;
      // Seed the version watermark from the authoritative snapshot these
      // messages carry, so a stale `room.snapshot` (lower version) that
      // arrives right after can't clobber our freshly-joined state.
      if (typeof msg.stateVersion === "number" && msg.stateVersion > this.localStateVersion) {
        this.localStateVersion = msg.stateVersion;
      }
    }
    if (msg.type === "room.leave.ok") {
      this.roomId = null;
      this.reconnectToken = null;
      this.localStateVersion = 0;
    }
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const env: ClientEnvelope = { type, requestId: createRequestId(), payload };
    this.ws.send(JSON.stringify(env));
  }

  createRoom(displayName?: string) {
    this.send("room.create", { displayName: displayName ?? getDisplayName() });
  }

  joinRoom(roomCode: string, displayName?: string) {
    this.send("room.join", { roomCode, displayName: displayName ?? getDisplayName() });
  }

  /** Join the designated public room (default landing for /wander). */
  joinPublicRoom() {
    if (this.publicRoomCode) this.joinRoom(this.publicRoomCode);
  }

  leaveRoom() {
    if (this.roomId) this.send("room.leave", { roomId: this.roomId });
    this.roomId = null;
    this.reconnectToken = null;
    this.localStateVersion = 0;
  }

  move(dir: Dir) {
    this.send("player.move", { dir });
  }

  resizeWorld(w: number, h: number) {
    if (this.roomId) this.send("world.resize", { w, h });
  }

  requestSync() {
    if (this.roomId) this.send("sync.request", { roomId: this.roomId });
  }

  reconnect() {
    if (this.roomId && this.reconnectToken) {
      this.send("session.reconnect", { roomId: this.roomId, reconnectToken: this.reconnectToken });
    }
  }

  private scheduleAutoReconnect() {
    if (this.autoReconnectAttempts >= 5) return;
    const delay = Math.min(1000 * 2 ** this.autoReconnectAttempts, 15_000);
    this.autoReconnectAttempts += 1;
    setTimeout(() => {
      this.connect().then(() => this.reconnect()).catch(() => {
        /* next attempt via onclose */
      });
    }, delay);
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
    this.reconnectToken = null;
    this.localStateVersion = 0;
  }
}
