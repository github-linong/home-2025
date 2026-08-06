# GameWorld.gd — renders authoritative entities from WorldSnapshot with a 100ms
# interpolation buffer (O-E7 client-side) so remote entities glide between server
# snapshots at 30Hz. Adds (A2) local-player input reconciliation + smooth correction,
# and forwards a render-tick estimate to EntityView for telegraph/co-op visuals (A3).
# Pure rendering; this node owns NO authoritative game state (Discipline B).
#
# Delivered for REVIEW ONLY — no Godot binary in the build sandbox, cannot be executed.
# Protocol/contract verified by client-protocol-conformance.mjs against the real server.

extends Node2D

# ── timing constants (mirror sim-core run-runtime TICK_RATE / ADR-NET-01 D2) ──
const INTERP_DELAY_MS := 100.0        # O-E7: render 100ms in the past
const SNAPSHOT_LIFETIME_MS := 1000.0  # drop snapshots older than this
const TICK_RATE := 30                 # authoritative sim rate (Hz)
const TICK_MS := 1000.0 / TICK_RATE   # ≈ 33.333ms per tick
# Exponential smoothing rate for the local render position when a server snapshot
# contradicts local prediction. Higher = snappier correction; lower = looser/smoother.
const LOCAL_CORRECTION_RATE := 10.0
# Heuristic: the client input layer emits ~60 inputs/s while the server simulates at
# 30Hz, so ~2 local inputs correspond to one authoritative tick. Used to convert an
# unacked input into roughly one tick of replayed movement during reconciliation.
# See a2-a3-client-note.md concern C1 — exact D9 golden alignment would instead replay
# the server's per-tick latest-pending application, not one-input-per-tick.
const CLIENT_INPUTS_PER_SERVER_TICK := 2.0
# Per-class move speed (px/s), keyed by seat % 4 — MUST stay in sync with sim-core
# PLAYER_CLASSES + CLASS_BASE.moveSpeed (concern C1). Order: tank, ranger, mage, healer.
const LOCAL_CLASS_MOVE_SPEED := [140.0, 185.0, 165.0, 170.0]

var _snapshot_buffer: Array = []      # Array of { recv_ms:int, snap:Dictionary }
var _entity_views: Dictionary = {}    # entity id -> EntityView
var _last_local_entity: Dictionary = {}

# ── A2: local-player prediction / reconciliation state (Discipline B: render-only) ──
var _local_entity_id: int = -1
var _local_class_ms: float = 140.0 / TICK_RATE  # move speed per tick for local class (set on detect)
var _unacked_inputs: Array = []       # Array of { seq:int, dir:Vector2 } (local MOVE only)
var _local_pred_pos: Vector2 = Vector2.ZERO    # predicted local pos = server correction + reapplied unacked
var _local_pred_dir: Vector2 = Vector2.ZERO    # latest unacked MOVE dir (current intent)
var _local_render_pos: Vector2 = Vector2.ZERO  # smoothed position actually drawn
var _local_has_pred: bool = false


func _ready() -> void:
	Connection.world_snapshot_received.connect(_on_world_snapshot)
	Connection.room_snapshot_received.connect(_on_room_snapshot)
	Connection.local_input_enqueued.connect(_on_local_input_enqueued)


func _on_room_snapshot(_snap: Dictionary) -> void:
	# Presence/lobby state lives in the UI layer; the world view only renders entities.
	pass


func _on_local_input_enqueued(seq: int, action: int, dir: Vector2) -> void:
	# Capture local MOVE inputs for reconciliation only. DODGE/ATTACK/SKILL do not move
	# the player, so they contribute nothing to position prediction (server still owns
	# the real movement; we just replay our own MOVE intent on top of its correction).
	if action != 0:  # InputAction.MOVE == 0
		return
	_unacked_inputs.append({ "seq": seq, "dir": dir })
	if dir.x != 0 or dir.y != 0:
		_local_pred_dir = dir


func _on_world_snapshot(snap: Dictionary) -> void:
	_snapshot_buffer.append({ "recv_ms": Time.get_ticks_msec(), "snap": snap })
	# Feed the local player entity to Connection so it can freeze PersonalState on disconnect.
	for e in snap.get("entities", []):
		if int(e.get("ownerId", -1)) == Connection.seat_index:
			_last_local_entity = e
			Connection.note_local_entity(e)
			if _local_entity_id < 0:
				_local_entity_id = int(e.get("id", -1))
				# Local class is known once the seat is assigned; derive per-tick move speed.
				var idx := Connection.seat_index % LOCAL_CLASS_MOVE_SPEED.size()
				_local_class_ms = LOCAL_CLASS_MOVE_SPEED[idx] / TICK_RATE
			break
	_reconcile_local(snap)


