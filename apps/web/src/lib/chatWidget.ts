import { ChatClient, type Identity, type ChatMessage, type ServerMessage, PUBLIC_GROUP } from "./chatClient";

type Channel = string;

/**
 * Chat widget controller. Builds the DOM (once, persisted across Astro page
 * transitions via `transition:persist`), owns a single ChatClient instance, and
 * renders public / group / DM conversations.
 */
class ChatWidget {
  private root!: HTMLElement;
  private client = new ChatClient();
  private activeChannel: Channel = PUBLIC_GROUP;
  private messages = new Map<Channel, ChatMessage[]>();
  private peerNames = new Map<string, string>();
  private publicPresence: Identity[] = [];
  private presenceKey = "";
  private contextGroup: string | null = null;

  // DOM refs
  private launcher!: HTMLElement;
  private panel!: HTMLElement;
  private dot!: HTMLElement;
  private meChip!: HTMLElement;
  private banner!: HTMLElement;
  private groupsEl!: HTMLElement;
  private dmsEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private input!: HTMLInputElement;
  private chList: HTMLElement[] = [];

  static mount() {
    if ((window as any).__lnChat) return (window as any).__lnChat as ChatWidget;
    const w = new ChatWidget();
    w.init();
    (window as any).__lnChat = w;
    (window as any).setLnChatContext = (g: string) => w.setContext(g);
    return w;
  }

