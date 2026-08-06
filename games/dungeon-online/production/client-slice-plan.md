# Epic A — Godot 4 Client Slice: Architecture & Plan

**Project:** 余烬小队 (Embers Squad) — 2D co-op online dungeon rogue-like
**Target:** Godot 4, browser export, authoritative-server netcode, 2–4 players
**Scope of this doc:** Epic A first verifiable chunk — client scaffold + connection/protocol layer (GDScript) + a headless Node protocol-conformance test. Also covers design gap **O-E7** (client reconnect interpolation) and the **D / telegraph visual**.

---

## 1. Build-sandbox constraints (read first)

This plan was produced in a sandbox with **no Godot binary**. Consequences:

| Concern | Status |
|---|---|
| GDScript files (`*.gd`, `project.godot`, `main.tscn`) | **Delivered for review only** — cannot compile/run here. Treated as code delivery + review-level verification. |
| Headless Node/TS conformance test (`client-protocol-conformance.mjs`) | **Runs for real** — opens a real WebSocket to the authoritative dungeon-server. This is the one *verifiable* deliverable. |
| `sim-core` / `dungeon-server` source | **Not modified.** Only read (to mirror the protocol exactly) and added-to (new client project + standalone test). |

Three environment facts discovered while building the conformance test (all worked around without touching server source):

