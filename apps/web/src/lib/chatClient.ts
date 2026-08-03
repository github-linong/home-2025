export type Identity = {
  userId: string;
  name: string;
  image?: string | null;
  isGuest: boolean;
};

/** The reserved, openly-joinable public group. Mirrors the server's registry. */
export const PUBLIC_GROUP = "group:public";

export type ChatMessage = {
  id: string;
  channel: string;
  author: Identity;
  text: string;
  ts: number;
  clientMsgId?: string;
};

export type ServerMessage = {
  type: string;
  [k: string]: unknown;
};

type Handler = (msg: ServerMessage) => void;

/**
 * WebSocket transport for the chat service. Mirrors the poker PokerSocket shape
 * (auto-reconnect, ping heartbeat) but chat-specific. Authentication is handled
 * server-side from the session cookie; anonymous guests pass a stable guestId
 * and an optional display name.
 */
export class ChatClient {
  private ws: WebSocket | null = null;
  connected = false;
  you: Identity | null = null;
  channels: { groups: string[]; dms: string[] } = {
    groups: [],
    dms: [],
  };
  private handlers = new Set<Handler>();
  private closeHandlers = new Set<() => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private urlBase: string;
  private guestId: string;
  private guestName: string;

  constructor() {
    this.urlBase = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat`;
    this.guestId = this.loadGuestId();
    this.guestName = this.loadGuestName();
  }

  private loadGuestId(): string {
    try {
      let id = localStorage.getItem("ln_chat_guest_id");
      if (!id) {
        id = "g" + crypto.randomUUID().slice(0, 8);
        localStorage.setItem("ln_chat_guest_id", id);
      }
      return id;
    } catch {
      return "g" + Math.random().toString(36).slice(2, 10);
    }
  }

  private loadGuestName(): string {
    try {
      return localStorage.getItem("ln_chat_guest_name") || "";
    } catch {
      return "";
    }
  }

  getGuestId() {
    return this.guestId;
  }
  getGuestName() {
    return this.guestName;
  }

  onMessage(h: Handler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  onClose(h: () => void) {
    this.closeHandlers.add(h);
    return () => this.closeHandlers.delete(h);
  }

  connect(): Promise<void> {
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      const u = new URL(this.urlBase, location.href);
      u.searchParams.set("guestId", this.guestId);
      if (this.guestName) u.searchParams.set("guestName", this.guestName);
      this.ws = new WebSocket(u.toString());
      let settled = false;
      const readyTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("chat ready timeout"));
          try {
            this.ws?.close();
          } catch {}
        }
      }, 10_000);

      this.ws.onopen = () => {};
      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(readyTimer);
          reject(new Error("chat connection failed"));
        }
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMessage;
          // Server-driven liveness: answer pings so idle connections aren't killed.
          if (msg.type === "chat.ping") {
            this.send("chat.pong");
            return;
          }
          if (msg.type === "chat.welcome") {
            if (!settled) {
              settled = true;
              clearTimeout(readyTimer);
              this.connected = true;
              this.startPing();
              this.reconnectAttempts = 0;
              resolve();
            }
          }
          for (const h of this.handlers) h(msg);
        } catch {
          /* ignore */
        }
      };
      this.ws.onclose = (ev) => {
        this.stopPing();
        this.connected = false;
        clearTimeout(readyTimer);
        for (const h of this.closeHandlers) h();
        if (!settled) {
          settled = true;
          reject(new Error("closed before open"));
          return;
        }
        if (!this.intentionalClose) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= 6) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send("chat.ping"), 20_000);
  }
  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  sendMessage(channel: string, text: string, clientMsgId?: string) {
    this.send("chat.message", { channel, text, clientMsgId });
  }
  joinGroup(channel: string) {
    this.send("chat.join", { channel });
  }
  /** Open a DM thread: tells the server so the peer's UI surfaces the channel. */
  joinDm(channel: string) {
    this.send("chat.join", { channel });
  }
  leaveGroup(channel: string) {
    this.send("chat.leave", { channel });
  }
  joinByInvite(inviteCode: string) {
    this.send("chat.joinByInvite", { inviteCode });
  }
  createGroup(name?: string) {
    this.send("chat.createGroup", name ? { name } : {});
  }
  requestHistory(channel: string, limit = 50) {
    this.send("chat.history", { channel, limit });
  }
  setGuestName(name: string) {
    this.guestName = name;
    if (this.you && this.you.isGuest) this.you.name = name;
    try {
      localStorage.setItem("ln_chat_guest_name", name);
    } catch {}
    this.send("chat.setGuestName", { name });
  }
  /** Broadcast a typing indicator for the given channel (throttled by caller). */
  sendTyping(channel: string) {
    this.send("chat.typing", { channel });
  }

  close() {
    this.intentionalClose = true;
    this.stopPing();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.connected = false;
  }
}
