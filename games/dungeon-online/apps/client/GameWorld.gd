# GameWorld.gd — renders authoritative entities from WorldSnapshot with a 100ms
# interpolation buffer (O-E7 client-side) so remote entities glide between server
# snapshots at 30Hz. Pure rendering; this node owns NO game state.
#
# Delivered for REVIEW ONLY — no Godot binary in the build sandbox, cannot be executed.
# Protocol/contract verified by client-protocol-conformance.mjs against the real server.

extends Node2D

const INTERP_DELAY_MS := 100.0        # O-E7: render 100ms in the past
const SNAPSHOT_LIFETIME_MS := 1000.0  # drop snapshots older than this

var _snapshot_buffer: Array = []      # Array of { recv_ms:int, snap:Dictionary }
var _entity_views: Dictionary = {}    # entity id -> EntityView
var _last_local_entity: Dictionary = {}


func _ready() -> void:
	Connection.world_snapshot_received.connect(_on_world_snapshot)
	Connection.room_snapshot_received.connect(_on_room_snapshot)


func _on_room_snapshot(_snap: Dictionary) -> void:
	# Presence/lobby state lives in the UI layer; the world view only renders entities.
	pass


func _on_world_snapshot(snap: Dictionary) -> void:
	_snapshot_buffer.append({ "recv_ms": Time.get_ticks_msec(), "snap": snap })
	# Feed the local player entity to Connection so it can freeze PersonalState on disconnect.
	for e in snap.get("entities", []):
		if int(e.get("ownerId", -1)) == Connection.seat_index:
			_last_local_entity = e
			Connection.note_local_entity(e)
			break


func _process(_delta: float) -> void:
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
	_render_interpolated(a, b, alpha)


func _render_interpolated(snap_a: Dictionary, snap_b: Dictionary, alpha: float) -> void:
	var ents_b: Array = snap_b.get("entities", [])
	var by_id: Dictionary = {}
	for e in ents_b:
		by_id[int(e["id"])] = e

	# Upsert a view per entity and interpolate its position.
	for e in ents_b:
		var id: int = int(e["id"])
		var view: EntityView = _entity_views.get(id)
		if view == null:
			view = EntityView.new()
			view.entity_id = id
			view.kind = int(e.get("kind", 0))
			add_child(view)
			_entity_views[id] = view
		var ea: Dictionary = _find_entity(snap_a, id)
		var pos_a: Vector2 = _to_vec(ea.get("pos")) if not ea.is_empty() else _to_vec(e.get("pos"))
		var pos_b: Vector2 = _to_vec(e.get("pos"))
		view.apply_state(pos_a.lerp(pos_b, alpha), e, alpha)

	# Retire views for entities no longer present.
	for id in _entity_views.keys():
		if not by_id.has(id):
			_entity_views[id].queue_free()
			_entity_views.erase(id)


func _find_entity(snap: Dictionary, id: int) -> Dictionary:
	for e in snap.get("entities", []):
		if int(e["id"]) == id:
			return e
	return {}


func _to_vec(p: Variant) -> Vector2:
	if typeof(p) != TYPE_DICTIONARY:
		return Vector2.ZERO
	return Vector2(float(p.get("x", 0)), float(p.get("y", 0)))
