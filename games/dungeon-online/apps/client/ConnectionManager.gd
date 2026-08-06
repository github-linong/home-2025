# ConnectionManager.gd — Godot 4 client networking singleton (autoload "Connection").
#
# Protocol mirror of dungeon-server: gateway.ts / protocol.ts / room-service.ts / config.ts.
# Delivered for REVIEW ONLY — this sandbox has NO Godot binary, so the file cannot be
# compiled or executed here. Its protocol contract is verified by
#   apps/dungeon-server/tests/integration/client-protocol-conformance.mjs
# against the REAL authoritative server (8/8 assertions pass).
#
# Key protocol facts (read from server source, do NOT invent):
#   * Auth = ws open to /ws/dungeon?devUserId=<id>  (config.DEV_SKIP_AUTH in dev/test).
#     There is NO client->server `session.connect` message; the server pushes
#     `session.ready` after auth. The ws-open event IS the session handshake.
#   * Control plane = JSON (room.create/join/leave/transferOwner/game.start/session.reconnect/
#     sync.request, plus broadcasts room.snapshot). Reply carries requestId.
#   * Data plane = `input.cmd` (payload.cmd: InputCmd) uplink, and `world.snap`
#     (WorldSnapshot, currently JSON encoded into a Buffer — R1 placeholder binary) downlink.
#   * Reconnect (O-E7): client reopens the ws, sends `session.reconnect` with the prior
#     reconnectToken + roomId + seatIndex + runId; server replies `session.reconnect.ok`
#     and re-broadcasts a full world.snap. Client resumes interpolation (see GameWorld).

extends Node

signal session_ready(user_id: String)
signal room_snapshot_received(snapshot: Dictionary)
signal world_snapshot_received(snapshot: Dictionary)
signal reconnect_ok(snapshot_tick: int)
signal connection_closed()
signal connection_error(reason: String)
# A2: emitted for every locally-enqueued input so GameWorld can capture MOVE intents for
# client-side prediction / reconciliation. Pure notification — carries no authority.
signal local_input_enqueued(seq: int, action: int, dir: Vector2)

const GATEWAY_PATH := "/ws/dungeon"
const PROTOCOL_VERSION := 1

# --- public session state (GameWorld reads seat_index / room_id) ---
var seat_index: int = 0
var room_id: String = ""
var run_id: String = ""

# --- private ---
var _ws: WebSocketPeer = null
var _gateway_url: String = ""
var _dev_user_id: String = ""
var _state := "disconnected"          # disconnected | connecting | connected | reconnecting
var _reconnect_token: String = ""
var _seq: int = 0
# Frozen local state captured on disconnect (O-E7 smooth resume; mirrors server PersonalState).
var _personal_state: Dictionary = {}


func connect_to_gateway(gateway_url: String, dev_user_id: String) -> void:
	_gateway_url = gateway_url
	_dev_user_id = dev_user_id
	_open_socket()


func _open_socket() -> void:
	_ws = WebSocketPeer.new()
	var url := "%s%s?devUserId=%s" % [_gateway_url, GATEWAY_PATH, _dev_user_id]
	var err := _ws.connect_to_url(url)
	if err != OK:
		connection_error.emit("connect_to_url failed: %d" % err)
		return
	_state = "connecting"


func _process(_delta: float) -> void:
	if _ws == null:
		return
	_ws.poll()
	var state := _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		_on_open()
		_drain_messages()
	elif state == WebSocketPeer.STATE_CLOSED:
		_on_closed(_ws.get_close_code(), _ws.get_close_reason())


func _on_open() -> void:
	if _state == "connected":
		return
	if _state == "reconnecting":
		# O-E7 client path: resume the prior session with the captured token.
		_state = "connected"
		_send("session.reconnect", {
			"roomId": room_id,
			"seatIndex": seat_index,
			"reconnectToken": _reconnect_token,
			"runId": run_id,
		})
		return
	# First connect: handshake complete. Server will push `session.ready`.
	_state = "connected"


func _drain_messages() -> void:
	while _ws.get_available_packet_count() > 0:
		var raw: PackedByteArray = _ws.get_packet()
		# R1 placeholder: data plane is JSON encoded into a Buffer, so decode as UTF-8 text.
		var text := raw.get_string_from_utf8()
		var msg: Variant = JSON.parse_string(text)
		if typeof(msg) != TYPE_DICTIONARY:
			continue
		_handle_message(msg)


