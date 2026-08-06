# A2 + A3 Client Note — Godot interpolation polish + telegraph / co-op-skill visuals

**Epic:** A2 (interpolation + input reconciliation) + A3 (telegraph & co-op skill visuals)
**Target:** `games/dungeon-online/apps/client/` (Godot 4 / GDScript, browser export)
**Author:** engineering-lead (主程序 / client architecture)
**Status:** REVIEW-ONLY GDScript + VERIFIED protocol conformance (see below)

---

## 0. Hard limitation (read first)

**This sandbox has NO Godot binary. GDScript was NOT executed and CANNOT be executed here.**
Every `.gd` change below is **delivered for review only**. There is exactly one real-run
verification gate available, and it runs the **Node/TS server**, not the client:

```
node --experimental-strip-types \
  games/dungeon-online/apps/dungeon-server/tests/integration/client-protocol-conformance.mjs
```

That test spins up the **real** `dungeon-server` in-process and drives a real WebSocket
client through the full protocol (auth → run start → input uplink → downlink snapshot →
input consumed → reconnect → resume). It proves the **protocol contract** is intact. It
does **not** import, compile, or run any GDScript. So it cannot validate rendering,
interpolation smoothness, prediction correctness, or "no stale overlays" — those require a
real Godot run (Section 5).

What a real Godot run would need to confirm (not verifiable here):
- Telegraph grows + intensifies correctly and is positioned on the attacker.
- Shield ring / taunt marker / cast bar appear and disappear exactly when the snapshot
  fields say so (no leftover overlays after the window expires).
- Local-player movement feels responsive (prediction) and corrections ease in over a few
  frames rather than snapping or rubber-banding.
- Remote players glide smoothly between 30Hz snapshots at the 100ms buffer.

---

## 1. Files changed

| File | Change | Classification |
|------|--------|----------------|
| `apps/client/GameWorld.gd` | A2: confirm/refine 100ms buffer; add local-player prediction + reconciliation (`lastProcessedSeq` → drop acked, re-apply unacked on server correction, exponential smoothing). | **review-only (GDScript)** |
| `apps/client/EntityView.gd` | A3: `_show_telegraph` (color/shape/radius, fill grows + intensifies `startTick→applyTick`); shield overlay, taunt marker, brief cast bar; all cleared/updated every snapshot tick. | **review-only (GDScript)** |
| `apps/client/ConnectionManager.gd` | Supporting fix (pre-existing blocker): (1) route untyped data-plane `world.snap` frames to `world_snapshot_received`; (2) emit `local_input_enqueued` signal for reconciliation capture. | **review-only (GDScript)** |

No server / sim-core files were modified. No new files were added (the two ConnectionManager
edits were necessary to make A2/A3 actually receive data and capture inputs — see §3/C2).

---

## 2. A2 — interpolation & input reconciliation (GameWorld.gd)

- **100ms buffer (confirmed/refined).** `INTERP_DELAY_MS = 100` retained. Each received
  snapshot is buffered with its `recv_ms`; `_process` picks the two snapshots surrounding
  `now - 100ms` and lerps entity positions. Added bounded pruning (`SNAPSHOT_LIFETIME_MS`
  + hard cap of 32) so the buffer cannot grow unbounded.
- **Local-player reconciliation (Discipline B: render-only).**
  - `_unacked_inputs` holds local MOVE inputs `{seq, dir}` captured via the new
    `Connection.local_input_enqueued` signal.
  - On every snapshot, `_reconcile_local` reads `lastProcessedSeq[String(seat)]` (JSON keys
    are strings) and **drops acked inputs** (`seq <= serverSeq`).
  - It then **re-applies the still-unacked inputs on top of the latest server correction**
    to build the predicted position. Remote players are **never** rolled back — only the
    local entity is predicted; remote entities keep using the interpolation buffer.
  - Per-frame (`_update_local_prediction`): prediction advances by the current move dir
    scaled to elapsed sim ticks (`delta * TICK_RATE`); the drawn position eases toward the
    prediction with exponential smoothing (`1 - exp(-LOCAL_CORRECTION_RATE * delta)`). This
    is the "converge over a few frames instead of snapping" requirement.
- **render-tick estimate.** Interpolated `tick` from the surrounding snapshot pair is passed
  to `EntityView.apply_state` so telegraph/skill timing lines up with the interpolated pose.

---