# A2 — standard client-side prediction correction for the LOCAL player only.
# 1) Drop inputs the server has already consumed (seq <= lastProcessedSeq[seat]).
# 2) Re-apply the still-unacked inputs on top of the latest server correction.
# Remote players are NEVER touched (their positions come from the interp buffer).
func _reconcile_local(snap: Dictionary) -> void:
	if _local_entity_id < 0:
		return
	var local = null
	for e in snap.get("entities", []):
		if int(e.get("id", -1)) == _local_entity_id:
			local = e
			break
	if local == null:
		return

	var server_pos: Vector2 = _to_vec(local.get("pos"))
	var lps: Variant = snap.get("lastProcessedSeq")
	var server_seq: int = -1
	if typeof(lps) == TYPE_DICTIONARY:
		# JSON serializes numeric keys as strings; look up the seat as a string.
		server_seq = int(lps.get(String(Connection.seat_index), -1))

	# 1) Keep only inputs not yet acknowledged by the server.
	var kept: Array = []
	for it in _unacked_inputs:
		if it.seq > server_seq:
			kept.append(it)
	_unacked_inputs = kept

	# 2) Re-apply unacked inputs on top of the authoritative correction.
	var pred: Vector2 = server_pos
	var last_dir: Vector2 = Vector2.ZERO
	for it in _unacked_inputs:
		pred += it.dir * _local_class_ms / CLIENT_INPUTS_PER_SERVER_TICK
		last_dir = it.dir
	_local_pred_pos = pred
	_local_pred_dir = last_dir

	if not _local_has_pred:
		_local_render_pos = server_pos
		_local_has_pred = true


func _process(delta: float) -> void:
	var now := Time.get_ticks_msec()
	_prune_old(now)
	if _snapshot_buffer.size() < 2:
		return

	# Pick the two buffered snapshots surrounding (now - INTERP_DELAY_MS).
	var render_time := now - INTERP_DELAY_MS
	var a: Dictionary = _snapshot_buffer[0]["snap"]
	var a_ms: int = _snapshot_buffer[0]["recv_ms"]
	var b: Dictionary = _snapshot_buffer[-1]["snap"]
	var b_ms: int = _snapshot_buffer[-1]["recv_ms"]
	for i in range(_snapshot_buffer.size() - 1):
		var cur_ms: int = _snapshot_buffer[i]["recv_ms"]
		var nxt_ms: int = _snapshot_buffer[i + 1]["recv_ms"]
		if cur_ms <= render_time and nxt_ms >= render_time:
			a = _snapshot_buffer[i]["snap"]
			a_ms = cur_ms
			b = _snapshot_buffer[i + 1]["snap"]
			b_ms = nxt_ms
			break

	var span := float(b_ms - a_ms)
	var alpha := 0.0
	if span > 0.0:
		alpha = clampf(float(render_time - a_ms) / span, 0.0, 1.0)

	# Render-tick estimate at the interpolated point. Feeds telegraph/co-op timing in A3
	# so the warning fills in lock-step with the authoritative windup window.
	var tick_a: float = float(a.get("tick", 0))
	var tick_b: float = float(b.get("tick", 0))
	var render_tick: float = lerpf(tick_a, tick_b, alpha)

	_update_local_prediction(delta)
	_render_interpolated(a, b, alpha, render_tick)


# Advance the local prediction forward by the current movement intent, then ease the
# drawn position toward it (exponential) so a server correction converges over a few
# frames instead of snapping.
func _update_local_prediction(delta: float) -> void:
	if not _local_has_pred:
		return
	# Scale movement by elapsed sim ticks (delta * TICK_RATE) so predicted distance matches
	# the server's per-tick movement regardless of the client's frame rate.
	_local_pred_pos += _local_pred_dir * _local_class_ms * (delta * TICK_RATE)
	var k := 1.0 - exp(-LOCAL_CORRECTION_RATE * delta)
	_local_render_pos = _local_render_pos.lerp(_local_pred_pos, k)


func _render_interpolated(snap_a: Dictionary, snap_b: Dictionary, alpha: float, render_tick: float) -> void:
	var ents_b: Array = snap_b.get("entities", [])
	var by_id: Dictionary = {}
	for e in ents_b:
		by_id[int(e["id"])] = e

	# Upsert a view per entity and interpolate/apply its state.
	for e in ents_b:
		var id: int = int(e["id"])
		var view: EntityView = _entity_views.get(id)
		if view == null:
			view = EntityView.new()
			view.entity_id = id
			view.kind = int(e.get("kind", 0))
			add_child(view)
			_entity_views[id] = view

		var target_pos: Vector2
		if id == _local_entity_id and _local_has_pred:
			# Local player: render predicted + smoothed position; never interpolate (no snap).
			target_pos = _local_render_pos
		else:
			var ea: Dictionary = _find_entity(snap_a, id)
			var pos_a: Vector2 = _to_vec(ea.get("pos")) if not ea.is_empty() else _to_vec(e.get("pos"))
			target_pos = pos_a.lerp(_to_vec(e.get("pos")), alpha)

		view.apply_state(target_pos, e, alpha, render_tick)

	# Retire views for entities no longer present.
	for id in _entity_views.keys():
		if not by_id.has(id):
			_entity_views[id].queue_free()
			_entity_views.erase(id)


func _prune_old(now: int) -> void:
	# Drop snapshots older than the lifetime, and always keep the buffer bounded.
	while _snapshot_buffer.size() > 0:
		var front: Dictionary = _snapshot_buffer[0]
		if now - int(front["recv_ms"]) > SNAPSHOT_LIFETIME_MS:
			_snapshot_buffer.pop_front()
		else:
			break
	while _snapshot_buffer.size() > 32:
		_snapshot_buffer.pop_front()


func _find_entity(snap: Dictionary, id: int) -> Dictionary:
	for e in snap.get("entities", []):
		if int(e["id"]) == id:
			return e
	return {}


func _to_vec(p: Variant) -> Vector2:
	if typeof(p) != TYPE_DICTIONARY:
		return Vector2.ZERO
	return Vector2(float(p.get("x", 0)), float(p.get("y", 0)))