  private init() {
    this.root = document.getElementById("ln-chat-root") as HTMLElement;
    if (!this.root) return;
    this.root.innerHTML = TEMPLATE;
    this.launcher = this.root.querySelector(".ln-chat-launcher") as HTMLElement;
    this.panel = this.root.querySelector(".ln-chat-panel") as HTMLElement;
    this.dot = this.root.querySelector(".ln-dot") as HTMLElement;
    this.meChip = this.root.querySelector(".ln-me") as HTMLElement;
    this.banner = this.root.querySelector(".ln-ctx-banner") as HTMLElement;
    this.groupsEl = this.root.querySelector(".ln-groups") as HTMLElement;
    this.dmsEl = this.root.querySelector(".ln-dms") as HTMLElement;
    this.messagesEl = this.root.querySelector(".ln-messages") as HTMLElement;
    this.input = this.root.querySelector(".ln-input") as HTMLInputElement;

    this.launcher.addEventListener("click", () => this.toggle());
    (this.root.querySelector(".ln-close") as HTMLElement).addEventListener("click", () => this.toggle(false));
    (this.root.querySelector(".ln-add-group") as HTMLElement).addEventListener("click", () => this.promptGroup());
    (this.root.querySelector(".ln-composer") as HTMLFormElement).addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit();
    });

    // guest rename
    this.meChip.addEventListener("click", () => {
      if (this.client.you && this.client.you.isGuest) {
        const name = window.prompt("设置你的游客昵称", this.client.getGuestName() || "");
        if (name && name.trim()) this.client.setGuestName(name.trim().slice(0, 24));
      }
    });

    this.client.onMessage((m) => this.onMessage(m));
    this.client.onClose(() => this.updateStatus(false));
    this.client.connect().then(() => this.updateStatus(true)).catch(() => this.updateStatus(false));

    // game-room context (if already set by another component)
    const existing = (window as any).LN_CHAT_CONTEXT;
    if (existing) this.setContext(existing);
  }

  private toggle(force?: boolean) {
    const show = force ?? this.panel.hasAttribute("hidden");
    if (show) {
      this.panel.removeAttribute("hidden");
      this.input.focus();
      this.scrollToBottom();
    } else {
      this.panel.setAttribute("hidden", "");
    }
  }

  private updateStatus(ok: boolean) {
    this.dot.classList.toggle("online", ok);
    this.dot.classList.toggle("offline", !ok);
    if (ok && this.client.you) this.renderMe();
  }

  private renderMe() {
    const you = this.client.you;
    if (!you) return;
    this.meChip.textContent = you.isGuest
      ? `游客: ${you.name} (点击改名)`
      : `${you.name} · 已登录`;
    this.meChip.title = you.isGuest ? "点击设置游客昵称" : "已登录用户";
    // Group creation is for logged-in users only. The "+ 群组" button is hidden
    // for guests (game-room groups still join programmatically via setContext).
    const gb = this.root.querySelector(".ln-add-group") as HTMLElement | null;
    if (gb) gb.style.display = you.isGuest ? "none" : "";
  }

  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case "chat.welcome":
        this.client.you = m.you as Identity;
        this.client.channels = m.channels as any;
        this.renderMe();
        this.renderChannelList();
        this.loadInto(PUBLIC_GROUP, (m.publicHistory as ChatMessage[]) || []);
        if (this.activeChannel === PUBLIC_GROUP) this.renderMessages();
        break;
      case "chat.message": {
        const msg = m as unknown as ChatMessage;
        this.rememberPeer(msg.author);
        this.appendMessage(msg);
        if (msg.channel === this.activeChannel) this.renderMessages();
        else this.bumpUnread(msg.channel);
        break;
      }
      case "chat.history": {
        const ch = m.channel as string;
        this.loadInto(ch, (m.messages as ChatMessage[]) || []);
        if (ch === this.activeChannel) this.renderMessages();
        break;
      }
      case "chat.joined":
        this.client.channels = m.channels as any;
        this.renderChannelList();
        this.loadInto(m.channel as string, (m.history as ChatMessage[]) || []);
        if (m.channel === this.activeChannel) this.renderMessages();
        break;
      case "chat.left":
        this.client.channels = m.channels as any;
        this.renderChannelList();
        break;
      case "chat.identity":
        this.client.you = m.you as Identity;
        this.renderMe();
        break;
      case "chat.presence":
        if (m.channel === PUBLIC_GROUP) {
          const users = (m.users as Identity[]) || [];
          // Only rebuild the sidebar when the *online set* actually changes.
          // Re-rendering on every tick would detach the very node a user is
          // mid-click (the DM row they're about to open), breaking interaction.
          const key = users.map((u) => u.userId).sort().join("|");
          if (key === this.presenceKey) break;
          this.presenceKey = key;
          this.publicPresence = users;
          this.publicPresence.forEach((u) => this.rememberPeer(u));
          this.renderChannelList();
        }
        break;
      case "chat.error":
        if (m.code === "RATE_LIMITED") this.flash((m.message as string) || "发送过于频繁");
        break;
      default:
        break;
    }
  }

  private rememberPeer(u: Identity) {
    if (u?.userId) this.peerNames.set(u.userId, u.name || u.userId);
  }

  private loadInto(ch: Channel, msgs: ChatMessage[]) {
    this.messages.set(ch, msgs.slice());
  }

  private appendMessage(msg: ChatMessage) {
    const arr = this.messages.get(msg.channel) || [];
    // dedupe by id / clientMsgId
    if (!arr.some((x) => x.id === msg.id || (msg.clientMsgId && x.clientMsgId === msg.clientMsgId))) {
      arr.push(msg);
      if (arr.length > 300) arr.shift();
    }
    this.messages.set(msg.channel, arr);
  }

  private bumpUnread(ch: Channel) {
    const el = this.chList.find((e) => e.dataset.ch === ch);
    if (el) el.classList.add("unread");
  }

  // ---- channel switching ----
  switchChannel(ch: Channel) {
    this.activeChannel = ch;
    this.renderChannelList();
    if (!this.messages.has(ch)) this.client.requestHistory(ch, 50);
    this.renderMessages();
    this.scrollToBottom();
  }

  private renderChannelList() {
    this.chList = [];

    this.groupsEl.innerHTML = "";
    for (const g of this.client.channels.groups) {
      const isPublic = g === PUBLIC_GROUP;
      const el = document.createElement("div");
      el.className = "ch" + (g === this.activeChannel ? " active" : "");
      el.dataset.ch = g;
      const label = document.createElement("span");
      label.className = "ch-label-text";
      // The public group reads as a pinned "公共聊天" inside the 群组 list —
      // it is a reserved group, not a separate channel kind.
      label.textContent = isPublic ? "💬 公聊" : "👥 " + g.replace(/^group:/, "");
      el.appendChild(label);
      // The public group can't be left; only regular groups show the ✕.
      if (!isPublic) {
        const x = this.makeLeaveBtn();
        x.addEventListener("click", (e) => { e.stopPropagation(); this.removeChannel(g); });
        el.appendChild(x);
      }
      el.addEventListener("click", () => this.switchChannel(g));
      this.groupsEl.appendChild(el);
      this.chList.push(el);
    }

    this.renderDmList();
  }

  /**
   * Render the 私聊 section. Online users (from the public group's presence)
   * are shown directly and clickable to start/open a DM — no "add" step. Active
   * DM threads are merged in (deduped by peer); threads whose peer is offline
   * are still listed so they aren't lost.
   */
  private renderDmList() {
    this.dmsEl.innerHTML = "";
    const me = this.client.you?.userId;
    const byPeer = new Map<string, { name: string; online: boolean; dm?: string }>();
    for (const u of this.publicPresence) {
      if (u.userId === me) continue;
      byPeer.set(u.userId, { name: u.name || u.userId, online: true });
    }
    for (const d of this.client.channels.dms) {
      const ids = d.replace(/^dm:/, "").split(":");
      const peer = ids.find((x) => x !== me) || ids[0];
      const cur = byPeer.get(peer);
      if (cur) cur.dm = d;
      else byPeer.set(peer, { name: this.peerNames.get(peer) || peer, online: false, dm: d });
    }
    for (const [peer, info] of byPeer) {
      const ch = info.dm;
      const isActive = ch != null && ch === this.activeChannel;
      const el = document.createElement("div");
      el.className = "ch" + (isActive ? " active" : "");
      if (ch) el.dataset.ch = ch;
      el.dataset.peer = peer;
      const label = document.createElement("span");
      label.className = "ch-label-text";
      label.textContent = (ch ? "🔒 " : "👤 ") + info.name + (info.online ? "" : " (离线)");
      el.appendChild(label);
      if (ch) {
        const x = this.makeLeaveBtn();
        x.addEventListener("click", (e) => { e.stopPropagation(); this.removeChannel(ch); });
        el.appendChild(x);
      }
      el.addEventListener("click", () => {
        if (ch) this.switchChannel(ch);
        else this.startDm({ userId: peer, name: info.name });
      });
      this.dmsEl.appendChild(el);
      this.chList.push(el);
    }
  }

  private dmLabel(d: Channel): string {
    const ids = d.replace(/^dm:/, "").split(":");
    const me = this.client.you?.userId;
    const other = ids.find((x) => x !== me) || ids[0];
    return this.peerNames.get(other) || other;
  }

  private makeLeaveBtn(): HTMLElement {
    const x = document.createElement("span");
    x.className = "ch-x";
    x.textContent = "✕";
    x.title = "退出 / 移除";
    return x;
  }

  /** Leave a group (server-side) or just hide a DM thread (client-side). */
  private removeChannel(ch: Channel) {
    const wasActive = this.activeChannel === ch;
    // The public group is reserved and can't be left.
    if (ch === PUBLIC_GROUP) {
      this.renderChannelList();
      return;
    }
    if (ch.startsWith("group:")) {
      this.client.leaveGroup(ch);
      this.client.channels.groups = this.client.channels.groups.filter((x) => x !== ch);
    } else if (ch.startsWith("dm:")) {
      this.client.channels.dms = this.client.channels.dms.filter((x) => x !== ch);
    }
    if (wasActive) this.switchChannel(PUBLIC_GROUP);
    else this.renderChannelList();
  }

  private renderMessages() {
    const arr = this.messages.get(this.activeChannel) || [];
    const me = this.client.you?.userId;
    this.messagesEl.innerHTML = "";
    for (const msg of arr) {
      const mine = msg.author.userId === me;
      const row = document.createElement("div");
      row.className = "chat " + (mine ? "chat-end" : "chat-start");
      const header = document.createElement("div");
      header.className = "chat-header";
      const name = document.createElement("span");
      name.textContent = msg.author.name || msg.author.userId;
      const time = document.createElement("time");
      time.textContent = new Date(msg.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      header.append(name, document.createTextNode(" "), time);
      const bubble = document.createElement("div");
      bubble.className = "chat-bubble" + (mine ? " chat-bubble-primary" : "");
      bubble.textContent = msg.text; // textContent => no HTML injection
      row.append(header, bubble);
      this.messagesEl.appendChild(row);
    }
    this.scrollToBottom();
  }

  private scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text) return;
    const id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
    this.client.sendMessage(this.activeChannel, text, id);
    this.input.value = "";
  }

  // ---- group / dm flows ----
  private promptGroup() {
    // Only logged-in users may create a group. Guests see no button, but guard
    // here too in case the handler is ever reached via another path.
    if (this.client.you?.isGuest) {
      this.flash("请先登录后再创建群组");
      return;
    }
    const id = window.prompt("输入群组 ID（例如 room-abc123）", this.contextGroup ? this.contextGroup.replace(/^group:/, "") : "");
    if (!id || !id.trim()) return;
    const ch = "group:" + id.trim().replace(/^group:/, "").slice(0, 64);
    if (!this.client.channels.groups.includes(ch)) this.client.channels.groups.push(ch);
    this.client.joinGroup(ch);
    this.switchChannel(ch);
  }

  private startDm(peer: Identity) {
    this.rememberPeer(peer);
    const me = this.client.you?.userId || "";
    const ch = "dm:" + [me, peer.userId].sort().join(":");
    if (!this.client.channels.dms.includes(ch)) this.client.channels.dms.push(ch);
    this.renderChannelList();
    this.client.joinDm(ch); // notify server so the peer sees the thread immediately
    this.switchChannel(ch);
  }

  /** Called by game-room pages to bind chat to a room group. */
  setContext(groupId: string) {
    const g = String(groupId).replace(/^group:/, "").slice(0, 64);
    if (!g) return;
    const target = "group:" + g;
    const alreadyBound = this.contextGroup === target;
    this.contextGroup = target;
    if (!this.client.channels.groups.includes(target)) this.client.channels.groups.push(target);
    this.client.joinGroup(target);
    this.banner.removeAttribute("hidden");
    this.banner.textContent = `🎮 已绑定游戏房间群聊: ${g}`;
    // Only switch channels on first bind / when the bound room changes, so repeat
    // room.snapshot pushes don't yank the user away from the chat they're reading.
    if (!alreadyBound) this.switchChannel(target);
  }

  /** Called by game-room pages when the user leaves the room. */
  clearContext() {
    const g = this.contextGroup;
    if (!g) return;
    this.client.leaveGroup(g);
    this.contextGroup = null;
    this.banner.setAttribute("hidden", "");
    this.banner.textContent = "";
    this.client.channels.groups = this.client.channels.groups.filter((x) => x !== g);
    // Don't leave the user stranded on a channel they just left.
    if (this.activeChannel === g) this.switchChannel(PUBLIC_GROUP);
    else this.renderChannelList();
  }

  private flash(text: string) {
    const el = this.root.querySelector(".ln-flash") as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.removeAttribute("hidden");
    setTimeout(() => el.setAttribute("hidden", ""), 2200);
  }
}

const TEMPLATE = `
  <button class="ln-chat-launcher" title="聊天" aria-label="打开聊天">💬</button>
  <div class="ln-chat-panel" hidden>
    <div class="ln-chat-header">
      <span class="ln-dot offline" title="连接状态"></span>
      <span class="ln-title">聊天</span>
      <span class="ln-ctx-banner" hidden></span>
      <span class="ln-spacer"></span>
      <span class="ln-me" title=""></span>
      <button class="ln-close" aria-label="关闭">✕</button>
    </div>
    <div class="ln-flash" hidden></div>
    <div class="ln-chat-body">
      <div class="ln-channels">
        <div class="ch-label">群组</div>
        <div class="ln-groups"></div>
        <div class="ch-label">私聊</div>
        <div class="ln-dms"></div>
        <div class="ch-actions">
          <button class="ln-add-group">+ 群组</button>
        </div>
      </div>
      <div class="ln-main">
        <div class="ln-messages"></div>
        <form class="ln-composer">
          <input class="ln-input" placeholder="说点什么… (Enter 发送)" autocomplete="off" />
          <button type="submit" class="ln-send">发送</button>
        </form>
      </div>
    </div>
  </div>
`;

export { ChatWidget };