## 3. A3 — telegraph & co-op skill visuals (EntityView.gd)

- **Telegraph (`_show_telegraph`).** Consumes `snapshot.telegraph`:
  - `color` → danger color (0 = DANGER red; map extensible).
  - `shape` → geometry: RING / AOE_FILL → circle, CONE → triangle, LINE → rect.
  - `radius` → geometry radius.
  - **Grows + intensifies**: `progress = (render_tick - startTick) / (applyTick - startTick)`;
    the whole indicator scales `0.35 → 1.0` and fill/outline alpha ramp up, so the danger
    zone visibly expands and brightens before the hit resolves (readable tell).
- **Co-op skill hooks (data-driven, never authored locally):**
  - `shieldUntilTick > render_tick` → cyan ring + soft fill on the shielded player.
  - `tauntUntilTick > render_tick` → yellow triangle marker above the taunting player.
  - `activeSkill != null` → brief cast bar; re-triggers (600ms) whenever the skill id changes.
- **No stale overlays.** `apply_state` runs every render frame with the freshest interpolated
  entity state and explicitly hides each visual when its snapshot field is absent/expired
  (`_hide_telegraph` on missing `telegraph`; shield/taunt hidden when window passed; cast bar
  hidden after its timer). REVIVE_BOOST (instant) produces only the cast-bar flash via
  `activeSkill`, with no persistent overlay — consistent with the brief's three named hooks.

---

## 4. Verified result — protocol conformance (the one real-run gate)

Command:
```
node --experimental-strip-types \
  games/dungeon-online/apps/dungeon-server/tests/integration/client-protocol-conformance.mjs
```

Output (verbatim):
```
=== Epic A client protocol conformance (headless, real ws) ===

server up on ephemeral port 60645 (DEV_SKIP_AUTH=true)

  [PASS] A1 session handshake + auth → room.create.ok (captured reconnectToken) — roomId=room_699223872766f9f9 seatIndex=0 tokenLen=64 sessionReady=false
  [PASS] A2 game.start → game.start.ok (30Hz authority live) — runId=run_bb601576b2733a45 tick=0
  [PASS] A3 input.cmd uplink accepted (no game.error) — ok
  [PASS] A4 downlink world.snap received (tick+entities) — tick=1 entities=20 localOwner=0
  [PASS] A5 control-plane room.snapshot broadcast received
  [PASS] A6 input consumed → local entity moved under authoritative sim — beforeX=1088 afterX=1106.666666666667
  [PASS] A7 session.reconnect → session.reconnect.ok (O-E7 resume accepted) — type=session.reconnect.ok snapshotTick=32 sessionReady=false
  [PASS] A8 resume → fresh world.snap on reconnected client (D8/O-E7) — tick=33 entities=20

=== SUMMARY: 8/8 assertions passed ===
RESULT: PASS — client protocol conforms to dungeon-server contract.
```

**Interpretation:** PASS / 8 / 8. No protocol-layer regression. (The test imports the
server, not the GDScript client, so this gate confirms the **server contract is unchanged**
by these client edits — it is not evidence that the GDScript renders correctly; see §0.)

The snapshot gap is confirmed **closed on the wire**: A4 shows `entities=20` carrying the
full `EntityState`, and the server's `world.snapshot()` now serializes `telegraph`,
`shieldUntilTick`, `shieldReduction`, `tauntUntilTick`, `activeSkill` (verified in
`packages/sim-core/src/world.ts`). The client reads exactly those keys.

---

## 5. Architecture / design concerns (for the design-strategist / orchestrator)

**C1 — Client prediction constants are hand-mirrored from sim-core (golden-alignment risk).**
`GameWorld.gd` hard-codes `LOCAL_CLASS_MOVE_SPEED = [140,185,165,170]` and `TICK_RATE=30`,
mirroring `sim-core` `CLASS_BASE.moveSpeed` + `PLAYER_CLASSES` order. If those balance
numbers change server-side, prediction desyncs (rubber-banding) until the client is updated.
The unacked-replay also uses a heuristic `CLIENT_INPUTS_PER_SERVER_TICK = 2.0` (≈60fps input
vs 30Hz sim) rather than replaying the server's exact per-tick latest-pending application.
→ **Design question:** should `CLASS_BASE` / `TICK_RATE` / `PLAYER_CLASSES` be the single
source (e.g., a shared JSON or codegen into the client) so D9 golden alignment is automatic?

