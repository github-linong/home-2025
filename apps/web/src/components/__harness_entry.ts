
  import { WanderSocket, getOrCreateDevUserId } from "../lib/wanderSocket";
  import type { RoomSnapshot, PlayerView, Dir, WorldSize } from "../lib/wanderProtocol";

  const root = document.querySelector(".wander-page") as HTMLElement;
  const canvas = document.getElementById("board") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const elLobby = document.getElementById("lobby")!;
  const elRoom = document.getElementById("room")!;
  const btnPublic = document.getElementById("btn-public") as HTMLButtonElement;
  const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
  const btnJoin = document.getElementById("btn-join") as HTMLButtonElement;
  const inputCode = document.getElementById("input-code") as HTMLInputElement;
  const elCode = document.getElementById("room-code")!;
  const elPublic = document.getElementById("room-public")!;
  const elWorld = document.getElementById("room-world")!;
  const elCount = document.getElementById("room-count")!;
  const elOwner = document.getElementById("room-owner")!;
  const btnShare = document.getElementById("btn-share") as HTMLButtonElement;
  const btnLeave = document.getElementById("btn-leave") as HTMLButtonElement;
  const elConn = document.getElementById("conn")!;
  const elConnText = document.getElementById("conn-text")!;
  const elCoords = document.getElementById("coords")!;
  const elPlayerList = document.getElementById("player-list")!;

  // ---- client state ----
  let socket = new WanderSocket();
  let connected = false;
  let youId: string | null = null;
  let roomId: string | null = null;
  let roomCode = "";
  let publicRoomCode = "";
  let ownerId: string | null = null;
  let world: WorldSize = { w: 1000, h: 1000 };
  let stateVersion = 0;
  let playersById = new Map<string, PlayerView>();
  // Authoritative integer cell per player (from snapshots). The local player's
  // target is advanced optimistically on keypress; we only reconcile to the
  // server when it diverges by >1 cell (a real desync / rejected move), never
  // snap backward — that backward snap was the source of the "jitter".
  let targets = new Map<string, { x: number; y: number; facing: Dir }>();
  // Eased float position per player; the render glides toward `targets` so
  // motion is smooth instead of teleporting one grid cell at a time.
  let renders = new Map<string, { x: number; y: number; facing: Dir }>();
  let localTarget: { x: number; y: number; facing: Dir } | null = null;
  // Currently-held movement directions (stack; last pressed wins). Lets us
  // glide continuously while a key is held instead of discrete step-and-wait.
  let heldDirs: Dir[] = [];

  const STEP_MS = 90; // time to glide across one cell (~11 cells/sec)
  const SPEED = 1 / (STEP_MS / 1000); // cells per second (~10)

  const VIEW = 33; // cells visible across the canvas (odd → player centered)
  // Crisp rendering on high-DPI screens: back the canvas with device pixels but
  // keep all drawing math in CSS pixels via ctx.scale(dpr, dpr).
  const CSS_SIZE = canvas.width; // 660 from the HTML attribute
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(CSS_SIZE * dpr);
  canvas.height = Math.round(CSS_SIZE * dpr);
  canvas.style.width = `${CSS_SIZE}px`;
  canvas.style.height = `${CSS_SIZE}px`;
  ctx.scale(dpr, dpr);
  const SIZE = CSS_SIZE;
  const cell = SIZE / VIEW;

  function setConn(on: boolean, text?: string) {
    connected = on;
    elConn.classList.toggle("online", on);
    elConnText.textContent = text ?? (on ? "已连接" : "未连接");
  }

  function showRoom() {
    elLobby.classList.add("hidden");
    elRoom.classList.remove("hidden");
  }
  function showLobby() {
    elLobby.classList.remove("hidden");
    elRoom.classList.add("hidden");
  }

  function applySnapshot(snap: RoomSnapshot) {
    roomId = snap.roomId;
    roomCode = snap.roomCode;
    ownerId = snap.ownerId;
    world = snap.world;
    stateVersion = snap.stateVersion;
    playersById = new Map(snap.players.map((p) => [p.userId, p]));

    // Rebuild authoritative targets from the snapshot; drop players who left.
    const next = new Map<string, { x: number; y: number; facing: Dir }>();
    for (const p of snap.players) next.set(p.userId, { x: p.x, y: p.y, facing: p.facing });
    targets = next;
    for (const uid of [...renders.keys()]) if (!targets.has(uid)) renders.delete(uid);
    for (const [uid, t] of targets) if (!renders.has(uid)) renders.set(uid, { x: t.x, y: t.y, facing: t.facing });

    // Local player: trust optimistic input; only reconcile to the server on a
    // real (>1 cell) divergence (e.g. server rejected a move / reconnected).
    if (youId && localTarget) {
      const s = targets.get(youId);
      if (s) {
        const div = Math.abs(s.x - localTarget.x) + Math.abs(s.y - localTarget.y);
        if (div > 1) localTarget = { x: s.x, y: s.y, facing: s.facing };
        targets.set(youId, { ...localTarget }); // render follows optimistic target
      }
    }

    elCode.textContent = snap.roomCode;
    elWorld.textContent = `地图 ${snap.world.w}×${snap.world.h}`;
    const online = snap.players.filter((p) => p.status === "active").length;
    elCount.textContent = `${online} 人在线`;
    const amOwner = youId != null && snap.ownerId === youId;
    elOwner.classList.toggle("hidden", !amOwner);
    elPublic.classList.toggle("hidden", !(publicRoomCode && snap.roomCode === publicRoomCode));

    renderPlayerList(snap.players);
  }

  function renderPlayerList(players: PlayerView[]) {
    if (players.length === 0) {
      elPlayerList.innerHTML = `<li class="empty">房间里还没有人</li>`;
      return;
    }
    const sorted = [...players].sort((a, b) => a.displayName.localeCompare(b.displayName));
    elPlayerList.innerHTML = sorted
      .map((p) => {
        const off = p.status === "disconnected" ? " offline" : "";
        const you = p.userId === youId ? " you" : "";
        return `<li class="${off}${you}">
          <span class="swatch" style="background:${p.color}"></span>
          <span class="pname">${escapeHtml(p.displayName)}</span>
          <span class="pcoord">${p.x},${p.y}</span>
        </li>`;
      })
      .join("");
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
    );
  }

  // ---- canvas rendering ----
  function camTopLeft() {
    const me = youId ? renders.get(youId) : undefined;
    const cx = me ? me.x : world.w / 2;
    const cy = me ? me.y : world.h / 2;
    // Float camera (no integer floor) so the world scrolls smoothly as the
    // eased player glides — an integer camera would jump a whole cell every
    // half-step, which reads as a stutter.
    return { camX: cx - VIEW / 2, camY: cy - VIEW / 2 };
  }

  let lastT = 0;
  function stepRenders(dtSec: number) {
    for (const [uid, t] of targets) {
      let r = renders.get(uid);
      if (!r) {
        renders.set(uid, { x: t.x, y: t.y, facing: t.facing });
        continue;
      }
      const dx = t.x - r.x;
      const dy = t.y - r.y;
      if (dx === 0 && dy === 0) {
        r.facing = t.facing;
        continue;
      }
      const maxStep = SPEED * dtSec;
      if (Math.abs(dx) >= Math.abs(dy)) {
        r.x += Math.max(-maxStep, Math.min(maxStep, dx));
      } else {
        r.y += Math.max(-maxStep, Math.min(maxStep, dy));
      }
      r.facing = t.facing;
    }
  }

  function draw(ts?: number) {
    const dtSec = lastT && ts ? Math.min(0.05, (ts - lastT) / 1000) : 0;
    lastT = ts ?? 0;
    stepRenders(dtSec);
    pumpHeld();

    ctx.clearRect(0, 0, SIZE, SIZE);
    const { camX, camY } = camTopLeft();
    const sx0 = Math.floor(camX);
    const sy0 = Math.floor(camY);

    // World playfield fill + boundary (drawn in world space so they scroll
    // smoothly into view; the blue edge makes the map limits legible).
    const bx = (0 - camX) * cell;
    const by = (0 - camY) * cell;
    const bw = world.w * cell;
    const bh = world.h * cell;
    ctx.fillStyle = "#eef1f6";
    ctx.fillRect(bx, by, bw, bh);

    ctx.lineWidth = 1;
    for (let ix = 0; ix <= VIEW + 1; ix += 1) {
      const wx = sx0 + ix;
      const inWorld = wx >= 0 && wx < world.w;
      ctx.strokeStyle = !inWorld
        ? "rgba(0,0,0,0.04)"
        : wx % 5 === 0
          ? "rgba(0,0,0,0.14)"
          : "rgba(0,0,0,0.05)";
      const sx = (wx - camX) * cell;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, SIZE);
      ctx.stroke();
    }
    for (let iy = 0; iy <= VIEW + 1; iy += 1) {
      const wy = sy0 + iy;
      const inWorld = wy >= 0 && wy < world.h;
      ctx.strokeStyle = !inWorld
        ? "rgba(0,0,0,0.04)"
        : wy % 5 === 0
          ? "rgba(0,0,0,0.14)"
          : "rgba(0,0,0,0.05)";
      const sy = (wy - camY) * cell;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(SIZE, sy);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(43,108,255,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    // Players — drawn at their eased render position (smooth glide).
    for (const [uid, t] of targets) {
      const r = renders.get(uid) ?? t;
      const p = playersById.get(uid);
      const sx = (r.x - camX + 0.5) * cell;
      const sy = (r.y - camY + 0.5) * cell;
      if (sx < -cell || sy < -cell || sx > SIZE + cell || sy > SIZE + cell) continue;
      const rad = cell * 0.34;
      const color = p ? p.color : "#888";
      const offline = !!p && p.status === "disconnected";

      // soft glow body
      ctx.save();
      ctx.globalAlpha = offline ? 0.4 : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = offline ? 0 : 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // facing notch
      const d = DIR_VEC[r.facing] ?? DIR_VEC.down;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + d.x * rad, sy + d.y * rad);
      ctx.stroke();

      // local-player ring
      if (uid === youId) {
        ctx.strokeStyle = "#2b6cff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, rad + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // name pill
      const label = p ? p.displayName : uid;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      const pw = tw + 10;
      const ph = 15;
      const px = sx - pw / 2;
      const py = sy - rad - 18;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      roundRect(ctx, px, py, pw, ph, 7);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillText(label, sx, py + ph / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";

    // coords HUD (grid coords, tracked on the optimistic target)
    if (localTarget) {
      elCoords.textContent = `x ${localTarget.x} · y ${localTarget.y} · 地图 ${world.w}×${world.h}`;
    } else {
      elCoords.textContent = `x — · y —`;
    }

    // debug hook for acceptance tests (harmless in prod)
    if (youId) {
      const me = renders.get(youId);
      (window as unknown as { __wanderDebug: unknown }).__wanderDebug = {
        youId,
        renderX: me ? me.x : null,
        renderY: me ? me.y : null,
        targetX: localTarget ? localTarget.x : null,
        targetY: localTarget ? localTarget.y : null,
        online: playersById.size,
      };
    }

    requestAnimationFrame(draw);
  }

  const DIR_VEC: Record<Dir, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  // Rounded-rect path helper (uses native roundRect when available).
  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (typeof (c as unknown as { roundRect?: unknown }).roundRect === "function") {
      c.beginPath();
      (c as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, r);
      return;
    }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---- input ----
  const KEY_DIR: Record<string, Dir> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right",
  };

  // Advance the local player one grid cell in `dir`. We only command the next
  // step once the eased render has *essentially* arrived at the current target
  // (ahead ≤ 0.12 cells), so holding a key produces seamless, gap-free gliding
  // instead of the old step→freeze→step cadence.
  function step(dir: Dir) {
    if (!roomId || !connected || !youId || !localTarget) return;
    const r = renders.get(youId);
    if (r) {
      const ahead = Math.abs(localTarget.x - r.x) + Math.abs(localTarget.y - r.y);
      if (ahead > 0.12) return;
    }
    const v = DIR_VEC[dir];
    const nx = Math.max(0, Math.min(world.w - 1, localTarget.x + v.x));
    const ny = Math.max(0, Math.min(world.h - 1, localTarget.y + v.y));
    if (nx === localTarget.x && ny === localTarget.y) return; // wall → no-op
    localTarget = { x: nx, y: ny, facing: dir };
    // Optimistic: drive the render target immediately. The server snapshot that
    // follows agrees (divergence ≤ 1) and never snaps us backward — that
    // backward snap was the original source of the jitter.
    targets.set(youId, { ...localTarget });
    socket.move(dir);
  }

  // Pump continuous motion from currently-held keys (called each animation
  // frame). `activeDir` is the most-recently pressed direction.
  function activeDir(): Dir | null {
    return heldDirs.length ? heldDirs[heldDirs.length - 1] : null;
  }
  function pumpHeld() {
    const d = activeDir();
    if (d) step(d);
  }

  function pressDir(dir: Dir) {
    if (!heldDirs.includes(dir)) heldDirs.push(dir);
    step(dir); // immediate first response when the key goes down
  }
  function releaseDir(dir: Dir) {
    heldDirs = heldDirs.filter((d) => d !== dir);
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (document.activeElement === inputCode) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        if (!e.repeat) pressDir(dir);
      }
    },
    { passive: false },
  );
  window.addEventListener("keyup", (e) => {
    const dir = KEY_DIR[e.key];
    if (dir) releaseDir(dir);
  });
  // Drop held keys if the tab loses focus, so movement doesn't "stick".
  window.addEventListener("blur", () => {
    heldDirs = [];
  });

  // Touch: drag on the canvas to move (dominant-axis single step, re-anchored
  // as you keep dragging so you can wander continuously on a phone/tablet).
  let touchAnchor: { x: number; y: number } | null = null;
  const TOUCH_STEP = 16;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchAnchor = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!touchAnchor) return;
      const t = e.touches[0];
      const dx = t.clientX - touchAnchor.x;
      const dy = t.clientY - touchAnchor.y;
      if (Math.abs(dx) < TOUCH_STEP && Math.abs(dy) < TOUCH_STEP) return;
      e.preventDefault();
      if (Math.abs(dx) > Math.abs(dy)) step(dx > 0 ? "right" : "left");
      else step(dy > 0 ? "down" : "up");
      touchAnchor = { x: t.clientX, y: t.clientY }; // re-anchor for continuous drag
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchend",
    () => {
      touchAnchor = null;
    },
    { passive: true },
  );

  // ---- socket wiring ----
  async function boot() {
    getOrCreateDevUserId();
    setConn(false, "连接中…");
    try {
      await socket.connect();
    } catch (err) {
      setConn(false, (err as Error).message || "连接失败");
      return;
    }
    setConn(true);
    publicRoomCode = socket.publicRoomCode ?? "";
    socket.onMessage((msg) => {
      if (msg.type === "room.snapshot") applySnapshot(msg);
      else if (msg.type === "room.create.ok") {
        youId = msg.you;
        applySnapshot({
          type: "room.snapshot",
          protocolVersion: 1,
          roomId: msg.roomId,
          roomCode: msg.roomCode,
          ownerId: msg.ownerId,
          world: msg.world,
          stateVersion: msg.stateVersion,
          players: msg.players,
        });
        localTarget = { x: msg.player.x, y: msg.player.y, facing: msg.player.facing };
        renders.set(youId, { x: msg.player.x, y: msg.player.y, facing: msg.player.facing });
        targets.set(youId, { ...localTarget });
        showRoom();
      } else if (msg.type === "room.join.ok") {
        youId = msg.you;
        applySnapshot({
          type: "room.snapshot",
          protocolVersion: 1,
          roomId: msg.roomId,
          roomCode: msg.roomCode,
          ownerId: msg.ownerId,
          world: msg.world,
          stateVersion: msg.stateVersion,
          players: msg.players,
        });
        localTarget = { x: msg.player.x, y: msg.player.y, facing: msg.player.facing };
        renders.set(youId, { x: msg.player.x, y: msg.player.y, facing: msg.player.facing });
        targets.set(youId, { ...localTarget });
        showRoom();
      } else if (msg.type === "room.leave.ok") {
        roomId = null;
        youId = null;
        playersById = new Map();
        localTarget = null;
        showLobby();
      } else if (msg.type === "world.resized") {
        world = msg.world;
        stateVersion = msg.stateVersion;
        elWorld.textContent = `地图 ${msg.world.w}×${msg.world.h}`;
      } else if (msg.type === "game.error") {
        if (msg.error.code === "AUTH_REQUIRED") {
          setConn(false, "请先登录");
        } else {
          flashHint(msg.error.message);
        }
      } else if (msg.type === "session.kicked") {
        setConn(false, "已被断开：" + msg.reason);
        showLobby();
      }
    });
    socket.onClose(() => setConn(false, "连接断开"));

    // Default landing: if no ?room=CODE is given, drop straight into the
    // public room so strangers immediately see each other. Otherwise join the
    // shared private room from the URL.
    const auto = (root.dataset.roomCode || "").trim().toUpperCase();
    if (auto) {
      inputCode.value = auto;
      socket.joinRoom(auto);
    } else {
      socket.joinPublicRoom();
    }
  }

  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  function flashHint(text: string) {
    const hint = document.getElementById("lobby-hint");
    if (!hint) return;
    const prev = hint.textContent;
    hint.textContent = text;
    hint.style.color = "#c0392b";
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hint.textContent = prev;
      hint.style.color = "";
    }, 2500);
  }

  // ---- buttons ----
  btnPublic.addEventListener("click", () => {
    if (!connected) return;
    socket.joinPublicRoom();
  });
  btnCreate.addEventListener("click", () => {
    if (!connected) return;
    socket.createRoom();
  });
  btnJoin.addEventListener("click", () => {
    if (!connected) return;
    const code = inputCode.value.trim().toUpperCase();
    if (!code) return;
    socket.joinRoom(code);
  });
  inputCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnJoin.click();
  });
  btnLeave.addEventListener("click", () => socket.leaveRoom());
  btnShare.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      flashHint("邀请链接已复制");
    } catch {
      prompt("复制此链接分享给朋友：", url);
    }
  });
  requestAnimationFrame(draw);
  boot();