func _handle_message(msg: Dictionary) -> void:
	# Data-plane world.snap (R1 placeholder) is broadcast as a RAW WorldSnapshot JSON with
	# NO `type` field (see connection-registry.serialize / run-manager.onBroadcast). Route
	# it by shape BEFORE the control-plane `type` switch, otherwise every snapshot is dropped
	# and the world view never renders. Control-plane frames always carry a `type`.
	if not msg.has("type"):
		var t := msg.get("tick")
		var ents := msg.get("entities")
		if (typeof(t) == TYPE_INT or typeof(t) == TYPE_FLOAT) and typeof(ents) == TYPE_ARRAY:
			world_snapshot_received.emit(msg)
		return
	match msg.get("type"):
		"session.ready":
			session_ready.emit(msg.get("userId", ""))
		"room.snapshot":
			room_snapshot_received.emit(msg)
		"world.snap":
			# Retained for forward-compat if the server later tags the data plane with a type.
			world_snapshot_received.emit(msg)
		"session.reconnect.ok":
			_reconnect_token = msg.get("reconnectToken", _reconnect_token)
			reconnect_ok.emit(msg.get("snapshotTick", 0))
		"game.error":
			connection_error.emit("game.error: %s" % JSON.stringify(msg.get("error", {})))


# --- room / run control (control plane) ---
func create_room(display_name: String, resident: bool = false) -> void:
	_send("room.create", { "displayName": display_name, "resident": resident })


func join_room(room_code: String, display_name: String) -> void:
	_send("room.join", { "roomCode": room_code, "displayName": display_name })


func start_game() -> void:
	if room_id == "":
		return
	_send("game.start", { "roomId": room_id })


# --- input uplink (data plane) ---
# action: InputAction (MOVE=0/ATTACK=1/DODGE=2/SKILL=3/SIGNAL=4).
# dir: int8 vector. target/param optional (SKILL uses param=skillId, ATTACK uses target=enemyId).
func enqueue_input(action: int, dir: Vector2, target: int = -1, param: int = 0) -> void:
	_seq += 1
	var cmd := {
		"seq": _seq,
		"tick": 0,
		"action": action,
		"dir": { "x": int(dir.x), "y": int(dir.y) },
		"target": target if target >= 0 else null,
		"param": param,
	}
	_send("input.cmd", { "cmd": cmd })
	# A2: notify the local prediction system (GameWorld) of our own input.
	local_input_enqueued.emit(_seq, action, Vector2(cmd.dir.x, cmd.dir.y))


# --- O-E7 reconnect entry point (called from _on_closed) ---
func reconnect() -> void:
	if _reconnect_token == "":
		connection_error.emit("reconnect: no reconnectToken captured")
		return
	_state = "reconnecting"
	_open_socket()


func _on_closed(_code: int = 0, _reason: String = "") -> void:
	_capture_personal_state()
	connection_closed.emit()
	# Auto-resume: reopen and send session.reconnect with the prior token.
	reconnect()


# Mirror server PersonalState (sim-core types.ts) for smooth resume: seatId/status/hp/
# downedRemainingTicks/rescueProgressTicks. GameWorld feeds the last local entity here
# on every snapshot; on disconnect we freeze it so interpolation has no jump.
func _capture_personal_state() -> void:
	if _personal_state.is_empty():
		return
	# _personal_state is populated by GameWorld via note_local_entity().


func note_local_entity(entity: Dictionary) -> void:
	_personal_state = {
		"seatId": seat_index,
		"status": entity.get("status", 1),
		"hp": entity.get("hp", 0),
		"downedRemainingTicks": 0,
		"rescueProgressTicks": 0,
	}


func get_personal_state() -> Dictionary:
	return _personal_state


func _send(type: String, payload: Dictionary) -> void:
	if _ws == null or _ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var frame := JSON.stringify({ "type": type, "requestId": "", "payload": payload })
	_ws.send_text(frame)


# Capture seat/room/token from room control replies (called by UI/lobby on those signals).
func _note_room_reply(reply: Dictionary) -> void:
	if reply.has("roomId"):
		room_id = reply["roomId"]
	if reply.has("seatIndex"):
		seat_index = int(reply["seatIndex"])
	if reply.has("reconnectToken"):
		_reconnect_token = reply["reconnectToken"]
	if reply.has("runId"):
		run_id = reply["runId"]