**C2 — CRITICAL: data-plane `world.snap` has no `type` discriminator (R1 placeholder).**
`connection-registry.serialize` sends the raw `WorldSnapshot` JSON (`Buffer.from(JSON…)`)
with no `type` field, so the original `ConnectionManager` dispatch-by-`msg.get("type")` would
**drop 100% of snapshots** — the client would never render. I fixed the client to route any
untyped frame that looks like a `WorldSnapshot` (`tick` number + `entities` array) to
`world_snapshot_received`. This is fragile (any future message sharing that shape would be
misrouted). → **Design question:** should the server eventually tag the data plane
(`{type:"world.snap", payload}` or a binary framing tag) for robustness, or keep the
shape-based client routing? The client fix is a stopgap until that decision lands.

**C3 — Telegraph shape set is 4, brief says "circle/rect".**
The wire `telegraph.shape` is `RING / AOE_FILL / CONE / LINE` (4 values). The brief phrased
it as "circle/rect". I implemented all four (CONE→triangle, LINE→rect) so the client matches
the server's `ENEMY_PROTOTYPES` shapes (grunt=RING, elite=AOE_FILL, boss=CONE). → **Confirm**
all four shapes are intended for client rendering; if only circle/rect are wanted, the boss
CONE tell would need a design decision.

**C4 — `activeSkill` persistence vs "brief" cast VFX.**
The server keeps `activeSkill` set to the last cast id until the next cast, so it is present
in snapshots continuously. The client shows the cast bar only for `CAST_VFX_MS` after the id
*changes* (re-triggers on each new cast). REVIVE_BOOST (instant) yields only that flash, no
persistent overlay. → **Confirm** this "flash-on-cast" behavior matches intent; if a
persistent "currently buffed" indicator is wanted, that needs a new snapshot field/design.

**C5 — Minor: seat change on reconnect.** `_local_class_ms` is derived once from
`Connection.seat_index` when the local entity is first detected. A reconnect that lands the
player on a *different* seat would leave a stale class speed until the next full re-detect.
Low risk in the current 2–4 player flow; flagging for completeness.

---

## 6. Recommendation for next step (real Godot run)

Before merging A2/A3, a Godot 4 editor / browser export run should:
1. Import the client, connect to a live `dungeon-server` (DEV_SKIP_AUTH), and confirm entities
   render and glide (validates the §3/C2 routing fix end-to-end).
2. Walk a player into an enemy windup and confirm the telegraph reads (grow + intensify).
3. Cast SHIELD_ALLY / TAUNT and confirm shield ring + taunt marker; cast any co-op skill and
   confirm the brief cast bar; verify overlays clear when windows expire.
  4. Drive the local player and confirm responsive movement with smooth (non-snapping)
     corrections under simulated latency.

---

## 7. A2+A3 Polish — N2 / M1 / M2 closure (post design-review)

**Status of the 3 must-fix-before-playtest items: DONE. Server changes verified (Node); all
GDScript changes are review-only (no Godot binary in sandbox).**

### N2 — directional telegraph orientation field (REAL correctness gap, closed)
- `packages/sim-core/src/types.ts` `TelegraphState`: added `readonly dir?: Vec2` (normalized
  attacker facing, world coords x-right/y-down). Radial shapes omit it.
- `packages/sim-core/src/world.ts` `snapshot()`: directional shapes (CONE/LINE) now carry `dir`,
  computed from the attacking actor's `Actor.dir` (0-7) via a new `dirToVector` helper
  (8-dir → unit vector; 0=E/+x, clockwise, screen y-down). RING/AOE_FILL omit `dir`
  (`undefined` → `JSON.stringify` drops the key, so the deterministic golden hash is unaffected).
- Client `apps/client/EntityView.gd` `_show_telegraph`: CONE triangle apex / LINE rect long-axis
  rotate to `dir` via `_telegraph.rotation = atan2(dir.y, dir.x)`; RING/AOE_FILL ignore `dir`.
  Geometry stays +x-anchored; orientation is applied by node rotation. **Review-only (no Godot).**

**Server-side proof (real Node run):** forced CONE windup → `{"shape":2,...,"dir":{"x":0,"y":1}}`;
forced RING/AOE_FILL windup → no `dir` key. Confirms directional fill + radial omission.