1. **Subprocess server WS handshake stalls.** Spawning `node src/server.ts` as a child answers HTTP `/healthz` but the WebSocket upgrade never completes (`CONNECTING` forever). The **in-process** `buildServer()` + `listen(0)` used by the green 28-count `integration.test.ts` works perfectly, so the conformance test reuses that exact harness (real server, ephemeral port, `DEV_SKIP_AUTH`). Process topology differs; protocol is identical. Re-validate in CI where subprocess spawn works.
2. **`session.ready` is timing-sensitive headlessly.** The server pushes `session.ready` immediately post-auth, but that frame is not reliably delivered to a fresh client (the server's `conn.send` readyState guard drops it pre-client-message). The authenticated `room.create → room.create.ok` round-trip *is* reliable and **proves the session handshake + dev auth succeeded** (an unauthenticated socket is closed with `AUTH_REQUIRED` before processing any message). The test asserts auth via `room.create.ok` and captures `session.ready` best-effort.
3. **`config.num("PORT", 3010)` rejects `0`.** `0 > 0` is false, so `PORT=0` silently falls back to 3010. The test reserves a genuinely-free ephemeral port via `net.listen(0)` and passes it to the server (with a spawn retry; unused for the in-process path).

---

## 2. Client architecture (Godot 4)

```
apps/client/
├── project.godot            # Godot 4 project; autoload "Connection" = ConnectionManager.gd
├── main.tscn                # entry scene: root Node2D "GameWorld" (GameWorld.gd)
├── ConnectionManager.gd     # autoload singleton — ws + protocol (mirrors gateway/protocol/room-service)
├── GameWorld.gd             # renders entities from snapshots; 100ms interpolation buffer (O-E7)
└── EntityView.gd            # one entity's visual: position/hp/status + D/telegraph hook
```

### 2.1 `ConnectionManager` (autoload `Connection`)
Single networking authority. Responsibilities, each a faithful mirror of the server:

- **Handshake:** open `ws://<host>/ws/dungeon?devUserId=<id>`. There is **no `session.connect` message** in `protocol.ts` — the ws-open + `devUserId` query *is* the session handshake; the server replies `session.ready`. (Client also listens for `session.ready`.)
- **Control plane (JSON):** `room.create` / `room.join` / `game.start` / `session.reconnect` / `sync.request`, with replies carrying `requestId`. Captures `roomId`, `seatIndex`, `reconnectToken`, `runId`.
- **Input uplink (data plane):** `enqueue_input(action, dir, target, param)` builds an `InputCmd` (`seq`/`tick`/`action`/`dir`/`target`/`param`) and sends `input.cmd`. `seq` is monotonic per connection.
- **Snapshot downlink:** receives `world.snap` (binary; currently JSON-in-Buffer, R1 placeholder) and `room.snapshot` (control), re-emitted as signals `world_snapshot_received` / `room_snapshot_received`.
- **O-E7 reconnect:** on `ws` close, `_capture_personal_state()` freezes the last local `PersonalState`, then `reconnect()` reopens the socket; on re-open it sends `session.reconnect` with the prior `reconnectToken` + `roomId` + `seatIndex` + `runId`. Server replies `session.reconnect.ok` and re-broadcasts a full `world.snap`; client resumes interpolation.

### 2.2 `GameWorld` (main scene root)
- Connects to `Connection.world_snapshot_received` in `_ready()`.
- Maintains a **100ms interpolation buffer** (array of `{recv_ms, snapshot}`). Each frame it picks the two snapshots surrounding `now − 100ms`, computes `alpha`, and lerps each entity's position. Remote entities glide between 30Hz server snapshots (O-E7 client-side smoothing).
- Upserts an `EntityView` per entity id; retires views for departed entities.
- Feeds the local player's entity to `Connection.note_local_entity()` so `PersonalState` can be frozen on disconnect.

### 2.3 `EntityView` (per entity)
- Renders interpolated position, hp bar (`hp/maxHp`), and a status tint from the `EntityStatus` bitmask (DOWNED/OUT/IFRAME).
- **D / telegraph visual hook:** `_show_telegraph(tg)` draws a danger cue from `telegraph.shape`/`radius`. **Wired but currently inactive** — see §4 gap.

### 2.4 Data flow
```
server (authoritative, 30Hz) ──world.snap──▶ ConnectionManager ──signal──▶ GameWorld
        ▲                                                                       │ (interp 100ms)
        │ input.cmd (InputCmd)                                                  ▼
        └──────────────── ConnectionManager ◀── player input (MOVE/ATTACK/DODGE/SKILL)
```

---

## 3. Verifiable vs NOT

| Artifact | Verifiable here? | How |
|---|---|---|
| `client-protocol-conformance.mjs` | ✅ **YES** | Runs against real dungeon-server; **8/8 assertions PASS**. |
| GDScript `*.gd`, `project.godot`, `main.tscn` | ❌ NO | No Godot binary. Review-only. Protocol mirrored exactly from `gateway.ts`/`protocol.ts`/`room-service.ts`/`config.ts`/`types.ts`/`world.ts`. |

The conformance test asserts, against the real server:
- **A1** session handshake + dev auth → `room.create.ok` (captures `reconnectToken`).
- **A2** `game.start` → `game.start.ok` (30Hz authority live).
- **A3** `input.cmd` uplink accepted (no `game.error`).
- **A4** downlink `world.snap` (binary `WorldSnapshot`, tick + entities).
- **A5** control-plane `room.snapshot` broadcast received.
- **A6** a MOVE `InputCmd` actually moves the local entity in a later snapshot (input consumed by authoritative sim).
- **A7** force ws close → `markDisconnected`; reopen + `session.reconnect` with prior token → `session.reconnect.ok` (O-E7 path).
- **A8** after reconnect, a fresh `world.snap` arrives on the new connection (D8/O-E7 resume).

Run manually (does not touch the 28-count vitest suite):
```
node apps/dungeon-server/tests/integration/client-protocol-conformance.mjs
```

---

## 4. Open client-sync gaps (must close before A3 polish)

These are **server-side serialization** gaps found while mirroring `world.ts`/`types.ts`. The client hooks exist but cannot fire until the server populates the fields.

1. **E8 shield / taunt / skill state not in the snapshot.** `EntityState` (sim-core `types.ts`) has no field for `shieldUntilTick` / `shieldReduction` / `tauntUntilTick` / `activeSkill`. The authoritative `Actor` in `world.ts` *does* hold them, but `world.snapshot()` never serializes them. **Client impact:** `EntityView` cannot render shield links (减伤), taunt auras (吸引敌火), or active-skill indicators. **Fix:** extend `EntityState` with `shieldUntilTick?`, `shieldReduction?`, `tauntUntilTick?`, `activeSkill?` and populate them in `world.snapshot()` (closed by E8 server work). This is a **server/sim-core change**, not a client change.
2. **`telegraph` declared but never populated.** `EntityState.telegraph?: TelegraphState` exists, but `world.snapshot()` omits it (only `rescue` is added for downed players). **Client impact:** the **D / telegraph visual** cannot be driven by server attack-intent data yet — `_show_telegraph()` is dead code until `world.snapshot()` fills `entity.telegraph` (from `Actor.telegraph: AttackWindup`). Close alongside the real binary-diff snapshot (R1) or as a targeted E5/E6 follow-up.
3. **R1 real binary diff.** Data plane is JSON encoded into a `Buffer` (placeholder). `ConnectionManager` decodes it as UTF-8 text; swap to a compact binary decoder when the server ships true diffs. No client behavior change needed beyond the decoder.
4. **`session.ready` reliable delivery.** Immediate post-handshake push is timing-sensitive (see §1.2). Client must not depend on it for flow control — it only triggers UI; auth is proven by the first successful authenticated request. If the server later needs `session.ready` for client gating, harden the server send (e.g., flush after open).

---

## 5. Phased plan

- **A1 (this chunk — DONE scaffold + protocol + conformance):** `apps/client/` project, `ConnectionManager`/`GameWorld`/`EntityView`, and the passing headless conformance test. Proves the full uplink+downlink + O-E7 reconnect contract.
- **A2 (interpolation polish):** tune the 100ms buffer; handle packet loss / snapshot gaps; reconcile local-player input (S4.3 `lastProcessedSeq`) so the local player isn't interpolated against their own stale snapshot; add extrapolation cap. Requires the real binary snapshot (R1) for bandwidth validation.
- **A3 (telegraph + skill visuals):** once §4 gaps #1/#2 are closed server-side, render D/telegraph warnings, shield/taunt auras, and active-skill cues from the populated `EntityState`. Add the lobby/UI layer (room code, class pick, reconnect banner using `reconnectToken`/`PersonalState`).

---

## 6. Files created

- `apps/client/project.godot`
- `apps/client/main.tscn`
- `apps/client/ConnectionManager.gd`
- `apps/client/GameWorld.gd`
- `apps/client/EntityView.gd`
- `apps/dungeon-server/tests/integration/client-protocol-conformance.mjs`
- `production/client-slice-plan.md` (this file)

**No server/sim-core source was modified. Nothing was committed.**