### M1 — telegraph readability (client-only, EntityView.gd; review-only)
- Decoupled boundary from charge: a FIXED full-extent OUTLINE is always visible at full radius
  with a low constant alpha (0.32), so the true danger radius is readable from frame 1
  (fixes the "whole indicator grows 0.35→1.0" weakness vs art-bible §7 / accessibility #4).
- The FILL now GROWS (scale 0.35→1.0) INSIDE the fixed outline → "charge toward applyTick".
- End-brightening: outline alpha bumps 0.32→0.95 as `progress→1` (last 25% of the windup).
- Edge pulse: the whole indicator briefly expands (~6%) in the last ~5 ticks (≈150ms @30Hz)
  before `applyTick`, via a `sin` ramp on `_telegraph.scale`.
- **M1 point 4 (from review) additionally applied:** DANGER red aligned to art-bible §3
  `#E5484D` (0.898, 0.282, 0.302) — was off-palette (1.0, 0.2, 0.2). Flagged here for visibility.
- All driven by snapshot fields (shape/color/radius/startTick/applyTick/dir) — Discipline B kept,
  no local authoring of the tell.

### M2 — palette violations (client-only, EntityView.gd; review-only)
- **Shield ring/fill:** hard-coded off-palette cyan `(0.4,0.85,1.0)` → now the SHIELDED ALLY's
  **faction color** (`ownerId % 4 → FACTION_TINTS`, re-derived every frame from snapshot).
  Matches art-bible §3 + ⑨ §7 ("护盾链接 = 目标盟友静态护盾环（自身阵营色）"). GOLD fallback
  if `ownerId` absent (defensive; shields only land on players).
- **Cast bar:** hard-coded off-palette periwinkle `(0.9,0.75,1.0)` → **EMBER** `#E8923C`
  (0.910, 0.573, 0.235) — art-bible §3 "EMBER=协作技光效". Chosen over per-skill coloring for
  this pass (cleaner, single on-palette semantic); per-skill tint is a future option.
- **Taunt** yellow triangle `(1.0,0.85,0.2)` ≈ GOLD left UNCHANGED (correct per review; GOLD=co-op).

### Verification (the one real-run gate + server suite)
- `packages/sim-core` golden + unit: **59/59 pass, GOLDEN_WORLD_HASH UNCHANGED**
  (`67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`) — goldens have no
  active telegraph, and radial shapes omit `dir`.
- `apps/dungeon-server` suite: **28/28 pass**; `client-protocol-conformance.mjs`: **8/8 PASS**.
  Adding `dir` did not alter the client↔server contract.
- **GDScript was NOT executed** (no Godot binary in sandbox). All `EntityView.gd` changes are
  delivered for review only — rendering/orientation/M1-M2 visuals require a real Godot run
  (see §0/§5) to confirm.

### Palette values chosen (for art-director ratification)
| Element | Before (off-palette) | After (on-palette, chosen) | Source |
|---|---|---|---|
| Telegraph DANGER | (1.0, 0.2, 0.2) | (0.898, 0.282, 0.302) | art-bible §3 `#E5484D` |
| Shield ring/fill | (0.4, 0.85, 1.0) cyan | shielded ally faction `ownerId%4` | art-bible §3 faction palette |
| Cast bar | (0.9, 0.75, 1.0) periwinkle | (0.910, 0.573, 0.235) EMBER | art-bible §3 `#E8923C` |
| Taunt marker | (1.0, 0.85, 0.2) | unchanged (GOLD, correct) | art-bible §3 `#F4C95D` |
| Faction tints | — | P1 (0.298,0.710,0.961) / P2 (0.608,0.482,0.910) / P3 (0.910,0.435,0.690) / P4 (0.435,0.839,0.541) | art-bible §3 |

### New concern (for orchestrator / engineering-lead)
- **N2 fidelity note:** `dir` is sourced from `Actor.dir` (0-7), which is currently the actor's
  **spawn-time facing** — `world.step` updates positions from input intent but does **not** write
  the live aim back to `a.dir`. So a boss CONE will orient along the spawn facing, not necessarily
  toward its current target, until enemy-ai / world start maintaining `a.dir` (or the snapshot
  computes the attacker→target vector directly). Orientation is now *correct-by-construction* when
  `a.dir` is live; recommend a follow-up to keep `a.dir` in sync with aim so the cone points at the
  intended target. Low risk for playtest (telegraph still readable + oriented, just may not yet
  track the target precisely).
